import { renderBody, readingMinutes, photoIdsOf } from './carnet-markdown.js';
import { RUBRIQUE_NAMES, LANGS } from './carnet.js';
import { localize, UI } from './i18n.js';
import { photoUrl } from './urls.js';
import { picture } from './picture.js';
import { shortDate } from './format.js';
import { project } from './geo/projection.js';
import { cadrage, typo } from './v2-vues.js';
import { nameOf } from './geo/cities.js';

// Ce que le site public montre d'un billet (v2 seulement : maquettes MQ-11 et MQ-12) : sa langue, ses auteurs, ses dates, son
// corps rendu (server/carnet-markdown.js), sa couverture, ses photos, sa carte au trait. Utilisé par la liste, le billet,
// la visionneuse (?carnet=), le flux et le plan du site.
const col = (f, lang) => (lang === 'fr' ? f : `${f}_${lang}`);
const LOC = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' };
const nb = s => String(s).replace(/ /g, '\u00a0');

// Jour de Paris d'un instant (« 2026-10-14 »), pour <time datetime> et les dates abrégées de l'interface.
export const parisDayOf = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
// Instant ISO 8601 avec le décalage de Paris (JSON-LD, Open Graph, Atom) : « 2026-10-14T08:00:00+02:00 ».
export function isoParis(ms) {
  const d = new Date(ms);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(d).map(p => [p.type, p.value]));
  const off = (parts.timeZoneName || 'GMT').replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
}

