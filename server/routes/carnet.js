import fs from 'node:fs';
import path from 'node:path';
import { usesV2 } from '../version-publique.js';
import { CarnetError, LANGS, RUBRIQUES, RUBRIQUE_NAMES, LIMITS, ADVISE, parseWhen } from '../carnet.js';
import { toStored, toEditor, renderBody, photoIdsOf, readingMinutes } from '../carnet-markdown.js';
import { grantsOf } from '../permissions.js';
import { variantName, widthsFor } from '../images.js';
import { picture } from '../picture.js';
import { fmt, typo } from '../v2-vues.js';
import { legalEmail } from '../legal.js';
import { TranslateError } from '../translate.js';
import { createRateLimiter } from '../ratelimit.js';
import { structureError } from '../carnet-markdown.js';

// Adresse de « Écrire aux auteurs » : sans ? & % , ni espace (aucun paramètre ajouté au lien mailto:).
export const CONTACT_RE = /^[^\s@?&%,;<>"']+@[^\s@?&%,;<>"']+\.[^\s@?&%,;<>"']+$/;

// Admin « Carnets » (maquette MQ-20 ; étude § 1.5 et § 1.6) : la liste des billets, l'éditeur, le circuit de publication.
// Enregistré dans le plugin d'administration (session d'admin exigée, comme le reste de /admin), comme voyages.js.
// Portée « les miennes » : un billet appartient au compte si l'un de ses auteurs est son photographe (B6, B42) ; le billet
// d'un autre photographe est introuvable (404), et signalé à la Vigie « hors portée » (BV-14, cas DS10).
const col = (f, lang) => (lang === 'fr' ? f : `${f}_${lang}`);
const byId = v => (/^\d+$/.test(String(v)) ? Number(v) : -1);
export const STATE_PILL = { brouillon: 'afaire', propose: 'encours', a_reprendre: 'attention', programme: 'encours', publie: 'abouti', retire: 'arret' };
export const STATE_LABEL = { brouillon: 'Brouillon', propose: 'Proposé', a_reprendre: 'À reprendre', programme: 'Programmé', publie: 'Publié', retire: 'Retiré' };

// Pastille d'état (planche MQ-00, admin § 4) : le symbole, la couleur et le mot ; t : la langue de l'admin.
const SYMBOL = {
  afaire: '<circle cx="12" cy="12" r="7.5"/>',
  encours: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none"/>',
  abouti: '<circle cx="12" cy="12" r="7.5" fill="currentColor"/>',
  attention: '<path d="M12 4.5l8.5 15h-17z"/>',
  arret: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
};
export const symbol = kind => `<svg class="ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SYMBOL[kind]}</svg>`;
export const pill = (state, t) => `<span class="etat etat--${STATE_PILL[state]}">${symbol(STATE_PILL[state])}${t(STATE_LABEL[state])}</span>`;

