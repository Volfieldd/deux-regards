import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EVENTS, isType, rank } from './vocabulaire.js';
import { uaFamily } from './detection.js';
import { networkOf, neutralize } from './reseau.js';

// Émission des événements de sécurité vers la Vigie (docs/etudes/annexe-vigie-architecture.md, sections 3.3 et 4.1).
// Chargé seulement quand VIGIE_URL est réglé : sans Vigie, le site n'envoie rien, ne garde rien, n'ajoute aucun crochet.
//
//   - un événement = un fait de sécurité, au vocabulaire fermé (vocabulaire.js), sans jeton ni donnée personnelle des
//     personnes photographiées ; l'adresse complète du visiteur n'est écrite que pour un événement (jamais pour une
//     visite normale) ;
//   - file en mémoire (10 000 au plus), envoyée chaque seconde ou dès 200 événements, en lots signés
//     (HMAC-SHA-256 de « horodatage.nonce.corps » avec VIGIE_INGEST_KEY) ;
//   - Vigie injoignable : lots écrits dans STORAGE_DIR/securite-attente (50 Mo au plus), renvoyés au retour ;
//   - budget par adresse : 60 événements par heure en dessous de « haut », puis une ligne de synthèse ;
//   - battement chaque minute (la Vigie voit un site qui se tait).

const BATCH = 200;
const QUEUE_MAX = 10_000;
const FLUSH_MS = 1000;
const HEARTBEAT_MS = 60 * 1000;
const SPOOL_MAX = 50 * 1024 * 1024;
const PER_IP_HOUR = 60;
const TIMEOUT_MS = 5000;
const DETAIL_MAX = 2000;

function cleanDetail(detail) {
  if (detail == null) return undefined;
  const walk = (v, depth) => {
    if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return neutralize(v);
    if (depth > 3) return undefined;
    if (Array.isArray(v)) return v.slice(0, 20).map(x => walk(x, depth + 1));
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [neutralize(k, 40), walk(x, depth + 1)]));
    return neutralize(v);
  };
  let out = walk(detail, 0);
  let json = JSON.stringify(out);
  if (json.length > DETAIL_MAX) out = { tronque: true, debut: json.slice(0, DETAIL_MAX - 40) };
  return out;
}

