import { clean } from '../util.js';

// Droits de la console (annexe architecture § 5.4). Quatre rôles, chacun comprend le précédent. Deux clés :
//   1. le plafond, donné dans Zitadel (rôles de projet vigie.*, organisation propriétaire du projet « Vigie ») : sans
//      lui, pas d'entrée ; relu à la connexion (jeton), toutes les 5 minutes et avant toute action (API de Zitadel) ;
//   2. l'attribution, réglée dans la Vigie par un Administrateur de la Vigie ; sans attribution : Lecteur.
// Droit effectif : le plus faible des deux. L'amorce VIGIE_ADMIN_SUBS l'emporte sur l'attribution (toujours
// Administrateur), jamais sur le plafond : retirer son rôle vigie.* dans Zitadel coupe l'accès d'un compte de l'amorce.
// VIGIE_ROLES=zitadel : une seule clé, l'attribution suit le plafond.

export const ROLES = ['viewer', 'handler', 'analyst', 'admin'];
export const LABELS = { viewer: 'Lecteur', handler: 'Intervenant', analyst: 'Analyste', admin: 'Administrateur' };
export const rank = role => ROLES.indexOf(role) + 1;                     // 0 : aucun
export const lowest = (a, b) => (rank(a) <= rank(b) ? a : b);

// Ce que chaque action demande (tableau du § 5.4). Les écrans et les routes ne testent jamais un rôle, une action.
export const ACTIONS = {
  voir: 'viewer',
  adresses_completes: 'handler',
  alertes_traiter: 'handler',
  actions_forcees: 'handler',
  exporter: 'analyst',
  reglages: 'analyst',
  verifications: 'analyst',
  droits: 'admin',
  confiance: 'admin',                    // adresses de confiance (annexe § 5.4 : Administrateur)
};
export const can = (role, action) => {
  if (!Object.hasOwn(ACTIONS, action)) throw new Error(`action inconnue : ${action}`);
  return rank(role) >= rank(ACTIONS[action]);
};

// Plafond tiré d'une liste de rôles (jeton ou API) : le plus haut des rôles vigie.*, ou null.
export function ceilingOf(roles) {
  let best = null;
  for (const r of roles || []) {
    const m = /^vigie\.(viewer|handler|analyst|admin)$/.exec(String(r));
    if (m && rank(m[1]) > rank(best)) best = m[1];
  }
  return best;
}

export class RightsError extends Error {}

// Relecture du plafond par l'API de gestion de Zitadel : autorisations (user grants) du compte sur le projet « Vigie »,
// actives, dans l'organisation propriétaire ; compte actif. Une erreur remonte (l'appelant décide : refuser l'action).
export function createCeilingReader({ api, projectId, orgId }) {
  return async function read(sub) {
    // Compte supprimé chez Zitadel (404) : aucun plafond, comme un compte désactivé (audit D3-A6), et non une panne.
    let user;
    try { user = await api(`/management/v1/users/${encodeURIComponent(sub)}`, { method: 'GET', org: orgId }); } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
    const state = user?.user?.state;
    if (state && state !== 'USER_STATE_ACTIVE' && state !== 'USER_STATE_INITIAL') return null;
    const r = await api('/management/v1/users/grants/_search', {
      org: orgId,
      body: { query: { limit: 50 }, queries: [{ userIdQuery: { userId: sub } }, { projectIdQuery: { projectId } }] },
    });
    const roles = (Array.isArray(r?.result) ? r.result : [])
      .filter(g => g.projectId === projectId && g.userId === sub && (!g.state || g.state === 'USER_GRANT_STATE_ACTIVE'))
      .flatMap(g => (Array.isArray(g.roleKeys) ? g.roleKeys : []));
    return ceilingOf(roles);
  };
}