export function registerCarnet(app, { repo, render: renderAdmin, P, W, done, failed, withReady }) {
  const c = app.carnet;
  // Pages des Carnets : les textes passent par les règles typographiques de la langue de l'admin (espaces insécables du
  // lexique des maquettes : « Français : », dates abrégées).
  const render = (request, reply, template, data) => renderAdmin(request, reply, template, { ...data, ty: s => typo(s, request.t.lang) });
  const pillOf = request => state => pill(state, request.t);
  const by = request => ({ sub: request.session.sub, name: request.session.name });
  const ownsPost = (request, perm, post) => { const s = request.scope(perm); return Boolean(s && (s.all || post.authors.includes(s.authorId))); };
  const sees = (request, post) => ownsPost(request, 'carnet.voir', post);
  const rights = (request, post) => {
    const write = ownsPost(request, 'carnet.ecrire', post);
    return { write, text: write || Boolean(request.can('carnet.textes')), publish: ownsPost(request, 'carnet.publier', post), live: ownsPost(request, 'carnet.publies.modifier', post) };
  };
  // Le billet d'un autre photographe : introuvable comme un billet qui n'existe pas, mais signalé (BV-14). Un identifiant
  // inconnu ne l'est pas.
  const outOfScope = (request, post) => app.securite.emit('authz_fail', { request, emetteur: 'server/routes/carnet.js · portée', detail: {
    raison: 'hors portée', permission: request.routeOptions?.config?.perm ?? 'carnet.voir', objet: 'billet', id: post.id, ecriture: request.method !== 'GET' && request.method !== 'HEAD' } });
  const load = request => {
    const post = c.get(byId(request.params.id));
    if (!post) return null;
    if (sees(request, post)) return post;
    outOfScope(request, post);
    return null;
  };
  const back = (id, lang = 'fr', hash = '') => `/admin/carnet/${id}${lang !== 'fr' ? `?langue=${lang}` : ''}${hash}`;
  const langOf = v => (LANGS.includes(v) ? v : 'fr');
  const names = () => new Map(repo.authors().map(a => [a.id, a]));
  const msg = (request, err) => request.t.msg(err.message);
  // Champs changés, notés au journal d'audit (noms des champs, jamais leurs valeurs : BV-20, BV-21).
  const note = (request, fields, label = '') => { if (fields.length) (request.auditChanges ||= []).push(`${label}${fields.join(', ')}`); };
  // Constructions actives neutralisées par le rendu (BV-12) : à « Enregistrer », « Proposer », « Publier », une fois par
  // champ, langue et contenu ; jamais à l'aperçu ni à l'enregistrement automatique.
  const signal = (request, post) => {
    if (!app.securite.enabled) return;
    for (const n of c.neutralized(post)) {
      const k = n.constructions;
      const active = k.script + k.attribut_evenement + k.schema_refuse + k.data_url > 0;
      app.securite.emit('malicious_input', { request, severity: active ? 'moyen' : 'bas', composant: 'site · admin', emetteur: 'server/carnet-markdown.js · billet',
        detail: { objet: 'billet', billet: post.id, champ: n.champ, langue: n.langue, familles: ['xss'], constructions: k, longueur: n.longueur } });
    }
  };

  // Photos qu'un compte peut mettre dans un billet : les publiées, et celles de sa portée (photos.voir) ; jamais le
  // brouillon d'un autre photographe (l'aperçu le montrerait par /admin/media/).
  const photoBySlug = app.db.prepare('SELECT id, author_id, status, slug FROM photos WHERE slug = ?');
  const photoById = app.db.prepare('SELECT id, author_id, status, slug FROM photos WHERE id = ?');
  const usable = (request, p) => Boolean(p) && (p.status === 'published' || request.owns('photos.voir', p.author_id));
  // post : le billet en cours ; une photo qu'il contient déjà (cosignée, mise par l'autre auteur) y reste, par son numéro,
  // sans que le compte puisse en ajouter une autre qu'il ne voit pas (revue de sécurité des Carnets).
  const resolver = (request, post = null) => (kind, v) => {
    if (kind === 'photo') {
      const p = /^\d+$/.test(v) ? photoById.get(Number(v)) : photoBySlug.get(v);
      if (!p) return null;
      return usable(request, p) || (post && /^\d+$/.test(v) && c.photoIds(post).includes(p.id)) ? p.id : null;
    }
    if (kind === 'serie') return repo.categories().find(x => x.slug === v || String(x.id) === v)?.id ?? null;
    if (kind === 'voyage') return app.db.prepare('SELECT id FROM trips WHERE slug = ? OR id = ?').pluck().get(v, /^\d+$/.test(v) ? Number(v) : -1) ?? null;
    if (kind === 'carnet') return app.db.prepare('SELECT id FROM posts WHERE slug = ? OR id = ?').pluck().get(v, /^\d+$/.test(v) ? Number(v) : -1) ?? null;
    return null;
  };
  // L'adresse d'une photo n'est écrite dans l'éditeur que si le compte peut la voir (sinon son numéro reste).
  const namerFor = request => (kind, id) => {
    if (kind === 'photo') { const p = photoById.get(id); return usable(request, p) ? p.slug : null; }
    if (kind === 'serie') return repo.categories().find(x => x.id === id)?.slug ?? null;
    if (kind === 'voyage') return app.db.prepare('SELECT slug FROM trips WHERE id = ?').pluck().get(id) ?? null;
    if (kind === 'carnet') return app.db.prepare('SELECT slug FROM posts WHERE id = ?').pluck().get(id) ?? null;
    return null;
  };

  // ---------- aperçu « comme sur le site » (B21, B28, B55 ; MQ-20, états 6, 8 et 9) ----------
  const thumb = p => `/admin/media/${variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)}`;
  const shortDate = (p, t) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.taken_on || '')) return p.when || '';
    return new Intl.DateTimeFormat(t.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${p.taken_on}T12:00:00Z`));
  };
  function preview(request, post, lang, source = post[col('body', lang)]) {
    const t = request.t;
    const ids = [...new Set([...photoIdsOf(source), ...c.photoIds(post)])];
    const all = app.publicRepo.photosByIds(ids, lang);
    const settings = c.settings(post.id);
    const two = post.authors.length > 1;
    const r = renderBody(source, {
      lang, preview: true,
      photo: id => {
        const p = all.get(id);
        if (!p || !usable(request, p)) return null;
        const s = settings.get(id) || {};
        return { photo: p, setting: s, visible: p.status === 'published', alt: s[col('alt', lang)] || s.alt || p.alt || '', legend: s[col('legend', lang)] || '' };
      },
      href: (kind, id) => (c.refExists(kind, id) ? '#' : null),
      photoHref: p => `/admin/carnet/${post.id}/apercu/photo/${encodeURIComponent(p.slug)}${lang !== 'fr' ? `?langue=${lang}` : ''}`,
      meta: p => [two ? p.author : '', p.place, [shortDate(p, t), p.time].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
      picture: (p, o) => picture(p, { ...o, base: '/admin/media/' }),
      t: { seeBig: (n, total) => t(' – voir en grand, photo {n} sur {total}', { n, total }), nonPubliee: t('· non publiée : absente du site tant qu’elle ne l’est pas'),
        diptyque: () => ({ label: t('Deux regards'), line: t('deux regards') }), galerie: n => t('{n} photos', { n }) },
    });
    return r;
  }

  // Poids estimé de la première vue (B63, budget de 1 Mo ; MQ-20, repère 8) : la couverture et la première photo du texte
  // à la taille d'un écran de bureau, plus la page, ses feuilles et ses polices (150 ko environ).
  const weightOf = post => {
    let bytes = 150 * 1024;
    const ids = [c.coverId(post), photoIdsOf(post.body)[1]].filter(Boolean);
    for (const p of app.publicRepo.photosByIds(ids).values()) {
      const w = widthsFor(p.width).filter(x => x <= 1280).at(-1) ?? widthsFor(p.width)[0];
      try { bytes += fs.statSync(path.join(app.config.storageDir, 'variants', variantName(p.file, w, 'webp', p.variant_key))).size; } catch { bytes += 200 * 1024; }
    }
    return Math.round(bytes / 1024);
  };

  // Qui publie après une proposition (« Proposer à Julien », MQ-20) : les comptes actifs qui publient tous les billets.
  const publishers = request => app.accounts.list().filter(a => a.status === 'actif' && a.sub !== request.session.sub && grantsOf(a.roles, a.adjust).get('carnet.publier') === 'tout').map(a => a.name).filter(Boolean);

  // ---------- liste ----------
  app.get('/admin/carnet', P('carnet.voir'), async (request, reply) => {
    const t = request.t, who = names();
    const list = c.list().filter(p => sees(request, p)).map(p => {
      const cover = c.coverId(p) ? app.publicRepo.photosByIds([c.coverId(p)]).get(c.coverId(p)) : null;
      return { ...p, who: p.authors.map(a => who.get(a)?.name).filter(Boolean).join(t(' et ')), cover: cover && withReady({ ...cover, file: cover.file }), rubriqueName: t(RUBRIQUE_NAMES.fr[p.rubrique] || p.rubrique) };
    });
    const s = request.scope('carnet.ecrire');
    const settings = app.publicRepo.settings();
    return render(request, reply, 'carnets', {
      title: t('Carnets'), list, STATE_PILL, STATE_LABEL, RUBRIQUES, RUBRIQUE_NAMES, pill: pillOf(request), carnetAssets: true,
      canCreate: Boolean(s), authors: s?.all ? repo.authors() : repo.authors().filter(a => a.id === s?.authorId),
      contact: { value: String(settings.carnet_contact || ''), fallback: legalEmail(settings) || '' }, canContact: Boolean(request.can('reglages.droits')),
      v2: usesV2(app.publicVersion.versionForSection('carnets')),
    });
  });

  app.post('/admin/carnet', W('carnet.ecrire'), async (request, reply) => {
    const s = request.scope('carnet.ecrire');
    const body = request.body || {};
    let authors = [].concat(body['authors[]'] ?? body.authors ?? []).map(Number).filter(Boolean);
    if (!s.all) {
      if (!s.authorId || s.authorId < 0) return failed(reply, '/admin/carnet', request.t('Aucun photographe lié à votre compte.'));
      authors = [s.authorId];
    }
    try {
      const id = c.create({ title: body.title, rubrique: RUBRIQUES.includes(body.rubrique) ? body.rubrique : 'atelier', authors: authors.length ? authors : [repo.authors()[0]?.id].filter(Boolean), by: by(request) });
      note(request, ['title', 'rubrique', 'authors']);
      return done(reply, `/admin/carnet/${id}`, request.t('Billet créé : écrivez-le, il s’enregistre tout seul.'));
    } catch (err) {
      if (!(err instanceof CarnetError)) throw err;
      return failed(reply, '/admin/carnet', msg(request, err));
    }
  });

  // Adresse de « Écrire aux auteurs » (B79 ; par défaut, l'e-mail des mentions légales) : un point de contact public, réglé
  // avec les autres (Droits et confidentialité).
  app.post('/admin/carnet/reglages', W('reglages.droits'), async (request, reply) => {
    const v = String(request.body?.carnet_contact || '').trim().slice(0, 200);
    // Une adresse, rien d'autre : ni paramètre ni retour à la ligne glissés dans le lien mailto: (revue de sécurité).
    if (v && !CONTACT_RE.test(v)) return failed(reply, '/admin/carnet', request.t('Adresse e-mail invalide.'));
    app.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('carnet_contact', JSON.stringify(v));
    note(request, ['carnet_contact']);
    return done(reply, '/admin/carnet', request.t('Adresse enregistrée.'));
  });

  // ---------- éditeur ----------
  function editor(request, reply, post, { lang = 'fr', verify = null, status = 200 } = {}) {
    const t = request.t, r = rights(request, post), who = names();
    const draft = c.draftOf(post.id);
    const fresh = draft && draft.at > post.updated_at ? draft : null;
    const value = f => (fresh && col(f, lang) in fresh.data ? fresh.data[col(f, lang)] : post[col(f, lang)]) ?? '';
    const fields = { title: value('title'), dek: value('dek'), body: toEditor(value('body'), namerFor(request)), mention: value('mention'), reply: value('reply') };
    const all = app.publicRepo.photosByIds(c.photoIds(post));
    const settings = c.settings(post.id);
    const people = new Map();
    const order = c.bodyPhotoIds(post);
    const photos = order.map((id, i) => {
      const p = all.get(id);
      if (!p || !usable(request, p)) return null;
      const s = settings.get(id) || {};
      const ready = app.readiness.state(id, people, t)?.site;
      return { ...withReady(p), n: i + 1, setting: s, alt: s[col('alt', lang)] || s.alt || p.alt_text || '', level: ready?.level || 'ok', reasons: ready?.reasons || [], cover: c.coverId(post) === id, thumb: thumb(p) };
    }).filter(Boolean);
    const checks = verify ? c.checks(post, { forPublish: verify === 'publier' }) : null;
    const pv = preview(request, post, lang, toStored(fields.body, resolver(request, post)));
    const sc = request.scope('photos.voir');
    // Sans script : les photos à cocher (celles du billet, puis les plus récentes que le compte peut y mettre).
    const candidates = app.db.prepare(`SELECT id, slug, title, status, author_id FROM photos WHERE status = 'published' OR (? = 1 OR author_id = ?) ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 60`)
      .all(sc?.all ? 1 : 0, sc?.authorId ?? -1).filter(p => usable(request, p));
    const pending = c.history(post.id);
    const lastRemark = pending.find(h => h.action === 'renvoye');
    const trips = app.trips.list().filter(tr => tr.author_id == null || request.owns('sorties.voir', tr.author_id) || post.trip_id === tr.id);
    reply.code(status);
    return render(request, reply, 'carnet', {
      title: post.title, post, lang, fields, fresh, r, photos, candidates, checks, preview: pv, minutes: readingMinutes(pv.words), words: pv.words,
      who: post.authors.map(a => who.get(a)).filter(Boolean), authors: repo.authors(), trips, rubriques: RUBRIQUES.map(k => ({ slug: k, name: t(RUBRIQUE_NAMES.fr[k]) })),
      publishers: publishers(request), history: pending.slice(0, 12), revisions: c.revisions(post.id).length, lastRemark,
      weight: weightOf(post), LIMITS, ADVISE, STATE_PILL, STATE_LABEL, LANGS, translate: app.translator.enabled, pill: pillOf(request), symbol,
      langState: l => (post.langs.includes(l) ? t('publié') : String(post[col('body', l)] || post[col('title', l)] || '').trim() ? t('à relire') : t('vide')),
      v2: usesV2(app.publicVersion.versionForSection('carnets')), carnetAssets: true, verifyAction: verify === 'publier' ? t('publié') : t('proposé'),
    });
  }

  app.get('/admin/carnet/:id', P('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const verify = ['proposer', 'publier'].includes(request.query.verifier) ? request.query.verifier : null;
    return editor(request, reply, post, { lang: langOf(request.query.langue), verify });
  });

  // Ce que le formulaire envoie, ramené à la forme de la base : les champs de la langue de l'onglet, et les réglages.
  function inputOf(request, post, body, lang, r) {
    const input = {};
    for (const f of ['title', 'dek', 'body', 'mention', 'reply']) if (f in body) input[col(f, lang)] = f === 'body' ? toStored(body[f], resolver(request, post)) : body[f];
    // Les réglages sont lus pour tous : en changer un sans carnet.ecrire est refusé (403, allowed), jamais ignoré en silence.
    {
      if ('rubrique' in body) input.rubrique = body.rubrique;
      if (body.authors_set) {
        let list = [].concat(body['authors[]'] ?? body.authors ?? []).map(Number).filter(Boolean);
        const s = request.scope('carnet.ecrire');
        if (s && !s.all && !list.includes(s.authorId)) list = [s.authorId, ...list];            // il reste signataire : sinon le billet lui échappe
        input.authors = list;
      }
      for (const f of ['cover_id', 'share_id', 'trip_id']) if (f in body) input[f] = Number(body[f]) || null;
      // Couverture et image de partage : une photo que le compte peut utiliser, ou celle déjà choisie.
      for (const f of ['cover_id', 'share_id']) if (input[f] && input[f] !== post[f] && !usable(request, photoById.get(input[f]))) input[f] = post[f] ?? null;
      if (body.contact_set) input.contact = body.contact === 'on' || body.contact === '1';
      if ('slug' in body && post.slug !== String(body.slug).trim()) input.slug = body.slug;
      if (body.langs_set && lang !== 'fr') input.langs = [...post.langs.filter(l => l !== lang), ...(body.langs === 'on' || body.langs === lang ? [lang] : [])];
      // Sans script : les photos cochées s'ajoutent en fin de texte, une ligne chacune (B27).
      const add = [].concat(body['photos[]'] ?? body.photos ?? []).map(v => resolver(request, post)('photo', String(v))).filter(Boolean);
      if (add.length) input[col('body', lang)] = c.appendPhotos(input[col('body', lang)] ?? post[col('body', lang)], add);
    }
    return input;
  }
  // Ce que le formulaire change, et qui en a le droit : textes (carnet.textes ou carnet.ecrire), le reste (carnet.ecrire) ;
  // un billet en ligne ne se modifie qu'avec carnet.publies.modifier.
  const TEXT_KEYS = new Set(c.TEXT_FIELDS);
  function allowed(post, input, r, revised = false) {
    const keys = Object.keys(input).filter(k => String(k === 'authors' ? input.authors.join(',') : input[k] ?? '') !== String(k === 'authors' ? post.authors.join(',') : post[k] ?? ''));
    // La case « mise à jour signalée » modifie seule la date publique, la version et l'autosauvegarde : elle compte donc
    // comme une écriture, même si aucun champ du formulaire n'a changé (revue de sécurité des Carnets).
    const mutation = keys.length || (revised && post.state === 'publie');
    if (keys.some(k => !TEXT_KEYS.has(k)) && !r.write) return 'write';
    if (mutation && !r.text) return 'write';
    if (mutation && post.state === 'publie' && !r.live) return 'live';
    return null;
  }

  app.post('/admin/carnet/:id', W('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const body = request.body || {}, t = request.t, lang = langOf(body.langue), r = rights(request, post);
    const faire = ['enregistrer', 'proposer', 'publier', 'programmer'].includes(body.faire) ? body.faire : 'enregistrer';
    const input = inputOf(request, post, body, lang, r);
    const revised = body.revised === 'on';
    const refused = allowed(post, input, r, revised);
    // « Retirer du billet » change le billet : mêmes droits qu'un réglage (revue de sécurité des Carnets).
    if (body.retirer && !r.write) return app.forbid(request, reply);
    if (body.retirer && post.state === 'publie' && !r.live) return failed(reply, back(post.id, lang), t('Ce billet est en ligne : il ne se modifie qu’avec le droit de modifier les billets publiés. Demandez-le à un administrateur.'));
    if (refused === 'write') return app.forbid(request, reply);
    if (refused === 'live') return failed(reply, back(post.id, lang), t('Ce billet est en ligne : il ne se modifie qu’avec le droit de modifier les billets publiés. Demandez-le à un administrateur.'));
    let saved = post;
    try {
      // Modifié par qui ne publie pas lui-même : une programmation repasse en proposition (server/carnet.js, edited).
      const res = c.update(post.id, input, by(request), { version: body.version, revised, publisher: r.publish });
      // Un enregistrement identique vaut acceptation du brouillon automatique seulement pour qui aurait pu l'écrire.
      if (!res.changed.length && r.text && (post.state !== 'publie' || r.live)) c.dropDraft(post.id);
      note(request, res.changed);
      saved = res.post;
      signal(request, saved);
    } catch (err) {
      if (!(err instanceof CarnetError)) throw err;
      if (err.status === 409) {
        // Conflit (B33) : rien n'est écrasé ; le texte envoyé est gardé dans l'enregistrement automatique, à reprendre.
        if (r.text && (post.state !== 'publie' || r.live)) {
          c.saveDraft(post.id, input, by(request));
          return failed(reply, back(post.id, lang), t('Modifié par {name} à {time} : rien n’a été écrasé. Votre texte est gardé ci-dessous, à reprendre.', { name: err.details?.by || t('quelqu’un'), time: new Intl.DateTimeFormat(t.locale, { timeStyle: 'short', timeZone: 'Europe/Paris' }).format(err.details?.at || Date.now()) }));
        }
        return failed(reply, back(post.id, lang), msg(request, err));
      }
      return failed(reply, back(post.id, lang), msg(request, err));
    }
    if (body.retirer) {
      const pid = byId(body.retirer);
      const before = c.revisions(post.id)[0]?.id;
      try { const res = c.removePhoto(post.id, pid, by(request), { publisher: r.publish }); note(request, res.changed, `photo ${pid} retirée : `); } catch (err) { if (!(err instanceof CarnetError)) throw err; return failed(reply, back(post.id, lang), msg(request, err)); }
      return done(reply, back(post.id, lang, '#photos'), t('Photo retirée du billet.'), before ? [t('Pour la remettre : Versions, puis Rétablir la version précédente.')] : undefined);
    }
    if (faire === 'proposer') return proposeFlow(request, reply, saved, lang, body.message);
    if (faire === 'publier' || faire === 'programmer') return publishFlow(request, reply, saved, lang, faire === 'programmer' ? body.publish_at : null);
    return done(reply, back(post.id, lang, '#apercu'), t('Billet enregistré.'));
  });

  // Enregistrement automatique (JSON, B31) et aperçu (JSON, B28) : hors du journal d'audit (B34, server/routes/admin.js) et
  // hors de l'inspection du corps par la Vigie (config.vigie.corps = 'rendu', BV-12 : c'est le rendu qui signale, à
  // l'enregistrement) ; toujours sous CSRF.
  // Limites par compte (revue de sécurité : déni de service par l'aperçu) : le script en demande une toutes les 1,5 s au plus.
  const previewLimit = createRateLimiter({ limit: 60, windowMs: 60 * 1000 });
  const draftLimit = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });
  const tooFast = (request, reply, limiter, name) => {
    if (limiter(`compte:${request.session.sub}`)) return false;
    app.securite.emit('excess_rate_limit_exceeded', { request, composant: 'site · admin', emetteur: 'server/routes/carnet.js · limite', detail: { limite: name } });
    reply.code(429).header('retry-after', '60').send({ error: request.t('Trop de demandes : réessayez dans une minute.') });
    return true;
  };
  const badStructure = (request, reply, text) => {
    const err = structureError(text);
    if (!err) return false;
    reply.code(422).send({ error: request.t.msg(`Texte refusé : ${err}.`) });
    return true;
  };
  app.post('/admin/carnet/:id/brouillon', { ...W('carnet.voir'), config: { perm: 'carnet.voir', vigie: { corps: 'rendu' } } }, async (request, reply) => {
    const post = load(request);
    if (!post) return reply.code(404).send({ error: request.t('Billet introuvable.') });
    if (tooFast(request, reply, draftLimit, 'carnet_brouillon') || badStructure(request, reply, request.body?.body)) return reply;
    const body = request.body || {}, lang = langOf(body.langue), r = rights(request, post);
    if (!r.text || (post.state === 'publie' && !r.live)) return reply.code(403).send({ error: request.t('Accès refusé : ce compte n’a pas ce droit.') });
    const data = {};
    for (const f of ['title', 'dek', 'body', 'mention', 'reply']) if (f in body) data[col(f, lang)] = f === 'body' ? toStored(body[f], resolver(request, post)) : String(body[f] ?? '');
    const at = c.saveDraft(post.id, data, by(request));
    return reply.header('cache-control', 'no-store').send({ ok: true, at, time: new Intl.DateTimeFormat(request.t.locale, { timeStyle: 'short', timeZone: 'Europe/Paris' }).format(at), version: post.version });
  });
  app.post('/admin/carnet/:id/apercu', { ...W('carnet.voir'), config: { perm: 'carnet.voir', vigie: { corps: 'rendu' } } }, async (request, reply) => {
    const post = load(request);
    if (!post) return reply.code(404).send({ error: request.t('Billet introuvable.') });
    if (tooFast(request, reply, previewLimit, 'carnet_apercu') || badStructure(request, reply, request.body?.body)) return reply;
    const lang = langOf(request.body?.langue);
    const r = preview(request, post, lang, toStored(String(request.body?.body ?? ''), resolver(request, post)));
    return reply.header('cache-control', 'no-store').send({ html: r.html, words: r.words, minutes: readingMinutes(r.words) });
  });
  // Écarter le texte de l'enregistrement automatique (B31 : « reprendre / écarter »).
  app.post('/admin/carnet/:id/brouillon/ecarter', W('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const r = rights(request, post);
    if (!r.text) return app.forbid(request, reply);
    if (post.state === 'publie' && !r.live) return failed(reply, back(post.id, langOf(request.body?.langue)), request.t('Ce billet est en ligne : il ne se modifie qu’avec le droit de modifier les billets publiés. Demandez-le à un administrateur.'));
    c.dropDraft(post.id);
    return done(reply, back(post.id, langOf(request.body?.langue)), request.t('Texte enregistré automatiquement écarté : le billet reprend sa dernière version.'));
  });

  // Une photo ouverte depuis l'aperçu : la visionneuse du billet (MQ-20, état 15), photos voisines du billet.
  app.get('/admin/carnet/:id/apercu/photo/:slug', P('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const lang = langOf(request.query.langue);
    const ids = photoIdsOf(post[col('body', lang)] || post.body);
    const all = app.publicRepo.photosByIds(ids, lang);
    const list = ids.map(id => all.get(id)).filter(p => p && usable(request, p));
    const i = list.findIndex(p => p.slug === request.params.slug);
    if (i === -1) return reply.callNotFound();
    const p = list[i], s = c.settings(post.id).get(p.id) || {};
    const two = post.authors.length > 1;
    return render(request, reply, 'carnet-photo', { title: `${p.title} · ${post.title}`, post, lang, p, alt: s[col('alt', lang)] || s.alt || p.alt || '', n: i + 1, count: list.length,
      prev: list[i - 1] || null, next: list[i + 1] || null, meta: [p.author, p.place, [shortDate(p, request.t), p.time].filter(Boolean).join(', ')].filter(Boolean).join(' · '), two, carnetAssets: true, f: fmt(p) });
  });

  // Photos du billet (MQ-20 : « Décrire la photo… », sans script une page) : texte de remplacement, légende, taille.
  const photoAt = (post, n, lang) => { const ids = c.bodyPhotoIds(post); const id = ids[Number(n) - 1]; return id ? { id, n: Number(n), photo: app.publicRepo.photosByIds([id], lang).get(id) } : null; };
  app.get('/admin/carnet/:id/photos/:n', P('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const lang = langOf(request.query.langue);
    const at = photoAt(post, request.params.n, lang);
    if (!at?.photo || !usable(request, at.photo)) return reply.callNotFound();
    const s = c.settings(post.id).get(at.id) || {};
    const suggestion = app.describer?.forPhoto?.(at.id, lang);
    return render(request, reply, 'carnet-photo-reglages', { title: request.t('Photo {n} du billet', { n: at.n }), post, lang, at, s, r: rights(request, post), suggestion: suggestion?.text || '', carnetAssets: true, LIMITS });
  });
  app.post('/admin/carnet/:id/photos/:n', W('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const lang = langOf(request.body?.langue), r = rights(request, post);
    if (!r.text) return app.forbid(request, reply);
    if (post.state === 'publie' && !r.live) return failed(reply, back(post.id, lang), request.t('Ce billet est en ligne : il ne se modifie qu’avec le droit de modifier les billets publiés. Demandez-le à un administrateur.'));
    const at = photoAt(post, request.params.n, lang);
    if (!at) return reply.callNotFound();
    const b = request.body || {};
    const input = { [col('alt', lang)]: b.alt, [col('legend', lang)]: b.legende };
    if (r.write) { input.size = b.taille; input.decorative = b.decorative === 'on'; }
    try {
      const changed = c.setPhoto(post.id, at.id, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)), { publisher: r.publish });
      note(request, changed, `photo ${at.id} : `);
    } catch (err) {
      if (!(err instanceof CarnetError)) throw err;
      return failed(reply, `/admin/carnet/${post.id}/photos/${at.n}${lang !== 'fr' ? `?langue=${lang}` : ''}`, msg(request, err));
    }
    return done(reply, back(post.id, lang, `#ph-${at.n}`), request.t('Photo mise à jour.'));
  });

  // Les photos qu'on peut insérer (sélecteur du script, B30) : publiées, ou de la portée du compte.
  app.get('/admin/carnet/:id/photos.json', P('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.code(404).send({ error: request.t('Billet introuvable.') });
    const sc = request.scope('photos.voir');
    const rows = app.db.prepare(`SELECT p.id, p.slug, p.title, p.status, p.author_id, p.file, p.width, p.variant_key, p.place FROM photos p WHERE p.status = 'published' OR (? = 1 OR p.author_id = ?)
      ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC LIMIT 400`).all(sc?.all ? 1 : 0, sc?.authorId ?? -1).filter(p => usable(request, p));
    return reply.header('cache-control', 'no-store').send(rows.map(p => ({ slug: p.slug, title: p.title, place: p.place, published: p.status === 'published', thumb: thumb(p) })));
  });

  // ---------- circuit ----------
  async function proposeFlow(request, reply, post, lang, message = '') {
    const t = request.t, r = rights(request, post);
    if (!r.write) return app.forbid(request, reply);
    // Avec « proposer ses photos » : les brouillons prêts partent avec le billet (B43).
    const drafts = c.photoIds(post).map(id => photoById.get(id)).filter(p => p && p.status === 'draft' && request.owns('photos.proposer', p.author_id)).map(p => p.id);
    try {
      await c.propose(post.id, by(request), String(message || '').slice(0, LIMITS.message));
    } catch (err) {
      if (!(err instanceof CarnetError)) throw err;
      return failed(reply, `${back(post.id, lang)}${lang !== 'fr' ? '&' : '?'}verifier=proposer#resume`, msg(request, err));
    }
    if (drafts.length) await app.review.propose(drafts, by(request), { message: t('Avec le billet « {title} ».', { title: post.title }) });
    note(request, ['state']);
    return done(reply, back(post.id, lang), t('Billet proposé à la publication.'));
  }
  // Publier ou programmer (B44, B45). Les photos encore en brouillon : publiées (ou programmées à la même heure) avec le
  // billet si le compte publie les photos de leur photographe ; sinon, refus avec la liste.
  async function publishFlow(request, reply, post, lang, when) {
    const t = request.t, r = rights(request, post);
    if (!r.publish) return app.forbid(request, reply);
    let at = null;
    if (when != null) {
      at = parseWhen(when);
      if (at == null) return failed(reply, `${back(post.id, lang)}#publication`, t('Date illisible : écrivez par exemple « sam. 17 oct., 8 h » ou « 17/10 8:00 ».'));
      if (at <= Date.now()) return failed(reply, `${back(post.id, lang)}#publication`, t('Cette date est passée : choisissez un jour à venir.'));
    }
    // Photos encore en brouillon : publiées avec le billet seulement si elles sont d'un de ses auteurs (ou déjà proposées),
    // et que le compte les publie ; jamais la photo d'un autre glissée dans le billet (revue de sécurité des Carnets).
    const proposed = app.db.prepare('SELECT review FROM photos WHERE id = ?').pluck();
    const drafts = c.photoIds(post).map(id => photoById.get(id)).filter(p => p && p.status !== 'published');
    const eligible = p => (post.authors.includes(p.author_id) || proposed.get(p.id) === 'proposee') && request.owns('photos.publier', p.author_id);
    const mine = drafts.filter(eligible);
    const others = drafts.filter(p => !eligible(p));
    if (others.length) return failed(reply, `${back(post.id, lang)}${lang !== 'fr' ? '&' : '?'}verifier=publier#resume`, t('Des photos du billet ne sont pas publiées, et ce compte ne peut pas les publier : publiez-les d’abord.'));
    const g = app.readiness.gate(mine.map(p => p.id));
    if (g.verify.length || g.blocked.length) return failed(reply, `${back(post.id, lang)}${lang !== 'fr' ? '&' : '?'}verifier=publier#resume`, t('Des photos du billet attendent un accord : vérifiez-les avant de publier.'));
    try {
      // Les vérifications du billet d'abord (chapô, textes de remplacement) : rien n'est publié si le billet est refusé.
      const c0 = c.checks(post, { forPublish: false });
      if (c0.blocking.length) throw new CarnetError('Pas encore publié : des points sont à corriger.', { details: c0 });
      if (mine.length) {
        if (at != null) await app.review.approve(mine.map(p => p.id), by(request), { at });
        else {
          const before = repo.setStatuses(Object.fromEntries(mine.map(p => [p.id, 'published'])));
          const ids = Object.keys(before).map(Number);
          app.instagram.onPublished(ids);
          for (const id of ids) app.review.clear(id);
          app.variants.schedule();
          note(request, ids.map(id => `photo ${id}`), 'photos publiées avec le billet : ');
        }
      }
      // Programmé : les photos le sont à la même heure ; le billet attend qu'elles soient publiées (runDue les revérifie).
      await c.publish(post.id, by(request), { at });
    } catch (err) {
      if (!(err instanceof CarnetError)) throw err;
      return failed(reply, `${back(post.id, lang)}${lang !== 'fr' ? '&' : '?'}verifier=publier#resume`, msg(request, err));
    }
    note(request, at != null ? ['state', 'publish_at'] : ['state', 'published_at']);
    signal(request, c.get(post.id));
    return done(reply, back(post.id, lang), at != null ? t('Billet programmé pour le {date}.', { date: new Intl.DateTimeFormat(t.locale, { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(at) }) : t('Billet publié.'));
  }

  app.post('/admin/carnet/:id/proposer', W('carnet.ecrire'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    return proposeFlow(request, reply, post, langOf(request.body?.langue), request.body?.message);
  });
  app.post('/admin/carnet/:id/publier', W('carnet.publier'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const b = request.body || {};
    return publishFlow(request, reply, post, langOf(b.langue), b.quand === 'programmer' ? String(b.publish_at || '') : null);
  });
  const simple = (url, perm, act, okText) => app.post(url, W(perm), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const r = rights(request, post);
    if (!(perm === 'carnet.ecrire' ? r.write : r.publish)) return app.forbid(request, reply);
    try { await act(post, request); } catch (err) { if (!(err instanceof CarnetError)) throw err; return failed(reply, back(post.id), msg(request, err)); }
    note(request, ['state']);
    return done(reply, back(post.id), request.t(okText));
  });
  simple('/admin/carnet/:id/retirer-proposition', 'carnet.ecrire', (post, request) => c.withdraw(post.id, by(request)), 'Proposition retirée : le billet redevient un brouillon.');
  simple('/admin/carnet/:id/deprogrammer', 'carnet.publier', (post, request) => c.unschedule(post.id, by(request)), 'Programmation annulée.');
  simple('/admin/carnet/:id/republier', 'carnet.publier', (post, request) => c.republish(post.id, by(request)), 'Billet republié.');

  // Renvoyer (remarque obligatoire, B46) et retirer du site (raison obligatoire, 410, B49) : une page de confirmation.
  for (const [slug, perm, field, act, okText, titleKey] of [
    ['renvoyer', 'carnet.publier', 'message', (post, request, v) => c.sendBack(post.id, by(request), v), 'Billet renvoyé avec votre remarque.', 'Renvoyer « {title} »'],
    ['retirer', 'carnet.publier', 'reason', (post, request, v) => c.retire(post.id, by(request), v), 'Billet retiré du site : son adresse répond « retiré » (410).', 'Retirer « {title} » du site'],
  ]) {
    app.get(`/admin/carnet/:id/${slug}`, P(perm), async (request, reply) => {
      const post = load(request);
      if (!post) return reply.callNotFound();
      if (!rights(request, post).publish) return app.forbid(request, reply);
      return render(request, reply, 'carnet-confirmer', { title: request.t(titleKey, { title: post.title }), post, action: slug, field });
    });
    app.post(`/admin/carnet/:id/${slug}`, W(perm), async (request, reply) => {
      const post = load(request);
      if (!post) return reply.callNotFound();
      if (!rights(request, post).publish) return app.forbid(request, reply);
      try { await act(post, request, String(request.body?.[field] || '')); } catch (err) { if (!(err instanceof CarnetError)) throw err; return failed(reply, `/admin/carnet/${post.id}/${slug}`, msg(request, err)); }
      note(request, slug === 'retirer' ? ['state', 'retired_at', 'retired_reason'] : ['state']);
      return done(reply, back(post.id), request.t(okText));
    });
  }
  // Supprimer : un billet jamais publié seulement (un billet publié se retire).
  app.get('/admin/carnet/:id/supprimer', P('carnet.ecrire'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    if (!rights(request, post).write) return app.forbid(request, reply);
    return render(request, reply, 'carnet-confirmer', { title: request.t('Supprimer « {title} » ?', { title: post.title }), post, action: 'supprimer', field: null });
  });
  app.post('/admin/carnet/:id/supprimer', W('carnet.ecrire'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    if (!rights(request, post).write) return app.forbid(request, reply);
    try { c.remove(post.id); } catch (err) { if (!(err instanceof CarnetError)) throw err; return failed(reply, back(post.id), msg(request, err)); }
    return done(reply, '/admin/carnet', request.t('Billet « {title} » supprimé.', { title: post.title }));
  });

  // Versions (B38) : les 30 dernières, à rétablir.
  app.get('/admin/carnet/:id/versions', P('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    return render(request, reply, 'carnet-versions', { title: request.t('Versions de « {title} »', { title: post.title }), post, list: c.revisions(post.id), history: c.history(post.id), r: rights(request, post) });
  });
  app.post('/admin/carnet/:id/versions/:rev/retablir', W('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const r = rights(request, post);
    if (!r.write) return app.forbid(request, reply);
    if (post.state === 'publie' && !r.live) return failed(reply, `/admin/carnet/${post.id}/versions`, request.t('Ce billet est en ligne : il ne se modifie qu’avec le droit de modifier les billets publiés. Demandez-le à un administrateur.'));
    try { const res = c.restore(post.id, request.params.rev, by(request), { publisher: r.publish }); note(request, res.changed); signal(request, res.post); } catch (err) { if (!(err instanceof CarnetError)) throw err; return failed(reply, `/admin/carnet/${post.id}/versions`, msg(request, err)); }
    return done(reply, back(post.id), request.t('Version rétablie.'));
  });

  // Proposer une traduction (B36) par le traducteur local (LibreTranslate) : titre, chapô et texte, par blocs, sans les
  // lignes des photos ; jamais publiée sans être relue (la case « Traduction relue » reste à cocher).
  app.post('/admin/carnet/:id/traduire', W('carnet.voir'), async (request, reply) => {
    const post = load(request);
    if (!post) return reply.callNotFound();
    const lang = langOf(request.body?.langue), r = rights(request, post), t = request.t;
    if (!r.text) return app.forbid(request, reply);
    if (lang === 'fr' || !app.translator.enabled) return failed(reply, back(post.id, lang), t('Traduction non configurée (TRANSLATE_URL).'));
    if (post.state === 'publie' && !r.live) return failed(reply, back(post.id, lang), t('Ce billet est en ligne : il ne se modifie qu’avec le droit de modifier les billets publiés. Demandez-le à un administrateur.'));
    try {
      const tr = s => (String(s || '').trim() ? app.translator.translate(s, 'fr', lang) : '');
      const blocks = String(post.body || '').split(/\n{2,}/);
      const out = [];
      for (const b of blocks) out.push(/^\s*photo:\S+\s*$/m.test(b) && b.split('\n').every(l => /^\s*photo:\S+\s*$/.test(l)) ? b : await tr(b));
      const data = { [col('title', lang)]: await tr(post.title), [col('dek', lang)]: await tr(post.dek), [col('body', lang)]: out.join('\n\n') };
      c.saveDraft(post.id, data, by(request));
    } catch (err) {
      if (!(err instanceof TranslateError)) throw err;
      return failed(reply, back(post.id, lang), msg(request, err));
    }
    return done(reply, back(post.id, lang), t('Traduction proposée par l’assistant : relisez-la, puis enregistrez. Elle n’est publiée qu’une fois la case « Traduction relue » cochée.'));
  });
}