export function createCarnetViews({ app, repo }) {
  const c = app.carnet;
  // Langue du contenu d'un billet pour une page : celle de la page si elle est publiée (traduction relue), sinon le français
  // (B54 : jamais de repli champ par champ, jamais de redirection).
  const contentLang = (post, lang) => (post.langs.includes(lang) ? lang : 'fr');
  const field = (post, f, l) => String(post[col(f, l)] || '');

  function authorsOf(post, lang) {
    const all = repo.authors(lang);
    return post.authors.map(id => all.find(a => a.id === id)).filter(Boolean);
  }
  const names = (list, lang) => (list.length > 1 ? `${list.slice(0, -1).map(a => a.name).join(', ')}${UI[lang].v2.and}${list.at(-1).name}` : list[0]?.name || '');

  // Photos publiées, dans la langue de la page, par identifiant (une lecture par page).
  const published = lang => new Map(repo.publishedPhotos({ lang }).map(p => [p.id, p]));

  // Adresse publique d'une référence interne (B9, B22), ou null : texte simple.
  function refHref(kind, id, lang, photos) {
    const u = path => localize(path, lang);
    if (kind === 'photo') { const p = photos.get(id); return p ? u(photoUrl(p.slug)) : null; }
    if (kind === 'serie') { const s = repo.categories().find(x => x.id === id); return s && [...photos.values()].some(p => p.category_slug === s.slug) ? u(`/serie/${s.slug}`) : null; }
    if (kind === 'voyage') {
      const tr = app.trips.listPublic().find(x => x.id === id);
      return tr && app.trips.photos(id).some(p => photos.has(p.id)) ? u(`/voyage/${tr.slug}`) : null;
    }
    if (kind === 'carnet') { const p = c.get(id); return p && p.state === 'publie' && p.visibility === 'public' ? u(`/carnet/${p.slug}`) : null; }
    return null;
  }

  // Date d'une photo dans le cartel du récit : « sam. 10 oct. », le jour abrégé lié à sa date (lexique § 0.4).
  const weekday = (p, lang) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.taken_on || '')) return p.when || '';
    return nb(new Intl.DateTimeFormat(LOC[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${p.taken_on}T12:00:00Z`)));
  };
  // Étiquette du diptyque (lexique § 0.5) : « Même soir » quand les deux photos sont du même jour et que leurs heures sont
  // montrées ; sinon « Deux regards ».
  function diptyque(a, b, lang) {
    const t = UI[lang].carnet;
    const same = a.shown_time && b.shown_time && a.taken_on === b.taken_on;
    const h = same ? Number(String(a.shown_time).slice(0, 2)) : null;
    const label = h == null ? t.twoViews : h < 12 ? t.sameMorning : h < 18 ? t.sameAfternoon : t.sameEvening;
    return { label, line: t.twoLine(same ? a.time : '', same ? b.time : '') };
  }

  // Corps rendu pour une page publique (preview : aperçu de l'équipe, photos non publiées servies par /admin/media/).
  function body(post, lang, { photos = published(lang), preview = false, team = null, skipCover = false } = {}) {
    const l = contentLang(post, lang);
    const settings = c.settings(post.id);
    const two = post.authors.length > 1;
    const t = UI[lang].carnet;
    const extra = preview ? repo.photosByIds(c.photoIds(post), lang) : new Map();
    return renderBody(field(post, 'body', l), {
      lang: l, preview, host: app.config.publicUrl.replace(/^https?:\/\//, ''), skip: skipCover ? c.coverId(post) : null,
      photo: id => {
        const p = photos.get(id) || (preview && team?.(extra.get(id)) ? extra.get(id) : null);
        if (!p) return null;
        const s = settings.get(id) || {};
        return { photo: p, setting: s, visible: p.status === 'published', alt: s[col('alt', l)] || s.alt || p.alt || '', legend: s[col('legend', l)] || '' };
      },
      href: (kind, id) => refHref(kind, id, lang, photos),
      photoHref: p => localize(photoUrl(p.slug, { carnet: post.slug }), lang),
      meta: p => [two ? p.author : '', p.place, [weekday(p, lang), p.time].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
      picture: (p, o) => picture(p, { ...o, base: p.status === 'published' ? '/media/' : '/admin/media/' }),
      t: { seeBig: t.seeBig, diptyque: (a, b) => diptyque(a, b, lang), nonPubliee: UI[lang].carnet.preview, galerie: t.gallery },
    });
  }

  // Photos du billet montrées en public, dans l'ordre du texte (couverture d'abord si elle n'y est pas), publiées seulement.
  // lang : la langue de la page ; les photos sont celles du texte montré (celui de la langue publiée, sinon le français).
  const photosOf = (post, photos, lang = 'fr') => photoIdsOf(field(post, 'body', contentLang(post, lang))).map(id => photos.get(id)).filter(Boolean);
  const coverOf = (post, photos, lang = 'fr') => photos.get(c.coverId(post)) || photosOf(post, photos, lang)[0] || null;
  const shareOf = (post, photos) => photos.get(c.shareId(post)) || coverOf(post, photos);

  // Carte d'un billet dans une liste (MQ-11) : « Auteur · date · n photos · n min de lecture ».
  function card(post, lang, photos) {
    const l = contentLang(post, lang);
    const r = body(post, lang, { photos });
    const authors = authorsOf(post, lang);
    return {
      post, slug: post.slug, lang: l, onlyFr: l !== lang, title: typo(field(post, 'title', l), l), dek: typo(field(post, 'dek', l), l),
      rubrique: RUBRIQUE_NAMES[lang][post.rubrique] || post.rubrique, authors, by: names(authors, lang),
      day: parisDayOf(post.published_at || post.updated_at), date: shortDate(parisDayOf(post.published_at || post.updated_at), lang),
      photos: r.photoIds.length, minutes: readingMinutes(r.words), cover: coverOf(post, photos, lang),
    };
  }

  // Carte au trait du sommaire (MQ-12, repère 3) : les villes des photos du billet (celles que leur fiche met sur la carte),
  // dans l'ordre du texte, sur le fond de carte du site, cadrées comme la carte du monde ; seulement à partir de deux villes.
  function itinerary(list, lang) {
    const seen = new Map();
    for (const p of list) if (p.on_map && p.city_id && Number.isFinite(p.city_lat) && Number.isFinite(p.city_lon) && !seen.has(p.city_id)) {
      const [x, y] = project(p.city_lat, p.city_lon);
      seen.set(p.city_id, { x, y, name: nameOf(p, lang), n: seen.size + 1 });
    }
    const pts = [...seen.values()];
    if (pts.length < 2) return null;
    const view = cadrage(pts, { min: 24 });
    return { view, pts, fs: Number((view.w * 17 / 150).toFixed(2)), r: Number((view.w * 3.2 / 150).toFixed(2)), stroke: Number((view.w * 1.2 / 150).toFixed(3)),
      label: UI[lang].carnet.map(pts.map(p => p.name).join(lang === 'fr' ? ', puis ' : lang === 'de' ? ', dann ' : ', then ')) };
  }

  // Méta du cartel du récit (MQ-12, repère 6) : le lieu et l'heure ; l'auteur en tête dans un billet à deux voix.
  const cartel = (post, p, lang) => [post.authors.length > 1 ? p.author : '', p.place, [weekday(p, lang), p.time].filter(Boolean).join(', ')].filter(Boolean).join(' · ');

  return { cartel, contentLang, field, authorsOf, names, published, body, photosOf, coverOf, shareOf, card, itinerary, weekday, LANGS };
}
