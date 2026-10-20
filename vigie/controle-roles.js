import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Contrôle des rôles sur les sauvegardes du site (annexe architecture, section 4.4) : la Vigie ouvre en lecture seule le
// dernier instantané du site (dossier des sauvegardes monté en lecture seule), lit les administrateurs actifs et les
// déclencheurs du journal des comptes, et compare à ce que le site a déclaré (événements sys_state) et à l'instantané
// précédent. Un site compromis peut mentir dans ses événements ; il ne réécrit pas la sauvegarde déjà faite par un autre
// conteneur.
// Revue du 17 octobre 2026 : seuls des fichiers ordinaires au nom attendu sont lus (ni lien, ni tube, ni nom fabriqué
// pour passer en tête du tri) ; un nouvel administrateur doit correspondre à un changement journalisé ; le texte des
// déclencheurs est comparé à celui de l'instantané précédent ; un contrôle impossible ou une sauvegarde trop ancienne
// est signalé (haut), un écart est critique.

const TRIGGERS = ['account_changes_insert', 'account_changes_update', 'account_changes_delete', 'account_changes_immuable',
  'account_changes_conserve', 'account_change_tickets_immuable', 'account_change_tickets_conserve'];
const NAME = /^site-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})(-suspect)?\.db$/;
const STALE = 48 * 3600e3;                       // sauvegarde quotidienne : au-delà de deux jours, le contrôle est aveugle
const MAX_SIZE = 2 * 1024 ** 3;

const stampOf = f => { const m = NAME.exec(f); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN; };
// Nom d'instantané pour un instant donné (même format que server/db/backup.js).
export const snapshotName = t => `site-${new Date(t).toISOString().replace(/[:]/g, '').replace(/\..+/, '')}.db`;

// Instantané le plus récent d'après la date de son nom (jamais dans le futur), fichier ordinaire seulement.
export function latestSnapshot(dir, now = Date.now()) {
  const db = path.join(dir, 'db');
  let files = [];
  try { files = fs.readdirSync(db); } catch { return null; }
  const candidates = files.map(f => ({ f, t: stampOf(f) })).filter(x => Number.isFinite(x.t) && x.t <= now + 5 * 60e3).sort((a, b) => b.t - a.t);
  for (const { f, t } of candidates) {
    const file = path.join(db, f);
    let st;
    try { st = fs.lstatSync(file); } catch { continue; }
    if (st.isFile() && st.size > 0 && st.size <= MAX_SIZE) return { file, stamp: t, stat: st };
  }
  return null;
}

const hash = s => crypto.createHash('sha256').update(s || '').digest('hex').slice(0, 16);

