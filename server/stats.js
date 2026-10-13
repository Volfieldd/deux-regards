import crypto from 'node:crypto';

// Mesure d'audience anonyme, sans cookie ni service tiers (exemption de consentement CNIL) :
// - aucune adresse IP ni identifiant n'est stocké : un visiteur du jour est reconnu par une empreinte
//   (IP + navigateur + clé aléatoire du jour), gardée en mémoire jusqu'à minuit puis oubliée ;
// - la clé change chaque jour : impossible de suivre quelqu'un d'un jour à l'autre ;
// - seuls des compteurs par jour sont écrits, et effacés au bout de 25 mois ;
// - robots, visites des administrateurs et navigateurs « Do Not Track » / GPC ne sont pas comptés ;
// - pays : le code fourni par Cloudflare (en-tête CF-IPCountry), seulement derrière le proxy de confiance ;
//   le site ne géolocalise rien lui-même et ne garde pas l'adresse.
export const RETENTION_MONTHS = 25;
export const BOTS = /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|preview|curl|wget|python|httpclient|go-http|java\/|headless|lighthouse|pingdom|uptime|monitor|scan/i;
const MOBILE = /mobi|android|iphone|ipod|ipad/i;
// Bornes contre le gonflement des compteurs (et de la mémoire) par un seul client qui varie son navigateur :
export const LIMITS = { visitors: 200_000, perAddress: 5, sources: 60 };

// Provenance : le domaine « enregistrable » approximatif (« l.instagram.com » → « instagram.com »,
// « news.bbc.co.uk » → « bbc.co.uk »), pour que chaque sous-domaine ne crée pas sa propre ligne.
export function siteOf(host) {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const sld = parts.at(-2);
  return parts.slice(sld.length <= 3 && ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'gouv'].includes(sld) ? -3 : -2).join('.');
}

// Jour à l'heure de Paris : AAAA-MM-JJ.
export const parisDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// Provenance : le nom du site d'origine, sans « www. » ; les visites venues du site lui-même ne comptent pas.
export function sourceOf(referer, ownHost) {
  if (!referer) return 'direct';
  let host;
  try { host = new URL(referer).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'direct'; }
  if (!host || host === ownHost) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return 'autres';
  return siteOf(host).slice(0, 80);
}

// Pays du visiteur : code ISO à deux lettres donné par Cloudflare ; « XX » si absent, invalide, Tor (« T1 »),
// ou si la requête ne vient pas du proxy de confiance (l'en-tête pourrait alors être inventé).
export function countryOf(headers, trusted) {
  const c = String(headers?.['cf-ipcountry'] || '').toUpperCase();
  return trusted && /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : 'XX';
}

