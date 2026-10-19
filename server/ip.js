import { reseau } from './securite/adresses-ip.js';

// Adresse IP tronquée dans les journaux et les événements envoyés à la Vigie (ip_net) : /24 en IPv4, /48 en IPv6, assez pour
// diagnostiquer, pas pour identifier. Calcul commun avec la Vigie (server/securite/adresses-ip.js) : « 2606:4700::1a » donne
// « 2606:4700:: », « 2a01::bad:5 » donne « 2a01:: » (audit D3-D5). Illisible : chaîne vide (rien de l'adresse n'est gardé).
export function truncateIp(ip) {
  return reseau(ip) || '';
}
