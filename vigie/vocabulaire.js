// Vocabulaire de la Vigie : celui du site (server/securite/vocabulaire.js, reçu par l'ingestion signée) et le sien
// (événements constatés par la Vigie elle-même : Zitadel, contrôles, actions des intervenants).
import { EVENTS as SITE, SEVERITIES, COMPOSANTS as SITE_COMPOSANTS, rank } from '../server/securite/vocabulaire.js';

export { SEVERITIES, rank, SITE_COMPOSANTS };

const E = (severity, composant) => ({ severity, composant });
export const OWN = {
  // Zitadel (lecture de son API des événements), par catégorie de vigie/zitadel/types-suivis.json
  zitadel_echec: E('moyen', 'zitadel'),
  zitadel_connexion: E('info', 'zitadel'),
  zitadel_facteur: E('haut', 'zitadel'),
  zitadel_droits: E('haut', 'zitadel'),
  zitadel_politique: E('haut', 'zitadel'),
  vigie_zitadel_trou: E('haut', 'vigie · contrôle'),
  vigie_zitadel_erreur: E('moyen', 'vigie · contrôle'),
  // Vigie elle-même
  vigie_demarrage: E('info', 'vigie · contrôle'),
  vigie_ingestion_refusee: E('haut', 'vigie · contrôle'),
  log_integrity_fail: E('critique', 'vigie · contrôle'),
  vigie_decision: E('moyen', 'vigie · ligne de commande'),
  vigie_interrupteur: E('moyen', 'vigie · ligne de commande'),
};
export const ALL = { ...SITE, ...OWN };
export const isSiteType = t => Object.hasOwn(SITE, t);
export const isType = t => Object.hasOwn(ALL, t);
