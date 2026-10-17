// Vocabulaire des événements de sécurité (docs/etudes/journalisation-securite.md, section 2.2), commun au site et à la
// Vigie. Noms repris du vocabulaire de journalisation d'OWASP. Liste fermée : un type inconnu est refusé à l'émission
// (erreur de programmation) comme à la réception.
export const SEVERITIES = ['info', 'bas', 'moyen', 'haut', 'critique'];
export const rank = s => SEVERITIES.indexOf(s);

// Composants qui peuvent émettre depuis le site (la Vigie n'accepte que ceux-là par l'ingestion signée).
export const COMPOSANTS = ['site · public', 'site · admin', 'site · connexion', 'site · système'];

const E = (severity, composant) => ({ severity, composant });
export const EVENTS = {
  // E1, E2, E3 : connexion
  authn_login_success: E('info', 'site · connexion'),
  authn_login_fail: E('moyen', 'site · connexion'),
  authn_login_pending: E('bas', 'site · connexion'),
  authn_login_disabled: E('moyen', 'site · connexion'),
  authn_local_attempt: E('moyen', 'site · connexion'),
  // E4, E5, E6 : sessions
  session_created: E('info', 'site · connexion'),
  session_destroyed: E('info', 'site · connexion'),
  session_expired: E('info', 'site · connexion'),
  session_use_after_expire: E('haut', 'site · connexion'),
  session_context_change: E('moyen', 'site · connexion'),
  // E7, E8 : droits
  authz_fail: E('bas', 'site · admin'),
  authz_csrf_fail: E('moyen', 'site · admin'),
  authz_blocked: E('bas', 'site · public'),           // requête refusée par une décision de la Vigie (blocage, verrouillage)
  // E9, E10 : comptes et rôles
  privilege_permissions_changed: E('bas', 'site · admin'),
  user_created: E('bas', 'site · admin'),
  user_deleted: E('bas', 'site · admin'),
  user_rescued: E('haut', 'site · admin'),
  // E11, E12 : données sensibles
  sensitive_read: E('info', 'site · admin'),
  sensitive_export: E('bas', 'site · admin'),
  // E13 à E19 : saisies, fichiers, débit, pièges, jetons
  input_validation_fail: E('moyen', 'site · public'),
  malicious_input: E('moyen', 'site · public'),
  upload_rejected: E('moyen', 'site · admin'),
  excess_rate_limit_exceeded: E('bas', 'site · public'),
  malicious_excess_404: E('bas', 'site · public'),
  malicious_honeypot: E('moyen', 'site · public'),
  malicious_excess_events: E('moyen', 'site · public'),
  token_guess: E('bas', 'site · public'),
  // E20 à E23 : système
  crypto_decrypt_fail: E('haut', 'site · système'),
  sys_startup: E('info', 'site · système'),
  sys_config_changed: E('haut', 'site · système'),
  sys_restore: E('haut', 'site · système'),
  sys_error: E('bas', 'site · système'),
  sys_heartbeat: E('info', 'site · système'),
  sys_state: E('info', 'site · système'),
  sys_events_dropped: E('haut', 'site · système'),
  // En-têtes de la bordure (Worker Cloudflare) présents mais faux : fabriqués, rejoués, ou clé du Worker différente.
  edge_signature_invalid: E('haut', 'site · système'),
};

export const isType = type => Object.hasOwn(EVENTS, type);
