// Barème du moteur d'entités (phase C1, recadrage du 17 octobre 2026) : points déposés par type d'événement, seuils
// par classe d'entité, exceptions à source unique (D18), modes par défaut (D3). Réglable par la ligne de commande
// (modes, seuils) ; les valeurs ci-dessous sont celles de départ, à recaler après le mois d'observation.

// Points par gravité, sauf type précisé.
export const BY_SEVERITY = { info: 0, bas: 0.5, moyen: 1.5, haut: 3, critique: 5 };
export const BY_TYPE = {
  // Faits ordinaires : aucun point (ils servent au contexte et aux liens).
  authn_login_success: 0, session_created: 0, session_destroyed: 0, session_expired: 0, sys_startup: 0, sys_heartbeat: 0,
  sys_state: 0, zitadel_connexion: 0, vigie_demarrage: 0, vigie_purge: 0, vigie_alerte: 0, vigie_decision: 0, vigie_interrupteur: 0,
  // Lectures : peu, beaucoup s'additionnent.
  sensitive_read: 0.2, sensitive_export: 1,
  // Signaux d'exploration ou d'attaque.
  malicious_honeypot: 2, malicious_input: 2, malicious_excess_404: 1.5, malicious_excess_events: 2, input_validation_fail: 1.5,
  token_guess: 0.5, authn_login_fail: 1, authz_fail: 1, authz_csrf_fail: 1.5, authz_blocked: 0.5, upload_rejected: 2,
  zitadel_echec: 1.5, excess_rate_limit_exceeded: 1,
};
export const pointsOf = row => (Object.hasOwn(BY_TYPE, row.type) ? BY_TYPE[row.type] : BY_SEVERITY[row.severity] ?? 0);

// Seuils d'alerte par classe d'entité (points, après décroissance).
export const THRESHOLDS = { ip: 7, reseau: 12, compte: 7, session: 5, appareil: 7 };
export const HALF_LIFE_MIN = 60;                 // demi-vie du score
export const SOURCE_MIN = 0.5;                   // contribution minimale pour qu'une source compte dans le quorum
export const QUORUM = 2;

// Source d'un événement, pour le quorum : le site, la bordure Cloudflare, Zitadel, les contrôles de la Vigie.
export function sourceOf(row) {
  const c = String(row.composant || '');
  if (c.startsWith('site')) return 'site';
  if (c === 'zitadel') return 'zitadel';
  if (c === 'bordure' || c === 'cloudflare') return 'bordure';
  if (c === 'vigie · contrôle') return 'vigie';
  return null;                                  // actions des intervenants : jamais des signaux
}

// Exceptions à source unique (D18) : une seule observation prouve l'incident ; alerte immédiate, sans quorum.
// entite(row, d) : { kind, key } de l'entité visée.
const compte = (k = 'sub') => (row, d) => ({ kind: 'compte', key: String(k === 'sub' ? row.sub : d[k]) });
export const EXCEPTIONS = [
  { id: 'role_hors_application', cas: 'DS8', gravite: 'critique', entite: compte('compte'),
    match: (r, d) => ['privilege_permissions_changed', 'user_created', 'user_deleted', 'user_rescued'].includes(r.type) && d.hors_application === true },
  { id: 'administrateur_donne', cas: 'DS8', gravite: 'haut', entite: compte('compte'),
    match: (r, d) => d.administrateur_donne === true && d.hors_application !== true },
  { id: 'integrite_comptes', cas: 'DS8', gravite: 'critique', entite: () => ({ kind: 'site', key: 'site' }),
    match: r => r.type === 'sys_state' && r.severity === 'critique' },
  { id: 'chaine_rompue', cas: 'DS20', gravite: 'critique', entite: () => ({ kind: 'vigie', key: 'chaine' }),
    match: r => r.type === 'log_integrity_fail' },
  { id: 'cookie_rejoue', cas: 'DS1', gravite: 'haut', entite: compte(),
    match: (r, d) => r.type === 'session_use_after_expire' && d.meme_reseau_et_navigateur === false && Boolean(r.sub) },
  { id: 'session_autre_appareil', cas: 'DS2', gravite: null, entite: compte(),
    match: r => r.type === 'session_context_change' && ['haut', 'critique'].includes(r.severity) && Boolean(r.sub) },
  { id: 'saisie_compte_admin', cas: 'DS11', gravite: 'haut', entite: compte(),
    match: r => r.type === 'malicious_input' && r.severity === 'haut' && Boolean(r.sub) },
  { id: 'zitadel_critique', cas: 'DS27', gravite: 'critique', entite: r => (r.sub ? { kind: 'compte', key: String(r.sub) } : { kind: 'site', key: 'zitadel' }),
    match: r => r.composant === 'zitadel' && r.severity === 'critique' },
  { id: 'configuration', cas: 'DS9', gravite: 'haut', entite: () => ({ kind: 'site', key: 'configuration' }), match: r => r.type === 'sys_config_changed' },
  { id: 'restauration', cas: 'DS19', gravite: 'haut', entite: () => ({ kind: 'site', key: 'restauration' }), match: r => r.type === 'sys_restore' },
  { id: 'dechiffrement', cas: 'DS18', gravite: 'haut', entite: () => ({ kind: 'site', key: 'donnees' }), match: r => r.type === 'crypto_decrypt_fail' },
  { id: 'ingestion_refusee', cas: 'MV11', gravite: 'haut', entite: () => ({ kind: 'vigie', key: 'ingestion' }), match: r => r.type === 'vigie_ingestion_refusee' && r.severity === 'haut' },
  { id: 'trou_zitadel', cas: 'DS24', gravite: 'moyen', entite: () => ({ kind: 'vigie', key: 'zitadel' }), match: r => r.type === 'vigie_zitadel_trou' },
];

// Règles et mode par défaut : un mois d'observation (D3), sauf le cookie rejoué (DS1) et le rôle donné hors de
// l'application (DS8), actifs tout de suite.
export const RULES = {
  'entite.score': { cas: 'quorum', mode: 'observer', titre: 'Score d’une entité au-dessus du seuil, confirmé par deux sources' },
  ...Object.fromEntries(EXCEPTIONS.map(e => [`exception.${e.id}`, { cas: e.cas, mode: 'observer', titre: e.id.replaceAll('_', ' ') }])),
};
RULES['exception.cookie_rejoue'].mode = 'bloquer';
RULES['exception.role_hors_application'].mode = 'bloquer';
export const MODES = ['arret', 'observer', 'alerter', 'bloquer'];
