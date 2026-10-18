import { RUBRIQUES, RUBRIQUE_NAMES, LANGS } from '../carnet.js';
import { createCarnetViews, isoParis, parisDayOf } from '../carnet-vues.js';
import { UI, PREFIX, localize } from '../i18n.js';
import { variantName, widthsFor } from '../images.js';
import { shareLinks, shareQr, VIAS } from '../share.js';
import { scanValue } from '../securite/detection.js';
import { legalEmail } from '../legal.js';
import { CONTACT_RE } from './carnet.js';
import { readingMinutes, renderReply } from '../carnet-markdown.js';
import { typo } from '../v2-vues.js';

// Carnets, côté public (étude § 1.7 et § 1.8 ; maquettes MQ-11 et MQ-12) : la liste (/carnet, ?rubrique=, ?par=, ?page=),
// un billet (/carnet/<slug> ; ancienne adresse : 301 ; retiré : 410), sa page « Partager » et le flux (/carnet/flux.xml).
// En v2 seulement : avec la v1 (réglage public_version) et hors aperçu des administrateurs, ces adresses répondent 404 et
// aucun lien n'y mène. Enregistré dans le plugin pages (trois langues), sauf le flux, hors des pages (B58 : un lecteur de
// flux qui envoie Accept-Language: de ne doit pas être redirigé).
const PAGE_SIZE = 12;
const col = (f, lang) => (lang === 'fr' ? f : `${f}_${lang}`);
const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// JSON-LD inséré par <%~ %> (B68) : « < » échappé, un </script> du contenu ne ferme jamais le bloc.
const jsonLd = obj => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Les Carnets sont-ils ouverts pour cette requête ? v2 appliquée, ou aperçu d'un administrateur.
export const carnetOpen = (app, request) => app.publicVersion.forRequest(request).version === 'v2';