export function createSecurite({ url, key, storageDir, log, send = null, now = Date.now, timers = true }) {
  const endpoint = `${String(url).replace(/\/+$/, '')}/v1/events`;
  const spoolDir = path.join(storageDir, 'securite-attente');
  const queue = [];
  const perIp = new Map();               // réseau → { start, count, dropped }
  let dropped = 0;                       // perdus faute de place (file pleine, tampon plein)
  let sending = false;
  let flushTimer = null, beatTimer = null;
  const listeners = [];                  // tâches périodiques ajoutées par le site (état des comptes…)
  const stats = { sent: 0, spooled: 0, replayed: 0, failed: 0 };

  const post = send || (async (body, headers) => {
    const res = await fetch(endpoint, { method: 'POST', body, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.arrayBuffer().catch(() => {});
    if (res.status < 200 || res.status >= 300) throw new Error(`Vigie : réponse ${res.status}`);
  });

  const sign = (body, late = false) => {
    const ts = String(now());
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = crypto.createHmac('sha256', key).update(`${ts}.${nonce}.${body}`).digest('hex');
    return { 'content-type': 'application/json', 'x-vigie-ts': ts, 'x-vigie-nonce': nonce, 'x-vigie-sig': sig, ...(late ? { 'x-vigie-retard': '1' } : {}) };
  };

  // Budget par adresse : au-delà de 60 événements « bas » ou « moyen » par heure, les suivants sont comptés et résumés.
  function budget(ev) {
    if (!ev.ip_net || rank(ev.severity) >= rank('haut')) return true;
    const t = now();
    let b = perIp.get(ev.ip_net);
    if (b && t - b.start >= 3600e3) { summarize(ev.ip_net, b); b = null; }
    if (!b) {
      if (perIp.size >= 10_000) for (const [k, v] of perIp) { if (t - v.start >= 3600e3) { summarize(k, v); perIp.delete(k); } if (perIp.size < 10_000) break; }
      if (perIp.size >= 10_000) perIp.delete(perIp.keys().next().value);
      b = { start: t, count: 0, dropped: 0 };
      perIp.set(ev.ip_net, b);
    }
    b.count += 1;
    if (b.count <= PER_IP_HOUR) return true;
    b.dropped += 1;
    return false;
  }
  function summarize(net, b) {
    if (!b.dropped) return;
    push(build('malicious_excess_events', { detail: { reseau: net, resumes: b.dropped, fenetre_min: 60 }, ip_net: net }));
  }

  function build(type, { request = null, severity, sub, detail, emetteur = '', reference, status, ip_net, composant } = {}) {
    if (!isType(type)) throw new Error(`événement de sécurité inconnu : ${type}`);
    const net = networkOf(request);
    const ua = request?.headers?.['user-agent'];
    const session = request?.session;
    return {
      v: 1,
      type,
      severity: severity || EVENTS[type].severity,
      survenu_a: now(),
      origine: { composant: composant || EVENTS[type].composant, emetteur: neutralize(emetteur, 120), reference: reference || request?.id || undefined },
      sub: sub ?? session?.sub ?? undefined,
      session: session?.id ? String(session.id).slice(0, 12) : undefined,
      ...net,
      ip_net: net.ip_net || ip_net,
      ua: ua ? neutralize(ua) : undefined,
      ua_family: request ? uaFamily(ua) : undefined,
      method: request?.method,
      route: request ? neutralize(request.routeOptions?.url || '(aucune route)', 120) : undefined,
      status: status ?? undefined,
      detail: cleanDetail(detail),
    };
  }

  function push(ev) {
    if (queue.length >= QUEUE_MAX) { queue.shift(); dropped += 1; }
    queue.push(ev);
    if (queue.length >= BATCH) setImmediate(() => flush().catch(() => {}));
  }

  // Tampon : un fichier par lot, renvoyé dans l'ordre. Au-delà de 50 Mo, les plus anciens partent (et c'est dit).
  const spoolFiles = () => { try { return fs.readdirSync(spoolDir).filter(f => f.endsWith('.json')).sort(); } catch { return []; } };
  function spool(body, count) {
    try {
      fs.mkdirSync(spoolDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(spoolDir, `${now()}-${crypto.randomBytes(4).toString('hex')}.json`), body, { mode: 0o600 });
      stats.spooled += count;
      let files = spoolFiles();
      let total = files.reduce((s, f) => s + (fs.statSync(path.join(spoolDir, f)).size), 0);
      while (total > SPOOL_MAX && files.length > 1) {
        const f = files.shift();
        const p = path.join(spoolDir, f);
        total -= fs.statSync(p).size;
        try { dropped += JSON.parse(fs.readFileSync(p, 'utf8')).lot.length; } catch { dropped += 1; }
        fs.rmSync(p, { force: true });
      }
    } catch (err) {
      dropped += count;
      log?.warn({ err: err.message }, 'Vigie : tampon impossible');
    }
  }

  async function flush() {
    if (sending) return;
    sending = true;
    try {
      if (dropped) { const n = dropped; dropped = 0; queue.unshift(build('sys_events_dropped', { detail: { perdus: n } })); }
      while (queue.length) {
        const lot = queue.splice(0, BATCH);
        const body = JSON.stringify({ emetteur: 'site', envoye_a: now(), lot });
        try {
          await post(body, sign(body));
          stats.sent += lot.length;
        } catch (err) {
          stats.failed += 1;
          spool(body, lot.length);
          log?.warn({ err: err.message }, 'Vigie injoignable : événements gardés en attente');   // le reste de la file attend le prochain passage
          return;
        }
      }
      // Vigie joignable : un lot en attente renvoyé à chaque passage (sans noyer la Vigie au retour).
      const [first] = spoolFiles();
      if (first) {
        const p = path.join(spoolDir, first);
        const body = fs.readFileSync(p, 'utf8');
        try { await post(body, sign(body, true)); stats.replayed += 1; fs.rmSync(p, { force: true }); } catch { stats.failed += 1; }
      }
    } finally {
      sending = false;
    }
  }

  const securite = {
    enabled: true,
    stats,
    // emit(type, { request, severity, sub, detail, emetteur, reference, status }) : jamais d'exception vers l'appelant.
    emit(type, opts = {}) {
      let ev;
      try { ev = build(type, opts); } catch (err) { log?.error({ err: err.message }, 'Vigie : événement refusé'); return null; }
      if (!budget(ev)) return null;
      push(ev);
      return ev;
    },
    // Événement sans requête limité dans le temps (échecs de déchiffrement en rafale) : un par clé et par minute, avec le
    // nombre d'occurrences regroupées.
    emitThrottled: (() => {
      const last = new Map();
      return (k, type, opts = {}) => {
        const t = now();
        const e = last.get(k) || { at: 0, n: 0 };
        e.n += 1;
        if (t - e.at < 60e3) { last.set(k, e); return null; }
        last.set(k, { at: t, n: 0 });
        return securite.emit(type, { ...opts, detail: { ...(opts.detail || {}), occurrences: e.n } });
      };
    })(),
    flush,
    pending: () => queue.length,
    spooled: () => spoolFiles().length,
    every(ms, fn) { listeners.push({ ms, fn, timer: null }); },
    // Tâches périodiques jouées une fois tout de suite (tests, arrêt).
    runTasks() { for (const l of listeners) { try { l.fn(); } catch (err) { log?.error({ err: err.message }, 'Vigie : tâche périodique'); } } },
    start() {
      if (!timers) return;
      flushTimer = setInterval(() => flush().catch(() => {}), FLUSH_MS); flushTimer.unref();
      beatTimer = setInterval(() => securite.emit('sys_heartbeat', { emetteur: 'server/securite · battement', detail: { attente: spoolFiles().length } }), HEARTBEAT_MS); beatTimer.unref();
      for (const l of listeners) { l.timer = setInterval(() => { try { l.fn(); } catch (err) { log?.error({ err: err.message }, 'Vigie : tâche périodique'); } }, l.ms); l.timer.unref(); }
    },
    async stop() {
      clearInterval(flushTimer); clearInterval(beatTimer);
      for (const l of listeners) clearInterval(l.timer);
      for (const [k, b] of perIp) { summarize(k, b); perIp.delete(k); }
      await flush().catch(() => {});
    },
  };
  return securite;
}