export function checkRoles({ store, siteBackupDir, now = Date.now }) {
  const t = now();
  const report = (severity, detail) => {
    // Le contrôle vise parfois plusieurs comptes. Garder un seul rapport et tous ses acteurs : choisir seulement
    // le premier ferait disparaître les autres dossiers ; un écart de déclencheur n'a aucun compte à lui prêter.
    const comptes = [...new Set([...(detail.administrateurs_non_declares || []), ...(detail.administrateurs_sans_changement || [])])];
    store.own('vigie_controle_roles', { severity, emetteur: 'vigie/controle-roles.js',
      sub: comptes.length === 1 ? comptes[0] : undefined, detail: { ...detail, ...(comptes.length ? { comptes } : {}) } });
  };
  const snapInfo = latestSnapshot(siteBackupDir, t);
  if (!snapInfo) {
    // Signalé une fois par jour au plus (le contrôle tourne chaque heure).
    if (t - store.setting.get('controle_roles_absent', 0) >= 864e5) {
      store.setting.set('controle_roles_absent', t);
      report('haut', { erreur: 'aucun instantané lisible du site' });
    }
    return { ok: null, raison: 'aucun instantané du site' };
  }
  const { file, stamp, stat } = snapInfo;
  const name = path.basename(file);
  const seen = store.setting.get('controle_roles_vu');
  if (seen?.fichier === name && seen?.taille === stat.size && seen?.modifie === stat.mtimeMs) {
    // Même instantané : pas de nouvelle sauvegarde depuis plus de deux jours se signale (une fois par jour).
    if (t - stamp > STALE && t - (seen.ancien_signale || 0) >= 864e5) {
      store.setting.set('controle_roles_vu', { ...seen, ancien_signale: t });
      report('haut', { instantane: name, erreur: 'sauvegarde du site trop ancienne', age_heures: Math.round((t - stamp) / 3600e3) });
    }
    return { ok: null, raison: 'instantané déjà contrôlé' };
  }
  store.setting.set('controle_roles_vu', { fichier: name, taille: stat.size, modifie: stat.mtimeMs, at: t });

  let admins, triggers, migration, comptes, acces = null;
  try {
    const snap = new Database(file, { readonly: true, fileMustExist: true });
    try {
      snap.pragma('query_only = ON');
      if (!snap.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'accounts'").get()) throw new Error('table accounts absente');
      const actifs = snap.prepare("SELECT * FROM accounts WHERE status = 'actif'").all();
      const json = (v, d) => { try { const x = JSON.parse(v); return x ?? d; } catch { return d; } };
      admins = actifs.filter(a => { const r = json(a.roles, []); return Array.isArray(r) && r.includes('admin'); }).map(a => String(a.sub)).sort();
      // Rôles, réglages du circuit et photographe lié de chaque compte actif : la référence du détecteur role_incoherent
      // (galeries privées et Carnets, vigie/detecteurs.js), lue ici plutôt que dans les déclarations du site.
      comptes = Object.fromEntries(actifs.map(a => {
        const roles = json(a.roles, []), adjust = json(a.adjust, {});
        return [String(a.sub), { roles: Array.isArray(roles) ? roles.map(String) : [], adjust: adjust && typeof adjust === 'object' ? { add: [].concat(adjust.add || []).map(String), remove: [].concat(adjust.remove || []).map(String) } : {}, auteur: a.author_id ?? null }];
      }));
      // Accès ouverts des galeries privées (registre BV-23, second temps), si la table existe (PR #149).
      if (snap.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'space_invites'").get()) {
        acces = snap.prepare('SELECT id FROM space_invites WHERE revoked_at IS NULL AND expires_at > ?').pluck().all(stamp).map(Number);
      }
      triggers = Object.fromEntries(snap.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger'").all().map(r => [r.name, hash(r.sql)]));
      try { migration = snap.prepare('SELECT MAX(name) FROM migrations').pluck().get() || ''; } catch { migration = ''; }
    } finally { snap.close(); }
  } catch (err) {
    report('critique', { instantane: name, erreur: `instantané illisible : ${String(err.message).slice(0, 200)}` });
    return { ok: false, erreur: err.message };
  }

  // Ce que le site a déclaré autour de la sauvegarde (sys_state depuis la veille).
  const declared = new Set();
  let declarations = 0;
  for (const d of store.db.prepare("SELECT detail FROM events WHERE type = 'sys_state' AND recu_a > ? ORDER BY seq DESC LIMIT 500").pluck().iterate(stamp - 864e5)) {
    try { const list = JSON.parse(d).administrateurs; if (Array.isArray(list)) { declarations += 1; for (const s of list) declared.add(s); } } catch { /* ligne illisible */ }
  }
  const unknownAdmins = declarations ? admins.filter(a => !declared.has(a)) : [];

  // Instantané précédent : un administrateur apparu depuis doit correspondre à un changement journalisé par le site.
  const previous = store.setting.get('controle_roles_admins', null);
  const unexplained = [];
  if (previous && Array.isArray(previous.administrateurs)) {
    const before = new Set(previous.administrateurs);
    const granted = new Set();
    const since = (previous.instantane_a ?? stamp - 864e5) - 3600e3;
    for (const d of store.db.prepare("SELECT detail FROM events WHERE type IN ('privilege_permissions_changed', 'user_created', 'user_rescued') AND recu_a > ?").pluck().iterate(since)) {
      try { const x = JSON.parse(d); if (x.administrateur_donne || (Array.isArray(x.apres?.roles) && x.apres.roles.includes('admin'))) granted.add(x.compte); } catch { /* ligne illisible */ }
    }
    for (const a of admins) if (!before.has(a) && !granted.has(a)) unexplained.push(a);
  }

  // Accès ouverts apparus depuis l'instantané précédent : chacun doit avoir été annoncé par le site (privacy_exposure_changed,
  // action « cree ») ; un accès écrit hors de l'application (base modifiée à la main) ne l'est pas (DS8 transposé).
  // Premier instantané qui contient la table : référence seulement (des accès peuvent dater d'avant la Vigie).
  const accesSans = [];
  const accesAvant = store.setting.get('controle_roles_acces', null);
  if (acces && accesAvant && Array.isArray(accesAvant.ids)) {
    const before = new Set(accesAvant.ids);
    const annonces = new Set();
    for (const d of store.db.prepare("SELECT detail FROM events WHERE type = 'privacy_exposure_changed' AND recu_a > ?").pluck().iterate((accesAvant.instantane_a ?? stamp - 864e5) - 3600e3)) {
      try { const x = JSON.parse(d); if (x.objet === 'acces_prive' && x.action === 'cree' && x.acces != null) annonces.add(Number(x.acces)); } catch { /* ligne illisible */ }
    }
    for (const id of acces) if (!before.has(id) && !annonces.has(id)) accesSans.push(id);
  }

  // Déclencheurs : présents, et même texte que dans l'instantané précédent (sauf migration du site entre les deux).
  const missing = TRIGGERS.filter(n => !triggers[n]);
  const ref = store.setting.get('controle_roles_declencheurs', null);
  const differs = ref ? TRIGGERS.filter(n => triggers[n] && ref.sql?.[n] && ref.sql[n] !== triggers[n]) : [];
  const migrated = Boolean(ref) && ref.migration !== migration;
  const altered = migrated ? [] : differs;

  const critical = unknownAdmins.length || unexplained.length || missing.length || altered.length || accesSans.length;
  const severity = critical ? 'critique' : (!declarations || (migrated && differs.length) || t - stamp > STALE) ? 'haut' : 'info';
  report(severity, {
    instantane: name, administrateurs: admins.length, administrateurs_non_declares: unknownAdmins, administrateurs_sans_changement: unexplained,
    declencheurs_absents: missing, declencheurs_modifies: altered, declencheurs_modifies_par_migration: migrated && differs.length ? differs : undefined,
    declare: declarations > 0, age_heures: Math.round((t - stamp) / 3600e3),
    acces_ouverts: acces ? acces.length : undefined, acces_sans_evenement: accesSans.length ? accesSans.slice(0, 50) : undefined,
  });
  store.setting.set('controle_roles_comptes', { comptes, instantane_a: stamp });
  if (acces && !accesSans.length) store.setting.set('controle_roles_acces', { ids: acces, instantane_a: stamp });
  // Références pour le prochain contrôle. Sur un écart, l'ancienne est gardée : l'écart ressort tant qu'il n'est pas
  // expliqué (ou que la ligne de commande ne l'a pas accepté).
  if (!unexplained.length && !unknownAdmins.length) store.setting.set('controle_roles_admins', { administrateurs: admins, instantane_a: stamp });
  if (!altered.length && !missing.length) store.setting.set('controle_roles_declencheurs', { migration, sql: Object.fromEntries(TRIGGERS.map(n => [n, triggers[n]])) });
  return { ok: !critical, unknownAdmins, unexplained, missing, altered, accesSans, severity };
}
