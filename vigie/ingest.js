import crypto from 'node:crypto';
import net from 'node:net';
import Fastify from 'fastify';
import { isSiteType, SEVERITIES, SITE_COMPOSANTS } from './vocabulaire.js';
import { clean, num, netOf } from './util.js';
import { cleReseau } from '../server/securite/adresses-ip.js';

// Réseau d'un événement reçu : tiré de l'adresse quand elle est là (même calcul que le site, forme canonique) ; sinon la clé
// envoyée, ramenée à sa forme canonique (une ancienne clé fausse, « 2a01::bad:: », ne garde jamais l'hôte : audit D3-C4).
const reseauRecu = e => (typeof e.ip === 'string' && net.isIP(e.ip) ? netOf(e.ip) : null)
  ?? (typeof e.ip_net === 'string' ? cleReseau(e.ip_net) ?? clean(e.ip_net, 50) : null);

const str = v => (typeof v === 'string' ? v : null);

// Réception des événements du site et remise des décisions (réseau interne « vigie-ingest », annexe 4.1 et 4.2).
//   - chaque requête est signée par le site (HMAC-SHA-256 de « horodatage.nonce.corps », VIGIE_INGEST_KEY) : horodatage à
//     60 s près, nonce jamais vu (10 min), signature comparée en temps constant ; sinon 401 (le site garde ses lots) ;
//   - corps de 1 Mo au plus, 500 événements au plus ; chaque champ revérifié et borné ; canal, confiance et place dans
//     la chaîne sont fixés par la Vigie ; un événement invalide est écarté (et compté), les autres sont gardés ;
//   - GET /v1/decisions?depuis=N : attente longue (25 s) puis la liste signée ;
//   - GET /v1/resume : résumé signé des alertes ouvertes pour l'admin du site (phase D).

const SKEW = 60e3;
const WAIT = 25e3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createIngest({ store, decisions, ingestKey, now = Date.now, logger = false, summary = null, consoleUrl = 'https://vigie.nicephos.art' }) {
  // Pas de journal par requête : le site envoie chaque seconde ; les refus sont des événements de la Vigie.
  const app = Fastify({ logger, bodyLimit: 1024 * 1024, trustProxy: false });
  // Arrêt : les attentes longues répondent tout de suite (Docker n'attend que 10 s).
  app.addHook('preClose', async () => decisions.release());
  const nonceSeen = store.db.prepare('SELECT 1 FROM nonces WHERE nonce = ?');
  const nonceAdd = store.db.prepare('INSERT INTO nonces (nonce, at) VALUES (?, ?)');
  let lastRefusal = 0;
  const refuse = (reply, request, raison) => {
    // Une alerte par minute au plus : un site mal réglé (clé, horloge) ne noie pas la base.
    if (now() - lastRefusal > 60e3) {
      lastRefusal = now();
      store.own('vigie_ingestion_refusee', { emetteur: 'vigie/ingest.js', detail: { raison, route: request.routeOptions?.url || request.url.slice(0, 60) }, ip: request.ip, ip_net: netOf(request.ip) });
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
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.id !== 'string' || !UUID.test(e.id) || typeof e.type !== 'string' || !isSiteType(e.type) || !SEVERITIES.includes(e.severity)) return null;
    const composant = e.origine?.composant;
    if (!SITE_COMPOSANTS.includes(composant)) return null;
    const t = now();
    // Deux horodatages (arbitrage NC7) : survenu_a, l'heure du site (bornée : 30 jours en arrière, 5 minutes en avant,
    // pour les détecteurs), recu_a, l'heure de réception par la Vigie. Une heure du site hors bornes est gardée telle
    // quelle dans le détail (horodatage_site_brut) : rien n'est perdu, et l'écart se voit.
    const site = num(e.survenu_a, t - 30 * 864e5, t + 5 * 60e3);
    const raw = typeof e.survenu_a === 'number' && Number.isFinite(e.survenu_a) && site == null ? e.survenu_a : null;
    let base = e.detail;
    if (raw != null) base = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : base == null ? {} : { valeur: base }), horodatage_site_brut: raw };
    let detail = base == null ? null : JSON.stringify(base);
    if (detail && detail.length > 4096) detail = JSON.stringify({ tronque: true, ...(raw != null ? { horodatage_site_brut: raw } : {}) });
    return {
      id: e.id, recu_a: t, survenu_a: site ?? t, type: e.type, severity: e.severity,
      composant, emetteur: clean(str(e.origine?.emetteur), 120), canal: 'ingestion signée', confiance: 'rapporté', reference: clean(str(e.origine?.reference), 120),
      sub: clean(str(e.sub), 200), session: typeof e.session === 'string' && /^[0-9a-f]{12}$/.test(e.session) ? e.session : null,
      ip: typeof e.ip === 'string' && net.isIP(e.ip) ? e.ip : null, ip_net: reseauRecu(e), country: typeof e.country === 'string' && /^[A-Z]{2}$/.test(e.country) ? e.country : null,
      city: clean(str(e.city), 80), lat: num(e.lat, -90, 90), lon: num(e.lon, -180, 180), ua: clean(str(e.ua), 200), ua_family: clean(str(e.ua_family), 60),
      method: typeof e.method === 'string' && /^[A-Z]{3,10}$/.test(e.method) ? e.method : null, route: clean(str(e.route), 120),
      status: Number.isInteger(e.status) && e.status >= 100 && e.status < 600 ? e.status : null, detail, retard: late,
    };
  }

  // Routes sans journal par requête (le site envoie chaque seconde) : les refus sont des événements de la Vigie.
  app.post('/v1/events', { logLevel: 'warn' }, async (request, reply) => {
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

  app.get('/v1/decisions', { logLevel: 'warn' }, async (request, reply) => {
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

  // Résumé des alertes pour l'admin du site (phase D) : requête signée comme les autres, réponse signée.
  app.get('/v1/resume', { logLevel: 'warn' }, async (request, reply) => {
    const bad = verify(request, `GET ${request.url}`);
    if (bad) return refuse(reply, request, bad);
    if (!summary) return reply.code(404).send({ error: 'résumé indisponible' });
    return reply.header('cache-control', 'no-store').send(decisions.signedSummary(summary(), consoleUrl));
  });

  app.get('/healthz', { logLevel: 'warn' }, async () => ({ status: 'ok' }));
  return app;
}
