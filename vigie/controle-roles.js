import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

// Contrôle des rôles sur les sauvegardes du site (annexe architecture, section 4.4) : la Vigie ouvre en lecture seule le
// dernier instantané du site (dossier des sauvegardes monté en lecture seule), lit les administrateurs actifs et les
// déclencheurs du journal des comptes, et compare à ce que le site a déclaré (événements sys_state). Un site compromis
// peut mentir dans ses événements ; il ne réécrit pas la sauvegarde déjà faite par un autre conteneur.

const TRIGGERS = ['account_changes_insert', 'account_changes_update', 'account_changes_delete', 'account_changes_immuable',
  'account_changes_conserve', 'account_change_tickets_immuable', 'account_change_tickets_conserve'];

export function latestSnapshot(dir) {
  const db = path.join(dir, 'db');
  let files = [];
  try { files = fs.readdirSync(db).filter(f => /^site-.+\.db$/.test(f)).sort(); } catch { return null; }
  return files.length ? path.join(db, files.at(-1)) : null;
}

export function checkRoles({ store, siteBackupDir, now = Date.now }) {
  const file = latestSnapshot(siteBackupDir);
  if (!file) return { ok: null, raison: 'aucun instantané du site' };
  const seen = store.setting.get('controle_roles_vu');
  const stat = fs.statSync(file);
  if (seen?.fichier === path.basename(file) && seen?.taille === stat.size && seen?.modifie === stat.mtimeMs) return { ok: null, raison: 'instantané déjà contrôlé' };
  const snap = new Database(file, { readonly: true, fileMustExist: true });
  let admins, triggers;
  try {
    admins = snap.prepare("SELECT sub, roles FROM accounts WHERE status = 'actif'").all()
      .filter(a => { try { return JSON.parse(a.roles).includes('admin'); } catch { return false; } }).map(a => a.sub).sort();
    triggers = snap.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").pluck().all();
  } finally { snap.close(); }
  // Ce que le site a déclaré depuis la sauvegarde (sys_state le plus récent avant elle, et ceux d'après).
  const declared = new Set();
  for (const d of store.db.prepare("SELECT detail FROM events WHERE type = 'sys_state' AND recu_a > ? ORDER BY seq DESC LIMIT 500").pluck().iterate(stat.mtimeMs - 864e5)) {
    try { for (const s of JSON.parse(d).administrateurs || []) declared.add(s); } catch { /* ligne illisible */ }
  }
  const unknownAdmins = declared.size ? admins.filter(a => !declared.has(a)) : [];
  const missing = TRIGGERS.filter(t => !triggers.includes(t));
  const ok = !unknownAdmins.length && !missing.length;
  store.setting.set('controle_roles_vu', { fichier: path.basename(file), taille: stat.size, modifie: stat.mtimeMs, at: now() });
  store.own('vigie_controle_roles', { severity: ok ? 'info' : 'critique', emetteur: 'vigie/controle-roles.js',
    detail: { instantane: path.basename(file), administrateurs: admins.length, administrateurs_non_declares: unknownAdmins, declencheurs_absents: missing, declare: declared.size > 0 } });
  return { ok, unknownAdmins, missing };
}
