import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EVENTS, isType, rank } from './vocabulaire.js';
import { uaFamily } from './detection.js';
import { networkOf, neutralize } from './reseau.js';

// Émission des événements de sécurité vers la Vigie (docs/etudes/annexe-vigie-architecture.md, sections 3.3 et 4.1).
// Chargé seulement quand VIGIE_URL est réglé : sans Vigie, le site n'envoie rien, ne garde rien, n'ajoute aucun crochet.
//
//   - un événement = un fait de sécurité, au vocabulaire fermé (vocabulaire.js), avec un identifiant unique (la Vigie
//     écarte les doublons d'un lot renvoyé), sans jeton ni donnée personnelle des personnes photographiées ;
//   - file en mémoire (10 000 au plus), envoyée chaque seconde en lots signés (HMAC-SHA-256 de « horodatage.nonce.corps »
//     avec VIGIE_INGEST_KEY), 200 événements et 256 ko au plus par lot ;
//   - Vigie injoignable : lots ajoutés à quelques fichiers de 1 Mo (STORAGE_DIR/securite-attente, 50 Mo au plus), dont
//     la liste est tenue en mémoire (le dossier n'est lu qu'au démarrage) ; nouvel essai après une attente qui double
//     (5 minutes au plus) ; un lot refusé par la Vigie (contenu invalide : 400, 413, 422) est écarté et compté ; une signature refusée (401) le garde, il ne bloque pas les suivants ;
//   - budget : 60 événements par heure pour un même réseau et un même type, sous la gravité « haut » ; au-delà, une
//     ligne tout de suite puis le compte à la fin de l'heure. Jamais pour un événement d'un compte connecté, de
//     connexion, de session, de données sensibles, de comptes ou du système ;
//   - battement chaque minute (la Vigie voit un site qui se tait).

const BATCH = 200;
const LOT_BYTES = 256 * 1024;
const QUEUE_MAX = 10_000;
const FLUSH_MS = 1000;
const HEARTBEAT_MS = 60 * 1000;
const SPOOL_MAX = 50 * 1024 * 1024;
const SEGMENT_MAX = 1024 * 1024;
const REPLAY_PER_PASS = 20;
const PER_KEY_HOUR = 60;
const HOUR = 3600e3;
const BACKOFF_MAX = 5 * 60e3;
const TIMEOUT_MS = 5000;
const DETAIL_MAX = 2000;
const KEYS_MAX = 10_000;
// Résumés par entité (décision D23) : pour ces familles publiques à fort volume, le premier événement d'une adresse part
// tout de suite, les suivants de la même fenêtre de 5 minutes sont comptés et partent en un seul événement résumé.
const AGGREGATED = new Set(['malicious_honeypot', 'malicious_excess_404', 'token_guess', 'input_validation_fail', 'authz_blocked', 'excess_rate_limit_exceeded']);
const AGG_WINDOW = 5 * 60e3;
// Jamais soumis au budget : ce qu'un attaquant ne doit pas pouvoir faire taire en saturant d'abord le réseau.
const UNBUDGETED = /^(?:authn_|session_|sensitive_|privilege_|user_|sys_|crypto_|malicious_excess_events$)/;

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
  const json = JSON.stringify(out);
  if (json.length > DETAIL_MAX) out = { tronque: true, debut: json.slice(0, DETAIL_MAX - 40) };
  return out;
}

class Refused extends Error {}         // la Vigie a répondu, et refuse le contenu de ce lot : inutile de le renvoyer