export function createRights({ db, store, adminSubs, mode = 'deux-cles', now = Date.now }) {
  const seed = new Set(adminSubs);
  const q = {
    get: db.prepare('SELECT * FROM console_droits WHERE sub = ?'),
    insert: db.prepare('INSERT INTO console_droits (sub, nom, plafond, plafond_a, premiere, derniere) VALUES (?, ?, ?, ?, ?, ?)'),
    seen: db.prepare('UPDATE console_droits SET nom = COALESCE(?, nom), derniere = ? WHERE sub = ?'),
    ceiling: db.prepare('UPDATE console_droits SET plafond = ?, plafond_a = ? WHERE sub = ?'),
    assign: db.prepare('UPDATE console_droits SET attribution = ?, attribue_par = ?, attribue_a = ? WHERE sub = ?'),
    all: db.prepare('SELECT * FROM console_droits ORDER BY premiere'),
  };
  const emit = (type, sub, detail, par) => store.own(type, { emetteur: par ? (String(par).startsWith('console · ') ? par : `console · ${clean(par, 200)}`) : 'vigie/console', sub, detail });

  // Attribution qui vaut pour ce compte (amorce, une seule clé, ou celle réglée dans la Vigie ; Lecteur par défaut).
  function assignedOf(sub, row, ceiling) {
    if (seed.has(sub)) return 'admin';
    if (mode === 'zitadel') return ceiling || 'viewer';
    return row?.attribution || 'viewer';
  }
  // Droit effectif pour un plafond donné (null : aucun accès).
  function effective(sub, ceiling) {
    if (!ceiling) return null;
    return lowest(ceiling, assignedOf(sub, q.get.get(sub), ceiling));
  }

  // Plafond constaté (connexion ou relecture) : retenu, et tout changement signalé (DS29). Première arrivée sans
  // attribution : signalée aussi (DS29, moyen), sauf pour l'amorce et le mode une seule clé.
  const observe = db.transaction((sub, ceiling, { nom = null } = {}) => {
    const t = now();
    const row = q.get.get(sub);
    const name = nom ? clean(nom, 120) : null;
    if (!row) {
      q.insert.run(sub, name, ceiling, t, t, t);
      if (ceiling && !seed.has(sub) && mode === 'deux-cles') emit('vigie_console_arrivee', sub, { plafond: ceiling, effectif: 'viewer', nom: name || undefined });
      return;
    }
    q.seen.run(name, t, sub);
    if ((row.plafond || null) !== (ceiling || null)) {
      q.ceiling.run(ceiling, t, sub);
      emit('vigie_console_droits', sub, { objet: 'plafond', avant: row.plafond || null, apres: ceiling || null, effectif: effective(sub, ceiling) });
    }
  });

  // Attribution réglée par un Administrateur de la Vigie (écran Droits, phase D3c). Garde-fous : Administrateur
  // seulement, jamais son propre rôle, jamais un compte de l'amorce, au moins un Administrateur effectif.
  function assign({ par, parAuteur, parRole, sub, role }) {
    if (parRole !== 'admin') throw new RightsError('réservé aux Administrateurs de la Vigie');
    if (!ROLES.includes(role)) throw new RightsError(`rôle inconnu : ${role}`);
    if (sub === par) throw new RightsError('personne ne change son propre rôle');
    if (seed.has(sub)) throw new RightsError('compte de l’amorce (VIGIE_ADMIN_SUBS) : toujours Administrateur ; pour lui couper l’accès, retirez son rôle vigie.* dans Zitadel');
    if (mode === 'zitadel') throw new RightsError('VIGIE_ROLES=zitadel : les rôles se règlent dans Zitadel');
    const row = q.get.get(sub);
    if (!row) throw new RightsError('compte inconnu de la console (jamais connecté)');
    if (row.attribution === role) return false;
    q.assign.run(role, par, now(), sub);
    emit('vigie_console_droits', sub, { objet: 'attribution', avant: row.attribution || null, apres: role, effectif: effective(sub, row.plafond) }, parAuteur || par);
    return true;
  }

  const list = () => q.all.all().map(r => ({ ...r, amorce: seed.has(r.sub), effectif: effective(r.sub, r.plafond) }));
  return { effective, observe, assign, list, isSeed: sub => seed.has(sub), mode };
}
