import fs from 'node:fs';
import net from 'node:net';
import { readLimited } from './zitadel.js';
import { reseauDe } from '../server/securite/adresses-ip.js';

// Liste d'adresses bloquées chez Cloudflare (phase E3, annexe Cloudflare § 8) : les blocages de tout le site de 24 h
// et plus sont recopiés dans une liste d'adresses du compte (« vigie_bloquees » par défaut), qu'une règle du pare-feu
// de Cloudflare bloque avant tout (Worker compris) :
//   - un attaquant bloqué ne consomme plus le quota du Worker (100 000 requêtes par jour en offre gratuite) ;
//   - le blocage tient même si le Worker est coupé.
// Les blocages plus courts, ou d'une seule partie du site (admin, connexion), restent au Worker et au site : inutile
// d'user les 10 000 entrées de la liste. Les entrées de la liste sont rapprochées des décisions toutes les 5 minutes et
// après chaque changement : ce que la Vigie ne connaît plus est retiré, mais seulement les entrées qu'elle a posées
// (commentaire « Vigie #… ») : une entrée ajoutée à la main n'est jamais touchée.
// Cloudflare : IPv4 seule ou en réseau /8 à /32 ; IPv6 en réseau /12 à /64 (une adresse IPv6 est recopiée avec son /64).
// Ajouts et retraits sont asynchrones : la Vigie attend la fin de l'opération (une seule à la fois par liste).
// Jeton : celui de la bordure, avec en plus « Account Filter Lists : Edit ».

const API = 'https://api.cloudflare.com/client/v4';
const MIN = 24 * 3600e3;
const MAX_ITEMS = 10_000;
const PREFIX = 'Vigie #';

// Entrée de liste pour une cible de blocage (« 203.0.113.0/24 », « 2001:db8::5/128 »), ou null si Cloudflare ne la prend pas.
export function entreeDe(cible) {
  const m = /^([^/]+)\/(\d{1,3})$/.exec(String(cible || ''));
  if (!m) return null;
  const v = net.isIP(m[1]);
  const p = Number(m[2]);
  if (v === 4) {
    if (p < 8 || p > 32) return null;
    const a = reseauDe(m[1], p);
    return p === 32 ? a : `${a}/${p}`;
  }
  if (v === 6) {
    if (p < 12) return null;
    const q = Math.min(p, 64);
    return `${reseauDe(m[1], q)}/${q}`;
  }
  return null;
}