export function registerCarnetPages(app, { lang, repo, base, ignored, gate, shareLimit }) {
  const c = app.carnet;
  const v = createCarnetViews({ app, repo });
  const t = UI[lang], tc = t.carnet;
  const u = path => localize(path, lang);
  const siteName = () => app.siteName();
  const host = () => app.config.publicUrl.replace(/^https?:\/\/(www\.)?/, '');
  const ogOf = p => p && `/media/${variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)}`;

  // Aperçu de l'équipe (B55) : billet non publié, visible avec carnet.voir ET sa portée (l'un des auteurs est le
  // photographe du compte, ou portée « tout »). Ne pas tester request.can() sans portée (constat C8).
  const teamSees = (request, post) => {
    if (!request.session) return false;
    const s = request.scope?.('carnet.voir');
    return Boolean(s && (s.all || post.authors.includes(s.authorId)));
  };

  // ---------- liste ----------
  app.get('/carnet', async (request, reply) => {
    if (!carnetOpen(app, request)) return reply.callNotFound();
    const all = c.published();
    if (!all.length) return reply.callNotFound();
    const authors = repo.authors(lang);
    // Filtres (décision 8 : rubrique et regard) : des liens ; une valeur hors liste est ignorée et signalée (BV-13).
    const em = 'server/routes/public.js · carnet';
    const rubrique = RUBRIQUES.includes(request.query.rubrique) ? request.query.rubrique : ignored(request, 'rubrique', em);
    const par = authors.some(a => a.slug === request.query.par) ? request.query.par : ignored(request, 'par', em, 'auteur');
    let page = 1;
    if (request.query.page != null && request.query.page !== '') {
      const raw = String(request.query.page);
      if (/^[1-9]\d{0,5}$/.test(raw)) page = Number(raw);
      else ignored(request, 'page', em);
    }
    const author = authors.find(a => a.slug === par);
    const matches = (p, f) => (!f.rubrique || p.rubrique === f.rubrique) && (!f.par || p.authors.includes(authors.find(a => a.slug === f.par)?.id));
    const list = all.filter(p => matches(p, { rubrique, par }));
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page > pages) return reply.callNotFound();                                   // au-delà de la dernière : 404 (B53)
    const photos = v.published(lang);
    const shown = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(p => v.card(p, lang, photos));
    // Chaque choix dit son nombre de billets (MQ-11, repère 3) ; un choix sans billet n'est pas proposé : aucune liste vide.
    const href = f => { const q = new URLSearchParams(); if (f.rubrique) q.set('rubrique', f.rubrique); if (f.par) q.set('par', f.par); const s = q.toString(); return u(`/carnet${s ? `?${s}` : ''}`); };
    const rubriques = [{ slug: null, name: tc.all, count: all.filter(p => matches(p, { par })).length, href: href({ par }) },
      ...RUBRIQUES.map(r => ({ slug: r, name: RUBRIQUE_NAMES[lang][r], count: all.filter(p => matches(p, { rubrique: r, par })).length, href: href({ rubrique: r, par }) }))].filter(x => x.slug == null || x.count);
    const regards = [{ slug: null, name: t.both, count: all.filter(p => matches(p, { rubrique })).length, href: href({ rubrique }) },
      ...authors.map(a => ({ slug: a.slug, name: a.name, count: all.filter(p => matches(p, { rubrique, par: a.slug })).length, href: href({ rubrique, par: a.slug }) }))].filter(x => x.slug == null || x.count);
    const two = author ? list.filter(p => p.authors.length > 1).length : 0;
    const filtered = Boolean(rubrique || par);
    if (filtered) reply.header('x-robots-tag', 'noindex, follow');                  // pages filtrées en noindex (B53)
    app.stats.hit(request, { page: 'carnet' });
    const canonical = filtered ? null : page > 1 ? `/carnet?page=${page}` : '/carnet';
    return reply.render('carnets', {
      ...base, siteName: siteName(), tc, list: shown, rubriques, regards, filter: { rubrique, par }, author, two, total: list.length, totalAll: all.length,
      page, pages, from: (page - 1) * PAGE_SIZE + 1, to: Math.min(list.length, page * PAGE_SIZE),
      prevHref: page > 1 ? `${href({ rubrique, par })}${filtered ? '&' : '?'}page=${page - 1}`.replace(/[?&]page=1$/, '') : null,
      nextHref: page < pages ? `${href({ rubrique, par })}${filtered ? '&' : '?'}page=${page + 1}` : null,
      pageTitle: `${tc.title}${page > 1 ? ` · ${tc.pages(page, pages, '', '', '').split(' · ')[0]}` : ''} · ${siteName()}`,
      canonical, robots: filtered ? 'noindex, follow' : null, description: tc.description(siteName(), v.names(authors, lang)),
      feed: { href: `${PREFIX[lang]}/carnet/flux.xml`, title: tc.feedTitle(siteName()) }, carnetCss: true,
      ogImage: shown[0]?.cover ? ogOf(shown[0].cover) : undefined,
    });
  });

  // ---------- un billet ----------
  async function showPost(request, reply, found, { share = false } = {}) {
    const post = found.post;
    const open = post.state === 'publie' && post.visibility === 'public';
    const team = !open && teamSees(request, post);
    if (!open && !team) {
      // Une session de l'admin qui demande l'aperçu du billet d'un autre photographe : signalée (BV-14, DS10).
      if (request.session && post.state !== 'retire') app.securite.emit('authz_fail', { request, emetteur: 'server/routes/public.js · carnet', detail: { raison: 'hors portée', permission: 'carnet.voir', objet: 'billet', id: post.id, ecriture: false } });
      if (post.state === 'retire') return retired(request, reply);
      return reply.callNotFound();
    }
    const l = v.contentLang(post, lang);
    const photos = v.published(lang);
    const sees = p => Boolean(p) && (p.status === 'published' || request.owns?.('photos.voir', p.author_id));
    const r = v.body(post, lang, { photos, preview: team, team: sees, skipCover: true });
    const authors = v.authorsOf(post, lang);
    const list = v.photosOf(post, photos, lang);
    // Couverture à l'ouverture (B8) : celle du billet, sinon sa première photo ; dans l'aperçu de l'équipe, même non publiée.
    const coverId = c.coverId(post);
    const cover = photos.get(coverId) || (team && coverId ? [repo.photosByIds([coverId], lang).get(coverId)].find(sees) || null : null) || (coverId ? null : v.coverOf(post, photos));
    const coverN = cover ? r.photoIds.indexOf(cover.id) + 1 : 0;
    const coverSetting = cover ? c.settings(post.id).get(cover.id) || {} : {};
    const coverAlt = cover ? (coverSetting.decorative ? '' : coverSetting[col('alt', l)] || coverSetting.alt || cover.alt || '') : '';
    const ogPhoto = v.shareOf(post, photos);
    // Texte du billet aux règles typographiques de sa langue (une page allemande d'un billet en français, B54).
    const title = typo(v.field(post, 'title', l), l), dek = typo(v.field(post, 'dek', l), l);
    const s = siteName();
    if (team) reply.header('x-robots-tag', 'noindex').header('cache-control', 'private, no-store');
    else if (l !== lang) reply.header('x-robots-tag', 'noindex, follow');                       // langue non publiée (B54)
    if (share) return { post, l, title, photos, ogPhoto, s };
    if (open) app.stats.hit(request, { page: `carnet:${post.slug}` });
    // Billets voisins : précédent (plus ancien) et suivant (plus récent), dans l'ordre de publication.
    const all = c.published();
    const i = all.findIndex(p => p.id === post.id);
    const neighbour = p => p && { href: u(`/carnet/${p.slug}`), title: v.field(p, 'title', v.contentLang(p, lang)), lang: v.contentLang(p, lang),
      by: v.names(v.authorsOf(p, lang), lang), date: v.card(p, lang, photos).date };
    const older = i >= 0 ? neighbour(all[i + 1]) : null, newer = i > 0 ? neighbour(all[i - 1]) : null;
    const trip = post.trip_id ? app.trips.listPublic().find(tr => tr.id === post.trip_id && app.trips.photos(tr.id).some(p => photos.has(p.id))) : null;
    // Une adresse seule (ni paramètre ni retour à la ligne : revue de sécurité) ; sinon, pas de lien.
    const rawContact = post.contact ? (String(repo.settings().carnet_contact || '').trim() || String(legalEmail(repo.settings()) || '').trim()) : '';
    const contact = CONTACT_RE.test(rawContact) ? rawContact : '';
    const names = v.names(authors, lang);
    const url = app.config.publicUrl + u(`/carnet/${post.slug}`);
    const modified = post.revised_at || post.published_at;
    // Langues publiées du billet (B67) : hreflang vers elles seules, x-default vers le français.
    const alternates = post.langs;
    const ld = open ? jsonLd({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'BlogPosting', '@id': `${url}#billet`, mainEntityOfPage: url, url, headline: title, description: dek,
        image: ogPhoto ? [app.config.publicUrl + ogOf(ogPhoto)] : undefined, datePublished: isoParis(post.published_at), dateModified: isoParis(modified),
        inLanguage: { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[l], articleSection: RUBRIQUE_NAMES[lang][post.rubrique], wordCount: r.words,
        author: authors.map(a => ({ '@type': 'Person', name: a.name, url: app.config.publicUrl + u(`/auteur/${a.slug}`) })),
        isPartOf: { '@type': 'Blog', '@id': `${app.config.publicUrl}${u('/carnet')}#carnet`, name: `${tc.title} · ${s}`, url: app.config.publicUrl + u('/carnet') },
        breadcrumb: { '@id': `${url}#ariane` } },
      { '@type': 'BreadcrumbList', '@id': `${url}#ariane`, itemListElement: [
        { '@type': 'ListItem', position: 1, name: s, item: `${app.config.publicUrl}${u('/')}` },
        { '@type': 'ListItem', position: 2, name: tc.title, item: app.config.publicUrl + u('/carnet') },
        { '@type': 'ListItem', position: 3, name: title }] }] }) : null;
    return reply.render('carnet', {
      ...base, siteName: s, tc, post, l, title, dek, authors, names, rubriqueName: RUBRIQUE_NAMES[lang][post.rubrique] || '', body: r, cover, coverN, coverAlt, coverMeta: cover ? v.cartel(post, cover, lang) : '', list, trip, older, newer, contact, team,
      minutes: readingMinutes(r.words), nPhotos: r.photoIds.length, map: v.itinerary(list, lang),
      published: post.published_at ? { day: parisDayOf(post.published_at), text: v.card(post, lang, photos).date } : null,
      revised: post.revised_at ? { day: parisDayOf(post.revised_at), text: v.card({ ...post, published_at: post.revised_at }, lang, photos).date } : null,
      mention: v.field(post, 'mention', l), reply: v.field(post, 'reply', l) ? { html: renderReply(v.field(post, 'reply', l), { lang: l, href: () => null, photoHref: () => '#', meta: () => '', picture: () => '', t: { seeBig: () => '', diptyque: () => ({}), galerie: () => '' } }).html, at: post.reply_at ? v.card({ ...post, published_at: post.reply_at }, lang, photos).date : '' } : null,
      mail: contact ? `mailto:${contact}?subject=${encodeURIComponent(tc.mailSubject(title))}` : null, totalAll: all.length,
      pageTitle: `${title} · ${s}`, canonical: open && l === lang ? `/carnet/${post.slug}` : null, alternates, description: dek,
      ogImage: ogPhoto ? ogOf(ogPhoto) : undefined, ogType: 'article', jsonLd: ld, robots: team ? 'noindex' : l !== lang ? 'noindex, follow' : 'max-image-preview:large',
      article: open ? { published: isoParis(post.published_at), modified: isoParis(modified), authors: authors.map(a => app.config.publicUrl + u(`/auteur/${a.slug}`)), tag: RUBRIQUE_NAMES[lang][post.rubrique] } : null,
      feed: { href: `${PREFIX[lang]}/carnet/flux.xml`, title: tc.feedTitle(s) }, carnetCss: true, host: host(),
    });
  }
  function retired(request, reply) {
    reply.code(410).header('x-robots-tag', 'noindex');
    return reply.render('carnet-retire', { ...base, siteName: siteName(), tc, pageTitle: `${tc.retired} · ${siteName()}`, description: '', carnetCss: true, totalAll: c.published().length });
  }
  const find = (request, reply) => {
    if (!carnetOpen(app, request)) { reply.callNotFound(); return null; }
    const found = c.bySlug(request.params.slug);
    if (!found) { reply.callNotFound(); return null; }
    return found;
  };
  app.get('/carnet/:slug', async (request, reply) => {
    const found = find(request, reply);
    if (!found) return reply;
    // Arrivée par le QR de « Partager » : l'adresse est nettoyée (comme une photo).
    if (request.query.partage === 'qr') return reply.redirect(u(`/carnet/${found.post.slug}`), 303);
    if (found.moved) return reply.redirect(u(`/carnet/${found.moved}`), 301);              // ancienne adresse (B3)
    return showPost(request, reply, found);
  });

  // « Partager ce billet » sans script (B57) : la fenêtre de partage de la v2, en page.
  app.get('/carnet/:slug/partager', async (request, reply) => {
    const found = find(request, reply);
    if (!found) return reply;
    if (found.moved) return reply.redirect(u(`/carnet/${found.moved}/partager`), 301);
    if (found.post.state !== 'publie') return reply.callNotFound();
    const d = await showPost(request, reply, found, { share: true });
    if (!d?.post) return d;
    const url = app.config.publicUrl + u(`/carnet/${d.post.slug}`);
    const image = d.ogPhoto ? app.config.publicUrl + ogOf(d.ogPhoto) : null;
    const authors = v.names(v.authorsOf(d.post, lang), lang);
    reply.header('x-robots-tag', 'noindex');
    return reply.render('carnet-partager', { ...base, siteName: d.s, tc, post: d.post, title: d.title, lang,
      share: { url, title: `${d.title} · ${d.s}`, host: host(), links: shareLinks({ url, title: `${d.title} · ${d.s}`, image }), qr: await shareQr(url), instagram: null,
        thumb: d.ogPhoto ? `/media/${variantName(d.ogPhoto.file, widthsFor(d.ogPhoto.width)[0], 'webp', d.ogPhoto.variant_key)}` : '', s: t.share },
      photo: { title: d.title, author: authors },
      pageTitle: `${t.share.title} · ${d.title} · ${d.s}`, canonical: `/carnet/${d.post.slug}/partager`, description: '', carnetCss: true });
  });
  // Un partage : seulement vérifié (provenance, limite, canal de la liste), rien n'est compté pour un billet.
  app.post('/carnet/:slug/partage', async (request, reply) => {
    if (!carnetOpen(app, request)) return reply.callNotFound();
    const found = c.bySlug(request.params.slug);
    if (!found || found.post.state !== 'publie') return reply.callNotFound();
    const via = String(request.body?.via || '');
    if (!gate(request, shareLimit, 'partage')) return reply.code(429).send({ error: 'limit' });
    if (VIAS.includes(via)) return reply.code(204).send();
    if (!scanValue('body', 'body.via', via)) app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/public.js · carnet', detail: { raison: 'valeur hors liste', champ: 'via', valeur: via.slice(0, 60) } });
    return reply.code(422).send({ error: 'via' });
  });
}

