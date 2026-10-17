import { ROLES, ADJUSTABLE } from './permissions.js';

// Comptes de l'admin : une ligne par identité (sub de l'IdP, ou « local:<photographe> » pour la connexion de test),
// avec ses rôles, le photographe lié et son état. Les rôles vivent ici ; l'IdP ne fait que transporter l'identité
// (et, à la première connexion seulement, son rôle « admin » sert d'amorce ; pas pour un compte supprimé qui revient).
// Ils sont relus à chaque requête : un retrait s'applique tout de suite. Garde-fou : les identités de ADMIN_SUBS sont
// toujours administratrices.
export const STATUSES = ['actif', 'en_attente', 'desactive'];

export class AccountError extends Error {}

export function createAccounts({ db, adminSubs = [], now = Date.now }) {
  const q = {
    bySub: db.prepare('SELECT * FROM accounts WHERE sub = ?'),
    byId: db.prepare('SELECT * FROM accounts WHERE id = ?'),
    all: db.prepare(`SELECT c.*, a.name AS author_name FROM accounts c LEFT JOIN authors a ON a.id = c.author_id
      ORDER BY CASE c.status WHEN 'en_attente' THEN 0 WHEN 'actif' THEN 1 ELSE 2 END, c.name COLLATE NOCASE, c.id`),
    insert: db.prepare(`INSERT INTO accounts (sub, name, email, author_id, roles, status, created_at, last_login_at, decided_at)
      VALUES (@sub, @name, @email, @author_id, @roles, @status, @created_at, @last_login_at, @decided_at)`),
    // Comptes supprimés (migration 040) : l'identité seule, le temps qu'elle revienne.
    removedAt: db.prepare('SELECT removed_at FROM accounts_removed WHERE sub = ?').pluck(),
    unremove: db.prepare('DELETE FROM accounts_removed WHERE sub = ?'),
    tombstone: db.prepare('INSERT OR REPLACE INTO accounts_removed (sub, removed_at) VALUES (?, ?)'),
  };
  // Tickets (migration 048) : chaque écriture de l'application sur un compte ouvre un ticket dans la même transaction ;
  // les déclencheurs de la base relient le changement noté à ce ticket. Un changement sans ticket vient d'ailleurs.
  const tq = {
    open: db.prepare('INSERT INTO account_change_tickets (at, action, by_sub) VALUES (?, ?, ?)'),
    close: db.prepare('UPDATE account_change_tickets SET open = 0 WHERE id = ?'),
  };
  const listeners = [];
  const ticketed = (action, by, fn) => {
    const r = db.transaction(() => {
      const id = tq.open.run(now(), action, by ?? null).lastInsertRowid;
      try { return fn(); } finally { tq.close.run(id); }
    })();
    for (const l of listeners) l();
    return r;
  };
  const adjustOf = raw => { let a = {}; try { a = JSON.parse(raw || '{}'); } catch { a = {}; } const ok = l => [...new Set(l || [])].filter(p => Object.hasOwn(ADJUSTABLE, p)); return { add: ok(a.add), remove: ok(a.remove) }; };
  const parse = row => row && { ...row, roles: JSON.parse(row.roles || '[]').filter(r => Object.hasOwn(ROLES, r)), adjust: adjustOf(row.adjust), notify_email: Boolean(row.notify_email), locked: adminSubs.includes(row.sub) };
  const bySub = sub => parse(q.bySub.get(sub));
  const byId = id => parse(q.byId.get(id));
  // Un compte supprimé par un administrateur qui revient (connexion OIDC, de test, ou session) : « en attente », sans
  // rôle, avec la décision de l'administrateur (decided_at) — le rôle « admin » de l'IdP ne le recrée pas
  // administrateur et ne le promeut pas ensuite. Seul ADMIN_SUBS passe outre.
  const create = ({ sub, name = '', email = '', authorId = null, roles = [], status, action = 'compte créé' }) => {
    const t = now();
    const removed = adminSubs.includes(sub) ? undefined : q.removedAt.get(sub);
    if (removed != null) { roles = []; status = undefined; }
    ticketed(action, sub, () => {
      q.insert.run({ sub, name, email, author_id: authorId, roles: JSON.stringify(roles), status: status || (roles.length ? 'actif' : 'en_attente'), created_at: t, last_login_at: null, decided_at: removed ?? null });
      q.unremove.run(sub);
    });
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
      for (const sub of subs) ticketed('compte en attente effacé (90 jours)', null, () => { db.prepare('DELETE FROM sessions WHERE sub = ?').run(sub); db.prepare('DELETE FROM accounts WHERE sub = ?').run(sub); });
      return subs.length;
    },
    // Journal des changements de comptes (migration 048) : gardé 13 mois, comme le Journal.
    purgeChanges() {
      const before = now() - 396 * 864e5;
      db.prepare('DELETE FROM account_changes WHERE at < ?').run(before);
      return db.prepare('DELETE FROM account_change_tickets WHERE at < ? AND id NOT IN (SELECT ticket_id FROM account_changes WHERE ticket_id IS NOT NULL)').run(before).changes;
    },
    // Changements notés depuis l'identifiant after (pour la Vigie), avec le ticket de l'application s'il y en a un.
    changesSince: (after, limit = 500) => db.prepare(`SELECT c.*, t.action, t.by_sub FROM account_changes c LEFT JOIN account_change_tickets t ON t.id = c.ticket_id
      WHERE c.id > ? ORDER BY c.id LIMIT ?`).all(after, limit),
    lastChangeId: () => db.prepare('SELECT COALESCE(MAX(id), 0) FROM account_changes').pluck().get(),
    onChange: fn => listeners.push(fn),
    // Rôles effectifs d'une identité : ceux du compte actif ; garde-fou ADMIN_SUBS.
    rolesOf(sub) {
      if (adminSubs.includes(sub)) return ['admin'];
      const a = bySub(sub);
      return a && a.status === 'actif' ? a.roles : [];
    },
    // Connexion : compte créé à la première connexion (administrateur si l'IdP transporte le rôle « admin » ou si
    // l'identité est dans ADMIN_SUBS, sinon en attente), nom et e-mail tenus à jour. rescued : remis administrateur
    // par ADMIN_SUBS (à noter au journal).
    login({ sub, name = '', email = '', idpAdmin = false }) {
      let a = bySub(sub);
      const locked = adminSubs.includes(sub);
      const admin = idpAdmin || locked;
      let rescued = false;
      if (!a) a = create({ sub, name, email, roles: admin ? ['admin'] : [], action: admin ? 'compte créé administrateur à la connexion' : 'compte créé à la connexion' });
      // Garde-fou ADMIN_SUBS : une identité ajoutée à la liste après coup (compte désactivé, rôles retirés) redevient
      // administrateur actif, en base aussi (page « Comptes et rôles », « au moins un administrateur actif »). Jamais
      // sur la seule foi de l'IdP : son rôle « admin » ne contredit pas une décision d'administrateur.
      else if (locked && (a.status !== 'actif' || !a.roles.includes('admin'))) {
        ticketed('compte rétabli par ADMIN_SUBS', sub, () => db.prepare("UPDATE accounts SET roles = ?, status = 'actif' WHERE id = ?").run(JSON.stringify([...new Set([...a.roles, 'admin'])]), a.id));
        rescued = true;
      }
      // En attente sans décision d'un administrateur, et l'IdP transporte désormais le rôle « admin » : promu. Un
      // compte dont un administrateur a retiré les rôles (ou qu'il a supprimé) ne l'est jamais.
      else if (a.status === 'en_attente' && !a.decided_at && admin) ticketed('compte promu administrateur à la connexion', sub, () => db.prepare("UPDATE accounts SET roles = '[\"admin\"]', status = 'actif' WHERE id = ?").run(a.id));
      // Une connexion refusée (compte désactivé) n'en est pas une : « dernière connexion » ne bouge pas (le journal la garde).
      db.prepare("UPDATE accounts SET name = ?, email = ?, last_login_at = CASE WHEN status = 'desactive' THEN last_login_at ELSE ? END WHERE id = ?").run(name || a.name, email || a.email, now(), a.id);
      return { ...bySub(sub), rescued };
    },
    // Compte d'une session : s'il manque (session d'avant les comptes), il est créé SANS rôle, en attente : les rôles
    // stockés dans la session ne valent jamais (sinon un compte effacé reviendrait avec ses anciens droits).
    // roles : seulement pour un appel explicite (tests, outils), jamais depuis une session.
    ensure({ sub, name = '', email = '', roles = [] }) {
      return bySub(sub) || create({ sub, name, email, roles: roles.filter(r => Object.hasOwn(ROLES, r)), action: 'compte créé pour une session' });
    },
    // Connexion de test : compte « local:<photographe> » lié à ce photographe, créé avec roles. Un compte qui existe
    // déjà garde ses rôles et son état : ils ne changent que par update() (garde-fous, journal).
    ensureLocal({ sub, name, authorId, roles }) {
      const a = bySub(sub);
      if (!a) {
        const created = create({ sub, name, authorId: db.prepare('SELECT 1 FROM accounts WHERE author_id = ?').get(authorId) ? null : authorId, roles, action: 'compte de test créé' });
        db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now(), created.id);
        return bySub(sub);
      }
      if (a.status !== 'desactive') db.prepare('UPDATE accounts SET last_login_at = ? WHERE id = ?').run(now(), a.id);
      return bySub(sub);
    },
    // Droits réglés pour une identité (circuit de publication) : { add, remove }.
    adjustOf(sub) { const a = bySub(sub); return a && a.status === 'actif' ? a.adjust : { add: [], remove: [] }; },
    // Régler un droit de ADJUSTABLE pour un compte : on (true : donné, false : retiré, null : celui du rôle).
    setAdjust(id, perm, on, by = null) {
      const a = byId(id);
      if (!a || !Object.hasOwn(ADJUSTABLE, perm)) throw new AccountError('Réglage inconnu.');
      const add = a.adjust.add.filter(p => p !== perm), remove = a.adjust.remove.filter(p => p !== perm);
      if (on === true) add.push(perm); else if (on === false) remove.push(perm);
      ticketed('circuit réglé', by, () => db.prepare('UPDATE accounts SET adjust = ? WHERE id = ?').run(JSON.stringify({ add, remove }), id));
      return byId(id);
    },
    // Être prévenu par e-mail (circuit de publication) : choisi par chacun pour lui-même.
    // digest : récapitulatif de ce qui attend le compte ('off', 'daily', 'weekly' ; absent : inchangé).
    setNotify(sub, { on, to = '', digest } = {}) {
      const addr = String(to || '').trim().slice(0, 200);
      if (addr && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(addr)) throw new AccountError('Cette adresse e-mail n’est pas valide.');
      const recap = ['off', 'daily', 'weekly'].includes(digest) ? digest : undefined;
      if ((on || (recap && recap !== 'off')) && !addr && !bySub(sub)?.email) throw new AccountError('Indiquez l’adresse où vous prévenir.');
      db.prepare('UPDATE accounts SET notify_email = ?, notify_to = ? WHERE sub = ?').run(on ? 1 : 0, addr, sub);
      if (recap) db.prepare('UPDATE accounts SET digest = ? WHERE sub = ?').run(recap, sub);
      return bySub(sub);
    },
    // Nouveautés : la dernière version vue dans la fenêtre « Nouveautés ».
    setSeenRelease: (sub, version) => db.prepare('UPDATE accounts SET seen_release = ? WHERE sub = ?').run(String(version), sub).changes > 0,
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
      // Plus Photographe : ses réglages du circuit (page « Circuit de publication », réservée aux photographes) sont
      // remis à zéro, pour qu'un rôle Photographe rendu plus tard ne les réactive pas en silence.
      const resetAdjust = a.roles.includes('photographe') && !next.roles.includes('photographe');
      ticketed('compte modifié', by, () => {
        db.prepare("UPDATE accounts SET roles = ?, author_id = ?, status = ?, decided_at = CASE WHEN ? THEN ? ELSE decided_at END, adjust = CASE WHEN ? THEN '{}' ELSE adjust END WHERE id = ?").run(JSON.stringify(next.roles), next.author_id, next.status, decided ? 1 : 0, now(), resetAdjust ? 1 : 0, id);
        // Plus aucun accès : ses sessions sont fermées tout de suite.
        if (next.status !== 'actif') db.prepare('DELETE FROM sessions WHERE sub = ?').run(a.sub);
      });
      return { before: a, after: byId(id) };
    },
    remove(id, by) {
      const a = byId(id);
      if (!a) throw new AccountError('Compte introuvable.');
      if (a.locked) throw new AccountError('Ce compte est protégé par ADMIN_SUBS : il reste administrateur.');
      if (a.sub === by) throw new AccountError('Vous ne pouvez pas supprimer votre propre compte.');
      if (a.status === 'actif' && a.roles.includes('admin') && activeAdmins().length <= 1) throw new AccountError('Il faut au moins un administrateur actif.');
      ticketed('compte supprimé', by, () => {
        q.tombstone.run(a.sub, now());                                            // s'il revient : en attente, sans rôle
        db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
        db.prepare('DELETE FROM sessions WHERE sub = ?').run(a.sub);               // déconnecté tout de suite
      });
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