export function createCfList({ store, decisions, accountId, tokenFile, name = 'vigie_bloquees', fetchImpl = fetch, now = Date.now, log, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!/^[0-9a-f]{32}$/.test(accountId)) throw new Error('liste Cloudflare : identifiant de compte attendu (32 caractères hexadécimaux)');
  if (!/^[a-z0-9_]{1,50}$/.test(name)) throw new Error('VIGIE_CF_LISTE : nom de liste en minuscules, chiffres et _ (50 au plus)');
  const { setting } = store;
  const token = () => fs.readFileSync(tokenFile, 'utf8').trim();
  async function call(path, init = {}) {
    const r = await fetchImpl(`${API}/accounts/${accountId}/rules/lists${path}`, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${token()}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
    });
    const text = await readLimited(r, 8 * 1024 * 1024);
    let j = null;
    try { j = JSON.parse(text); } catch { /* pas du JSON */ }
    if (r.status !== 200 || !j?.success) {
      const why = j?.errors?.[0]?.message;
      throw new Error(`Cloudflare (liste) : réponse ${r.status}${why ? ` : ${String(why).slice(0, 160)}` : ''}`);
    }
    return j;
  }

  let listId = null;
  async function liste() {
    if (listId) return listId;
    const j = await call('');
    const found = (j.result || []).find(l => l.name === name && l.kind === 'ip');
    if (found) return (listId = found.id);
    const c = await call('', { method: 'POST', body: JSON.stringify({ name, kind: 'ip', description: 'Blocages de la Vigie (recopiés, ne pas modifier à la main)' }) });
    return (listId = c.result.id);
  }
  async function items(id) {
    const out = [];
    let cursor = null;
    for (let page = 0; page < 50; page++) {
      const j = await call(`/${id}/items?per_page=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      out.push(...(j.result || []));
      cursor = j.result_info?.cursors?.after;
      if (!cursor) break;
    }
    return out;
  }
  // Opération asynchrone : attendue jusqu'à 2 minutes.
  async function attendre(op) {
    for (let i = 0; i < 60; i++) {
      const j = await call(`/bulk_operations/${encodeURIComponent(op)}`);
      const st = j.result?.status;
      if (st === 'completed') return;
      if (st === 'failed') throw new Error(`Cloudflare (liste) : opération refusée${j.result?.error ? ` : ${String(j.result.error).slice(0, 160)}` : ''}`);
      await sleep(2000);
    }
    throw new Error('Cloudflare (liste) : opération toujours en cours après 2 minutes');
  }

  // Ce que la liste doit contenir : entrée → commentaire.
  function voulu() {
    const out = new Map();
    for (const d of decisions.active()) {
      if (d.kind !== 'bloquer' || d.portee !== 'tout' || d.fin - d.cree_a < MIN) continue;
      const e = entreeDe(d.cible);
      if (e && !out.has(e)) out.set(e, `${PREFIX}${d.id} jusqu’au ${new Date(d.fin).toISOString().slice(0, 16).replace('T', ' ')} UTC`);
      if (out.size >= MAX_ITEMS) break;
    }
    return out;
  }

  let running = null;
  async function syncOnce() {
    const id = await liste();
    const want = voulu();
    const have = await items(id);
    const present = new Set(have.map(i => i.ip));
    const ajouter = [...want].filter(([ip]) => !present.has(ip)).map(([ip, comment]) => ({ ip, comment }));
    const retirer = have.filter(i => String(i.comment || '').startsWith(PREFIX) && !want.has(i.ip)).map(i => ({ id: i.id }));
    if (ajouter.length) await attendre((await call(`/${id}/items`, { method: 'POST', body: JSON.stringify(ajouter) })).result.operation_id);
    if (retirer.length) await attendre((await call(`/${id}/items`, { method: 'DELETE', body: JSON.stringify({ items: retirer }) })).result.operation_id);
    const etat = { at: now(), ok: true, liste: name, total: want.size, ajoutees: ajouter.length, retirees: retirer.length };
    setting.set('cf_liste', etat);
    return etat;
  }
  // Une seule synchronisation à la fois ; échec noté (une fois par heure) et gardé dans l'état pour la santé.
  const told = new Map();
  function sync() {
    if (!running) {
      running = syncOnce().catch(err => {
        log?.warn({ err: err.message }, 'Vigie : liste Cloudflare');
        setting.set('cf_liste', { ...(setting.get('cf_liste', null) || {}), at_echec: now(), ok: false, erreur: String(err.message).slice(0, 200) });
        const hour = Math.floor(now() / 3600e3);
        if (told.get('liste') !== hour) {
          told.set('liste', hour);
          store.own('vigie_bordure_erreur', { emetteur: 'vigie/cloudflare-liste.js', detail: { operation: 'liste', erreur: String(err.message).slice(0, 200) } });
        }
        listId = null;
        return null;
      }).finally(() => { running = null; });
    }
    return running;
  }

  let timer = null, soon = null, first = null;
  const onChange = () => { if (!soon) { soon = setTimeout(() => { soon = null; sync(); }, 30e3); soon.unref?.(); } };
  return {
    sync,
    voulu,
    start(every = 5 * 60e3) {
      first = setTimeout(sync, 10e3); first.unref?.();
      timer = setInterval(sync, every); timer.unref?.();
      decisions.events?.on?.('change', onChange);
    },
    stop() { clearInterval(timer); clearTimeout(soon); clearTimeout(first); decisions.events?.off?.('change', onChange); },
  };
}
