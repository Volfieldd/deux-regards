import crypto from 'node:crypto';
import net from 'node:net';
import { EventEmitter } from 'node:events';
import { reseauDe } from '../server/securite/adresses-ip.js';

// Décisions de la Vigie, appliquées par le site (annexe architecture, section 4.2) : le site les lit, signées par la
// Vigie (Ed25519 ; le site n'a que la clé publique). Toutes sont bornées dans le temps ; aucune ne peut bloquer tout le
// monde. Chaque ligne porte un HMAC (clé du journal) : une décision écrite à la main dans la base n'est jamais signée
// pour le site.

// suspendre_acces : un accès d'une galerie privée (son numéro), suspendu par le site comme après 30 refus (registre des
// briques, BV-18, « Tranché » 5). Le site l'applique une fois par décision ; lever la décision ne rouvre pas l'accès
// (l'équipe le débloque dans l'admin du site).
export const KINDS = ['bloquer', 'revoquer_session', 'revoquer_compte', 'geler', 'verrouiller', 'suspendre_acces'];
export const SCOPES = ['tout', 'admin', 'auth'];
const DAY = 864e5;
export const MAX_DURATION = { bloquer: 30 * DAY, revoquer_session: 2 * DAY, revoquer_compte: 2 * DAY, geler: 30 * DAY, verrouiller: DAY, suspendre_acces: 30 * DAY };
export const MAX_ACTIVE = 10_000;
// Espace d'adresses IPv4 bloqué au total : l'équivalent d'un /8 au plus.
export const MAX_IPV4 = 2 ** 24;

export class DecisionError extends Error {}

// Plages IPv6 qui contiennent tout l'IPv4 (adresses IPv4 dans IPv6, NAT64, 6to4) : une règle qui les touche bloquerait
// tous les visiteurs IPv4. Plages locales jamais bloquées (vérification de santé, proxy).
const V6_IPV4 = new net.BlockList();
for (const [a, p] of [['::ffff:0:0', 96], ['::', 96], ['64:ff9b::', 96], ['2002::', 16]]) V6_IPV4.addSubnet(a, p, 'ipv6');
const V6_BASES = [['::ffff:0:0', 96], ['::', 96], ['64:ff9b::', 96], ['2002::', 16]];
const LOCAL = new net.BlockList();
LOCAL.addSubnet('127.0.0.0', 8, 'ipv4'); LOCAL.addAddress('::1', 'ipv6'); LOCAL.addSubnet('0.0.0.0', 8, 'ipv4');

// Adresse ou réseau à bloquer : IPv4 /8 à /32, IPv6 /32 à /128 ; jamais 0.0.0.0/0 ni ::/0, ni une plage IPv6 qui
// recouvre l'IPv4, ni la boucle locale.
export function parseTarget(cible) {
  const m = /^([^/%]+)(?:\/(\d{1,3}))?$/.exec(String(cible || '').trim());          // jamais d'identifiant de zone (%eth0)
  if (!m) throw new DecisionError('adresse ou réseau attendu (ex. 203.0.113.7 ou 203.0.113.0/24)');
  const v = net.isIP(m[1]);
  if (!v) throw new DecisionError(`adresse invalide : ${m[1]}`);
  const prefix = m[2] == null ? (v === 4 ? 32 : 128) : Number(m[2]);
  const [min, max] = v === 4 ? [8, 32] : [32, 128];
  if (prefix < min || prefix > max) throw new DecisionError(`réseau trop large ou invalide : /${prefix} (IPv${v} de /${min} à /${max})`);
  const type = v === 4 ? 'ipv4' : 'ipv6';
  if (LOCAL.check(m[1], type)) throw new DecisionError('adresse locale : jamais bloquée');
  if (v === 6) {
    const target = new net.BlockList(); target.addSubnet(m[1], prefix, 'ipv6');
    if (V6_IPV4.check(m[1], 'ipv6') || V6_BASES.some(([a]) => target.check(a, 'ipv6'))) throw new DecisionError('plage IPv6 qui recouvre des adresses IPv4 : refusée (bloquez l’adresse IPv4 elle-même)');
  }
  // Le réseau lui-même, sous sa forme canonique (bits d'hôte à zéro, IPv6 en minuscules et abrégée) : « 198.51.100.7/24 » est
  // gardé « 198.51.100.0/24 », jamais l'adresse d'une personne derrière un blocage de réseau (audit D3-C1).
  const address = reseauDe(m[1], prefix) || m[1];
  return { address, prefix, family: type, cible: `${address}/${prefix}`, size: v === 4 ? 2 ** (32 - prefix) : 0 };
}

export const parseDuration = text => {
  const m = /^(\d+)\s*(min|h|j|d)$/.exec(String(text || '').trim());
  if (!m) throw new DecisionError('durée attendue : 30min, 1h, 24h, 7j…');
  return Number(m[1]) * { min: 60e3, h: 3600e3, j: DAY, d: DAY }[m[2]];
};

