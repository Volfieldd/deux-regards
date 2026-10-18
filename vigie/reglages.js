import net from 'node:net';
import { DecisionError, parseDuration } from './decisions.js';
import { checkRoles } from './controle-roles.js';
import { adresseCanonique } from '../server/securite/adresses-ip.js';

// Réglages partagés par la ligne de commande et la console (phase D3c) : mêmes règles, quel que soit l'appelant.

const canonique = ip => adresseCanonique(String(ip)) || String(ip);

// Adresses de confiance (jamais bloquées automatiquement) : toujours pour une durée (7 jours au plus), avec un motif ;
// un ajout réduit la surveillance et le signale aux Administrateurs.
export function setTrust(store, { action, ip, duree, motif, par, now = Date.now }) {
  if (!['ajouter', 'retirer'].includes(action) || !net.isIP(String(ip || ''))) throw new DecisionError('adresse IP attendue (ex. 203.0.113.7)');
  // Forme canonique (audit D3-B9) : « 2001:0db8::7 » et « 2001:DB8::7 » sont la même adresse que « 2001:db8::7 ».
  ip = canonique(ip);
  const m = String(motif || '').trim().slice(0, 200);
  const toutes = store.setting.get('adresses_confiance', []).filter(x => x && typeof x === 'object');
  const list = toutes.filter(x => canonique(x.ip) !== ip);
  if (action === 'retirer' && list.length === toutes.length) throw new DecisionError(`adresse ${ip} absente des adresses de confiance`);
  if (action === 'ajouter') {
    if (!duree) throw new DecisionError('adresse de confiance toujours pour une durée (7 jours au plus)');
    if (!m) throw new DecisionError('adresse de confiance : motif obligatoire');
    const jusqua = now() + Math.min(parseDuration(duree), 7 * 864e5);
    list.push({ ip, jusqua, par, motif: m });
    store.own('vigie_surveillance_reduite', { emetteur: par, detail: { objet: `confiance:${ip}`, jusqua, motif: m } });
  }
  store.setting.set('adresses_confiance', list);
  store.own('vigie_interrupteur', { emetteur: par, detail: { adresse_confiance: action, ip } });
  return list;
}

// Contrôle des rôles : relance, et avec accepter, l'instantané actuel devient la référence. Jamais pendant qu'une alerte
// du contrôle est ouverte (accepter rendrait légitime ce qu'elle signale) ; motif obligatoire.
export function runRolesCheck(store, { accepter = false, motif, par, siteBackupDir, now = Date.now }) {
  const m = String(motif || '').trim().slice(0, 200);
  if (accepter) {
    const open = store.db.prepare("SELECT id FROM alerts WHERE regle = 'sigma.controle_roles' AND statut != 'close' ORDER BY id DESC LIMIT 1").pluck().get();
    if (open) throw new DecisionError(`alerte #${open} du contrôle des rôles encore ouverte : classez-la d'abord`);
    if (!m) throw new DecisionError('référence acceptée : motif obligatoire');
  }
  store.setting.set('controle_roles_vu', null);
  if (!accepter) return checkRoles({ store, siteBackupDir, now });
  // Accepter : la référence n'est remplacée que si une sauvegarde lisible la remplace (audit D3-B6) ; sinon l'ancienne
  // est remise (sans elle, plus aucun blocage automatique d'adresse ni confirmation pour une adresse d'administrateur).
  const avant = { admins: store.setting.get('controle_roles_admins', null), declencheurs: store.setting.get('controle_roles_declencheurs', null) };
  store.setting.set('controle_roles_admins', null);
  store.setting.set('controle_roles_declencheurs', null);
  const r = checkRoles({ store, siteBackupDir, now });
  if (r.ok === null || r.erreur) {
    store.setting.set('controle_roles_admins', avant.admins);
    store.setting.set('controle_roles_declencheurs', avant.declencheurs);
    throw new DecisionError(`aucune sauvegarde du site lisible : référence non acceptée${r.raison ? ` (${r.raison})` : ''}`);
  }
  store.own('vigie_interrupteur', { emetteur: par, detail: { controle_roles: 'référence acceptée', motif: m } });
  store.own('vigie_surveillance_reduite', { emetteur: par, detail: { objet: 'controle_roles:reference', motif: m } });
  return r;
}
