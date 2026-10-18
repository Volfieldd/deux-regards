// Petits outils sans dépendance (la Vigie ne fait confiance à aucun champ reçu, même du site).
import { reseau } from '../server/securite/adresses-ip.js';

export const clean = (v, max = 200) => (v == null ? null : String(v).toWellFormed().replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029‎‏‪-‮⁦-⁩]/g, '␤').slice(0, max).replace(/[\ud800-\udbff]$/, '') || null);
export const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

// Réseau d'une adresse, comme le site (server/ip.js, même calcul : server/securite/adresses-ip.js) : /24 en IPv4, /48 en
// IPv6, forme canonique (ip_net de tous les événements). Illisible : null.
export function netOf(ip) {
  return reseau(ip);
}

// Texte d'une erreur d'envoi (canal de notification) sans adresse e-mail, numéro de téléphone ni identifiant de groupe
// Signal (audit D3-C5) : écrit ainsi dans vigie_canal_echec, relu ainsi par la console (anciens événements).
export const sansContacts = s => String(s ?? '')
  .replace(/[^\s<>@"'«»()[\],;:]+@[^\s<>@"'«»()[\],;:]+/g, '•••@•••')
  .replace(/\+?\d[\d ]{6,}\d|\b\d{2}(?:[.-]\d{2}){4}\b/g, '•••')
  .replace(/group\.[A-Za-z0-9+/=_-]+/g, 'group.•••');