export function createSecurite({ url, key, storageDir, log, send = null, now = Date.now, timers = true }) {
  const endpoint = `${String(url).replace(/\/+$/, '')}/v1/events`;
  const spoolDir = path.join(storageDir, 'securite-attente');
  const queue = [];
  const budgets = new Map();             // « réseau|type » → { start, count, dropped, told }
  const aggregates = new Map();          // « adresse|type » → { start, n, last }
  let dropped = 0;                       // perdus (file pleine, tampon plein, refusés par la Vigie)
  let inflight = null;
  let flushTimer = null, beatTimer = null, sweepTimer = null;
  let down = false, failures = 0, nextTry = 0;
  const listeners = [];                  // tâches périodiques ajoutées par le site (état des comptes…)
  const stats = { sent: 0, spooled: 0, replayed: 0, failed: 0, refused: 0 };

  const post = send || (async (body, headers) => {
    const res = await fetch(endpoint, { method: 'POST', body, headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel?.().catch(() => {});                     // réponse jamais lue (rien d'utile, taille inconnue)
    if (res.status >= 200 && res.status < 300) return;
    // Refus du contenu du lot (400, 413, 422) : inutile de le renvoyer. 401 (clé ou horloge à régler) : on garde.
    const refused = [400, 413, 422].includes(res.status);
    const err = refused ? new Refused(`Vigie : lot refusé (${res.status})`) : new Error(`Vigie : réponse ${res.status}`);
    err.status = res.status;
    throw err;
  });

  const sign = body => {
    const ts = String(now());
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = crypto.createHmac('sha256', key).update(`${ts}.${nonce}.${body}`).digest('hex');
    return { 'content-type': 'application/json', 'x-vigie-ts': ts, 'x-vigie-nonce': nonce, 'x-vigie-sig': sig };
  };

  // ---------- budget ----------
  const excess = (reseau, type, detail) => push(build('malicious_excess_events', { ip_net: reseau, detail: { reseau, type, fenetre_min: 60, ...detail } }));
  function close(k, b) {
    if (b.dropped) { const [reseau, type] = k.split('|'); excess(reseau, type, { resumes: b.dropped }); }
    budgets.delete(k);
  }
  function sweep(all = false) {
    const t = now();
    for (const [k, b] of budgets) if (all || t - b.start >= HOUR) close(k, b);
    for (const [k, a] of aggregates) if (all || t - a.start >= AGG_WINDOW) { aggregates.delete(k); if (a.n) summary(a, t); }
  }
  const summary = (a, t) => push({ ...a.last, id: crypto.randomUUID(), survenu_a: t, detail: { ...(a.last.detail || {}), agrege: true, nombre: a.n, fenetre_min: AGG_WINDOW / 60e3 } });
  // Résumé par adresse et par type : true si l'événement part tel quel, false s'il est compté dans le résumé.
  function aggregate(ev) {
    if (!AGGREGATED.has(ev.type) || ev.sub || !ev.ip || rank(ev.severity) >= rank('haut')) return true;
    const k = `${ev.ip}|${ev.type}`;
    const t = now();
    const a = aggregates.get(k);
    if (!a || t - a.start >= AGG_WINDOW) {
      if (a?.n) summary(a, t);
      // Plus de place : la clé la plus ancienne part, avec son résumé (un afflux de clés ne cache pas un comptage).
      if (!a && aggregates.size >= KEYS_MAX) { const [k0, old] = aggregates.entries().next().value; aggregates.delete(k0); if (old.n) summary(old, t); }
      aggregates.set(k, { start: t, n: 0, last: ev });
      return true;
    }
    a.n += 1; a.last = ev;
    return false;
  }
  function budget(ev) {
    if (!ev.ip_net || ev.sub || UNBUDGETED.test(ev.type) || rank(ev.severity) >= rank('haut')) return true;
    const k = `${ev.ip_net}|${ev.type}`;
    const t = now();
    let b = budgets.get(k);
    if (b && t - b.start >= HOUR) { close(k, b); b = null; }
    if (!b) {
      if (budgets.size >= KEYS_MAX) sweep();
      if (budgets.size >= KEYS_MAX) { const [k0, b0] = budgets.entries().next().value; close(k0, b0); }
      b = { start: t, count: 0, dropped: 0, told: false };
      budgets.set(k, b);
    }
    b.count += 1;
    if (b.count <= PER_KEY_HOUR) return true;
    b.dropped += 1;
    if (!b.told) { b.told = true; excess(ev.ip_net, ev.type, { depasse: true }); }
    return false;
  }

  function build(type, { request = null, severity, sub, detail, emetteur = '', reference, status, ip_net, composant } = {}) {
    if (!isType(type)) throw new Error(`événement de sécurité inconnu : ${type}`);
    const net = networkOf(request);
    const ua = request?.headers?.['user-agent'];
    const session = request?.session;
    return {
      v: 1,
      id: crypto.randomUUID(),
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
      // Bordure (phase C3) : opérateur et empreinte TLS vus par le Worker, quand ses en-têtes signés sont là.
      detail: cleanDetail(request?.bordure ? { ...(detail || {}), bordure: { asn: request.bordure.asn, org: request.bordure.org, tls: request.bordure.tls } } : detail),
    };
  }

  function push(ev) {
    if (queue.length >= QUEUE_MAX) { queue.shift(); dropped += 1; }
    queue.push(ev);
  }

  // Lots : 200 événements et 256 ko au plus. late : lot gardé en attente, marqué « retard » dans le corps signé.
  function lotsOf(events, late = false) {
    const lots = [];
    let cur = [], size = 0;
    const done = () => {
      if (cur.length) lots.push({ events: cur, body: JSON.stringify({ emetteur: 'site', envoye_a: now(), ...(late ? { retard: true } : {}), lot: cur }) });
      cur = []; size = 0;
    };
    for (const ev of events) {
      const n = JSON.stringify(ev).length + 1;
      if (cur.length >= BATCH || (cur.length && size + n > LOT_BYTES)) done();
      cur.push(ev); size += n;
    }
    done();
    return lots;
  }

  // ---------- tampon ----------
  // Segments : fichiers .ndjson, une ligne par lot (corps renvoyé tel quel, signé de nouveau). Liste, tailles et nombre
  // d'événements tenus en mémoire ; le dossier n'est lu qu'au démarrage.
  const segments = [];                   // { name, size, events }
  let replay = null;                     // { name, lines, next } : segment en cours de renvoi
  (function load() {
    let names = [];
    try { names = fs.readdirSync(spoolDir).filter(f => /\.(?:ndjson|json)$/.test(f)).sort(); } catch { return; }
    for (const name of names) {
      try {
        const text = fs.readFileSync(path.join(spoolDir, name), 'utf8');
        let events = 0;
        for (const line of text.split('\n')) if (line.trim()) { try { events += JSON.parse(line).lot.length; } catch { events += 1; } }
        segments.push({ name, size: Buffer.byteLength(text), events });
      } catch { /* illisible : ignoré */ }
    }
  })();
  const spoolBytes = () => segments.reduce((s, x) => s + x.size, 0);
  function dropOldest() {
    const s = segments.shift();
    if (replay?.name === s.name) { dropped += s.events - countOf(replay.lines.slice(0, replay.next)); replay = null; } else dropped += s.events;
    fs.rmSync(path.join(spoolDir, s.name), { force: true });
  }
  const countOf = lines => lines.reduce((n, l) => { try { return n + JSON.parse(l).lot.length; } catch { return n + 1; } }, 0);
  function spoolLots(lots) {
    if (!lots.length) return;
    try {
      fs.mkdirSync(spoolDir, { recursive: true, mode: 0o700 });
      for (const lot of lots) {
        let cur = segments.at(-1);
        if (!cur || cur.size >= SEGMENT_MAX || cur.name === replay?.name) {
          cur = { name: `${String(now()).padStart(15, '0')}-${crypto.randomBytes(4).toString('hex')}.ndjson`, size: 0, events: 0 };
          segments.push(cur);
        }
        const line = `${lot.body}\n`;
        fs.appendFileSync(path.join(spoolDir, cur.name), line, { mode: 0o600 });
        cur.size += Buffer.byteLength(line); cur.events += lot.events.length;
        stats.spooled += lot.events.length;
      }
      while (segments.length > 1 && spoolBytes() > SPOOL_MAX) dropOldest();
    } catch (err) {
      for (const lot of lots) dropped += lot.events.length;
      log?.warn({ err: err.message }, 'Vigie : tampon impossible');
    }
  }
  const spoolEvents = events => spoolLots(lotsOf(events, true));

  function markDown(err) {
    failures += 1;
    nextTry = now() + Math.min(1000 * 2 ** Math.min(failures, 10), BACKOFF_MAX);
    if (!down) log?.warn({ err: err.message }, 'Vigie injoignable : événements gardés en attente');
    down = true;
  }
  function markUp() {
    if (down) log?.info('Vigie de nouveau joignable : renvoi des événements en attente');
    down = false; failures = 0; nextTry = 0;
  }

  // Envoi d'un lot : true (reçu, ou refusé et écarté), false (Vigie injoignable : à garder).
  async function deliver(body, count) {
    try {
      await post(body, sign(body));
      markUp();
      return true;
    } catch (err) {
      if (err instanceof Refused) {
        stats.refused += 1; dropped += count;
        log?.warn({ status: err.status }, 'Vigie : lot refusé, écarté');
        return true;
      }
      stats.failed += 1;
      markDown(err);
      return false;
    }
  }

  // Renvoi de ce qui attend sur le disque, du plus ancien au plus récent (20 lots par passage au plus).
  async function replaySpool() {
    let left = REPLAY_PER_PASS;
    while (segments.length && left > 0) {
      const seg = segments[0];
      if (replay?.name !== seg.name) {
        let text = '';
        try { text = fs.readFileSync(path.join(spoolDir, seg.name), 'utf8'); } catch { segments.shift(); continue; }
        replay = { name: seg.name, lines: text.split('\n').filter(l => l.trim()), next: 0 };
      }
      while (replay.next < replay.lines.length && left > 0) {
        const line = replay.lines[replay.next];
        if (!(await deliver(line, countOf([line])))) return false;
        replay.next += 1; left -= 1; stats.replayed += 1;
      }
      if (replay.next >= replay.lines.length) {
        segments.shift();
        replay = null;
        try { fs.rmSync(path.join(spoolDir, seg.name), { force: true }); } catch (err) { log?.warn({ err: err.message }, 'Vigie : fichier en attente non effacé'); }
      }
    }
    return true;
  }

  async function doFlush() {
    if (dropped) { const n = dropped; dropped = 0; queue.unshift(build('sys_events_dropped', { detail: { perdus: n } })); }
    // En panne, pas encore l'heure de réessayer : la file passe sur le disque (mémoire bornée), sans réseau.
    if (now() < nextTry) { if (queue.length) spoolEvents(queue.splice(0)); return; }
    // D'abord ce qui attend sur le disque (l'ordre est gardé), puis la file.
    if (!(await replaySpool()) || segments.length) { if (queue.length) spoolEvents(queue.splice(0)); return; }
    const lots = lotsOf(queue.splice(0));
    for (let i = 0; i < lots.length; i++) {
      if (await deliver(lots[i].body, lots[i].events.length)) { stats.sent += lots[i].events.length; continue; }
      spoolEvents(lots.slice(i).flatMap(l => l.events));
      return;
    }
  }

  function flush() {
    inflight ??= doFlush().catch(err => log?.error({ err: err.message }, 'Vigie : envoi')).finally(() => { inflight = null; });
    return inflight;
  }

  const securite = {
    enabled: true,
    stats,
    // emit(type, { request, severity, sub, detail, emetteur, reference, status }) : jamais d'exception vers l'appelant.
    emit(type, opts = {}) {
      let ev;
      try { ev = build(type, opts); } catch (err) { log?.error({ err: err.message }, 'Vigie : événement refusé'); return null; }
      if (!aggregate(ev) || !budget(ev)) return null;
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
    // Nouvel essai tout de suite, sans attendre la fin de l'attente (tests ; Vigie revenue).
    retryNow() { nextTry = 0; },
    sweep,
    pending: () => queue.length,
    spooled: () => segments.reduce((s, x) => s + x.events, 0),
    every(ms, fn) { listeners.push({ ms, fn, timer: null }); },
    // Tâches périodiques jouées une fois tout de suite (tests).
    runTasks() { for (const l of listeners) { try { l.fn(); } catch (err) { log?.error({ err: err.message }, 'Vigie : tâche périodique'); } } },
    start() {
      if (!timers) return;
      flushTimer = setInterval(() => { if (queue.length || segments.length) flush(); }, FLUSH_MS); flushTimer.unref();
      sweepTimer = setInterval(() => sweep(), 60e3); sweepTimer.unref();
      beatTimer = setInterval(() => securite.emit('sys_heartbeat', { emetteur: 'server/securite · battement', detail: { attente: securite.spooled() } }), HEARTBEAT_MS); beatTimer.unref();
      for (const l of listeners) { l.timer = setInterval(() => { try { l.fn(); } catch (err) { log?.error({ err: err.message }, 'Vigie : tâche périodique'); } }, l.ms); l.timer.unref(); }
    },
    // Arrêt : synthèses, un dernier envoi si la Vigie répond, et tout ce qui reste passe sur le disque (rien n'est perdu).
    async stop() {
      clearInterval(flushTimer); clearInterval(beatTimer); clearInterval(sweepTimer);
      for (const l of listeners) clearInterval(l.timer);
      sweep(true);
      if (inflight) await inflight;
      await flush();
      if (queue.length) spoolEvents(queue.splice(0));
    },
  };
  return securite;
}
