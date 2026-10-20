// Barème du moteur d'entités (phases C1 et C2, recadrage du 17 octobre 2026) : points déposés par type d'événement
// (base, avant les règles Sigma et les détecteurs), seuils par classe d'entité, décroissance, quorum. Réglable par la
// ligne de commande (seuils) ; les valeurs ci-dessous sont celles de départ, à recaler après le mois d'observation.

// Points par gravité, sauf type précisé.
export const BY_SEVERITY = { info: 0, bas: 0.5, moyen: 1.5, haut: 3, critique: 5 };
export const BY_TYPE = {
  // Faits ordinaires : aucun point (ils servent au contexte et aux liens).
  authn_login_success: 0, authn_reauth_success: 0, session_created: 0, session_destroyed: 0, session_expired: 0, sys_startup: 0, sys_heartbeat: 0,
  sys_state: 0, zitadel_connexion: 0, vigie_demarrage: 0, vigie_purge: 0, vigie_alerte: 0, vigie_decision: 0, vigie_interrupteur: 0,
  vigie_signal: 0, vigie_dossier: 0, vigie_controle_roles: 0, vigie_moteur_sature: 0, vigie_regle_lente: 0,
  // Bordure (phase C3) : notée par ses règles Sigma (70-bordure.yml), jamais deux fois.
  bordure_blocage: 0, bordure_erreurs: 0, bordure_rafale: 0, bordure_nouvel_operateur: 0, bordure_erreur_worker: 0, edge_signature_invalid: 0,
  vigie_bordure_erreur: 0, vigie_bordure_silence: 0, vigie_canal_echec: 0, vigie_surveillance_reduite: 0,
  // Réseau (phase E4) : noté par ses règles Sigma (75-reseau.yml) ; ses événements ne portent ni adresse de visiteur ni
  // compte (seulement des conteneurs de la pile et des destinations), donc aucune entité à noter.
  reseau_sortie_refusee: 0, reseau_sortie_directe: 0, reseau_flux_hors_liste: 0, vigie_reseau_silence: 0,
  // Lectures : peu, beaucoup s'additionnent.
  sensitive_read: 0.2, sensitive_export: 1,
  // Suppression (BV-30) : trier sa boîte est un geste ordinaire, noté comme une lecture plutôt qu'au poids de sa gravité
  // (« bas », 0,5) ; la série est jugée par sa corrélation (messages_effaces_en_masse, 40-donnees.yml).
  sensitive_delete: 0.2,
  // Signaux d'exploration ou d'attaque.
  // Types qu'une règle Sigma à un seul événement note déjà (piège, connexion de test, Zitadel « haut ») : pas de points de
  // base en plus (jamais compté deux fois).
  // Écriture arrêtée faute d'identité confirmée : la personne légitime en fait une ou deux avant de confirmer ; la série
  // est notée par sa règle (ecritures_sans_identite, 10-preuves.yml).
  authz_reauth_required: 0,
  malicious_honeypot: 0, authn_local_attempt: 0, zitadel_facteur: 0, zitadel_droits: 0, zitadel_politique: 0,
  malicious_input: 2, malicious_excess_404: 1.5, malicious_excess_events: 2, input_validation_fail: 1.5,
  token_guess: 0.5, authn_login_fail: 1, authz_fail: 1, authz_csrf_fail: 1.5, authz_blocked: 0.5, upload_rejected: 2,
  zitadel_echec: 1.5, excess_rate_limit_exceeded: 1,
};
// Propres au canal : l'échec d'un mot de passe de galerie privée (composant public) n'est pas une force brute sur la
// connexion de l'admin ; ses propres règles (BV-16 : échecs par adresse, essais répartis, suspension) le comptent.
const detailOf = row => { try { return (typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail) || {}; } catch { return {}; } };
const detailObjet = row => detailOf(row).objet;
// Champs libres des formulaires Contact et demande de licence (registre des briques, BV-27) : un message cite souvent du
// code (« <script> », « union select »), un visiteur qui écrit n'est pas un scanner. Envois de ces deux formulaires
// seulement (route du site, trois langues ; jamais la page en GET, dont les paramètres restent notés comme ailleurs).
const FORMULAIRES_LIBRES = /^(?:\/(?:en|de))?\/(?:contact|droits\/demande)$/;
const CHAMPS_LIBRES = new Set(['body.message', 'body.diffusion']);
// Saisie dont tous les constats sont dans le message ou la diffusion d'un de ces formulaires, sans outil d'attaque reconnu
// au navigateur ; un constat ailleurs (nom, e-mail, adresse, navigateur) garde tout son poids.
export function saisieLibre(row) {
  if (row.type !== 'malicious_input' || row.composant !== 'site · public' || (row.method && row.method !== 'POST') || !FORMULAIRES_LIBRES.test(String(row.route || ''))) return false;
  const d = detailOf(row);
  const constats = Array.isArray(d.constats) ? d.constats : [];
  return constats.length > 0 && constats.every(c => CHAMPS_LIBRES.has(c?.champ)) && !(Array.isArray(d.familles) && d.familles.includes('outil'));
}
// Poids d'une saisie libre par gravité : « bas » (envoyée depuis une session de l'admin) gardée pour l'enquête, sans
// point ; « moyen » (un visiteur) un quart du poids ordinaire ; « haut » ou plus : le poids ordinaire. La série reste
// comptée par la règle scanner (5 saisies en 1 h depuis une adresse, DS11), qui ne lit pas ce barème.
const SAISIE_LIBRE = { bas: 0, moyen: 0.5 };
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
  if (Object.hasOwn(SAISIE_LIBRE, row.severity) && saisieLibre(row)) return SAISIE_LIBRE[row.severity];
  return Object.hasOwn(BY_TYPE, row.type) ? BY_TYPE[row.type] : BY_SEVERITY[row.severity] ?? 0;
};

// Seuils d'alerte par classe d'entité (points, après décroissance).
export const THRESHOLDS = { ip: 7, reseau: 12, compte: 7, session: 5, appareil: 7 };
export const HALF_LIFE_MIN = 60;                 // demi-vie du score
export const SOURCE_MIN = 0.5;                   // contribution minimale pour qu'une source compte dans le quorum
export const QUORUM = 2;

// Source d'un événement, pour le quorum : le site, la bordure Cloudflare, Zitadel, le réseau (mandataire de sortie et
// pare-feu de l'hôte, phase E4), les contrôles de la Vigie.
export function sourceOf(row) {
  const c = String(row.composant || '');
  if (c.startsWith('site')) return 'site';
  if (c === 'zitadel') return 'zitadel';
  if (c === 'bordure' || c === 'cloudflare') return 'bordure';
  if (c === 'réseau') return 'reseau';
  if (c === 'vigie · contrôle') return 'vigie';
  return null;                                  // actions des intervenants : jamais des signaux
}

export const MODES = ['arret', 'observer', 'alerter', 'bloquer'];
// Les exceptions à source unique et les règles sont au format Sigma (vigie/regles/*.yml, décision D20).
