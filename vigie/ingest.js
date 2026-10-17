import crypto from 'node:crypto';
import net from 'node:net';
import Fastify from 'fastify';
import { isSiteType, SEVERITIES, SITE_COMPOSANTS } from './vocabulaire.js';
import { clean, num } from './util.js';

// Réception des événements du site et remise des décisions (réseau interne « vigie-ingest », annexe 4.1 et 4.2).
//   - chaque requête est signée par le site (HMAC-SHA-256 de « horodatage.nonce.corps », VIGIE_INGEST_KEY) : horodatage à
//     60 s près, nonce jamais vu (10 min), signature comparée en temps constant ; sinon 401 (le site garde ses lots) ;
//   - corps de 1 Mo au plus, 500 événements au plus ; chaque champ revérifié et borné ; canal, confiance et place dans
//     la chaîne sont fixés par la Vigie ; un événement invalide est écarté (et compté), les autres sont gardés ;
//   - GET /v1/decisions?depuis=N : attente longue (25 s) puis la liste signée.

const SKEW = 60e3;
const WAIT = 25e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createIngest({ store, decisions, ingestKey, now = Date.now, logger = false }) {
  // Pas de journal par requête : le site envoie chaque seconde ; les refus sont des événements de la Vigie.
  const app = Fastify({ logger, disableRequestLogging: true, bodyLimit: 1024 * 1024, trustProxy: false });
  const nonceSeen = store.db.prepare('SELECT 1 FROM nonces WHERE nonce = ?');
  const nonceAdd = store.db.prepare('INSERT INTO nonces (nonce, at) VALUES (?, ?)');
  let lastRefusal = 0;
  const refuse = (reply, request, raison) => {
    // Une alerte par minute au plus : un site mal réglé (clé, horloge) ne noie pas la base.
    if (now() - lastRefusal > 60e3) {
      lastRefusal = now();
      store.own('vigie_ingestion_refusee', { emetteur: 'vigie/ingest.js', detail: { raison, route: request.routeOptions?.url || request.url.slice(0, 60) }, ip: request.ip, ip_net: request.ip });
    }
    return reply.code(401).send({ error: raison });
  };
  const verify = (request, body) => {
    const ts = Number(request.headers['x-vigie-ts']);
    const nonce = String(request.headers['x-vigie-nonce'] || '');
    const sig = String(request.headers['x-vigie-sig'] || '');
    if (!Number.isFinite(ts) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return 'signature absente';
    if (Math.abs(now() - ts) > SKEW) return 'horloge décalée de plus de 60 s';
    const expected = crypto.createHmac('sha256', ingestKey).update(`${ts}.${nonce}.${body}`).digest();
    if (!crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'))) return 'signature fausse';
    if (nonceSeen.get(nonce)) return 'lot rejoué';
    nonceAdd.run(nonce, now());
    return null;
  };

  // Corps lu tel quel, quel que soit son type : la signature est vérifiée sur ces octets avant toute analyse.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (request, body, done) => done(null, body));

  // Un événement du site, revérifié champ par champ ; null s'il est invalide.
  function row(e, late) {
    if (!e || typeof e !== 'object' || !UUID.test(String(e.id)) || !isSiteType(e.type) || !SEVERITIES.includes(e.severity)) return null;
    const composant = e.origine?.composant;
    if (!SITE_COMPOSANTS.includes(composant)) return null;
    let detail = e.detail == null ? null : JSON.stringify(e.detail);
    if (detail && detail.length > 4096) detail = JSON.stringify({ tronque: true });
    const t = now();
    return {
      id: e.id, recu_a: t, survenu_a: num(e.survenu_a, t - 30 * 864e5, t + 5 * 60e3) ?? t, type: e.type, severity: e.severity,
      composant, emetteur: clean(e.origine?.emetteur, 120), canal: 'ingestion signée', confiance: 'rapporté', reference: clean(e.origine?.reference, 120),
      sub: clean(e.sub, 200), session: /^[0-9a-f]{12}$/.test(String(e.session)) ? e.session : null,
      ip: net.isIP(String(e.ip || '')) ? e.ip : null, ip_net: clean(e.ip_net, 50), country: /^[A-Z]{2}$/.test(String(e.country)) ? e.country : null,
      city: clean(e.city, 80), lat: num(e.lat, -90, 90), lon: num(e.lon, -180, 180), ua: clean(e.ua, 200), ua_family: clean(e.ua_family, 60),
      method: /^[A-Z]{3,10}$/.test(String(e.method)) ? e.method : null, route: clean(e.route, 120),
      status: Number.isInteger(e.status) && e.status >= 100 && e.status < 600 ? e.status : null, detail, retard: late,
    };
  }

  app.post('/v1/events', async (request, reply) => {
    const body = typeof request.body === 'string' ? request.body : '';
    const bad = verify(request, body);
    if (bad) return refuse(reply, request, bad);
    let parsed;
    try { parsed = JSON.parse(body); } catch { return reply.code(400).send({ error: 'JSON invalide' }); }
    if (parsed?.emetteur !== 'site' || !Array.isArray(parsed.lot) || parsed.lot.length > 500) return reply.code(400).send({ error: 'lot invalide' });
    const rows = parsed.lot.map(e => row(e, parsed.retard === true));
    const ok = rows.filter(Boolean);
    const added = store.add(ok);
    if (ok.length < rows.length) store.own('vigie_ingestion_refusee', { severity: 'moyen', emetteur: 'vigie/ingest.js', detail: { raison: 'événements invalides écartés', nombre: rows.length - ok.length } });
    return reply.code(200).send({ recus: rows.length, gardes: added, ecartes: rows.length - ok.length });
  });

  app.get('/v1/decisions', async (request, reply) => {
    const bad = verify(request, `GET ${request.url}`);
    if (bad) return refuse(reply, request, bad);
    const since = Number.parseInt(request.query.depuis, 10);
    if (Number.isFinite(since) && since >= decisions.version()) {
      await new Promise(resolve => {
        const t = setTimeout(done, WAIT);
        function done() { clearTimeout(t); decisions.events.off('change', done); request.raw.off('close', done); resolve(); }
        decisions.events.on('change', done);
        request.raw.on('close', done);
      });
    }
    return reply.header('cache-control', 'no-store').send(decisions.signed());
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  return app;
}
