import { ROLES, ADJUSTABLE } from './permissions.js';

// Comptes de l'admin : une ligne par identité (sub de l'IdP, ou « local:<photographe> » pour la connexion de test),
// avec ses rôles, le photographe lié et son état. Les rôles vivent ici ; l'IdP ne fait que transporter l'identité
// (et, à la première connexion seulement, son rôle « admin » sert d'amorce). Ils sont relus à chaque requête : un
// retrait s'applique tout de suite. Garde-fou : les identités de ADMIN_SUBS sont toujours administratrices.
export const STATUSES = ['actif', 'en_attente', 'desactive'];

export class AccountError extends Error {}

export function createAccounts({ db, adminSubs = [], now = Date.now }) {
  const q = {
    bySub: db.prepare('SELECT * FROM accounts WHERE sub = ?'),
    byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
    all: db.prepare(`SELECT c.*, a.name AS author_name FROM accounts c LEFT JOIN authors a ON a.id = c.author_id
      ORDER BY CASE c.status WHEN 'en_attente' THEN 0 WHEN 'actif' THEN 1 ELSE 2 END, c.name COLLATE NOCASE, c.id`),
    insert: db.prepare(`INSERT INTO accounts (sub, name, email, author_id, roles, status, created_at, last_login_at)
      VALUES (@sub, @name, @email, @author_id, @roles, @status, @created_at, @last_login_at)`),
  };
  const adjustOf = raw => { let a = {}; try { a = JSON.parse(raw || '{}'); } catch { a = {}; } const ok = l => [...new Set(l || [])].filter(p => Object.hasOwn(ADJUSTABLE, p)); return { add: ok(a.add), remove: ok(a.remove) }; };
  const parse = row => row && { ...row, roles: JSON.parse(row.roles || '[]').filter(r => Object.hasOwn(ROLES, r)), adjust: adjustOf(row.adjust), notify_email: Boolean(row.notify_email), locked: adminSubs.includes(row.sub) };
  const bySub = sub => parse(q.bySub.get(sub));
  const byId = id => parse(q.byId.get(id));
  const create = ({ sub, name = '', email = '', authorId = null, roles = [], status }) => {
    const t = now();
    q.insert.run({ sub, name, email, author_id: authorId, roles: JSON.stringify(roles), status: status || (roles.length ? 'actif' : 'en_attente'), created_at: t, last_login_at: null });
    return bySub(sub);
  };
  // Administrateurs actifs (garde-fou : jamais zéro).
  const activeAdmins = () => q.all.all().map(parse).filter(a => a.status === 'actif' && (a.roles.includes('admin') || a.locked));

  return {
    bySub, byId,
    list: () => q.all.all().map(parse),
    pending: () => db.prepare("SELECT COUNT(*) FROM accounts WHERE status = 'en_attente'").pluck().get(),
    // Comptes restés en attente 90 jours sans qu'on leur donne de rôle : effacés (nom et e-mail ne sont pas gardés pour rien).
    purgePending() {
      const subs = db.prepare("SELECT sub FROM accounts WHERE status = 'en_attente' AND decided_at IS NULL AND created_at < ?").pluck().all(now() - 90 * 864e5);
      for (const sub of subs) { db.prepare('DELETE FROM sessions WHERE sub = ?').run(sub); db.prepare('DELETE FROM accounts WHERE sub = ?').run(sub); }
      return subs.length;
    },
    // Rôles effectifs d'une identité : ceux du compte actif ; garde-fou ADMIN_SUBS.
    rolesOf(sub) {
      if (adminSubs.includes(sub)) return ['admin'];
      const a = bySub(sub);
      return a && a.status === 'actif' ? a.roles : [];
    },
    // Connexion : compte créé à la première connexion (administrateur si l'IdP transporte le rôle « admin » ou si
    // l'identité est dans ADMIN_SUBS, sinon en attente), nom et e-mail tenus à jour.
    login({ sub, name = '', email = '', idpAdmin = false }) {
      let a = bySub(sub);
      const admin = idpAdmin || adminSubs.includes(sub);
      if (!a) a = create({ sub, name, email, roles: admin ? ['admin'] : [] });
      // En attente sans décision d'un administrateur, et l'IdP transporte désormais le rôle « admin » : promu. Un
      // compte dont un administrateur a retiré les rôles ne l'est jamais.
      else if (a.status === 'en_attente' && !a.decided_at && admin) db.prepare("UPDATE accounts SET roles = '[\"admin\"]', status = 'actif' WHERE id = ?").run(a.id);
      db.prepare('UPDATE accounts SET name = ?, email = ?, last_login_at = ? WHERE id = ?').run(name || a.name, email || a.email, now(), a.id);
      return bySub(sub);
    },
    // Compte d'une session : s'il manque (session d'avant les comptes), il est créé SANS rôle, en attente : les rôles
    // stockés dans la session ne valent jamais (sinon un compte effacé reviendrait avec ses anciens droits).
    // roles : seulement pour un appel explicite (tests, outils), jamais depuis une session.
    ensure({ sub, name = '', email = '', roles = [] }) {
      return bySub(sub) || create({ sub, name, email, roles: roles.filter(r => Object.hasOwn(ROLES, r)) });
    },
    // Connexion de test : compte « local:<photographe> » lié à ce photographe.
    ensureLocal({ sub, name, authorId, roles }) {
      const a = bySub(sub);
      if (!a) {
        const created = create({ sub, name, authorId: db.prepare('SELECT 1 FROM accounts WHERE author_id = ?').get(authorId) ? null : authorId, roles });
        db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now(), created.id);
        return bySub(sub);
      }
      if (roles) db.prepare('UPDATE accounts SET roles = ?, status = ? WHERE id = ?').run(JSON.stringify(roles), roles.length ? 'actif' : 'en_attente', a.id);
      db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now(), a.id);
      return bySub(sub);
    },
    // Droits réglés pour une identité (circuit de publication) : { add, remove }.
    adjustOf(sub) { const a = bySub(sub); return a && a.status === 'actif' ? a.adjust : { add: [], remove: [] }; },
    // Régler un droit de ADJUSTABLE pour un compte : on (true : donné, false : retiré, null : celui du rôle).
    setAdjust(id, perm, on) {
      const a = byId(id);
      if (!a || !Object.hasOwn(ADJUSTABLE, perm)) throw new AccountError('Réglage inconnu.');
      const add = a.adjust.add.filter(p => p !== perm), remove = a.adjust.remove.filter(p => p !== perm);
      if (on === true) add.push(perm); else if (on === false) remove.push(perm);
      db.prepare('UPDATE accounts SET adjust = ? WHERE id = ?').run(JSON.stringify({ add, remove }), id);
      return byId(id);
    },
    // Être prévenu par e-mail (circuit de publication) : choisi par chacun pour lui-même.
    setNotify(sub, { on, to = '' }) {
      const addr = String(to || '').trim().slice(0, 200);
      if (addr && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(addr)) throw new AccountError('Cette adresse e-mail n’est pas valide.');
      if (on && !addr && !bySub(sub)?.email) throw new AccountError('Indiquez l’adresse où vous prévenir.');
      db.prepare('UPDATE accounts SET notify_email = ?, notify_to = ? WHERE sub = ?').run(on ? 1 : 0, addr, sub);
      return bySub(sub);
    },
    // Photographe lié à une identité (valeurs par défaut, et plus tard la portée « les miennes »).
    authorIdOf: sub => q.bySub.get(sub)?.author_id ?? null,

    // Modifier un compte (page « Comptes et rôles ») : rôles, photographe lié, état. by : sub de qui modifie.
    // Refus : retirer le dernier administrateur, toucher au garde-fou, se désactiver soi-même.
    update(id, { roles, authorId, status }, by) {
      const a = byId(id);
      if (!a) throw new AccountError('Compte introuvable.');
      const next = {
        roles: roles === undefined ? a.roles : [...new Set(roles)].filter(r => Object.hasOwn(ROLES, r)),
        author_id: authorId === undefined ? a.author_id : authorId || null,
        status: status === undefined ? (roles !== undefined && a.status === 'en_attente' && roles.length ? 'actif' : a.status) : status,
      };
      if (!STATUSES.includes(next.status)) throw new AccountError('État inconnu.');
      if (next.status === 'actif' && !next.roles.length && !a.locked) next.status = 'en_attente';
      if (a.locked && (!next.roles.includes('admin') || next.status !== 'actif')) throw new AccountError('Ce compte est protégé par ADMIN_SUBS : il reste administrateur.');
      if (a.sub === by && next.status !== 'actif') throw new AccountError('Vous ne pouvez pas désactiver votre propre compte.');
      const wasAdmin = a.status === 'actif' && (a.roles.includes('admin') || a.locked);
      const staysAdmin = next.status === 'actif' && (next.roles.includes('admin') || a.locked);
      if (wasAdmin && !staysAdmin && activeAdmins().length <= 1) throw new AccountError('Il faut au moins un administrateur actif.');
      if (next.author_id && db.prepare('SELECT 1 FROM accounts WHERE author_id = ? AND id != ?').get(next.author_id, id)) throw new AccountError('Ce photographe est déjà lié à un autre compte.');
      if (next.author_id && !db.prepare('SELECT 1 FROM authors WHERE id = ?').get(next.author_id)) throw new AccountError('Photographe inconnu.');
      const decided = next.roles.join() !== a.roles.join() || next.status !== a.status;
      db.prepare('UPDATE accounts SET roles = ?, author_id = ?, status = ?, decided_at = CASE WHEN ? THEN ? ELSE decided_at END WHERE id = ?').run(JSON.stringify(next.roles), next.author_id, next.status, decided ? 1 : 0, now(), id);
      // Plus aucun accès : ses sessions sont fermées tout de suite.
      if (next.status !== 'actif') db.prepare('DELETE FROM sessions WHERE sub = ?').run(a.sub);
      return { before: a, after: byId(id) };
    },
    remove(id, by) {
      const a = byId(id);
      if (!a) throw new AccountError('Compte introuvable.');
      if (a.locked) throw new AccountError('Ce compte est protégé par ADMIN_SUBS : il reste administrateur.');
      if (a.sub === by) throw new AccountError('Vous ne pouvez pas supprimer votre propre compte.');
      if (a.status === 'actif' && a.roles.includes('admin') && activeAdmins().length <= 1) throw new AccountError('Il faut au moins un administrateur actif.');
      db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE sub = ?').run(a.sub);                 // déconnecté tout de suite
      return a;
    },
  };
}

// Journal : qui a fait quoi, en base (consultable dans l'admin), gardé 13 mois.
export function createAudit({ db, now = Date.now }) {
  const add = db.prepare('INSERT INTO audit_log (at, sub, name, action, target, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)');
  return {
    log({ sub = null, name = '', action, target = '', status = null, detail = '' }) {
      add.run(now(), sub, name, String(action).slice(0, 200), String(target).slice(0, 200), status, String(detail).slice(0, 2000));
    },
    list({ sub = '', q = '', limit = 300 } = {}) {
      const like = `%${String(q).replace(/[%_]/g, '')}%`;
      return db.prepare(`SELECT * FROM audit_log WHERE (? = '' OR sub = ?) AND (? = '%%' OR action LIKE ? OR target LIKE ? OR detail LIKE ? OR name LIKE ?)
        ORDER BY at DESC, id DESC LIMIT ?`).all(sub, sub, like, like, like, like, like, limit);
    },
    purge: () => db.prepare('DELETE FROM audit_log WHERE at < ?').run(now() - 396 * 864e5).changes,
  };
}
