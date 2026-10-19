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
  vigie_zitadel_quota: E('moyen', 'vigie · contrôle'),          // quota mensuel de l'API de Zitadel Cloud (80 % puis 95 %)
  // Vigie elle-même
  vigie_demarrage: E('info', 'vigie · contrôle'),
  vigie_ingestion_refusee: E('haut', 'vigie · contrôle'),
  log_integrity_fail: E('critique', 'vigie · contrôle'),
  vigie_purge: E('info', 'vigie · contrôle'),
  vigie_alerte: E('info', 'vigie · contrôle'),
  vigie_signal: E('info', 'vigie · contrôle'),
  vigie_controle_roles: E('info', 'vigie · contrôle'),
  vigie_moteur_sature: E('haut', 'vigie · contrôle'),
  vigie_regle_lente: E('moyen', 'vigie · contrôle'),
  // Bordure Cloudflare (phase C3) : constats du Worker, lus dans Analytics Engine (source « bordure » du quorum)
  bordure_blocage: E('info', 'bordure'),
  bordure_erreurs: E('moyen', 'bordure'),
  bordure_rafale: E('moyen', 'bordure'),
  bordure_nouvel_operateur: E('bas', 'bordure'),
  bordure_erreur_worker: E('bas', 'bordure'),
  // Réponse d'une page ou d'une image privée (/g/…, /prive/…, ou en-tête privé du site) servie par le cache de Cloudflare
  // (registre des briques, BV-26) : le site ne la voit jamais passer.
  bordure_cache_prive: E('haut', 'bordure'),
  vigie_bordure_erreur: E('moyen', 'vigie · contrôle'),
  vigie_bordure_silence: E('moyen', 'vigie · contrôle'),
  // Notifications (phase D)
  vigie_canal_echec: E('moyen', 'vigie · contrôle'),
  vigie_surveillance_reduite: E('moyen', 'vigie · contrôle'),
  vigie_decision: E('moyen', 'vigie · ligne de commande'),
  vigie_interrupteur: E('moyen', 'vigie · ligne de commande'),
  vigie_urgence: E('haut', 'vigie · ligne de commande'),        // mode urgence de Cloudflare (« I'm Under Attack »)
  // Console (phase D3) : connexions, refus (DS30), arrivées et changements de droits (DS29). Constatés par la Vigie.
  vigie_console_connexion: E('info', 'vigie · console'),
  vigie_console_sortie: E('info', 'vigie · console'),
  vigie_console_refus: E('moyen', 'vigie · console'),
  vigie_console_arrivee: E('moyen', 'vigie · console'),
  vigie_console_droits: E('haut', 'vigie · console'),
  vigie_console_export: E('bas', 'vigie · console'),           // export CSV du journal (Analyste)
  vigie_console_indisponible: E('haut', 'vigie · contrôle'),   // console réglée mais qui ne peut pas écouter
};
export const ALL = { ...SITE, ...OWN };
export const isSiteType = t => Object.hasOwn(SITE, t);
export const isType = t => Object.hasOwn(ALL, t);