export function createStats({ db, publicUrl, now = () => new Date(), log, trustCountry = false }) {
  const ownHost = (() => { try { return new URL(publicUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const q = {
    page: db.prepare('INSERT INTO stats_pages (day, page, views) VALUES (?, ?, 1) ON CONFLICT(day, page) DO UPDATE SET views = views + 1'),
    photo: db.prepare('INSERT INTO stats_photos (day, photo_id, views) VALUES (?, ?, 1) ON CONFLICT(day, photo_id) DO UPDATE SET views = views + 1'),
    visitor: db.prepare('INSERT INTO stats_days (day, visitors, mobile) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET visitors = visitors + 1, mobile = mobile + excluded.mobile'),
    source: db.prepare('INSERT INTO stats_sources (day, source, visits) VALUES (?, ?, 1) ON CONFLICT(day, source) DO UPDATE SET visits = visits + 1'),
    country: db.prepare('INSERT INTO stats_countries (day, country, visitors) VALUES (?, ?, 1) ON CONFLICT(day, country) DO UPDATE SET visitors = visitors + 1'),
  };
  let day = null;
  let salt = null;
  let seen = new Set();
  let perAddress = new Map();                     // empreinte de l'adresse seule → nombre de navigateurs vus
  let sourcesToday = new Set();

  // Nouveau jour : nouvelle clé, empreintes oubliées, purge des compteurs trop anciens.
  function rollover() {
    const today = parisDay(now());
    if (today === day) return today;
    day = today;
    salt = crypto.randomBytes(32);
    seen = new Set();
    perAddress = new Map();
    sourcesToday = new Set(db.prepare('SELECT source FROM stats_sources WHERE day = ?').pluck().all(today));
    const limit = new Date(now());
    limit.setUTCMonth(limit.getUTCMonth() - RETENTION_MONTHS);
    const cut = parisDay(limit);
    for (const t of ['stats_pages', 'stats_photos', 'stats_days', 'stats_sources', 'stats_countries']) db.prepare(`DELETE FROM ${t} WHERE day < ?`).run(cut);
    return today;
  }

  // Une visite compte-t-elle ? (GET d'une vraie page, ni robot, ni admin connecté, ni refus de suivi)
  function counted(request) {
    if (request.method !== 'GET') return false;
    const h = request.headers;
    if (h.dnt === '1' || h['sec-gpc'] === '1') return false;
    if (/prefetch|prerender/i.test(`${h.purpose || ''} ${h['sec-purpose'] || ''}`)) return false;
    if (request.session) return false;                     // les auteurs ne se comptent pas eux-mêmes
    const ua = h['user-agent'] || '';
    return Boolean(ua) && !BOTS.test(ua);
  }

  return {
    // target : { page: 'accueil' } ou { photoId: 12 }
    hit(request, target) {
      try {
        if (!counted(request)) return false;
        const today = rollover();
        const ua = request.headers['user-agent'] || '';
        const print = crypto.createHmac('sha256', salt).update(`${request.ip}|${ua}`).digest('base64url').slice(0, 22);
        const addr = crypto.createHmac('sha256', salt).update(String(request.ip)).digest('base64url').slice(0, 16);
        // Nouveau visiteur : pas plus de 5 navigateurs différents par adresse et par jour, 200 000 au total.
        const fresh = !seen.has(print) && seen.size < LIMITS.visitors && (perAddress.get(addr) || 0) < LIMITS.perAddress;
        db.transaction(() => {
          if (target.photoId) q.photo.run(today, target.photoId);
          else q.page.run(today, target.page);
          if (fresh) {
            seen.add(print);
            perAddress.set(addr, (perAddress.get(addr) || 0) + 1);
            q.visitor.run(today, MOBILE.test(ua) ? 1 : 0);
            let source = sourceOf(request.headers.referer, ownHost);
            // Au-delà de 60 provenances différentes dans la journée : regroupées sous « autres ».
            if (source && !sourcesToday.has(source)) { if (sourcesToday.size >= LIMITS.sources) source = 'autres'; else sourcesToday.add(source); }
            if (source) q.source.run(today, source);
            q.country.run(today, countryOf(request.headers, trustCountry));
          }
        })();
        return true;
      } catch (err) {
        log?.warn({ err }, 'statistiques : visite non comptée');      // jamais d'erreur pour le visiteur
        return false;
      }
    },

    // ---------- lecture (admin) ----------
    // Jours [from, to] inclus, au format AAAA-MM-JJ.
    range(days) {
      const to = parisDay(now());
      const d = new Date(`${to}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (days - 1));
      return { from: d.toISOString().slice(0, 10), to };
    },
    daily(from, to) {
      const views = Object.fromEntries(db.prepare(`SELECT day, SUM(v) AS v FROM (
        SELECT day, views AS v FROM stats_pages WHERE day BETWEEN ? AND ? UNION ALL SELECT day, views FROM stats_photos WHERE day BETWEEN ? AND ?) GROUP BY day`).all(from, to, from, to).map(r => [r.day, r.v]));
      const visitors = Object.fromEntries(db.prepare('SELECT day, visitors, mobile FROM stats_days WHERE day BETWEEN ? AND ?').all(from, to).map(r => [r.day, r]));
      const out = [];
      for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        const k = d.toISOString().slice(0, 10);
        out.push({ day: k, views: views[k] || 0, visitors: visitors[k]?.visitors || 0, mobile: visitors[k]?.mobile || 0 });
      }
      return out;
    },
    topPhotos: (from, to, limit = 10) => db.prepare(`SELECT photo_id AS id, SUM(views) AS views FROM stats_photos WHERE day BETWEEN ? AND ?
      GROUP BY photo_id ORDER BY views DESC, photo_id LIMIT ?`).all(from, to, limit),
    topPages: (from, to, limit = 10) => db.prepare(`SELECT page, SUM(views) AS views FROM stats_pages WHERE day BETWEEN ? AND ?
      GROUP BY page ORDER BY views DESC, page LIMIT ?`).all(from, to, limit),
    countries: (from, to) => db.prepare(`SELECT country, SUM(visitors) AS visitors FROM stats_countries WHERE day BETWEEN ? AND ?
      GROUP BY country ORDER BY visitors DESC, country`).all(from, to),
    sources: (from, to, limit = 10) => db.prepare(`SELECT source, SUM(visits) AS visits FROM stats_sources WHERE day BETWEEN ? AND ?
      GROUP BY source ORDER BY visits DESC, source LIMIT ?`).all(from, to, limit),
    // Vues d'une photo jour par jour, et son rang parmi les photos vues sur la période.
    photo(id, from, to) {
      const rows = Object.fromEntries(db.prepare('SELECT day, views FROM stats_photos WHERE photo_id = ? AND day BETWEEN ? AND ?').all(id, from, to).map(r => [r.day, r.views]));
      const days = this.daily(from, to).map(d => ({ day: d.day, views: rows[d.day] || 0 }));
      const total = days.reduce((a, d) => a + d.views, 0);
      const rank = total ? db.prepare(`SELECT COUNT(*) + 1 FROM (SELECT SUM(views) AS v FROM stats_photos WHERE day BETWEEN ? AND ? GROUP BY photo_id) WHERE v > ?`).pluck().get(from, to, total) : null;
      return { days, total, rank };
    },
    viewsByPhoto: (from, to) => Object.fromEntries(db.prepare('SELECT photo_id, SUM(views) AS v FROM stats_photos WHERE day BETWEEN ? AND ? GROUP BY photo_id').all(from, to).map(r => [r.photo_id, r.v])),
    today: () => db.prepare('SELECT visitors FROM stats_days WHERE day = ?').pluck().get(parisDay(now())) || 0,
  };
}