export function createDecisions({ store, privateKey, now = Date.now }) {
  const { db, setting } = store;
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const rowMac = d => store.hmac(`decision|${d.id}|${d.kind}|${d.cible}|${d.portee ?? ''}|${d.par}|${d.cree_a}|${d.fin}|${d.leve_a ?? ''}|${d.leve_par ?? ''}|${d.details ?? ''}`);
  // Le signal part après la validation de la transaction en cours (revue C3) : une liste n'est jamais calculée sur une
  // décision qu'un point de sauvegarde annulerait ensuite.
  const bump = () => { setting.set('decisions_version', (setting.get('decisions_version', 0) || 0) + 1); setImmediate(() => events.emit('change')); };
  const live = () => db.prepare('SELECT * FROM decisions WHERE leve_a IS NULL AND fin > ? ORDER BY id').all(now());
  // Décisions actives et intègres ; une ligne à la signature fausse est écartée et signalée (une fois).
  const reported = new Set();
  function active() {
    const ok = [];
    for (const d of live()) {
      if (d.mac && d.mac === rowMac(d)) { ok.push(d); continue; }
      if (!reported.has(d.id)) { reported.add(d.id); store.own('log_integrity_fail', { emetteur: 'vigie/decisions.js', detail: { raison: 'décision sans signature valide, écartée', id: d.id, kind: d.kind, cible: d.cible } }); }
    }
    return ok;
  }

  // alerte : numéro de l'alerte à laquelle la décision répond (réponse automatique du moteur, décision prise depuis la
  // fiche d'une alerte), rangé dans la colonne indexée alerte_id (audit D3-D3 : la console cherchait les réponses d'une
  // alerte dans le motif, sans index). Sans lui, repris d'un motif « alerte #n » ou « alerte #n · … », comme la migration
  // 012. Hors de l'empreinte de la ligne (rowMac) et de la liste signée : il ne sert qu'à la console.
  const create = ({ kind, cible, portee = null, duree, motif = '', par, auto = false, details = null, alerte = null }) => db.transaction(() => {
    if (!KINDS.includes(kind)) throw new DecisionError(`action inconnue : ${kind}`);
    if (alerte != null && !(Number.isSafeInteger(Number(alerte)) && Number(alerte) > 0)) throw new DecisionError('numéro d’alerte invalide');
    if (!par) throw new DecisionError('auteur de la décision manquant');
    const ms = Math.min(typeof duree === 'number' ? duree : parseDuration(duree), MAX_DURATION[kind]);
    let target = String(cible || '').trim();
    const current = active();
    if (kind === 'bloquer') {
      const t = parseTarget(target);
      target = t.cible;
      if (!SCOPES.includes(portee || 'tout')) throw new DecisionError(`portée inconnue : ${portee}`);
      portee ||= 'tout';
      const used = current.filter(d => d.kind === 'bloquer').reduce((n, d) => n + parseTarget(d.cible).size, 0);
      if (used + t.size > MAX_IPV4) throw new DecisionError('trop d’adresses IPv4 bloquées au total (l’équivalent d’un /8 au plus)');
    } else if (kind === 'revoquer_session') {
      if (!/^[0-9a-f]{12,64}$/.test(target)) throw new DecisionError('empreinte de session attendue (12 caractères hexadécimaux au moins)');
    } else if (kind === 'suspendre_acces') {
      if (!/^[1-9]\d{0,14}$/.test(target)) throw new DecisionError('numéro d’accès attendu (celui de la galerie privée, tel que le journal l’écrit : detail.acces)');
    } else if (kind === 'verrouiller') {
      target = 'admin';
      const d = details || {};
      const comptes = [...new Set((d.comptes || []).map(String).filter(Boolean))];
      const adresses = [...new Set((d.adresses || []).map(a => parseTarget(a).cible))];
      if (!comptes.length && !adresses.length) throw new DecisionError('verrouillage : au moins un compte ou une adresse autorisés (sinon personne n’entre plus)');
      details = { comptes, adresses };
    } else if (!target || target.length > 200) throw new DecisionError('compte (sub) attendu');
    if (current.length >= MAX_ACTIVE) throw new DecisionError(`trop de décisions actives (${MAX_ACTIVE} au plus)`);
    const row = { kind, cible: target, portee, motif: String(motif).slice(0, 300), par, cree_a: now(), fin: now() + ms, auto: auto ? 1 : 0, details: details ? JSON.stringify(details) : null };
    const cite = /^alerte #([1-9]\d{0,14})(?: · |$)/.exec(row.motif);
    const alerteId = alerte != null ? Number(alerte) : cite ? Number(cite[1]) : null;
    row.id = Number(db.prepare('INSERT INTO decisions (kind, cible, portee, motif, par, cree_a, fin, auto, details, alerte_id) VALUES (@kind, @cible, @portee, @motif, @par, @cree_a, @fin, @auto, @details, @alerte_id)')
      .run({ ...row, alerte_id: alerteId }).lastInsertRowid);
    db.prepare('UPDATE decisions SET mac = ? WHERE id = ?').run(rowMac(row), row.id);
    store.own('vigie_decision', { emetteur: par, detail: { action: 'créée', id: row.id, kind, cible: target, portee, fin: row.fin, motif: row.motif, auto } });
    bump();
    return row.id;
  }).immediate();

  const lift = ({ id = null, all = false, par, motif = '' }) => db.transaction(() => {
    const t = now();
    const rows = all ? live() : live().filter(d => d.id === id);
    for (const d of rows) {
      const next = { ...d, leve_a: t, leve_par: par };
      db.prepare('UPDATE decisions SET leve_a = ?, leve_par = ?, mac = ? WHERE id = ?').run(t, par, rowMac(next), d.id);
    }
    const m = String(motif || '').trim().slice(0, 300) || undefined;
    if (rows.length) { store.own('vigie_decision', { emetteur: par, detail: { action: 'levée', id, toutes: all, nombre: rows.length, motif: m } }); bump(); }
    // Lever un verrouillage, une réponse automatique ou la décision de quelqu'un d'autre réduit la surveillance : les
    // Administrateurs en sont prévenus (audit D3-B4).
    const sensibles = rows.filter(d => d.kind === 'verrouiller' || d.auto || d.par !== par);
    if (sensibles.length) {
      store.own('vigie_surveillance_reduite', { emetteur: par, detail: { objet: all ? 'decisions:toutes' : `decision:${sensibles[0].id}`, kinds: [...new Set(sensibles.map(d => d.kind))], nombre: sensibles.length, motif: m } });
    }
    return rows.length;
  }).immediate();

  // Ce que lit le site : liste à jour, signée. Le site vérifie la signature sur la chaîne exacte reçue.
  function signed() {
    const list = active();
    const by = k => list.filter(d => d.kind === k);
    const lock = by('verrouiller').at(-1);
    const payload = JSON.stringify({
      usage: 'site',
      version: setting.get('decisions_version', 0) || 0,
      emis_a: now(),
      blocages: by('bloquer').map(d => ({ cible: d.cible, portee: d.portee, fin: d.fin })),
      sessions: by('revoquer_session').map(d => ({ prefixe: d.cible, fin: d.fin })),
      comptes: by('revoquer_compte').map(d => ({ sub: d.cible, avant: d.cree_a, fin: d.fin })),
      gels: by('geler').map(d => ({ sub: d.cible, fin: d.fin })),
      // Accès des galeries privées à suspendre : « depuis » distingue deux décisions successives sur le même accès (le site
      // applique chacune une fois).
      acces: by('suspendre_acces').map(d => ({ id: Number(d.cible), depuis: d.cree_a, fin: d.fin })),
      verrouillage: lock ? { fin: lock.fin, ...JSON.parse(lock.details) } : null,
    });
    return { payload, signature: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64') };
  }
  // Ce que lit la bordure (Worker Cloudflare, phase C3) : les blocages d'adresses seulement, jamais un compte ni une
  // session (minimisation : rien de personnel ne part chez Cloudflare au-delà des adresses qu'il voit déjà).
  // « usage » sépare les deux listes : signées par la même clé, chacune est refusée par l'autre lecteur.
  function signedEdge() {
    const payload = JSON.stringify({
      usage: 'bordure',
      version: setting.get('decisions_version', 0) || 0,
      emis_a: now(),
      // 1 000 au plus (coût de calcul du Worker) : les décisions prises à la main d'abord, puis les plus récentes.
      blocages: active().filter(d => d.kind === 'bloquer').sort((a, b) => a.auto - b.auto || b.cree_a - a.cree_a).slice(0, 1000)
        .map(d => ({ cible: d.cible, portee: d.portee, fin: d.fin })),
    });
    return { payload, signature: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64') };
  }

  // Résumé des alertes pour l'admin du site (phase D), signé comme les décisions, usage « resume » : jamais pris pour
  // une liste de décisions, ni par le site ni par la bordure.
  function signedSummary(summary, consoleUrl) {
    const payload = JSON.stringify({ usage: 'resume', emis_a: now(), console: consoleUrl, ...summary });
    return { payload, signature: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64') };
  }

  // Changement fait par la ligne de commande (autre processus) : vu par le service en relisant la version. Une décision
  // échue fait aussi repartir la liste (le site retire tout de suite ce qui a expiré).
  let seen = setting.get('decisions_version', 0);
  const nextEnd = () => db.prepare('SELECT MIN(fin) FROM decisions WHERE leve_a IS NULL AND fin > ?').pluck().get(now()) ?? null;
  let pendingEnd = nextEnd();
  const watch = () => {
    const v = setting.get('decisions_version', 0);
    if (v !== seen) { seen = v; pendingEnd = nextEnd(); events.emit('change'); return; }
    if (pendingEnd && now() >= pendingEnd) { bump(); seen = setting.get('decisions_version', 0); pendingEnd = nextEnd(); }
  };
  // Arrêt : les attentes longues en cours répondent tout de suite.
  const release = () => events.emit('change');

  return { create, lift, active, signed, signedEdge, signedSummary, events, watch, release, version: () => setting.get('decisions_version', 0) || 0 };
}
