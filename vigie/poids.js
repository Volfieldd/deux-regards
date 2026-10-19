// Barème du moteur d'entités (phases C1 et C2, recadrage du 17 octobre 2026) : points déposés par type d'événement
// (base, avant les règles Sigma et les détecteurs), seuils par classe d'entité, décroissance, quorum. Réglable par la
// ligne de commande (seuils) ; les valeurs ci-dessous sont celles de départ, à recaler après le mois d'observation.

// Points par gravité, sauf type précisé.
export const BY_SEVERITY = { info: 0, bas: 0.5, moyen: 1.5, haut: 3, critique: 5 };
export const BY_TYPE = {
  // Faits ordinaires : aucun point (ils servent au contexte et aux liens).
  authn_login_success: 0, session_created: 0, session_destroyed: 0, session_expired: 0, sys_startup: 0, sys_heartbeat: 0,
  sys_state: 0, zitadel_connexion: 0, vigie_demarrage: 0, vigie_purge: 0, vigie_alerte: 0, vigie_decision: 0, vigie_interrupteur: 0,
  vigie_signal: 0, vigie_controle_roles: 0, vigie_moteur_sature: 0, vigie_regle_lente: 0,
  // Bordure (phase C3) : notée par ses règles Sigma (70-bordure.yml), jamais deux fois.
  bordure_blocage: 0, bordure_erreurs: 0, bordure_rafale: 0, bordure_nouvel_operateur: 0, bordure_erreur_worker: 0, edge_signature_invalid: 0,
  vigie_bordure_erreur: 0, vigie_bordure_silence: 0, vigie_canal_echec: 0, vigie_surveillance_reduite: 0,
  // Lectures : peu, beaucoup s'additionnent.
  sensitive_read: 0.2, sensitive_export: 1,
  // Signaux d'exploration ou d'attaque.
  // Types qu'une règle Sigma à un seul événement note déjà (piège, connexion de test, Zitadel « haut ») : pas de points de
  // base en plus (jamais compté deux fois).
  malicious_honeypot: 0, authn_local_attempt: 0, zitadel_facteur: 0, zitadel_droits: 0, zitadel_politique: 0,
  malicious_input: 2, malicious_excess_404: 1.5, malicious_excess_events: 2, input_validation_fail: 1.5,
  token_guess: 0.5, authn_login_fail: 1, authz_fail: 1, authz_csrf_fail: 1.5, authz_blocked: 0.5, upload_rejected: 2,
  zitadel_echec: 1.5, excess_rate_limit_exceeded: 1,
};
// Propres au canal : l'échec d'un mot de passe de galerie privée (composant public) n'est pas une force brute sur la
// connexion de l'admin ; ses propres règles (BV-16 : échecs par adresse, essais répartis, suspension) le comptent.
const detailObjet = row => { try { return (typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail)?.objet; } catch { return null; } };
const BY_CANAL = {
  'authn_login_fail|site · public': 0,
  'authn_login_disabled|site · public': 0,      // forme provisoire du palier des galeries (type_attendu authn_login_lock)
  'authn_login_lock|site · public': 0,
  'bordure_cache_prive|bordure': 0,             // faute de configuration du cache, pas de l'invité : sa règle le dit (BV-26)
};
export const pointsOf = row => {
  const k = `${row.type}|${row.composant}`;
  if (Object.hasOwn(BY_CANAL, k)) return BY_CANAL[k];
  // Billet des Carnets : un constat « bas » (HTML inoffensif, image externe) est gardé pour l'enquête, sans point ; une
  // construction active (moyen ou plus) garde ses points (BV-12).
  if (row.type === 'malicious_input' && row.severity === 'bas' && detailObjet(row) === 'billet') return 0;
  return Object.hasOwn(BY_TYPE, row.type) ? BY_TYPE[row.type] : BY_SEVERITY[row.severity] ?? 0;
};

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

export const MODES = ['arret', 'observer', 'alerter', 'bloquer'];
// Les exceptions à source unique et les règles sont au format Sigma (vigie/regles/*.yml, décision D20).
