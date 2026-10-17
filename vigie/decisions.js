import crypto from 'node:crypto';
import net from 'node:net';
import { EventEmitter } from 'node:events';

// Décisions de la Vigie, appliquées par le site (annexe architecture, section 4.2) : le site les lit, signées par la
// Vigie (Ed25519 ; le site n'a que la clé publique). Toutes sont bornées dans le temps ; aucune ne peut bloquer tout le
// monde.

export const KINDS = ['bloquer', 'revoquer_session', 'revoquer_compte', 'geler', 'verrouiller'];
export const SCOPES = ['tout', 'admin', 'auth'];
const DAY = 864e5;
export const MAX_DURATION = { bloquer: 30 * DAY, revoquer_session: 2 * DAY, revoquer_compte: 2 * DAY, geler: 30 * DAY, verrouiller: DAY };
export const MAX_ACTIVE = 10_000;

export class DecisionError extends Error {}

// Adresse ou réseau à bloquer : IPv4 /8 à /32, IPv6 /32 à /128 ; jamais 0.0.0.0/0 ni ::/0.
export function parseTarget(cible) {
  const m = /^([^/]+)(?:\/(\d{1,3}))?$/.exec(String(cible || '').trim());
  if (!m) throw new DecisionError('adresse ou réseau attendu (ex. 203.0.113.7 ou 203.0.113.0/24)');
  const v = net.isIP(m[1]);
  if (!v) throw new DecisionError(`adresse invalide : ${m[1]}`);
  const prefix = m[2] == null ? (v === 4 ? 32 : 128) : Number(m[2]);
  const [min, max] = v === 4 ? [8, 32] : [32, 128];
  if (prefix < min || prefix > max) throw new DecisionError(`réseau trop large ou invalide : /${prefix} (IPv${v} de /${min} à /${max})`);
  return { address: m[1], prefix, family: v === 4 ? 'ipv4' : 'ipv6', cible: `${m[1]}/${prefix}` };
}

export const parseDuration = text => {
  const m = /^(\d+)\s*(min|h|j|d)$/.exec(String(text || '').trim());
  if (!m) throw new DecisionError('durée attendue : 30min, 1h, 24h, 7j…');
  return Number(m[1]) * { min: 60e3, h: 3600e3, j: DAY, d: DAY }[m[2]];
};

export function createDecisions({ store, privateKey, now = Date.now }) {
  const { db, setting } = store;
  const events = new EventEmitter();
  events.setMaxListeners(100);
  const bump = () => { setting.set('decisions_version', (setting.get('decisions_version', 0) || 0) + 1); events.emit('change'); };
  const active = () => db.prepare('SELECT * FROM decisions WHERE leve_a IS NULL AND fin > ? ORDER BY id').all(now());

  function create({ kind, cible, portee = null, duree, motif = '', par, auto = false, details = null }) {
    if (!KINDS.includes(kind)) throw new DecisionError(`action inconnue : ${kind}`);
    if (!par) throw new DecisionError('auteur de la décision manquant');
    const ms = Math.min(typeof duree === 'number' ? duree : parseDuration(duree), MAX_DURATION[kind]);
    let target = String(cible || '').trim();
    if (kind === 'bloquer') {
      target = parseTarget(target).cible;
      if (!SCOPES.includes(portee || 'tout')) throw new DecisionError(`portée inconnue : ${portee}`);
      portee ||= 'tout';
    } else if (kind === 'revoquer_session') {
      if (!/^[0-9a-f]{12,64}$/.test(target)) throw new DecisionError('empreinte de session attendue (12 caractères hexadécimaux au moins)');
    } else if (kind === 'verrouiller') {
      target = 'admin';
      const d = details || {};
      const comptes = [...new Set((d.comptes || []).map(String).filter(Boolean))];
      const adresses = [...new Set((d.adresses || []).map(a => parseTarget(a).cible))];
      if (!comptes.length && !adresses.length) throw new DecisionError('verrouillage : au moins un compte ou une adresse autorisés (sinon personne n’entre plus)');
      details = { comptes, adresses };
    } else if (!target || target.length > 200) throw new DecisionError('compte (sub) attendu');
    if (active().length >= MAX_ACTIVE) throw new DecisionError(`trop de décisions actives (${MAX_ACTIVE} au plus)`);
    const id = db.prepare(`INSERT INTO decisions (kind, cible, portee, motif, par, cree_a, fin, auto, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(kind, target, portee, String(motif).slice(0, 300), par, now(), now() + ms, auto ? 1 : 0, details ? JSON.stringify(details) : null).lastInsertRowid;
    bump();
    store.own('vigie_decision', { emetteur: par, detail: { action: 'créée', id: Number(id), kind, cible: target, portee, fin: now() + ms, motif: String(motif).slice(0, 300), auto } });
    return Number(id);
  }

  function lift({ id = null, all = false, par }) {
    const t = now();
    const n = all ? db.prepare('UPDATE decisions SET leve_a = ?, leve_par = ? WHERE leve_a IS NULL AND fin > ?').run(t, par, t).changes
      : db.prepare('UPDATE decisions SET leve_a = ?, leve_par = ? WHERE id = ? AND leve_a IS NULL').run(t, par, id).changes;
    if (n) { bump(); store.own('vigie_decision', { emetteur: par, detail: { action: 'levée', id, toutes: all, nombre: n } }); }
    return n;
  }

  // Ce que lit le site : liste à jour, signée. Le site vérifie la signature sur la chaîne exacte reçue.
  function signed() {
    const list = active();
    const by = k => list.filter(d => d.kind === k);
    const lock = by('verrouiller').at(-1);
    const payload = JSON.stringify({
      version: setting.get('decisions_version', 0) || 0,
      emis_a: now(),
      blocages: by('bloquer').map(d => ({ cible: d.cible, portee: d.portee, fin: d.fin })),
      sessions: by('revoquer_session').map(d => ({ prefixe: d.cible, fin: d.fin })),
      comptes: by('revoquer_compte').map(d => ({ sub: d.cible, avant: d.cree_a, fin: d.fin })),
      gels: by('geler').map(d => ({ sub: d.cible, fin: d.fin })),
      verrouillage: lock ? { fin: lock.fin, ...JSON.parse(lock.details) } : null,
    });
    return { payload, signature: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64') };
  }

  // Changement fait par la ligne de commande (autre processus) : vu par le service en relisant la version.
  // Une décision échue fait aussi repartir la liste (le site retire tout de suite ce qui a expiré).
  let seen = setting.get('decisions_version', 0);
  const nextEnd = () => db.prepare('SELECT MIN(fin) FROM decisions WHERE leve_a IS NULL AND fin > ?').pluck().get(now()) ?? null;
  let pendingEnd = nextEnd();
  const watch = () => {
    const v = setting.get('decisions_version', 0);
    if (v !== seen) { seen = v; pendingEnd = nextEnd(); events.emit('change'); return; }
    if (pendingEnd && now() >= pendingEnd) { bump(); seen = setting.get('decisions_version', 0); pendingEnd = nextEnd(); }
  };

  return { create, lift, active, signed, events, watch, version: () => setting.get('decisions_version', 0) || 0 };
}