// Contexte ?carnet=<billet> de la visionneuse (MQ-12, repères 7 et 16) : le billet publié et ses photos publiées, dans
// l'ordre du texte ; une valeur inconnue est ignorée et signalée (BV-13), sauf un billet retiré ou une ancienne adresse.
export function carnetContext(app, request, { lang, repo, ignored, slug }) {
  const raw = request.query.carnet;
  if (raw == null || raw === '') return null;
  if (!carnetOpen(app, request)) return null;
  const found = app.carnet.bySlug(String(raw));
  const em = 'server/routes/public.js · carnet';
  if (!found) { ignored(request, 'carnet', em); return null; }
  const post = found.post;
  if (post.state !== 'publie' || post.visibility !== 'public') { if (post.state !== 'retire') ignored(request, 'carnet', em); return null; }
  const v = createCarnetViews({ app, repo });
  const photos = v.published(lang);
  const list = v.photosOf(post, photos, lang);
  const i = list.findIndex(p => p.slug === slug);
  if (i === -1) return null;                                   // photo retirée du billet : la visionneuse ordinaire
  const l = v.contentLang(post, lang);
  return { post, list, i, title: v.field(post, 'title', l), lang: l, moved: found.moved || null };
}

// Flux Atom par langue (B58 à B60), hors des pages : les 20 derniers billets publiés dans la langue, texte intégral (adresses
// absolues, images WebP 1 280 px), id tag: indépendant de l'adresse ; Last-Modified, ETag, 304.
export function registerCarnetFeeds(app) {
  const c = app.carnet;
  for (const lang of LANGS) {
    app.get(`${PREFIX[lang]}/carnet/flux.xml`, async (request, reply) => {
      if (!carnetOpen(app, request)) return reply.callNotFound();
      const repo = app.publicRepo;
      const v = createCarnetViews({ app, repo });
      const t = UI[lang].carnet;
      const posts = c.published().filter(p => p.langs.includes(lang)).slice(0, 20);
      const base = app.config.publicUrl;
      const updated = Math.max(0, ...posts.map(p => p.revised_at || p.published_at || 0), ...posts.map(p => p.updated_at || 0));
      const etag = `"carnet-${lang}-${updated}-${posts.length}"`;
      const last = new Date(updated || Date.now()).toUTCString();
      reply.header('cache-control', 'public, max-age=900').header('etag', etag).header('last-modified', last).header('x-robots-tag', 'noindex');
      if (request.headers['if-none-match'] === etag || (request.headers['if-modified-since'] && Date.parse(request.headers['if-modified-since']) >= Math.floor((updated || 0) / 1000) * 1000 && posts.length)) return reply.code(304).send();
      const photos = v.published(lang);
      const domain = new URL(base).hostname;
      const abs = html => html.replace(/(href|src)="\//g, `$1="${base}/`).replace(/srcset="([^"]*)"/g, (m, set) => `srcset="${set.split(', ').map(x => (x.startsWith('/') ? base + x : x)).join(', ')}"`);
      const entries = posts.map(p => {
        const r = v.body(p, lang, { photos });
        const authors = v.authorsOf(p, lang);
        const cover = v.coverOf(p, photos);
        const img = cover ? `<p><img src="${base}/media/${variantName(cover.file, widthsFor(cover.width).filter(w => w <= 1280).at(-1) ?? widthsFor(cover.width)[0], 'webp', cover.variant_key)}" alt=""></p>` : '';
        const html = `${img}<p><strong>${xml(p[col('dek', lang)] || '')}</strong></p>${abs(r.html)}`;
        return `  <entry>
    <id>tag:${domain},${new Date(p.created_at).toISOString().slice(0, 10)}:carnet/${p.id}</id>
    <title>${xml(p[col('title', lang)])}</title>
    <link rel="alternate" type="text/html" href="${xml(base + localize(`/carnet/${p.slug}`, lang))}"/>
    <published>${new Date(p.published_at).toISOString()}</published>
    <updated>${new Date(p.revised_at || p.published_at).toISOString()}</updated>
${authors.map(a => `    <author><name>${xml(a.name)}</name><uri>${xml(base + localize(`/auteur/${a.slug}`, lang))}</uri></author>`).join('\n')}
    <summary>${xml(p[col('dek', lang)] || '')}</summary>
    <content type="html">${xml(html)}</content>
  </entry>`;
      }).join('\n');
      const self = base + localize('/carnet/flux.xml', lang);
      const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">
  <id>tag:${domain},2026:carnet/${lang}</id>
  <title>${xml(t.feedTitle(app.siteName()).replace(/ \([^)]*\)$/, ''))}</title>
  <link rel="self" type="application/atom+xml" href="${xml(self)}"/>
  <link rel="alternate" type="text/html" href="${xml(base + localize('/carnet', lang))}"/>
  <updated>${new Date(updated || Date.now()).toISOString()}</updated>
  <author><name>${xml(app.siteName())}</name></author>
${entries}
</feed>
`;
      return reply.type('application/atom+xml; charset=utf-8').send(body);
    });
  }
}

// Plan du site (B69) : /carnet et chaque billet publié, seulement en v2 appliquée (en v1, ces pages n'existent pas), lastmod
// = mise à jour signalée ou publication, langues publiées seulement.
export function carnetSitemap(app) {
  if (app.publicVersion.setting() !== 'v2') return [];
  const posts = app.carnet.published();
  if (!posts.length) return [];
  const day = ms => new Date(ms).toISOString().slice(0, 10);
  return [{ loc: '/carnet', lastmod: day(Math.max(...posts.map(p => p.revised_at || p.published_at))) },
    ...posts.map(p => ({ loc: `/carnet/${p.slug}`, lastmod: day(p.revised_at || p.published_at), langs: p.langs }))];
}
