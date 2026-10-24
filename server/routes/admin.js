import crypto from 'node:crypto';
import { noterLecture } from '../securite/donnees.js';
import { FOCALS } from '../point-focal.js';
import { ROLES, PERMISSIONS, SCOPES, grantsOf } from '../permissions.js';
import { MailError } from '../mailer.js';
import { DescribeError } from '../describe.js';
import { CURRENT as RELEASE_CURRENT, RELEASES, unseen as unseenReleases, localize as localizeRelease } from '../releases.js';
import { AccountError } from '../accounts.js';
import { NoteError } from '../notes.js';
import { ReviewError } from '../review.js';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import { createAdminRepo, ValidationError, titleFromFilename, LIMITS } from '../admin-repo.js';
import { createImportTracker } from '../imports.js';
import { variantName, widthsFor } from '../images.js';
import { importOriginal, removePhotoFiles, ImportError, MAX_FILE_BYTES } from '../media.js';
import { picture, tileRatio, tileSizes } from '../picture.js';
import { sameToken, safeNext } from '../auth.js';
import { pad } from '../format.js';
import sharp from 'sharp';
import { normalizeWatermark, normalizeExif, EXIF_MODES, MIN_WIDTHS } from '../variants.js';
import { FONTS, POSITIONS, KINDS, TONE_LABELS } from '../watermark.js';
import { DESIGNS, SECTIONS, validDesignSettings } from '../designs.js';
import { THEMES, BRAND_MODES, BRAND_SLOTS } from '../themes.js';
import { processEmblem, processIcon, processShare, BrandError, EMBLEM_MAX_BYTES } from '../brand.js';
import { loadHelp, chapterIds } from '../help.js';
import { barsAndLine, sparkline } from '../charts.js';
import { RIGHTS, LANGS, rightsDefaults, withoutDefaults } from '../rights.js';
import { FRAMES, DEFAULT_TEMPLATE, normalizeSettings, parseTimes, captionWarnings, InstagramError } from '../instagram.js';
import { PRESETS as IG_PRESETS, BOUNDS as IG_BOUNDS } from '../instagram-limits.js';
import * as cities from '../geo/cities.js';
import { createVigieAdmin } from '../vigie-admin.js';
import { createIdentityBanner } from '../verification-identite.js';
import { LEVELS as TASK_LEVELS } from '../todo.js';
import { TranslateError } from '../translate.js';
import { registerEncounters } from './rencontres.js';
import { registerOutings } from './sorties.js';
import { registerTrips } from './voyages.js';
import { registerGaleries } from './galeries.js';
import { registerCarnet } from './carnet.js';
import { registerSaisons } from './saisons.js';
import { registerSaisonsPropositions } from './saisons-propositions.js';
import { registerSaisonsBilans } from './saisons-bilans.js';
import { registerMessages } from './messages.js';
import { ADMIN_LANGS, ADMIN_LANG_NAMES, translator } from '../admin-i18n.js';
import { monthYear } from '../format.js';
import { legalMissing } from '../legal.js';
import { createAdminVersion, ADMIN_VERSIONS } from '../admin-version.js';
import { typoHtml } from '../typo-html.js';
import * as JOURNAL from '../journal-libelles.js';
import { shotLine } from '../prise-de-vue.js';
import { fileURLToPath } from 'node:url';

// Carte des visiteurs (page Statistiques) : centre de chaque pays dans le repère 1000 × 520 du fond de carte
// (public/admin/carte-monde.svg, généré par scripts/carte-monde.mjs), nom du pays en français.
const COUNTRY_CENTRES = JSON.parse(fs.readFileSync(new URL('../pays-centres.json', import.meta.url), 'utf8'));
const REGION_NAMES = Object.fromEntries(ADMIN_LANGS.map(l => [l, new Intl.DisplayNames([l], { type: 'region' })]));
const countryName = (code, t) => { if (code === 'XX') return t('Pays inconnu'); try { return (REGION_NAMES[t.lang] || REGION_NAMES.fr).of(code) || code; } catch { return code; } };
// Bulles : surface proportionnelle aux visiteurs (rayon en racine carrée), 3 à 24 unités ; les petites dessinées en dernier.
function countryBubbles(rows) {
  const known = rows.filter(r => COUNTRY_CENTRES[r.country]);
  const max = Math.max(1, ...known.map(r => r.visitors));
  return known.map(r => ({ ...r, x: COUNTRY_CENTRES[r.country][0], y: COUNTRY_CENTRES[r.country][1], r: Math.round((3 + 21 * Math.sqrt(r.visitors / max)) * 10) / 10 }))
    .sort((a, b) => b.visitors - a.visitors);
}

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_MAX_SIDE = 4000;

const MAX_FILES = 50;
// Actions sur plusieurs photos : au-delà, la demande est refusée (chaque photo coûte une lecture en base).
const MAX_BULK = 5000;
const STATUSES = { draft: 'Brouillon', published: 'Publiée' };
// Clé reçue (formulaire, adresse) lue dans une table : seulement ses propres clés, jamais « constructor » ou
// « __proto__ » héritées d'Object.prototype, ni un tableau JSON converti en texte.
const ownKey = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);

export { titleFromFilename };

// Administration : tout passe par requireAdmin ; chaque écriture par verifyCsrf.
export default async function adminRoutes(app) {
  const repo = createAdminRepo(app.db);
  const { storageDir, secureCookies } = app.config;
  const tmpDir = path.join(storageDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  // Au démarrage, aucun import n'est en cours : les restes d'un import interrompu sont effacés.
  for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { force: true, recursive: true });

  // throwFileSizeLimit: false — un fichier trop lourd est refusé seul (part.file.truncated), pas tout le lot.
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 10, fieldSize: 2000, parts: MAX_FILES + 10 },
  });

  // Photos envoyées une à une : rendu en arrière-plan, suivi consultable (/admin/photos/traitement).
  const tracker = createImportTracker({
    render: (id, onStep) => app.variants.renderPhoto(id, { onStep }),
    onReady: () => app.proofs.schedule(),
    // Rendu impossible (disque plein, incident passager…) : l'original, déjà validé et rangé, n'est jamais effacé ;
    // la photo reste en brouillon et le passage suivant recalcule ses images.
    onFailed: () => app.variants.schedule(),
    log: app.log,
  });
  app.addHook('onClose', async () => { tracker.stop(); await tracker.idle(); });

  // Rôles et permissions (server/permissions.js) : chaque route déclare la sienne ; une route d'admin sans permission
  // empêche le démarrage, et une permission absente du compte est refusée (fermé par défaut).
  app.addHook('onRoute', r => { if (r.url.startsWith('/admin') && !r.config?.perm) throw new Error(`route d’admin sans permission : ${r.method} ${r.url}`); });
  // Langue de l'admin : celle du photographe lié au compte, sinon le cookie du compte, sinon le français.
  // request.t traduit (voir server/admin-i18n.js) ; elle sert aux pages et aux messages après redirection.
  const LANG_COOKIE = 'admin_langue';
  app.decorateRequest('t', null);
  app.addHook('preHandler', async request => {
    if (!request.session) return;
    const author = repo.authorBySub(request.session.sub);
    const lang = ADMIN_LANGS.includes(author?.admin_lang) ? author.admin_lang : ADMIN_LANGS.includes(request.cookies[LANG_COOKIE]) ? request.cookies[LANG_COOKIE] : 'fr';
    request.t = translator(lang);
  });
  app.addHook('preHandler', app.requireAdmin);
  app.addHook('preHandler', app.requirePermission);
  // Vérification d'identité demandée par la Vigie : écritures arrêtées pour une session authentifiée avant la décision
  // (server/auth.js), lectures permises avec un bandeau (server/verification-identite.js).
  app.addHook('preHandler', app.requireFreshIdentity);
  // Portée « les miennes » : une photo, une rencontre, une personne, une sortie ou un QR qui n'est pas au photographe du
  // compte n'existe pas pour lui (404). Les listes, elles, sont filtrées dans chaque route.
  const encounterAuthor = app.db.prepare('SELECT author_id FROM encounters WHERE id = ?');
  const personHasOwn = app.db.prepare('SELECT 1 FROM encounters WHERE person_id = ? AND author_id = ? LIMIT 1');
  const personExists = app.db.prepare('SELECT 1 FROM people WHERE id = ?');
  // Deux contrôles : la chose doit être visible (sinon 404), et la permission de la route doit couvrir son
  // photographe quand elle a une portée (sinon 403) — un compte peut voir toutes les photos (relecteur) sans pouvoir
  // supprimer ou modifier celles des autres (photographe).
  app.addHook('preHandler', async (request, reply) => {
    const url = request.routeOptions.url || '';
    const perm = request.routeOptions.config?.perm;
    const scoped = perm && PERMISSIONS[perm]?.scoped;
    const id = Number(request.params?.id);
    // exists : la chose existe (un « hors portée » n'est signalé à la Vigie que pour une chose qui existe).
    let author, visible = true, found = true, exists = true;
    if (url.startsWith('/admin/photos/:id')) {
      const p = repo.photo(id);
      found = exists = Boolean(p); author = p?.author_id;
      visible = !p || request.owns('photos.voir', author);
    } else if (url.startsWith('/admin/rencontres/:id')) {
      const e = encounterAuthor.get(id);
      found = exists = Boolean(e); author = e?.author_id;
      visible = !e || request.owns('personnes.voir', author);
    } else if (url.startsWith('/admin/personnes/:id')) {
      // Une personne : visible si l'une de ses rencontres l'est ; les actions qui la modifient vérifient en plus que
      // toutes ses rencontres sont au photographe (rencontres.js, « exclusive »).
      const s = request.scope('personnes.voir');
      visible = !s || s.all || Boolean(personHasOwn.get(id, s.authorId));
      found = false;                                                  // pas de contrôle par photographe unique ici
      exists = Boolean(personExists.get(id));
    } else if (url.startsWith('/admin/sorties/:author')) {
      const a = repo.authors().find(x => x.slug === request.params.author);
      author = a?.id;
      visible = Boolean(a) && request.owns('sorties.voir', a.id);
      exists = Boolean(a);
    } else if (url.startsWith('/admin/instagram/:id/')) {
      // Un envoi de la file : celui de la photo (portée de instagram.file pour qui la règle sur ses photos seulement).
      const post = app.instagram.post(id);
      found = exists = Boolean(post); author = post ? repo.photo(post.photo_id)?.author_id : undefined;
      visible = !post || request.can('instagram.voir') || request.owns('photos.voir', author);
    } else if (url === '/admin/auteurs/:id/qr/:file') {
      author = id;
      visible = request.owns('terrain.cartes', id);
      exists = repo.authors().some(a => a.id === id);
    } else {
      return;
    }
    if (!visible) {
      if (exists) app.securite.emit('authz_fail', { request, emetteur: 'server/routes/admin.js · portée', detail: { raison: 'hors portée', permission: perm ?? null } });
      reply.callNotFound(); return reply;
    }
    if (found && scoped && author !== undefined && !request.owns(perm, author)) return app.forbid(request, reply);
  });
  // Fichier refusé au décodage (Vigie) : image piégée, illisible ou bombe de décompression. Un HEIC d'iPhone, une image
  // trop grande ou trop haute sont des refus ordinaires, non signalés. Seule l'extension du nom est gardée.
  const signalUpload = (request, err, name) => {
    if (!(err instanceof ImportError)) return;                                  // panne du serveur, pas un fichier piégé
    const m = String(err.message || '');
    if (/HEIC|trop grande|trop haute|16 bits|non pris en charge/.test(m)) return;
    app.securite.emit('upload_rejected', { request, emetteur: 'server/routes/admin.js · import', detail: { raison: m.slice(0, 120), extension: path.extname(String(name || '')).slice(0, 10).toLowerCase() } });
  };
  // Journal d'audit : qui a modifié quoi, dans le journal du serveur et dans la base (page « Journal »). Une action
  // déjà notée avec son détail par la route (request.audited) n'est pas notée deux fois ; la langue et le thème de
  // l'admin, simples préférences, ne le sont pas. Les lectures les plus sensibles (exports RGPD, originaux avec leur
  // GPS) le sont aussi : leur route le demande (config.audit).
  app.decorateRequest('audited', false);
  app.decorateRequest('refused', false);
  // Champs modifiés par l'action (noms des colonnes, jamais leurs valeurs : un texte peut porter une donnée personnelle),
  // notés dans le détail de sa ligne du journal : quel texte publié a changé, et sur quelle photo, série ou photographe
  // (la Vigie pourra les lire : registre des briques, BV-20 et BV-21).
  app.decorateRequest('auditChanges', null);
  // Admin v2, Journal (UX-A-19) : ce que le journal note en plus pour se lire en toutes lettres. Jamais une valeur
  // personnelle : le titre d'un voyage ou d'une série (un titre éditorial, publié sur le site) et, pour une action
  // groupée, ce qu'elle a fait et combien de photos (« lot : publiees 5 »). Le titre d'une rencontre ou d'une personne n'y
  // figure jamais : leur cible reste le numéro seul. Ajouté au détail de la ligne, après « champs : … » (dont les noms ne
  // changent pas : la Vigie ne lit pas le journal, mais les tests et BV-20 et BV-21 les attendent tels quels).
  app.decorateRequest('auditLot', null);
  app.decorateRequest('auditNom', null);
  const NOMMES = /^(?:POST) \/admin\/(voyages|series)\/:id(?:\/|$)/;
  const nomDe = (genre, id) => (genre === 'voyages' ? app.trips.get(id)?.name : app.db.prepare('SELECT name FROM categories WHERE id = ?').pluck().get(id));
  // Avant l'action : un voyage ou une série qu'elle efface a encore son titre.
  app.addHook('preHandler', async request => {
    if (!request.session || request.method !== 'POST') return;
    const m = NOMMES.exec(`${request.method} ${request.routeOptions.url}`);
    if (m) request.auditNom = JOURNAL.nomPropre(nomDe(m[1], Number(request.params.id)));
  });
  const noteChanges = (request, before, after, label = '') => {
    const fields = Object.keys(after || {}).filter(k => !BOOKKEEPING.has(k) && String(before?.[k] ?? '') !== String(after[k] ?? ''));
    if (fields.length) (request.auditChanges ||= []).push(`${label}${fields.join(', ')}`);
  };
  app.addHook('onResponse', async (request, reply) => {
    if (request.session && ((request.method !== 'GET' && request.method !== 'HEAD') || request.routeOptions.config?.audit)) {
      const action = `${request.method} ${request.routeOptions.url}`;
      request.log.info({ audit: true, sub: request.session.sub, action, params: request.params, status: reply.statusCode }, 'action admin');
      // L'aperçu d'un billet et son enregistrement automatique (une demande toutes les 1,5 à 30 s pendant qu'on écrit) ne
      // le sont pas non plus (étude des Carnets, B34) : ils n'écrivent rien du billet ; « Enregistrer » est noté.
      // Le choix de l'admin v1 ou v2 (POST /admin/version) est une préférence du compte, comme la langue et le thème ; de
      // même les raccourcis d'une touche de la photothèque v2 (POST /admin/compte/raccourcis).
      if (!request.audited && !['POST /admin/langue', 'POST /admin/theme', 'POST /admin/version', 'POST /admin/compte/raccourcis', 'POST /admin/carnet/:id/apercu', 'POST /admin/carnet/:id/brouillon'].includes(action)) {
        // Statut gardé : celui de l'issue (422 pour un refus par failed(), redirigé en 303), lu « fait » ou « refusé ».
        // Le titre d'après l'action (un voyage renommé : le nouveau), à défaut celui d'avant (un voyage supprimé).
        const m = NOMMES.exec(action);
        const nom = m ? JOURNAL.nomPropre(nomDe(m[1], Number(request.params.id))) || request.auditNom : null;
        app.audit.log({ sub: request.session.sub, name: request.session.name, action, target: Object.values(request.params || {}).join(' / '), status: request.refused && reply.statusCode < 400 ? 422 : reply.statusCode,
          detail: JOURNAL.detailDe({ champs: request.auditChanges?.length ? request.auditChanges.join(' ; ') : '', lot: request.auditLot, nom }) });
      }
    }
  });
  // Permission de la route (P), et pour une écriture le jeton CSRF en plus (W).
  const P = perm => ({ config: { perm } });
  const W = perm => ({ preHandler: app.verifyCsrf, config: { perm } });
  // Routes qui font plusieurs choses : la permission de l'action précise est vérifiée en plus.
  // Textes d'une photo (photos.textes) ; changer un autre champ demande photos.modifier.
  // Le texte de remplacement (migration 053) en est un : le relecteur le corrige comme la légende.
  const TEXT_FIELDS = new Set(['title', 'legend', 'place', 'keywords', 'title_en', 'title_de', 'legend_en', 'legend_de', 'place_en', 'place_de', 'alt_text', 'alt_text_en', 'alt_text_de']);
  // Une photo publiée ne se modifie qu'avec « modifier ses photos publiées » (réglable par photographe).
  // Après une modification par qui ne valide pas lui-même (le photographe) : une photo programmée repasse en
  // proposition, pour que le modérateur revoie ce qui partira en ligne.
  const edited = (request, ids) => { if (!request.scope('photos.publier')?.all) app.review.edited([].concat(ids).map(Number), by(request)); };
  // Seulement les photos dont le contenu a réellement changé (la ligne avant et après, hors tenue de compte) : une
  // photo envoyée telle quelle (formulaire « Compléter et publier », fiche) garde la date choisie par le modérateur ;
  // une annulation ou un changement de série, de lieu ou de carte, lui, repasse devant lui.
  const BOOKKEEPING = new Set(['updated_at', 'series_checked']);
  const snapshot = ids => new Map([].concat(ids).map(Number).map(id => [id, repo.photo(id)]));
  // Les champs changés sont notés au journal (noteChanges), précédés du numéro de la photo quand ce n'est pas celle de
  // l'adresse (lot, actions groupées).
  const editedIfChanged = (request, before) => edited(request, [...before].filter(([id, p]) => {
    const now = repo.photo(id);
    if (p && now) noteChanges(request, p, now, String(request.params?.id) === String(id) ? '' : `photo ${id} : `);
    return p && now && Object.keys(now).some(k => !BOOKKEEPING.has(k) && String(p[k] ?? '') !== String(now[k] ?? ''));
  }).map(([id]) => id));
  const editable = (request, photo) => Boolean(photo) && (photo.status !== 'published' || request.owns('photos.publiees.modifier', photo.author_id));
  // Photo absente (supprimée entre-temps, dans un autre onglet) : 404, en page ou en JSON selon l'appel — jamais une
  // erreur 500 (le contrôle de portée laisse passer une photo absente : à chaque route de le dire).
  const noPhoto = (request, reply) => (request.headers.accept?.includes('text/html') ? reply.callNotFound() : reply.code(404).send({ error: request.t('Photo introuvable.') }));
  // Réponse en JSON demandée exprès (admin v2 : enregistrement au geste, « Défaire ») ; un formulaire, ou une requête sans
  // en-tête Accept, garde la redirection et son message. Même route, mêmes contrôles, même journal.
  const asJson = request => /application\/json/.test(request.headers.accept || '') && !request.headers.accept.includes('text/html');
  const refusedJson = (request, reply, error, code = 422) => { request.refused = true; return reply.code(code).send({ error }); };
  // La ville et la carte comptent toujours comme « plus que du texte » (city_label n'est pas une colonne : la comparer
  // ne voudrait rien dire, et la vider effacerait la ville).
  const CITY_FIELDS = new Set(['city_label', 'city_id', 'on_map']);
  const touchesMore = (photo, fields) => Object.entries(fields).some(([k, v]) => !TEXT_FIELDS.has(k) && v !== undefined && (CITY_FIELDS.has(k) || String(v ?? '') !== String(photo?.[k] ?? '')));

  // ---------- messages après redirection (cookie signé, lu une fois) ----------
  const FLASH = 'flash';
  // Un cookie de plus de 4 Ko est ignoré par le navigateur, et le message avec : les détails (fichiers refusés d'un
  // import…) sont raccourcis, puis les derniers résumés (« … (+12) ») jusqu'à tenir sous FLASH_MAX octets encodés.
  const FLASH_MAX = 3000;
  const flash = (reply, message) => {
    const details = Array.isArray(message.details) ? message.details.map(d => (String(d).length > 160 ? `${String(d).slice(0, 159)}…` : String(d))) : message.details;
    const keep = k => ({ ...message, details: Array.isArray(details) && k < details.length ? [...details.slice(0, k), `… (+${details.length - k})`] : details });
    let k = Array.isArray(details) ? details.length : 0;
    while (k > 0 && encodeURIComponent(JSON.stringify(keep(k))).length > FLASH_MAX) k--;
    return reply.setCookie(FLASH, JSON.stringify(keep(k)), {
      path: '/admin', httpOnly: true, secure: secureCookies, sameSite: 'lax', signed: true, maxAge: 60,
    });
  };
  function takeFlash(request, reply) {
    const raw = request.cookies[FLASH];
    if (!raw) return null;
    reply.clearCookie(FLASH, { path: '/admin' });
    const unsigned = request.unsignCookie(raw);
    try { return unsigned.valid ? JSON.parse(unsigned.value) : null; } catch { return null; }
  }
  const done = (reply, to, text, details) => flash(reply, { type: 'ok', text, details }).redirect(to, 303);
  // Refus annoncé par un message et une redirection : noté « refusé » au journal (request.refused), malgré le 303.
  const failed = (reply, to, text, details) => { reply.request.refused = true; return flash(reply, { type: 'error', text, details }).redirect(to, 303); };

  // Apparence de l'admin : « dark », « light », ou rien (celle du système, prefers-color-scheme).
  const THEME_COOKIE = 'admin_theme';
  const adminTheme = request => (['dark', 'light'].includes(request.cookies[THEME_COOKIE]) ? request.cookies[THEME_COOKIE] : '');
  // Barre latérale : les séries, avec une vignette et leur nombre de photos (cibles de dépôt).
  // Nouvelles rencontres (badge de la barre latérale) : celles du photographe du compte en portée « les miennes ».
  const newEncounters = request => {
    const s = request.scope('personnes.voir');
    if (!s) return 0;
    return s.all ? app.encounters.countNew() : app.db.prepare("SELECT COUNT(*) FROM encounters WHERE status = 'nouvelle' AND author_id = ?").pluck().get(s.authorId);
  };
  // Séries du menu : nombre de photos et vignette (la première photo, publiée d'abord) ; en portée « les miennes »,
  // seulement ses photos.
  const navSeries = request => {
    const s = request.scope('photos.voir');
    if (!s) return [];
    if (s.all) {
      const covers = repo.covers();
      return repo.categories().map(c => ({ ...c, thumb: covers[c.id] && rendered(covers[c.id]) ? thumb(covers[c.id]) : null }));
    }
    const mine = request.mine('photos.voir', repo.photos()).sort((a, b) => (b.status === 'published') - (a.status === 'published') || a.position - b.position || a.id - b.id);
    return repo.categories().map(c => {
      const list = mine.filter(p => p.category_id === c.id);
      return { ...c, count: list.length, thumb: list[0] && rendered(list[0]) ? thumb(list[0]) : null };
    });
  };

  // La Vigie dans l'admin (MV-10) : seulement si elle est réglée côté site, et pour les seuls comptes securite.voir.
  const vigieView = app.decisions && app.config.vigie ? createVigieAdmin({ decisions: app.decisions, consoleUrl: app.config.vigie.consoleUrl }) : null;
  const securiteOf = request => (vigieView && request.can('securite.voir') ? vigieView(request.t) : null);
  const identityOf = createIdentityBanner({ decisions: app.decisions, hrefOf: app.identityHref });

  // Admin v1 ou v2, au choix de chaque compte (server/admin-version.js) ; un écran sans gabarit v2 reste en v1.
  const adminVersion = createAdminVersion({ db: app.db, viewsDir: fileURLToPath(new URL('../../views/', import.meta.url)), cache: app.config.production });
  // Onglets des Réglages de la v2 (MQ-07) : les pages de réglage existantes, chacune avec sa permission ; « Mentions et
  // confidentialité » compte les rubriques légales qui manquent.
  const SETTINGS_TABS = [
    ['appearance', '/admin/apparence', 'Identité et apparence', 'site.apparence'],
    ['images', '/admin/images', 'Filigrane et EXIF', 'site.filigrane'],
    ['droits', '/admin/droits', 'Mentions et confidentialité', 'reglages.droits'],
    ['authors', '/admin/auteurs', 'Photographes', 'photographes.gerer'],
    ['assistants', '/admin/reglages/assistants', 'Assistants d’analyse', 'series.propositions'],
  ];
  // Pages de la v2 en français : espaces insécables posées à l'envoi (server/typo-html.js).
  app.decorateRequest('typoV2', false);
  app.addHook('onSend', async (request, reply, payload) => (request.typoV2 && typeof payload === 'string' && String(reply.getHeader('content-type') || '').startsWith('text/html') ? typoHtml(payload) : payload));
  const settingsTabs = request => SETTINGS_TABS.filter(([, , , perm]) => request.can(perm))
    .map(([key, href, label, perm]) => ({ key, href, label: request.t(label), alert: key === 'droits' ? legalMissing(repo.settings()).length : 0, perm }));

  // Messages de validation (écrits en français dans le code) : traduits dans la langue de l'admin à l'affichage.
  const translateDeep = (t, v) => (typeof v === 'string' ? t.msg(v) : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'values' ? x : translateDeep(t, x)])) : v);
  function render(request, reply, template, data) {
    const siteName = app.siteName();
    if (data.errors) data = { ...data, errors: translateDeep(request.t, data.errors) };
    if (data.editErrors) data = { ...data, editErrors: { ...data.editErrors, errors: translateDeep(request.t, data.editErrors.errors) } };
    // Nouveautés pas encore vues par ce compte : une seule fois, sur la première page affichée (puis marquées vues).
    let releasePopup = null;
    const account = request.method === 'GET' ? app.accounts.bySub(request.session.sub) : null;
    if (account && account.seen_release !== RELEASE_CURRENT) {
      const list = unseenReleases(account.seen_release).map(r => localizeRelease(r, request.t.lang, perm => Boolean(request.can(perm)))).filter(r => r.items.length);
      if (list.length && template !== 'releases') releasePopup = list;     // sur la page Nouveautés, déjà sous les yeux
      app.accounts.setSeenRelease(request.session.sub, RELEASE_CURRENT);
    }
    const securite = data.securite === undefined ? securiteOf(request) : data.securite;
    const version = adminVersion.of(request.session.sub);
    // data.v2 : le gabarit v2 d'un écran que la v1 rend avec un gabarit partagé (« settings » sert Site public et Droits) ;
    // un nom seulement (les Carnets passent v2: vrai ou faux, la version du site public, pour leur propre usage).
    const shown = adminVersion.template(request, typeof data.v2 === 'string' ? data.v2 : template);
    const v2 = shown.startsWith('admin/v2/');
    if (v2) request.typoV2 = true;
    return reply.render(v2 ? shown : `admin/${template}`, {
      // Choix de l'admin (menu du compte) ; en v2, les onglets des Réglages et le rôle affiché sous le nom.
      adminVersion: version, adminV2: v2,
      // shortcuts : raccourcis d'une touche de la photothèque (préférence du compte, « Mon compte »).
      ...(v2 ? { settingsTabs: settingsTabs(request), roleNames: (request.session.roles || []).map(r => request.t(ROLES[r]?.label || r)), shortcuts: adminVersion.shortcuts(request.session.sub),
        // Les chapitres de l'aide que ce compte peut lire (le panneau d'aide contextuelle en reconnaît celui d'une ancre).
        helpChapters: chapterIds().filter(id => helpAllowed(request, id)) } : {}),
      releasePopup, releaseCurrent: RELEASE_CURRENT, securite, identite: identityOf(request),
      // Retour après la bascule clair / sombre : la page affichée, si elle a été obtenue par GET.
      adminTheme: adminTheme(request), navSeries: navSeries(request), currentPath: request.method === 'GET' ? request.url : '/admin',
      siteName, session: request.session, csrf: request.session.csrf, flash: takeFlash(request, reply), can: perm => Boolean(request.can(perm)), canAll: perm => Boolean(request.scope(perm)?.all),
      // Droits du compte, lus par admin.js (boutons, raccourcis, palette) ; le serveur reste seul juge.
      grants: Object.keys(PERMISSIONS).filter(p => request.can(p)),
      section: template, picture: (p, o) => picture(p, { base: '/admin/media/', ...o }), pad, STATUSES,
      // Mise à jour des images : seulement pour qui règle le filigrane (titres de toutes les photos en échec, suivi
      // par /admin/images/etat, réservé à ce droit).
      variants: request.can('site.filigrane') ? app.variants.status() : { running: false, total: 0, done: 0, errors: [] },
      local: request.session.sub.startsWith('local:') || !request.session.id_token, activity: tracker.active(),
      translate: app.translator.enabled, encountersNew: newEncounters(request), reportsNew: request.can('signalements.traiter') ? app.feedback.pending() : 0, messagesNew: app.messages.pending(request.scope('messages.traiter')), urgent: app.todo.urgentCount(perm => request.scope(perm)) + (securite?.task?.level === 'urgent' ? 1 : 0), toValidate: (request.scope('photos.publier')?.all ? app.review.countFor('proposee') : 0) + (request.scope('instagram.file')?.all ? app.instagram.proposals().length : 0), description: '',
      // Billets proposés, à valider (Carnets) : pour qui publie tous les billets.
      carnetsPending: request.scope('carnet.publier')?.all ? app.carnet.countIn('propose') : 0,
      // adminLang : la langue de l'admin, que l'écran ne remplace pas (un billet passe la langue de son onglet dans lang).
      t: request.t, lang: request.t.lang, adminLang: request.t.lang, locale: request.t.locale, adminLangs: ADMIN_LANGS, langNames: ADMIN_LANG_NAMES,
      ...data, pageTitle: `${data.title} · ${request.t('Administration')} · ${siteName}`,
    });
  }

  // Admin v2 : la page « Accès refusé » (403) dans la mise en page de l'admin, pour un compte en v2 qui a une session sur une
  // adresse de l'admin (app.forbid l'appelle) ; null sinon, et la page du site s'affiche comme avant. Le refus lui-même
  // (code 403, no-store, authz_fail vers la Vigie) est celui de app.forbid.
  app.forbidPage.render = (request, reply) => {
    if (!request.session || !request.t || !String(request.url).startsWith('/admin') || adminVersion.of(request.session.sub) !== 'v2') return null;
    return render(request, reply, 'forbidden', { title: request.t('Accès refusé') });
  };

  const byId = id => (Number.isInteger(Number(id)) ? Number(id) : -1);
  // Variantes prêtes : la plus grande existe (les brouillons tout juste envoyés n'en ont pas encore). La plus grande, pas la
  // plus petite : une photo d'avant les tailles de 160 et 480 px reste prête pendant leur rattrapage de fond (ses vignettes
  // sont alors servies par une plus grande, server/repli-variantes.js).
  const rendered = p => {
    const job = tracker.get(p.id);
    if (job && (job.state === 'waiting' || job.state === 'processing')) return false;
    return fs.existsSync(path.join(storageDir, 'variants', variantName(p.file, widthsFor(p.width).at(-1), 'webp', p.variant_key)));
  };
  const withReady = p => p && { ...p, ready: rendered(p) };
  // Images de l'admin : vignette (la plus petite variante, 160 px : listes de 18 à 64 px) et grande image (1280 px au plus).
  const thumb = p => `/admin/media/${variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)}`;
  const large = p => { const ws = widthsFor(p.width); return `/admin/media/${variantName(p.file, ws.filter(w => w <= 1280).at(-1) ?? ws[0], 'webp', p.variant_key)}`; };
  // Heure de prise de vue dans l'admin (« 14 h 32 » en français, « 14:32 » sinon), toujours montrée avec la date.
  const hourOf = (time, lang) => (lang === 'fr' ? time.replace(':', ' h ') : time);
  // Données d'une photo pour l'inspecteur de la photothèque.
  const dataOf = (p, lang = 'fr') => ({
    id: p.id, n: p.n, title: p.title, slug: p.slug, legend: p.legend, alt_text: p.alt_text || '', status: p.status, provisional: p.provisional, review: p.review || null,
    category_id: p.category_id, category: p.category, author_id: p.author_id, author: p.author, place: p.place,
    taken_on: p.taken_on, when: p.when, time: p.taken_time ? hourOf(p.taken_time, lang) : '', width: p.width, height: p.height, ready: p.ready,
    city_id: p.city_id ?? null, city: cities.labelOf(p, lang), city_source: p.city_source ?? null, on_map: Boolean(p.on_map),
    thumb: p.ready ? thumb(p) : null, large: p.ready ? large(p) : null, suggest: p.suggest || [],
  });
  // Séries proposées (server/series-suggest.js) avec leur nom ; thumbs : vignettes des photos voisines (fiche).
  const catNames = () => new Map(repo.categories().map(c => [c.id, c.name]));
  // request (fiche) : les photos voisines d'un autre photographe ne sont pas montrées en portée « les miennes ».
  const suggestOf = (list, names = catNames(), thumbs = false, request = null) => (list || []).map(x => ({ id: x.category_id, name: names.get(x.category_id) || '', votes: x.votes, size: x.size,
    ...(thumbs ? { like: x.like.map(id => withReady(repo.photo(id))).filter(q => q?.ready && (!request || request.owns('photos.voir', q.author_id))).map(q => ({ id: q.id, title: q.title, thumb: thumb(q) })) } : {}) }));
  // Classe de format (« ar-150 » = 3:2) : planche contact justifiée sans style en ligne (CSP).
  const ratioClass = p => `ar-${Math.round(tileRatio(p) * 100)}`;

  // ---------- accueil ----------
  app.get('/admin', P('admin.acceder'), async (request, reply) => {
    // Les fichiers ne sont vérifiés (withReady) que pour les quelques photos affichées.
    // Portée « les miennes » : les photos, les chiffres et le rythme du photographe du compte.
    const sv = request.scope('photos.voir');
    const own = sv && !sv.all ? sv.authorId : null;
    const photos = request.mine('photos.voir', repo.photos());
    const published = photos.filter(p => p.status === 'published');
    const heroSlugs = Array.isArray(repo.settings().hero) ? repo.settings().hero : [];
    const hero = heroSlugs.map(s => published.find(p => p.slug === s)).filter(Boolean);
    const todo = photos.filter(p => p.status === 'draft' || p.provisional);
    // Ligne de la Vigie : en tête de son niveau d'urgence.
    const tasks = app.todo.list(request.t, perm => request.scope(perm));
    const securite = securiteOf(request);
    if (securite?.task) {
      const at = tasks.findIndex(x => TASK_LEVELS.indexOf(x.level) >= TASK_LEVELS.indexOf(securite.task.level));
      tasks.splice(at < 0 ? tasks.length : at, 0, securite.task);
    }
    return render(request, reply, 'home', {
      title: request.t('Aujourd’hui'), tasks, securite,
      // État des accords de chaque brouillon affiché (prête, à vérifier, bloquée) : « Publier » seulement si prête.
      todo: todo.slice(0, 6).map(withReady).map(p => ({ ...p, gate: (g => (g.blocked.length ? 'no' : g.verify.length ? 'warn' : 'ok'))(app.readiness.gate([p.id])) })), todoCount: todo.length,
      // Toutes les photos à finir (200 au plus) : « Compléter dans le lot » de la v2.
      todoIds: todo.slice(0, 200).map(p => p.id),
      hero: (hero.length ? hero : published.slice(0, 5)).map(withReady).filter(p => p.ready),
      heroChosen: hero.length > 0,
      rhythm: repo.importsByMonth(12, own),
      recent: repo.recent(5, own).map(withReady),
      visitorsToday: request.scope('statistiques.voir')?.all ? app.stats.today() : null,
      // Photo du moment : parmi celles dont le compte voit les chiffres (statistiques.voir), pas toutes celles qu'il voit.
      monthTop: (() => { const seen = request.mine('statistiques.voir', photos); if (!seen.length) return null; const { from, to } = app.stats.range(30); const t = app.stats.topPhotos(from, to, 100).find(r => seen.some(x => x.id === r.id)); const p = t && seen.find(x => x.id === t.id); return p ? { ...withReady(p), views: t.views } : null; })(),
      themeLabel: DESIGNS[app.publicVersion.designSettings()?.default]?.label || (THEMES[app.appearance.themeId()] || {}).label,
      publicUrl: app.config.publicUrl,
      counts: { published: photos.filter(p => p.status === 'published').length, draft: photos.filter(p => p.status === 'draft').length },
      categories: repo.categories().length, authors: repo.authors(), me: repo.authorBySub(request.session.sub),
      roleLabels: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.label])), account: app.accounts.bySub(request.session.sub), mailer: app.mailer.enabled,
      proofs: app.proofs.status(), tsa: app.config.tsa, allPhotos: own == null,
    });
  });

  // ---------- photos ----------
  app.get('/admin/photos', P('photos.voir'), async (request, reply) => {
    const { q = '', auteur = '', serie = '', statut = '' } = request.query;
    // Ce qui manque (liens d'« Aujourd'hui ») : ville (carte du monde) ou traduction du titre, photos publiées.
    // État pour le site (server/readiness.js) : à vérifier, bloquée, sans visage.
    const stateOf = new Map(), people = new Map();
    const st = p => { if (!stateOf.has(p.id)) stateOf.set(p.id, app.readiness.state(p, people, request.t)); return stateOf.get(p.id); };
    const all = request.mine('photos.voir', repo.photos());
    const sugg = app.seriesSuggest.forPhotos(all), names = catNames();
    const MISSING = { ville: { label: request.t('Publiées sans ville'), test: p => p.status === 'published' && p.city_id == null },
      traduction: { label: request.t('Titres sans traduction'), test: p => p.status === 'published' && (!p.title_en || !p.title_de) },
      verifier: { label: request.t('▲ À vérifier'), test: p => st(p).site.level === 'warn' && !app.readiness.confirmed(p.id, 'site', st(p)) },
      bloquee: { label: request.t('✕ Bloquées'), test: p => st(p).site.level === 'no' },
      'sans-visage': { label: request.t('Sans visage'), test: p => !st(p).faces.has },
      proposee: { label: request.t('✦ Série proposée'), test: p => sugg.has(p.id) },
      proposees: { label: request.t('▷ Proposées'), test: p => p.review === 'proposee' },
      programmees: { label: request.t('⏲ Programmées'), test: p => p.review === 'programmee' },
      'a-reprendre': { label: request.t('↩ À reprendre'), test: p => p.review === 'a_reprendre' } };
    const missing = Object.hasOwn(MISSING, request.query.manque) ? request.query.manque : '';
    // « À finir » : brouillons et titres provisoires.
    const todo = statut === 'afinir';
    const filter = { q: String(q), author: String(auteur), category: String(serie), status: ownKey(STATUSES, statut) ? statut : '' };
    const authors = request.mine('photos.modifier', repo.authors(), 'id');   // portée « les miennes » : son photographe seulement
    // Mois de prise de vue dans la langue de l'admin (« oct. 2026 », « Oct 2026 », « Okt. 2026 »).
    let photos = request.mine('photos.voir', repo.photos(filter)).map(p => withReady({ ...p, when: monthYear(p.taken_on, request.t.lang) }));
    if (todo) photos = photos.filter(p => p.status === 'draft' || p.provisional);
    if (missing) photos = photos.filter(MISSING[missing].test);
    // seePeople : le détail des raisons (références des rencontres) seulement pour les personnes de son ressort.
    photos = photos.map(p => ({ ...p, site: st(p).site, suggest: suggestOf(sugg.get(p.id), names), seePeople: request.owns('personnes.voir', p.author_id) }));
    // Données de l'inspecteur (une photo choisie) : lues par admin.js, jamais exécutées.
    const data = photos.map(p => dataOf(p, request.t.lang));
    return render(request, reply, 'photos', {
      title: request.t('Photothèque'), photos, filter, authors, categories: repo.categories(), ratioClass, tileSizes, altMax: LIMITS.alt_text,
      json: JSON.stringify(data).replace(/</g, '\\u003c'),
      filtered: Boolean(filter.q || filter.author || filter.category || filter.status || todo || missing), todo,
      missing: missing ? { key: missing, label: MISSING[missing].label } : null,
      totals: { all: all.length, published: all.filter(p => p.status === 'published').length, draft: all.filter(p => p.status === 'draft').length,
        todo: all.filter(p => p.status === 'draft' || p.provisional).length,
        verifier: all.filter(MISSING.verifier.test).length, bloquee: all.filter(MISSING.bloquee.test).length, 'sans-visage': all.filter(MISSING['sans-visage'].test).length, proposee: sugg.size,
        proposees: all.filter(MISSING.proposees.test).length, programmees: all.filter(MISSING.programmees.test).length, 'a-reprendre': all.filter(MISSING['a-reprendre'].test).length },
      view: request.query.vue === 'liste' ? 'liste' : 'planche', importer: 'importer' in request.query, wide: true,
      defaultAuthor: repo.authorBySub(request.session.sub)?.id ?? authors[0]?.id,
      defaultCategory: repo.categories().find(c => c.slug === filter.category)?.id ?? repo.categories()[0]?.id,
      maxFileBytes: MAX_FILE_BYTES,
    });
  });

  // Import multiple. Le jeton CSRF est le premier champ du formulaire : aucun fichier n'est lu avant lui.
  app.post('/admin/photos/import', P('photos.importer'), async (request, reply) => {
    const wantsJson = !request.headers.accept?.includes('text/html');
    const fields = {};
    const imported = [];
    const refused = [];
    let checked = false;
    const finish = (code, payload) => (wantsJson ? reply.code(code).send(payload) : null);

    try {
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          fields[part.fieldname] = part.value;
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked) {
          part.file.resume();
          return finish(403, { error: request.t('Jeton CSRF invalide.') }) ?? reply.code(403).send(request.t('Jeton CSRF invalide.'));
        }
        const categoryId = Number(fields.category_id);
        const authorId = Number(fields.author_id);
        // Portée « les miennes » : on n'importe que pour son propre photographe.
        if (!repo.categories().some(c => c.id === categoryId) || !repo.authors().some(a => a.id === authorId) || !request.owns('photos.modifier', authorId)) {
          part.file.resume();
          refused.push({ name: part.filename, reason: request.t('série ou auteur invalide') });
          continue;
        }
        const tmp = path.join(tmpDir, crypto.randomUUID());
        try {
          await pipeline(part.file, fs.createWriteStream(tmp));
        } catch (err) {
          fs.rmSync(tmp, { force: true });            // envoi interrompu : rien ne reste dans tmp/
          throw err;
        }
        if (part.file.truncated) {
          fs.rmSync(tmp, { force: true });
          refused.push({ name: part.filename, reason: request.t('fichier trop lourd ({n} Mo au plus)', { n: MAX_FILE_BYTES / 1024 / 1024 }) });
          continue;
        }
        let id = null;
        let original = null;
        try {
          original = await importOriginal(storageDir, tmp);
          id = repo.addPhoto({ title: titleFromFilename(part.filename), categoryId, authorId, sourceName: part.filename, ...original });
          if (wantsJson) await app.variants.renderPhoto(id);          // réponse JSON : images prêtes à la réponse
          await app.faces.examine(id);
          app.seriesSuggest.examine(id);
          // Formulaire sans JavaScript : comme l'envoi photo par photo, réponse dès les originaux rangés, images rendues
          // ensuite par le suivi d'import (cinquante rendus d'affilée dépasseraient les 100 s de Cloudflare).
          if (!wantsJson) tracker.add(id, part.filename);
          imported.push({ id, name: part.filename });
        } catch (err) {
          // Rien ne reste d'une image qui n'a pas pu être rendue : ni ligne, ni original, ni variante.
          if (id) repo.deletePhoto(id);
          if (original) removePhotoFiles(storageDir, original.file);
          signalUpload(request, err, part.filename);
          if (err instanceof ImportError) refused.push({ name: part.filename, reason: request.t.msg(err.message) });
          else {
            request.log.warn({ err, file: part.filename }, 'rendu impossible à l’import');
            refused.push({ name: part.filename, reason: request.t('image illisible ou format non pris en charge par le serveur') });
          }
        }
      }
    } catch (err) {
      if (err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return reply.code(400).send({ error: request.t('Envoi multipart attendu.') });
      if (err.code !== 'FST_FILES_LIMIT' && err.code !== 'FST_PARTS_LIMIT') throw err;
      refused.push({ name: '…', reason: request.t('{n} fichiers au plus par envoi', { n: MAX_FILES }) });
    }

    if (!checked) return finish(403, { error: request.t('Jeton CSRF invalide.') }) ?? reply.code(403).send(request.t('Jeton CSRF invalide.'));
    request.log.info({ imported: imported.length, refused: refused.length }, 'import de photos');
    if (imported.length) app.proofs.schedule();          // horodatage des nouveaux originaux
    if (wantsJson) return reply.send({ imported, refused });
    const details = refused.map(r => request.t('{name} : {reason}', { name: r.name, reason: r.reason }));
    const text = (refused.length ? request.t('{n} photo(s) importée(s) en brouillon, {r} refusée(s).', { n: imported.length, r: refused.length })
      : request.t('{n} photo(s) importée(s) en brouillon.', { n: imported.length })) + (imported.length ? ` ${request.t('Images en cours de calcul : elles apparaissent dans quelques instants.')}` : '');
    return (imported.length ? done : failed)(reply, '/admin/photos?statut=draft', text, details);
  });


  // Envoi d'une seule photo (page d'import, avec JavaScript) : réponse dès l'original rangé,
  // les variantes sont rendues ensuite (suivi : /admin/photos/traitement).
  app.post('/admin/photos/envoi', P('photos.importer'), async (request, reply) => {
    const fields = {};
    let checked = false;
    let result = null;
    const refuse = (code, error) => { result = { code, error }; };
    try {
      for await (const part of request.parts({ limits: { files: 1 } })) {
        if (part.type === 'field') {
          fields[part.fieldname] = part.value;
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked || result) { part.file.resume(); continue; }
        const categoryId = Number(fields.category_id);
        const authorId = Number(fields.author_id);
        // Portée « les miennes » : on n'importe que pour son propre photographe.
        if (!repo.categories().some(c => c.id === categoryId) || !repo.authors().some(a => a.id === authorId) || !request.owns('photos.modifier', authorId)) {
          part.file.resume();
          refuse(422, request.t('série ou auteur invalide'));
          continue;
        }
        const tmp = path.join(tmpDir, crypto.randomUUID());
        try {
          await pipeline(part.file, fs.createWriteStream(tmp));
        } catch (err) {
          fs.rmSync(tmp, { force: true });            // envoi interrompu (annulé) : rien ne reste dans tmp/
          throw err;
        }
        if (part.file.truncated) {
          fs.rmSync(tmp, { force: true });
          refuse(413, request.t('trop lourde ({n} Mo au plus)', { n: MAX_FILE_BYTES / 1024 / 1024 }));
          continue;
        }
        try {
          const original = await importOriginal(storageDir, tmp);
          const title = titleFromFilename(part.filename);
          const id = repo.addPhoto({ title, categoryId, authorId, sourceName: part.filename, ...original });
          await app.faces.examine(id);
          app.seriesSuggest.examine(id);
          tracker.add(id, part.filename);
          result = { code: 200, id, title };
        } catch (err) {
          if (!(err instanceof ImportError)) throw err;
          signalUpload(request, err, part.filename);
          refuse(422, request.t.msg(err.message));
        }
      }
    } catch (err) {
      if (err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return reply.code(400).send({ error: request.t('Envoi multipart attendu.') });
      if (err.code !== 'FST_FILES_LIMIT' && err.code !== 'FST_PARTS_LIMIT') throw err;
    }
    if (!checked) return reply.code(403).send({ error: request.t('Jeton CSRF invalide.') });
    if (!result) return reply.code(400).send({ error: request.t('Aucun fichier reçu.') });
    const { code, ...payload } = result;
    if (code === 200) request.log.info({ photo: payload.id }, 'photo envoyée');
    return reply.code(code).send(payload);
  });

  // État du traitement : par photo (?ids=1,2) et nombre de photos encore en cours (indicateur d'en-tête).
  app.get('/admin/photos/traitement', P('photos.voir'), async request => {
    // Appelée en boucle pendant un import : seulement les photos demandées (celles d'un autre photographe sont tues).
    const ids = String(request.query.ids || '').split(',').filter(Boolean).map(Number).filter(Number.isInteger).slice(0, 200)
      .filter(id => { const p = repo.photo(id); return !p || request.owns('photos.voir', p.author_id); });
    return {
      active: tracker.active(),
      photos: ids.map(id => {
        const job = tracker.get(id);
        if (job?.state === 'error') return { id, state: 'error', error: request.t.msg(job.error) };
        const p = repo.photo(id);
        if (!p) return { id, state: 'missing' };
        const ready = rendered(p);
        return { id, state: ready ? 'ready' : (job?.state || 'processing'), done: job?.done ?? 0, total: job?.total ?? 0, thumb: ready ? thumb(p) : null };
      }),
    };
  });

  // Une photo, pour l'inspecteur (photo arrivée par l'import, ou relue après une modification).
  app.get('/admin/photos/:id/donnees', P('photos.voir'), async (request, reply) => {
    const p = repo.photoView(byId(request.params.id));
    if (!p) return reply.code(404).send({ error: request.t('Photo introuvable.') });
    return dataOf(withReady({ ...p, suggest: suggestOf(app.seriesSuggest.forPhoto(repo.photo(p.id))) }), request.t.lang);
  });
  // Plusieurs photos d'un coup (inspecteur, après une action groupée ou son annulation) : une requête, et non une par
  // photo ; seulement celles que le compte voit.
  app.get('/admin/photos/donnees', P('photos.voir'), async request => {
    const ids = new Set(String(request.query.ids || '').split(',').slice(0, 2000).map(Number).filter(Number.isInteger));
    const names = catNames();
    return { photos: request.mine('photos.voir', repo.photos()).filter(p => ids.has(p.id))
      .map(p => dataOf(withReady({ ...p, suggest: suggestOf(app.seriesSuggest.forPhoto(repo.photo(p.id)), names) }), request.t.lang)) };
  });

  // Série proposée : la prendre (category_id) ou garder la série actuelle (garder=1). JSON ou formulaire (fiche,
  // sortie) ; dans les deux cas, la série est désormais choisie et la proposition disparaît.
  app.post('/admin/photos/:id/serie', W('photos.modifier'), async (request, reply) => {
    const id = byId(request.params.id);
    const photo = repo.photo(id);
    if (photo && !editable(request, photo)) return app.forbid(request, reply);
    const json = !request.headers.accept?.includes('text/html');
    const back = safeBack(request, `/admin/photos/${id}`);
    if (!photo) return json ? reply.code(404).send({ error: request.t('Photo introuvable.') }) : reply.callNotFound();
    const body = request.body || {};
    let text;
    if (body.garder === '1') {
      repo.keepSeries(id);
      text = request.t('« {title} » reste dans « {name} ».', { title: photo.title, name: photo.category });
    } else {
      const target = repo.categories().find(c => c.id === Number(body.category_id));
      if (!target) return json ? reply.code(422).send({ error: request.t('Série inconnue.') }) : failed(reply, back, request.t('Série inconnue.'));
      const before = snapshot(id);
      repo.setCategories({ [id]: target.id });
      editedIfChanged(request, before);
      text = request.t('« {title} » classée dans « {name} ».', { title: photo.title, name: target.name });
    }
    return json ? { ok: true, text, category_id: repo.photo(id).category_id } : done(reply, back, text);
  });

  // ---------- Instagram (voir server/instagram.js) ----------
  // Photos passées de brouillon à publiée : dans la file Instagram si leur série est en mise en file automatique.
  // Et photos repassées en brouillon : retirées de la file (elles ne partiront pas).
  function queued(before) {
    const now = id => repo.photo(Number(id))?.status;
    const up = Object.entries(before).filter(([id, st]) => st === 'draft' && now(id) === 'published').map(([id]) => Number(id));
    const down = Object.entries(before).filter(([id, st]) => st === 'published' && now(id) === 'draft').map(([id]) => Number(id));
    if (up.length) app.instagram.onPublished(up);
    if (down.length) app.instagram.onUnpublished(down);
    for (const id of [...up, ...down]) app.review.clear(id);              // publiée ou dépubliée directement : hors circuit
  }
  const IG_STATE = 'ig_state';
  const igPage = (request, reply, extra = {}) => {
    const ig = app.instagram;
    const s = ig.settings();
    const photos = new Map(repo.photos().map(p => [p.id, p]));
    const withPhoto = list => list.map(x => ({ ...x, photo: photos.get(x.photo_id) && withReady(photos.get(x.photo_id)), caption: ig.captionOf(x, s) })).filter(x => x.photo);
    return render(request, reply, 'instagram', {
      title: request.t('Instagram'), s, FRAMES, DEFAULT_TEMPLATE, categories: repo.categories(),
      conf: { configured: app.config.instagram.configured, https: app.config.instagram.https, redirectUri: app.config.instagram.redirectUri, apiVersion: app.config.instagram.apiVersion },
      account: ig.account.get(), connected: ig.account.connected(),
      queue: withPhoto(ig.queue()), published: withPhoto(ig.published(10)).map(x => ({ ...x, engagement: ig.engagementOf(x.ig_media_id) })),
      failed: withPhoto(ig.failedLatest(20)), events: ig.events(50),
      mostLiked: withPhoto(ig.mostLiked(10)), engagementState: ig.engagementState(), usage: ig.usage(), IG_PRESETS, IG_BOUNDS,
      // Admin v2 : les propositions des photographes sur la page Instagram aussi (les mêmes qu'« À valider », mêmes routes),
      // pour qui gère toute la file.
      proposals: request.scope('instagram.file')?.all ? ig.proposals().map(pr => { const photo = photos.get(pr.photo_id); return photo && { ...pr, photo: withReady(photo),
        author: repo.authors().find(a => a.id === photo.author_id)?.name || '', caption: ig.captionOf({ photo_id: pr.photo_id, caption: pr.caption }), frameLabel: FRAMES[pr.frame] || pr.frame }; }).filter(Boolean) : null,
      ...extra,
    });
  };
  app.get('/admin/instagram', P('instagram.voir'), async (request, reply) => igPage(request, reply));
  // Lever une pause « limite atteinte » à la main (Meta a rendu l'accès plus tôt, réglage changé…).
  app.post('/admin/instagram/reprendre', W('instagram.compte'), async (request, reply) => { app.instagram.resume(request.session.name); return done(reply, '/admin/instagram', request.t('File Instagram reprise.')); });

  // Likes et commentaires relevés à la demande (sinon une fois par jour) ; pas plus d'une fois toutes les 10 minutes.
  app.post('/admin/instagram/likes', W('instagram.compte'), async (request, reply) => {
    const ig = app.instagram;
    if (!ig.account.connected()) return failed(reply, '/admin/instagram#likes', request.t('Connectez d’abord le compte Instagram.'));
    if (!ig.canSyncNow()) return failed(reply, '/admin/instagram#likes', request.t('Relevé déjà demandé il y a moins de 10 minutes : réessayez un peu plus tard.'));
    try {
      const r = await ig.syncEngagement();
      return done(reply, '/admin/instagram#likes', r.skipped ? request.t('Aucun post publié depuis le site à relever pour l’instant.')
        : r.count > 1 ? request.t('Likes et commentaires relevés pour {n} posts.', { n: r.count }) : request.t('Likes et commentaires relevés pour {n} post.', { n: r.count }));
    } catch (err) {
      return failed(reply, '/admin/instagram#likes', request.t('Relevé impossible : {error}', { error: request.t.msg(err.message) }));
    }
  });

  app.post('/admin/instagram/reglages', W('instagram.compte'), async (request, reply) => {
    app.instagram.saveSettings(normalizeSettings(request.body || {}, repo.categories()));
    // Une heure illisible est écartée : on le dit (sinon la file publierait à 18:30 sans prévenir).
    const { rejected } = parseTimes(request.body?.times);
    const ignored = rejected.length ? ` ${request.t('Heures ignorées (format HH:MM attendu) : {times}.', { times: rejected.join(', ') })}` : '';
    // Admin v2 : le formulaire part à chaque geste et demande une réponse JSON (les réglages tels qu'enregistrés).
    if (request.headers.accept?.includes('application/json')) return { ok: true, text: `${request.t('Réglages Instagram enregistrés.')}${ignored}`, rejected, times: app.instagram.settings().times };
    return done(reply, '/admin/instagram#reglages', `${request.t('Réglages Instagram enregistrés.')}${ignored}`);
  });

  // Connexion : redirection vers Instagram, avec un « state » lié à ce navigateur (cookie signé).
  app.get('/admin/instagram/connexion', P('instagram.compte'), async (request, reply) => {
    const c = app.config.instagram;
    if (!c.configured) return failed(reply, '/admin/instagram', request.t('INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET manquent dans la configuration du serveur.'));
    if (!c.https) return failed(reply, '/admin/instagram', request.t('La connexion à Instagram exige que le site soit en HTTPS (PUBLIC_URL).'));
    const state = crypto.randomBytes(24).toString('base64url');
    reply.setCookie(IG_STATE, state, { path: '/admin/instagram', httpOnly: true, secure: secureCookies, sameSite: 'lax', signed: true, maxAge: 600 });
    return reply.redirect(app.instagram.authorizeUrl(state), 303);
  });
  app.get('/admin/instagram/callback', P('instagram.compte'), async (request, reply) => {
    const raw = request.cookies[IG_STATE];
    reply.clearCookie(IG_STATE, { path: '/admin/instagram' });
    const expected = raw && request.unsignCookie(raw);
    const { code, state, error_description: denied } = request.query;
    if (!expected?.valid || typeof state !== 'string' || !sameToken(state, expected.value)) return failed(reply, '/admin/instagram', request.t('Connexion refusée : la demande ne vient pas de cet écran ou a expiré. Recommencez.'));
    if (!code) return failed(reply, '/admin/instagram', denied ? request.t('Connexion annulée : {reason}.', { reason: String(denied).slice(0, 200) }) : request.t('Connexion annulée.'));
    try {
      const username = await app.instagram.connect(String(code));
      app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'compte Instagram connecté', target: `@${username}`, status: 303 });
      return done(reply, '/admin/instagram', request.t('Compte Instagram @{username} connecté.', { username }));
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return failed(reply, '/admin/instagram', request.t('Connexion impossible : {error}', { error: request.t.msg(err.message) }));
    }
  });
  app.post('/admin/instagram/deconnexion', W('instagram.compte'), async (request, reply) => {
    app.instagram.account.remove();
    return done(reply, '/admin/instagram', request.t('Compte Instagram déconnecté (le jeton est effacé ; retirez aussi l’accès dans Instagram si besoin).'));
  });

  // Une photo dans la file (ou ses options modifiées) : depuis la fiche ou l'inspecteur.
  app.post('/admin/instagram/file', W('instagram.file'), async (request, reply) => {
    const body = request.body || {};
    const json = !request.headers.accept?.includes('text/html');
    const id = byId(body.photo_id);
    const back = safeBack(request, `/admin/photos/${id}#instagram`);
    const photo = repo.photo(id);
    if (!photo) return reply.callNotFound();
    if (!request.owns('instagram.file', photo.author_id)) return app.forbid(request, reply);   // sans validation : ses photos seulement
    try {
      // Case « filigrane » : absente du formulaire quand elle est décochée, d'où le champ témoin watermark_set.
      const watermark = body.watermark_set ? body.watermark === 'on' || body.watermark === true : undefined;
      // Signature du photographe : gardée sur la photo (la légende du post est recalculée à l'envoi).
      if (body.signature_set) app.db.prepare('UPDATE photos SET ig_signature = ? WHERE id = ?').run(body.signature === 'on' || body.signature === true ? 1 : 0, id);
      app.instagram.enqueue(id, { frame: body.frame, watermark, caption: body.custom === 'on' || body.custom === true ? body.caption : null,
        // Confirmer les accords « à vérifier » : seulement qui voit les personnes de cette photo (pas le modérateur).
        confirmed: (body.confirmer === '1' || body.confirmer === true) && request.owns('personnes.voir', repo.photo(id)?.author_id), byName: request.session.name });
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return json ? reply.code(422).send({ error: request.t.msg(err.message) }) : failed(reply, back, request.t('Instagram : {error}.', { error: request.t.msg(err.message) }));
    }
    return json ? reply.send({ ok: true, text: request.t('Dans la file Instagram.') }) : done(reply, back, request.t('Photo dans la file Instagram.'));
  });

  for (const [act, label] of [['annuler', t => t('Retirée de la file Instagram.')], ['monter', null], ['descendre', null], ['reessayer', t => t('Remise en tête de file.')], ['publier', t => t('Publiée sur Instagram.')]]) {
    app.post(`/admin/instagram/:id/${act}`, W(act === 'publier' ? 'instagram.publier' : 'instagram.file'), async (request, reply) => {
      const id = byId(request.params.id);
      const back = safeBack(request, '/admin/instagram');
      if (!app.instagram.post(id)) return reply.callNotFound();
      // L'ordre de la file touche toutes les photos : réservé à qui la gère en entier.
      if ((act === 'monter' || act === 'descendre') && !request.scope('instagram.file')?.all) return app.forbid(request, reply);
      try {
        if (act === 'annuler') app.instagram.cancel(id, request.session.name);
        else if (act === 'monter' || act === 'descendre') app.instagram.move(id, act === 'monter' ? 'up' : 'down');
        else if (act === 'reessayer') app.instagram.retry(id, request.session.name);
        else if (!request.headers.accept?.includes('text/html')) {
          // « Publier maintenant » depuis la page (JavaScript) : l'envoi part en arrière-plan, la page suit son
          // avancement (GET …/etat) ; un refus immédiat (budget, compte, accords) est renvoyé tout de suite.
          const run = app.instagram.publish(id, { byName: request.session.name });
          const early = await Promise.race([run.then(() => ({}), err => ({ err })), new Promise(r => setTimeout(r, 300, null))]);
          if (!early) run.catch(() => {});
          if (early?.err) throw early.err;
          return reply.code(202).send({ ok: true, state: igState(request, id) });
        } else await app.instagram.publish(id, { byName: request.session.name });
      } catch (err) {
        if (!(err instanceof InstagramError)) throw err;
        if (act === 'publier' && !request.headers.accept?.includes('text/html')) return reply.code(422).send({ error: request.t.msg(err.message), state: igState(request, id) });
        return failed(reply, back, request.t('Instagram : {error}.', { error: request.t.msg(err.message).replace(/\.$/, '') }));
      }
      // Admin v2 : « Avancer », « Reculer » sans recharger (et « Défaire » par le geste inverse) ; réponse JSON sur demande.
      if (act !== 'publier' && request.headers.accept?.includes('application/json')) return { ok: true, text: label ? label(request.t) : '', queue: app.instagram.queue().map(x => x.id) };
      return label ? done(reply, back, label(request.t)) : reply.redirect(back, 303);
    });
  }

  // ---------- circuit Instagram : le photographe propose, le modérateur met dans la file ou renvoie ----------
  // E-mails (best effort) : à qui gère toute la file et l'a choisi ; au photographe de la photo s'il l'a choisi.
  // Langue de chaque destinataire : celle de l'admin du photographe lié à son compte (comme les relances), sinon le français.
  const mailLang = a => repo.authors().find(x => x.id === a.author_id)?.admin_lang || 'fr';
  const teamMail = perm => app.accounts.list().filter(a => a.status === 'actif' && a.notify_email && (a.notify_to || a.email) && grantsOf(a.roles, a.adjust).get(perm) === SCOPES.ALL).map(a => ({ addr: a.notify_to || a.email, lang: mailLang(a) }));
  const authorMail = authorId => app.accounts.list().filter(a => a.status === 'actif' && a.notify_email && (a.notify_to || a.email) && a.author_id === authorId).map(a => ({ addr: a.notify_to || a.email, lang: mailLang(a) }));
  // compose(t) → { subject, lines }, dans la langue du destinataire ; link : la page à ouvrir (l'admin par défaut).
  const mailTo = async (to, compose, request, link = '/admin') => {
    if (!app.mailer.enabled) return;
    const seen = new Set();
    for (const { addr, lang } of to) {
      if (seen.has(addr)) continue;
      seen.add(addr);
      const { subject, lines } = compose(translator(lang));
      const text = [...lines, '', app.config.publicUrl ? `${app.config.publicUrl}${link}` : ''].join('\n');
      await app.mailer.send({ to: addr, subject: `${app.siteName()} · ${subject}`, text }).catch(err => request.log.warn({ err: err.message }, 'instagram : e-mail non envoyé'));
    }
  };
  const igForm = body => ({
    frame: body.frame, watermark: body.watermark_set ? body.watermark === 'on' || body.watermark === true : undefined,
    caption: body.custom === 'on' || body.custom === true ? body.caption : null,
  });
  app.post('/admin/photos/:id/instagram/proposer', W('instagram.proposer'), async (request, reply) => {
    const id = byId(request.params.id);
    const photo = repo.photo(id);
    if (!photo) return noPhoto(request, reply);
    const body = request.body || {};
    const back = `/admin/photos/${id}#instagram`;
    if (body.signature_set) app.db.prepare('UPDATE photos SET ig_signature = ? WHERE id = ?').run(body.signature === 'on' || body.signature === true ? 1 : 0, id);
    let r;
    try {
      r = app.instagram.propose(id, { ...igForm(body), message: body.message, byName: request.session.name, bySub: request.session.sub,
        confirmed: (body.confirmer === '1' || body.confirmer === true) && request.owns('personnes.voir', photo.author_id) });
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return failed(reply, back, request.t('Instagram : {error}.', { error: request.t.msg(err.message).replace(/\.$/, '') }));
    }
    if (r.created) {
      const word = String(body.message || '').trim();
      await mailTo(teamMail('instagram.file'), t => ({ subject: t('Photo proposée pour Instagram'),
        lines: [t('{name} propose « {title} » pour Instagram.', { name: request.session.name || t('Un photographe'), title: photo.title }), word ? t('Son mot : {message}', { message: word }) : ''] }), request);
    }
    return done(reply, back, r.created ? request.t('Photo proposée pour Instagram : le modérateur est prévenu.') : request.t('Proposition mise à jour.'));
  });
  app.post('/admin/photos/:id/instagram/retirer-proposition', W('instagram.proposer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!app.instagram.withdrawProposal(id, request.session.name)) return failed(reply, `/admin/photos/${id}#instagram`, request.t('Rien à retirer : la photo n’est pas proposée pour Instagram.'));
    return done(reply, `/admin/photos/${id}#instagram`, request.t('Proposition pour Instagram retirée.'));
  });
  const proposalOf = request => {
    const pr = app.instagram.proposal(byId(request.params.pid));
    return pr && repo.photo(pr.photo_id) ? pr : null;
  };
  app.post('/admin/instagram/propositions/:pid/valider', W('instagram.file'), async (request, reply) => {
    const back = safeBack(request, '/admin/a-valider#instagram');
    if (!request.scope('instagram.file')?.all) return app.forbid(request, reply);
    const pr = proposalOf(request);
    if (!pr) return reply.callNotFound();
    try {
      app.instagram.approveProposal(pr.id, request.session.name);
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return failed(reply, back, request.t('Instagram : {error}.', { error: request.t.msg(err.message).replace(/\.$/, '') }));
    }
    const photo = repo.photo(pr.photo_id);
    await mailTo(authorMail(photo.author_id), t => ({ subject: t('Photo acceptée pour Instagram'), lines: [t('« {title} » est dans la file Instagram (validé par {name}).', { title: photo.title, name: request.session.name || t('le modérateur') })] }), request);
    return done(reply, back, request.t('« {title} » est dans la file Instagram.', { title: photo.title }));
  });
  app.post('/admin/instagram/propositions/:pid/renvoyer', W('instagram.file'), async (request, reply) => {
    const back = safeBack(request, '/admin/a-valider#instagram');
    if (!request.scope('instagram.file')?.all) return app.forbid(request, reply);
    const pr = proposalOf(request);
    if (!pr) return reply.callNotFound();
    const remark = String(request.body?.message || '').trim();
    try {
      app.instagram.sendBackProposal(pr.id, request.session.name, remark);
    } catch (err) {
      if (!(err instanceof InstagramError)) throw err;
      return failed(reply, back, request.t.msg(err.message));
    }
    // La remarque arrive dans l'« Aujourd'hui » du photographe et sur la fiche (Remarques).
    app.notes.add(pr.photo_id, `Instagram : ${remark}`, { sub: request.session.sub, name: request.session.name });
    const photo = repo.photo(pr.photo_id);
    await mailTo(authorMail(photo.author_id), t => ({ subject: t('Proposition Instagram à reprendre'), lines: [t('« {title} » ne part pas sur Instagram pour l’instant ; {name} vous écrit :', { title: photo.title, name: request.session.name || t('le modérateur') }), remark] }), request);
    return done(reply, back, request.t('Proposition renvoyée au photographe avec votre remarque.'));
  });

  // Publication Instagram en échec, vue du photographe qui n'a pas la main sur la file : il demande qu'elle soit
  // republiée. Qui gère la file la voit dans « Aujourd'hui » et sur la page Instagram, et par e-mail s'il l'a choisi.
  app.post('/admin/photos/:id/instagram/demande', W('photos.proposer'), async (request, reply) => {
    const id = byId(request.params.id);
    const photo = repo.photo(id);
    const back = `/admin/photos/${id}#instagram`;
    if (!photo) return reply.callNotFound();
    if (!request.owns('photos.proposer', photo.author_id)) return app.forbid(request, reply);
    const post = app.instagram.forPhoto(id);
    if (post?.status !== 'failed') return failed(reply, back, request.t('Rien à demander : la photo n’est pas en échec sur Instagram (elle est peut-être déjà dans la file).'));
    if (post.retry_requested_at) return done(reply, back, request.t('Republication déjà demandée.'));
    app.instagram.requestRetry(post.id, request.session.name);
    await mailTo(teamMail('instagram.file'), t => ({ subject: t('Republication Instagram demandée'),
      lines: [t('{name} demande que « {title} » soit republiée sur Instagram.', { name: request.session.name || t('Un photographe'), title: photo.title }), t('Dernière erreur : {error}', { error: t.msg(post.error) || '—' })] }), request, `/admin/photos/${id}#instagram`);
    return done(reply, back, request.t('Republication demandée : l’équipe qui gère la file Instagram est prévenue.'));
  });

  // Avancement d'un envoi (« Publier maintenant ») : étape, texte, pourcentage ; état final du post.
  const IG_STEPS = {
    controle: [5, t => t('Vérifications (compte, accords, limites)…')],
    envoi: [20, t => t('Image envoyée à Instagram…')],
    traitement: [null, (t, p) => t('Instagram traite l’image (vérification {n} sur {of})…', { n: p.n, of: p.of })],
    publication: [85, t => t('Publication du post…')],
    fini: [100, t => t('Publiée sur Instagram.')],
  };
  const igState = (request, id) => {
    const post = app.instagram.post(id);
    const p = app.instagram.progressOf(id);
    const t = request.t;
    const status = post?.status || 'removed';
    const done = status === 'published' || status === 'failed' || status === 'removed' || (status === 'queued' && p?.step === 'erreur');
    let percent = 0, label = '';
    if (status === 'published') [percent, label] = [100, t('Publiée sur Instagram.')];
    else if (p?.step === 'erreur' || status === 'failed') label = status === 'failed' ? t('Échec : {error}', { error: t.msg(post.error || p?.error || '') }) : t('Pas envoyée : {error}', { error: t.msg(p?.error || '') });
    else if (p && IG_STEPS[p.step]) { const [pc, l] = IG_STEPS[p.step]; percent = pc ?? Math.round(20 + (60 * p.n) / p.of); label = l(t, p); }
    else if (status === 'publishing') [percent, label] = [10, t('Envoi en cours…')];
    return { id, status, step: p?.step || null, percent, label, done, ok: status === 'published', permalink: post?.permalink || null };
  };
  app.get('/admin/instagram/:id/etat', P('instagram.voir'), async request => igState(request, byId(request.params.id)));

  // Aperçu exact de l'image envoyée, et légende du modèle (bouton « Revenir au modèle »).
  // Aperçu et légende du modèle : pour qui voit la file, et pour le photographe qui propose ou règle sa photo.
  const igSees = (request, photo) => request.can('instagram.voir') || request.owns('instagram.proposer', photo.author_id) || request.owns('instagram.file', photo.author_id);
  app.get('/admin/instagram/apercu.jpg', P('admin.acceder'), async (request, reply) => {
    const id = byId(request.query.photo);
    const photo = repo.photo(id);
    if (!photo || !igSees(request, photo)) return reply.callNotFound();
    const frame = Object.hasOwn(FRAMES, request.query.cadre) ? request.query.cadre : app.instagram.settings().frame;
    let buf;
    try {
      buf = await app.instagram.image(id, { frame, watermark: request.query.filigrane === '1' }, { preview: true });
    } catch (err) {
      if (!err.busy) throw err;
      return reply.code(429).header('retry-after', '5').header('cache-control', 'no-store').send({ error: request.t.msg(err.message) });   // aperçus en attente : plus tard
    }
    return reply.header('cache-control', 'no-store').type('image/jpeg').send(buf);
  });
  app.get('/admin/instagram/legende', P('admin.acceder'), async (request, reply) => {
    const id = byId(request.query.photo);
    const photo = repo.photo(id);
    if (!photo || !igSees(request, photo)) return reply.code(404).send({ error: request.t('Photo introuvable.') });
    const caption = app.instagram.caption(id);
    return { caption, warnings: captionWarnings(caption) };
  });

  // ---------- statistiques (anonymes, voir server/stats.js) ----------
  const short = t => [t('janv.'), t('févr.'), t('mars'), t('avr.'), t('mai'), t('juin'), t('juil.'), t('août'), t('sept.'), t('oct.'), t('nov.'), t('déc.')];
  const dayLabel = (d, t) => t('{day} {month}', { day: Number(d.slice(8)), month: short(t)[Number(d.slice(5, 7)) - 1] });
  // Infobulle d'une barre du graphique, dans la langue de l'admin (pluriel français : 0 et 1 au singulier).
  const chartTip = t => {
    const n = (k, one, many) => `${k} ${(t.lang === 'fr' ? k > 1 : k !== 1) ? many : one}`;
    return p => `${p.label}${t.lang === 'fr' ? ' :' : ':'} ${n(p.views, t('vue'), t('vues'))}, ${n(p.visitors, t('visiteur'), t('visiteurs'))}`;
  };
  const monthLabel = (m, t) => `${short(t)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const PERIODS = { 30: '30 jours', 90: '3 mois', 365: '12 mois' };
  const periods = t => ({ 30: t('30 jours'), 90: t('3 mois'), 365: t('12 mois') });
  const pageLabel = (page, categories, authors, t) => {
    if (page === 'accueil') return t('Accueil');
    if (page === 'galerie') return t('Galerie');
    if (page === 'series') return t('Séries');
    if (page === 'a-propos') return t('À propos');
    if (page === 'droits') return t('Droits d’utilisation');
    if (page === 'carte') return t('Carte');
    if (page === 'confidentialite') return t('Confidentialité');
    if (page === 'bonjour') return t('Je vous ai photographié (/bonjour)');
    if (page === 'contact') return t('Contact');
    if (page === 'droits-demande') return t('Demander une licence');
    if (page === 'carnet') return t('Carnets');
    if (page.startsWith('carnet:')) { const slug = page.slice(7); return t('Billet « {title} »', { title: app.carnet.bySlug(slug)?.post?.title || slug }); }
    const [kind, slug] = page.split(':');
    if (kind === 'serie') return t('Série « {name} »', { name: categories.find(c => c.slug === slug)?.name || slug });
    if (kind === 'auteur') return t('Regard de {name}', { name: authors.find(a => a.slug === slug)?.name || slug });
    return page;
  };
  const instaOf = (photo, t) => {
    const ig = app.instagram;
    const s = ig.settings();
    const post = ig.forPhoto(photo.id);
    const active = post && (post.status === 'queued' || post.status === 'publishing');
    const caption = post?.caption || ig.caption(photo.id, s);
    const engagement = post?.status === 'published' ? ig.engagementOf(post.ig_media_id) : null;
    const signature = repo.authors().find(a => a.id === photo.author_id)?.ig_signature || '';
    return { post, active, s, FRAMES, caption, signature, blocked: (r => (r.level === 'no' ? r.reasons : []))(app.readiness.state(photo.id, null, t).instagram),     // dans la langue de l'admin
      custom: Boolean(post?.caption), warnings: captionWarnings(caption), connected: ig.account.connected(),
      engagement, likesSpark: engagement && engagement.series.length > 1 ? sparkline(engagement.series.map(d => d.likes)) : '',
      slot: active ? ig.queue().find(x => x.id === post.id)?.slot : null };
  };
  // Ce que la fiche montre en plus du formulaire : audience, Instagram, personnes, sortie, état et confirmations.
  // Personnes et audience : selon la portée, sur le photographe de la photo (un compte photographe et relecteur voit
  // toutes les photos, mais seulement ses personnes et ses chiffres) ; une rencontre d'un autre photographe liée à la
  // photo reste tue, comme sa fiche (404).
  // « Reprendre comme texte de remplacement » : la version française dans le champ français ; sans traducteur, l'anglais
  // va dans le champ anglais, jamais dans le français ; l'allemande (traduite) et l'anglaise remplissent en plus leur
  // champ s'il est vide.
  const descriptionUse = id => {
    const fr = app.describer.forPhoto(id, 'fr'), de = app.describer.forPhoto(id, 'de');
    if (!fr?.en) return { field: 'alt_text_en', text: '' };
    return fr.translated ? { field: 'alt_text', text: fr.text, en: fr.en, de: de?.translated ? de.text : '' } : { field: 'alt_text_en', text: fr.en, de: de?.translated ? de.text : '' };
  };
  const photoExtras = (photo, t, request) => ({
    altMax: LIMITS.alt_text, FOCALS,
    seePeople: request.owns('personnes.voir', photo.author_id), seeStats: request.owns('statistiques.voir', photo.author_id),
    proof: app.proofs.get(photo.id), tsa: app.config.tsa,
    audience: request.owns('statistiques.voir', photo.author_id) ? photoStats(photo.id) : null, shares: request.owns('statistiques.voir', photo.author_id) ? app.shares.forPhoto(photo.id) : 0, insta: instaOf(photo, t),
    encounters: request.owns('personnes.voir', photo.author_id) ? app.encounters.forPhoto(photo.id).filter(e => request.owns('personnes.voir', encounterAuthor.get(e.id)?.author_id)) : [],
    outingUrl: app.outings.urlOf(photo.author_id, photo.taken_on, photo.taken_time),
    // Réglage des images « tout l'EXIF » : l'heure part avec les fichiers servis, quel que soit le choix de la fiche.
    exifAll: repo.settings().exif?.mode === 'all',
    // Prise de vue lue dans l'EXIF de l'original (migration 060), en lecture seule, dans la langue de l'admin ; '' si
    // l'original n'en a pas (ou n'a pas encore été lu : shotRead). Le mode des images dit si les fichiers servis la portent.
    shot: shotLine(photo, t.lang), shotRead: Number(photo.shot_read) === 1, exifMode: repo.settings().exif?.mode || 'none',
    notes: app.notes.open({ photoId: photo.id }), ownPhoto: app.accounts.authorIdOf(request.session.sub) === photo.author_id,
    // Instagram : la main sur la file pour cette photo, ou seulement la proposer (circuit) ; sa proposition en cours.
    // Mots-clés suggérés par CLIP (empreinte des propositions de séries) ; null : pas encore d'empreinte.
    keywordSuggestions: app.keywordSuggest.forPhoto(photo, { lang: request.t.lang, have: photo.keywords }), seriesSuggestOn: app.seriesSuggest.enabled(),
    // Description suggérée (Florence-2) : seulement si la fonction est allumée. Elle se reprend dans le texte de
    // remplacement (UX-F-44, maquette MQ-09), jamais seule : le bouton remplit le champ, la personne relit et enregistre.
    description: app.describer.settings().on ? (d => (d ? { ...d, use: descriptionUse(photo.id) } : { pending: false, text: '' }))(app.describer.forPhoto(photo.id, request.t.lang)) : null,
    igFile: request.owns('instagram.file', photo.author_id), igPropose: request.owns('instagram.proposer', photo.author_id), igProposal: app.instagram.openProposal(photo.id),
    review: { state: repo.photo(photo.id)?.review || null, at: repo.photo(photo.id)?.publish_at || null, history: app.review.history(photo.id).slice(0, 10) },
    suggest: suggestOf(app.seriesSuggest.forPhoto(repo.photo(photo.id)), undefined, true, request),
    ready: app.readiness.state(photo.id, null, t), confirmations: app.readiness.confirmations(photo.id), igConfirmed: app.readiness.confirmed(photo.id, 'instagram'),
    siteConfirmed: app.readiness.confirmed(photo.id, 'site'),
    // Fiche de l'admin v2 : titre provisoire (UX-A-03), date lue, heure de prise de vue dans la langue de l'admin.
    moderators: moderators(request), provisional: Boolean(repo.photoView(photo.id)?.provisional), read: readDate(photo.taken_on, t.lang), time: photo.taken_time ? hourOf(photo.taken_time, t.lang) : '',
  });
  const photoStats = id => {
    const { from, to } = app.stats.range(30);
    const s = app.stats.photo(id, from, to);
    return { ...s, spark: sparkline(s.days.map(d => d.views)) };
  };

  // ---------- signalements des visiteurs ----------
  // L'adresse laissée par le visiteur est une donnée personnelle : seul qui voit toutes les personnes (l'administrateur)
  // la reçoit ; le modérateur lit le message, et sait seulement qu'une adresse a été laissée.
  app.get('/admin/signalements', P('signalements.traiter'), async (request, reply) => {
    const contact = Boolean(request.scope('personnes.voir')?.all);
    // etat : le filtre de la v2 (nouveaux, traités), appliqué à l'affichage ; les mêmes signalements sont lus.
    return render(request, reply, 'reports', {
      etat: ['nouveau', 'traite'].includes(request.query.etat) ? request.query.etat : '',
      title: request.t('Signalements des visiteurs'), reports: app.feedback.reports().map(r => withReady({ ...r, id: r.pid, reportId: r.id, email: contact ? r.email : '', hasEmail: Boolean(r.email) })),
    });
  });
  app.post('/admin/signalements/:id/traite', W('signalements.traiter'), async (request, reply) => {
    app.feedback.done(byId(request.params.id));
    return done(reply, '/admin/signalements', request.t('Signalement marqué comme traité.'));
  });
  app.post('/admin/signalements/:id/supprimer', W('signalements.traiter'), async (request, reply) => {
    app.feedback.remove(byId(request.params.id));
    return done(reply, '/admin/signalements', request.t('Signalement supprimé.'));
  });

  app.get('/admin/statistiques', P('statistiques.voir'), async (request, reply) => {
    const days = ownKey(PERIODS, request.query.periode) ? Number(request.query.periode) : 30;
    const { from, to } = app.stats.range(days);
    const prev = app.stats.range(days * 2);
    const eve = new Date(`${from}T12:00:00Z`);
    eve.setUTCDate(eve.getUTCDate() - 1);
    const before = app.stats.daily(prev.from, eve.toISOString().slice(0, 10));     // période précédente, même durée
    const daily = app.stats.daily(from, to);
    // 12 mois : regroupés par mois (visiteurs : somme des visiteurs de chaque jour).
    let points = daily.map(d => ({ ...d, label: dayLabel(d.day, request.t) }));
    if (days === 365) {
      const months = new Map();
      for (const d of daily) { const m = d.day.slice(0, 7); const o = months.get(m) || { day: m, views: 0, visitors: 0, mobile: 0 }; o.views += d.views; o.visitors += d.visitors; o.mobile += d.mobile; months.set(m, o); }
      points = [...months.values()].map(m => ({ ...m, label: monthLabel(m.day, request.t) }));
    }
    const sum = (list, k) => list.reduce((a, d) => a + d[k], 0);
    const totals = { views: sum(daily, 'views'), visitors: sum(daily, 'visitors'), mobile: sum(daily, 'mobile') };
    const previous = { views: sum(before, 'views'), visitors: sum(before, 'visitors') };
    // Portée « les miennes » : seulement les photos du photographe du compte (pas la fréquentation du site).
    const ss = request.scope('statistiques.voir');
    const own = ss.all ? null : ss.authorId;
    const all = new Map(request.mine('statistiques.voir', repo.photos()).map(p => [p.id, p]));
    const viewed = app.stats.topPhotos(from, to, 100000).filter(r => own == null || all.has(r.id));
    const photoViews = sum(viewed, 'views');
    const categories = repo.categories();
    const authors = repo.authors();
    return render(request, reply, 'stats', {
      title: request.t('Statistiques'), days, PERIODS: periods(request.t), from, to, totals, previous, photoViews,
      chart: barsAndLine(points, { labels: [points[0].label, points.at(-1).label], tip: chartTip(request.t) }), points,
      own: own != null,
      top: viewed.slice(0, own == null ? 10 : 100).map(r => ({ ...r, photo: all.get(r.id) && withReady(all.get(r.id)) })).filter(r => r.photo).slice(0, 10),
      pages: own != null ? [] : app.stats.topPages(from, to, 8).map(r => ({ ...r, label: pageLabel(r.page, categories, authors, request.t) })),
      sources: own != null ? [] : app.stats.sources(from, to, 8),
      // Partages : par moyen, et photos les plus partagées.
      shares: (() => {
        const t = request.t;
        const VIA = { whatsapp: 'WhatsApp', facebook: 'Facebook', bluesky: 'Bluesky', x: 'X', pinterest: 'Pinterest', email: t('E-mail'),
          copie: t('Lien copié'), instagram: t('Post Instagram ouvert'), telephone: t('Menu du téléphone'), qr: t('QR scanné') };
        const byVia = app.shares.byVia(from, to, own).map(r => ({ ...r, label: VIA[r.via] || r.via }));
        return { byVia, total: byVia.reduce((a, r) => a + r.n, 0),
          top: app.shares.topPhotos(from, to, 5, own).map(r => ({ ...r, photo: all.get(r.id) && withReady(all.get(r.id)) })).filter(r => r.photo) };
      })(),
      ...(() => {
        const countries = own != null ? [] : app.stats.countries(from, to).map(r => ({ ...r, name: countryName(r.country, request.t) }));
        return { countries, bubbles: countryBubbles(countries) };
      })(),
    });
  });

  // Audience d'une photo (inspecteur de la photothèque) : 30 derniers jours.
  app.get('/admin/photos/:id/statistiques', P('statistiques.voir'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!repo.photo(id)) return reply.code(404).send({ error: request.t('Photo introuvable.') });
    const s = photoStats(id);
    return { total: s.total, rank: s.rank, spark: s.spark, days: s.days.map(d => d.views) };
  });

  // ---------- comptes et rôles, journal ----------
  // Rôles proposés, dans l'ordre.
  const ROLE_ORDER = ['admin', 'photographe', 'moderateur', 'relecteur', 'directeur_publication'];
  const STATUS_FR = { actif: 'actif', en_attente: 'en attente', desactive: 'désactivé' };
  app.get('/admin/comptes', P('comptes.gerer'), async (request, reply) => {
    const accounts = app.accounts.list();
    noterLecture(request, { objet: 'compte', liste: true, objets: accounts.length, categorie: accounts.length ? ['identite', 'coordonnees'] : [] });
    return render(request, reply, 'accounts', {
      title: request.t('Comptes et rôles'), accounts, authors: repo.authors(), me: request.session.sub,
      roles: ROLE_ORDER.map(key => ({ key, label: ROLES[key].label })), guarded: (app.config.adminSubs || []).length > 0,
      mail: { enabled: app.mailer.enabled, from: app.mailer.from, mine: (a => a?.notify_to || a?.email || request.session.email || '')(app.accounts.bySub(request.session.sub)) },
    });
  });
  // Description suggérée d'une photo : la demander (elle passe avant la file de nuit), et son état (suivi sans recharger).
  app.post('/admin/photos/:id/description', W('photos.textes'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!repo.photo(id)) return noPhoto(request, reply);
    if (!app.describer.settings().on) return failed(reply, `/admin/photos/${id}`, request.t('Les descriptions suggérées sont éteintes (page Séries).'));
    // File bornée (MAX_ASKED demandes en attente) : un compte ne peut pas occuper le calcul indéfiniment.
    if (app.describer.request(id) === false) {
      const busy = request.t('Trop de descriptions demandées attendent déjà : réessayez dans quelques minutes.');
      if (!request.headers.accept?.includes('text/html')) return reply.code(429).send({ ok: false, error: busy });
      return failed(reply, `/admin/photos/${id}#description`, busy);
    }
    if (!request.headers.accept?.includes('text/html')) return { ok: true };
    return done(reply, `/admin/photos/${id}#description`, request.t('Description demandée : elle arrive dans une minute environ.'));
  });
  app.get('/admin/photos/:id/description', P('photos.voir'), async request => {
    const id = byId(request.params.id);
    return { ...(app.describer.forPhoto(id, request.t.lang) || { pending: false, text: '' }), use: descriptionUse(id) };
  });

  // Nouveautés : toutes les versions, la plus récente d'abord, et la version installée.
  app.get('/admin/nouveautes', P('admin.acceder'), async (request, reply) => render(request, reply, 'releases', {
    title: request.t('Nouveautés'), releases: RELEASES.map(r => localizeRelease(r, request.t.lang, perm => Boolean(request.can(perm)))).filter(r => r.items.length),
  }));
  // Tester l'envoi d'e-mails : à l'adresse choisie (la sienne par défaut) ; l'erreur du serveur de messagerie sinon.
  app.post('/admin/comptes/test-email', W('comptes.gerer'), async (request, reply) => {
    const to = String(request.body?.adresse || '').trim().slice(0, 200);
    const back = '/admin/comptes#email';
    if (!app.mailer.enabled) return failed(reply, back, request.t('L’envoi d’e-mails n’est pas configuré sur ce serveur (SMTP_URL).'));
    if (!/^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/.test(to)) return failed(reply, back, request.t('Cette adresse e-mail n’est pas valide.'));
    try {
      await app.reminders.test(to, request.t);
    } catch (err) {
      if (!(err instanceof MailError)) throw err;
      return failed(reply, back, request.t.msg(err.message));
    }
    return done(reply, back, request.t('E-mail de test envoyé à {to} : vérifiez la boîte de réception (et les indésirables).', { to }));
  });
  app.post('/admin/comptes/:id', W('comptes.gerer'), async (request, reply) => {
    const body = request.body || {};
    const a = app.accounts.byId(byId(request.params.id));
    if (!a) return reply.callNotFound();
    const roles = [].concat(body.roles || []).filter(r => ROLE_ORDER.includes(r));
    if (a.locked && !roles.includes('admin')) roles.push('admin');        // protégé par ADMIN_SUBS : sa case est grisée, donc absente
    const status = body.status === 'desactive' ? 'desactive' : roles.length ? 'actif' : a.status === 'desactive' ? 'actif' : 'en_attente';
    const authorId = body.author_id === undefined ? undefined : Number(body.author_id) || null;
    try {
      const { before, after } = app.accounts.update(a.id, { roles, authorId, status }, request.session.sub);
      const lbl = list => list.map(r => ROLES[r]?.label || r).join(', ') || '—';
      const changes = [before.roles.join() !== after.roles.join() && `rôles : ${lbl(before.roles)} → ${lbl(after.roles)}`,
        before.status !== after.status && `état : ${STATUS_FR[before.status]} → ${STATUS_FR[after.status]}`,
        before.author_id !== after.author_id && `photographe : ${repo.authors().find(x => x.id === before.author_id)?.name || '—'} → ${repo.authors().find(x => x.id === after.author_id)?.name || '—'}`].filter(Boolean);
      if (changes.length) app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'compte modifié', target: after.name || after.sub, status: 303, detail: changes.join(' ; ') });
      request.audited = true;
      const message = request.t('Compte « {name} » enregistré.', { name: after.name || after.sub });
      // Admin v2 : l'état enregistré, pour la carte du compte et « Défaire » (qui renvoie l'état d'avant par cette route).
      if (asJson(request)) return { ok: true, message, account: { id: after.id, roles: after.roles, status: after.status, author_id: after.author_id ?? null } };
      return done(reply, '/admin/comptes', message);
    } catch (err) {
      if (!(err instanceof AccountError)) throw err;
      if (asJson(request)) return refusedJson(request, reply, request.t.msg(err.message));
      return failed(reply, '/admin/comptes', request.t.msg(err.message));
    }
  });
  app.post('/admin/comptes/:id/supprimer', W('comptes.gerer'), async (request, reply) => {
    try {
      const a = app.accounts.remove(byId(request.params.id), request.session.sub);
      app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'compte supprimé', target: a.name || a.sub, status: 303 });
      request.audited = true;
      return done(reply, '/admin/comptes', request.t('Compte « {name} » supprimé.', { name: a.name || a.sub }));
    } catch (err) {
      if (!(err instanceof AccountError)) throw err;
      return failed(reply, '/admin/comptes', request.t.msg(err.message));
    }
  });
  // Journal : les 300 dernières actions, filtrables par compte et par texte.
  app.get('/admin/journal', P('journal.voir'), async (request, reply) => {
    const sub = String(request.query.compte || '');
    const q = String(request.query.q || '').slice(0, 80);
    // Heure de Paris, comme le reste de l'admin (le conteneur, lui, est en UTC) ; un seul formateur pour les 300 lignes.
    const f = new Intl.DateTimeFormat(request.t.locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
    // Admin v2 (UX-A-19) : les mêmes lignes, filtrées à l'affichage par famille et par période, 50 par page, avec un
    // libellé lisible pour chaque action (server/journal-libelles.js) ; la v1 ignore ces paramètres.
    const type = JOURNAL.FAMILLES.includes(request.query.type) ? request.query.type : '';
    const periode = ownKey(JOURNAL.PERIODES, request.query.periode) ? request.query.periode : '';
    const page = Math.min(6, Math.max(1, Number.parseInt(request.query.page, 10) || 1));
    return render(request, reply, 'journal', {
      title: request.t('Journal'), entries: app.audit.list({ sub, q }), accounts: app.accounts.list(), filter: { sub, q, type, periode, page },
      when: at => f.format(new Date(at)), journal: JOURNAL,
    });
  });

  // ---------- apparence de l'admin (clair / sombre) ----------
  // Langue de l'admin : gardée sur le photographe lié au compte (elle le suit d'un appareil à l'autre), sinon dans un
  // cookie du compte.
  app.post('/admin/langue', W('admin.acceder'), async (request, reply) => {
    const lang = ADMIN_LANGS.includes(request.body?.lang) ? request.body.lang : 'fr';
    const author = repo.authorBySub(request.session.sub);
    if (author) app.db.prepare('UPDATE authors SET admin_lang = ? WHERE id = ?').run(lang, author.id);
    else reply.setCookie(LANG_COOKIE, lang, { path: '/admin', httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 365 * 24 * 3600 });
    return reply.redirect(safeBack(request, '/admin'), 303);
  });

  // Admin v1 ou v2 (menu du compte) : une préférence du compte, comme la langue et le thème, jamais un réglage du site ;
  // le retour en v1 est un clic, au pied du menu de la v2.
  app.post('/admin/version', W('admin.acceder'), async (request, reply) => {
    const v = request.body?.version;
    const back = safeBack(request, '/admin');
    if (!ADMIN_VERSIONS.includes(v) || !adminVersion.set(request.session.sub, v)) return failed(reply, back, request.t('Version de l’admin inconnue : rien n’a changé.'));
    if (!request.headers.accept?.includes('text/html')) return { ok: true, version: v };
    return done(reply, back, v === 'v2' ? request.t('Vous êtes dans l’admin v2. Pour revenir à la v1 : « Revenir à l’admin v1 », au pied du menu.') : request.t('Vous êtes de retour dans l’admin v1. La v2 reste à un clic : « Essayer l’admin v2 », au pied du menu.'));
  });
  // Raccourcis d'une touche de la photothèque v2 (UX-A-02) : les couper, ou les rallumer, depuis « Mon compte ». Une
  // préférence du compte (account_prefs), pas au journal ; « raccourcis » vaut off (champ caché) puis on (case cochée), ou
  // « action » en JSON (l'interrupteur enregistré au geste, admin-v2.js).
  app.post('/admin/compte/raccourcis', W('admin.acceder'), async (request, reply) => {
    const on = switchAction(request.body?.action ?? request.body?.raccourcis) === 'on';
    const back = safeBack(request, '/admin/compte');
    if (!adminVersion.setShortcuts(request.session.sub, on)) return failed(reply, back, request.t('Compte introuvable : rien n’a changé.'));
    if (!request.headers.accept?.includes('text/html')) return { ok: true, raccourcis: on };
    return done(reply, back, on ? request.t('Raccourcis d’une touche allumés.') : request.t('Raccourcis d’une touche coupés : seuls Ctrl K, Ctrl A et Ctrl Z restent.'));
  });
  // Mon compte (v2) : la version de l'admin et les e-mails des avis. En v1, ces réglages sont sur « Aujourd'hui ».
  app.get('/admin/compte', P('admin.acceder'), async (request, reply) => {
    if (!adminVersion.hasV2('compte') || adminVersion.of(request.session.sub) !== 'v2') return reply.redirect('/admin#compte', 303);
    return render(request, reply, 'compte', { title: request.t('Mon compte'), account: app.accounts.bySub(request.session.sub), me: repo.authorBySub(request.session.sub), mailer: app.mailer.enabled,
      roleLabels: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, r.label])) });
  });

  app.post('/admin/theme', W('admin.acceder'), async (request, reply) => {
    const theme = request.body?.theme;
    if (theme === 'dark' || theme === 'light') reply.setCookie(THEME_COOKIE, theme, { path: '/admin', httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 365 * 24 * 3600 });
    else reply.clearCookie(THEME_COOKIE, { path: '/admin' });
    if (!request.headers.accept?.includes('text/html')) return { ok: true, theme: theme === 'dark' || theme === 'light' ? theme : '' };
    return reply.redirect(safeBack(request, '/admin'), 303);
  });

  // ---------- palette de commandes (⌘K) : photos et séries ----------
  app.get('/admin/recherche.json', P('admin.acceder'), async (request, reply) => {
    reply.header('cache-control', 'no-store');
    return {
      photos: request.mine('photos.voir', repo.photos()).map(p => ({ id: p.id, title: p.title, category: p.category, place: p.place, status: p.status, thumb: rendered(p) ? thumb(p) : null })),
      series: navSeries(request).map(c => ({ id: c.id, name: c.name, slug: c.slug, count: c.count })),       // comptes selon la portée
    };
  });

  // ---------- compléter un lot ----------
  const lotAll = raw => [...new Set(String([].concat(raw || []).join(',')).split(',').filter(Boolean).map(Number))].filter(Number.isInteger);
  const lotIds = raw => lotAll(raw).slice(0, 200);
  // Date lue (« mercredi 14 octobre 2026 », « octobre 2026 ») : ce que le serveur a compris de la saisie (lot de la v2).
  const readDate = (taken, lang) => {
    const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(taken || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1, 12));
    const loc = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[lang] || 'fr-FR';
    const o = m[3] ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : m[2] ? { month: 'long', year: 'numeric' } : { year: 'numeric' };
    return new Intl.DateTimeFormat(loc, { ...o, timeZone: 'UTC' }).format(d);
  };
  // Qui valide les propositions (MQ-08 : « Proposer les 3 photos à Julien ? ») : les comptes actifs qui publient toutes
  // les photos, sauf celui de la session ; plus de deux, ou aucun : « la modération ».
  const moderators = request => app.accounts.list().filter(a => a.status === 'actif' && a.sub !== request.session.sub && grantsOf(a.roles, a.adjust).get('photos.publier') === 'tout')
    .map(a => String(a.name || '').replace(/\s*\(test\)$/, '').split(' ')[0]).filter(Boolean);
  // Ce qui reste à faire sur une photo du lot (filtre « À corriger », dialogues de proposition et de publication) :
  // titre provisoire, sans date ; accord à vérifier ou refusé (état pour le site, server/readiness.js).
  const lotIssues = (request, p, people) => {
    const site = app.readiness.state(p, people, request.t).site;
    return { provisional: Boolean(p.provisional), noDate: !p.taken_on, verify: site.level === 'warn' && !app.readiness.confirmed(p.id, 'site'), blocked: site.level === 'no', reasons: site.reasons || [] };
  };
  const lotPage = (request, reply, ids, extra = {}) => {
    const byIdMap = new Map(repo.photos().map(p => [p.id, withReady(p)]));
    const all = ids.map(id => byIdMap.get(id)).filter(Boolean);
    const people = new Map();
    const sugg = app.seriesSuggest.forPhotos(all), names = catNames();
    const enrich = all.map(p => ({ ...p, issues: lotIssues(request, p, people), suggest: suggestOf(sugg.get(p.id), names), read: readDate(p.taken_on, request.t.lang),
      time: p.taken_time ? hourOf(p.taken_time, request.t.lang) : '' }));
    // Filtres du lot (MQ-08, repère 7) : « À corriger » (titre provisoire, sans date), « Accord à vérifier ».
    const voir = ['a-corriger', 'accord'].includes(request.query?.voir) ? request.query.voir : '';
    const fix = p => p.issues.provisional || p.issues.noDate;
    const agree = p => p.issues.verify || p.issues.blocked;
    const shown = voir === 'a-corriger' ? enrich.filter(fix) : voir === 'accord' ? enrich.filter(agree) : enrich;
    return render(request, reply, 'batch', {
      title: request.scope('photos.publier')?.all ? request.t('Compléter et publier') : request.t('Compléter et proposer'), photos: shown, all: enrich, ids: all.map(p => p.id), categories: repo.categories(), authors: request.mine('photos.modifier', repo.authors(), 'id'), altMax: LIMITS.alt_text,
      voir, counts: { fix: enrich.filter(fix).length, agree: enrich.filter(agree).length }, moderators: moderators(request), canPublishAll: Boolean(request.scope('photos.publier')?.all),
      errors: {}, values: {}, ...extra,
    });
  };
  app.get('/admin/photos/lot', P('photos.textes'), async (request, reply) => {
    const visible = new Set(request.mine('photos.voir', repo.photos()).map(p => p.id));
    // 200 photos par page ; au-delà (grosse carte mémoire), la page le dit et mène aux suivantes.
    const all = lotAll(request.query.ids).filter(id => visible.has(id));
    const ids = all.slice(0, 200);
    if (!ids.length) return reply.redirect('/admin/photos?statut=draft', 303);
    return lotPage(request, reply, ids, { rest: all.slice(200), total: all.length });
  });

  // Sans JavaScript : tout le tableau est envoyé d'un coup (champs titre_<id>, serie_<id>…). Le texte de remplacement
  // (alt_text_<id>, en français) est un texte comme le titre : photos.textes suffit. Admin v2 (MQ-08) : les titres anglais
  // et allemand (title_en_<id>, title_de_<id>), la suggestion de série acceptée (accept_suggestion_<id>), et deux suites :
  // « proposer=1 » (proposer le lot au modérateur) et « publish=1 » (publier) ; ce qui empêche ou mérite d'être revu
  // (titre provisoire, date refusée, accord à vérifier) est d'abord montré dans un dialogue, sauf « forcer=1 ».
  app.post('/admin/photos/lot', W('photos.textes'), async (request, reply) => {
    const body = request.body || {};
    const ids = repo.existingIds(lotIds(body.ids)).filter(id => request.owns('photos.textes', repo.photo(id)?.author_id) && editable(request, repo.photo(id)));
    if (body.publish === '1' && ids.some(id => !request.owns('photos.publier', repo.photo(id).author_id))) return app.forbid(request, reply);
    if (body.proposer === '1' && ids.some(id => !request.owns('photos.proposer', repo.photo(id).author_id))) return app.forbid(request, reply);
    // « Proposer sans corriger » : les corrections du dialogue ne sont pas reprises.
    if (body.sans_corriger === '1') for (const k of Object.keys(body)) if (/^(title|taken_on)_\d+$/.test(k)) delete body[k];
    const accepted = id => { const c = Number(body[`accept_suggestion_${id}`]); return c && repo.categories().some(x => x.id === c) ? c : undefined; };
    if (ids.some(id => !request.owns('photos.modifier', repo.photo(id).author_id) && touchesMore(repo.photo(id), { category_id: accepted(id) ?? body[`category_id_${id}`], taken_on: body[`taken_on_${id}`] }))) return app.forbid(request, reply);
    const errors = {};
    const values = {};
    for (const id of ids) {
      const fields = { title: body[`title_${id}`], title_en: body[`title_en_${id}`], title_de: body[`title_de_${id}`], alt_text: body[`alt_text_${id}`], category_id: accepted(id) ?? body[`category_id_${id}`], place: body[`place_${id}`], taken_on: body[`taken_on_${id}`] };
      for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
      if (!Object.keys(fields).length) continue;
      try {
        const before = snapshot(id);
        repo.patchPhoto(id, fields);
        editedIfChanged(request, before);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        errors[id] = err.errors;
        values[id] = fields;
      }
    }
    app.variants.schedule();
    const t = request.t;
    // Proposer ou publier : ce qui reste à revoir est montré d'abord (dialogue), sauf si la personne a déjà choisi d'y aller.
    const next = body.proposer === '1' ? 'proposer' : body.publish === '1' ? 'publier' : null;
    // La v1 garde sa règle : une erreur arrête tout ; publier part sans dialogue.
    const v2 = adminVersion.of(request.session.sub) === 'v2';
    if (!v2 && Object.keys(errors).length) return lotPage(request, reply.code(422), ids, { errors, values });
    // Le dialogue envoie forcer=1 : ses corrections sont appliquées, puis la suite part ; une correction refusée le rouvre.
    if (v2 && next && (body.forcer !== '1' || Object.keys(errors).length)) {
      const people = new Map();
      const review = ids.map(id => ({ p: repo.photoView(id), e: errors[id] })).filter(x => x.p).map(x => ({ id: x.p.id, title: x.p.title, file: x.p.source_name || '', issues: lotIssues(request, x.p, people), errors: x.e || null, values: values[x.p.id] || {},
        ready: rendered(x.p), thumb: rendered(x.p) ? thumb(x.p) : null, confirmed: body[`confirmer_${x.p.id}`] === '1' }))
        .filter(x => x.issues.provisional || x.errors || (x.issues.verify && !x.confirmed) || x.issues.blocked);
      if (review.length) return lotPage(request, reply.code(Object.keys(errors).length ? 422 : 200), ids, { errors, values, dialog: { kind: next, review, message: String(body.message || '').slice(0, 1000) } });
    } else if (Object.keys(errors).length && (!next || body.forcer !== '1')) return lotPage(request, reply.code(422), ids, { errors, values });
    const to = `/admin/photos/lot?ids=${ids.join(',')}`;
    if (next === 'proposer') {
      // Les photos dont l'accord est à vérifier ne partent qu'avec la confirmation du photographe (case par photo).
      const sure = ids.filter(id => body[`confirmer_${id}`] === '1');
      const r1 = sure.length ? await app.review.propose(sure, by(request), { message: body.message, confirm: true }) : { proposed: [], verify: [], blocked: [], skipped: [] };
      const r2 = await app.review.propose(ids.filter(id => !sure.includes(id)), by(request), { message: body.message });
      const r = { proposed: [...r1.proposed, ...r2.proposed], verify: [...r1.verify, ...r2.verify], blocked: [...r1.blocked, ...r2.blocked], skipped: [...r1.skipped, ...r2.skipped] };
      JOURNAL.noterLot(request, 'proposees', r.proposed.length);
      return (r.proposed.length ? done : failed)(reply, r.proposed.length ? '/admin/photos?manque=proposees' : to, proposedText(t, r));
    }
    if (next === 'publier') {
      const g = app.readiness.gate(ids.filter(id => repo.photo(id)?.status !== 'published'));
      const before = repo.setStatuses(Object.fromEntries(g.ok.map(id => [id, 'published'])));
      queued(before);
      const held = g.verify.length + g.blocked.length;
      JOURNAL.noterLot(request, 'publiees', g.ok.length);
      const published = g.ok.length > 1 ? t('{n} photos publiées.', { n: g.ok.length }) : t('{n} photo publiée.', { n: g.ok.length });
      const parts = [g.verify.length && t('{n} à vérifier (confirmez dans leur fiche)', { n: g.verify.length }),
        g.blocked.length && (g.blocked.length > 1 ? t('{n} bloquées par un refus', { n: g.blocked.length }) : t('{n} bloquée par un refus', { n: g.blocked.length }))].filter(Boolean);
      const rest = held ? ` ${held > 1 ? t('{n} restent en brouillon :', { n: held }) : t('{n} reste en brouillon :', { n: held })} ${parts.join(', ')}.` : '';
      return done(reply, '/admin/photos', `${published}${rest}`);
    }
    return done(reply, to, t('Modifications enregistrées.'));
  });

  // Un champ à la fois (enregistrement à la sortie du champ). Réponse : valeurs telles qu'enregistrées.
  app.post('/admin/photos/:id/champs', W('photos.textes'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!editable(request, repo.photo(id))) return app.forbid(request, reply);
    if (touchesMore(repo.photo(id), request.body || {}) && !request.owns('photos.modifier', repo.photo(id)?.author_id)) return app.forbid(request, reply);
    if (request.body?.author_id !== undefined && !request.owns('photos.modifier', Number(request.body.author_id))) return app.forbid(request, reply);
    try {
      const before = snapshot(id);
      const p = repo.patchPhoto(id, request.body || {});
      if (!p) return reply.code(404).send({ error: request.t('Photo introuvable.') });
      editedIfChanged(request, before);
      app.variants.schedule();
      const shown = repo.photoView(id);
      return { ok: true, photo: { title: p.title, slug: p.slug, category_id: p.category_id, author_id: p.author_id, place: p.place, legend: p.legend, alt_text: p.alt_text, taken_on: p.taken_on, when: shown?.when || '', read: readDate(p.taken_on, request.t.lang), provisional: shown?.provisional || false,
        city_id: p.city_id ?? null, city: cities.labelOf(p, request.t.lang), city_source: p.city_source ?? null, on_map: Boolean(p.on_map) } };
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return reply.code(422).send({ errors: translateDeep(request.t, err.errors) });
    }
  });

  // Villes proposées au fil de la frappe (fiche, photothèque) : liste embarquée, aucun service extérieur.
  app.get('/admin/villes', P('admin.acceder'), async request => ({ villes: cities.search(String(request.query.q || '').slice(0, 60), 8, request.t.lang).map(c => ({ id: c.id, label: c.label })) }));

  // ---------- actions sur plusieurs photos ----------
  // JSON (barre de sélection) ou formulaire classique. Les réponses JSON portent de quoi annuler.
  app.post('/admin/photos/actions', W('photos.voir'), async (request, reply) => {
    const body = request.body || {};
    const json = !request.headers.accept?.includes('text/html');
    const back = safeBack(request, '/admin/photos');
    // Chaque action a sa permission (publier ou dépublier, supprimer, proposer, sinon modifier) ; seules les photos
    // que cette permission couvre sont touchées (portée « les miennes »), et pour modifier, seulement les photos
    // modifiables (une photo publiée demande « modifier ses photos publiées »).
    const NEED = { publish: 'photos.publier', draft: 'photos.publier', statuses: 'photos.publier', delete: 'photos.supprimer', propose: 'photos.proposer' };
    const need = ownKey(NEED, body.action) ? NEED[body.action] : null;
    const actPerm = need || 'photos.modifier';
    // Le droit de l'action d'abord, puis une liste bornée : rien n'est lu en base pour une demande refusée.
    if (!request.can(actPerm)) return app.forbid(request, reply);
    const t = request.t;
    const ko = (code, text) => (json ? reply.code(code).send({ error: text }) : failed(reply, back, text));
    if ([].concat(body.ids || []).length > MAX_BULK) app.securite.emit('input_validation_fail', { request, composant: 'site · admin', emetteur: 'server/routes/admin.js · actions groupées', detail: { raison: 'liste trop longue', nombre: [].concat(body.ids || []).length } });
    if ([].concat(body.ids || []).length > MAX_BULK) return ko(413, t('Trop de photos à la fois : {n} au plus.', { n: MAX_BULK }));
    const touchable = id => { const p = repo.photo(Number(id)); return Boolean(p) && request.owns(actPerm, p.author_id) && (Boolean(need) || editable(request, p)); };
    const ids = repo.existingIds(body.ids).filter(touchable);
    const n = ids.length;
    const photosWord = n > 1 ? t('{n} photos', { n }) : t('{n} photo', { n });
    const ok = (text, extra = {}) => (json ? reply.send({ ok: true, count: n, text, ...extra }) : done(reply, back, text));
    const each = value => Object.fromEntries(ids.map(id => [id, value]));
    // Annulations : l'état précédent renvoyé par le navigateur, réduit aux photos que l'action peut toucher.
    const map = raw => { let m; try { m = typeof raw === 'string' ? JSON.parse(raw) : raw || {}; } catch { m = {}; } return Object.fromEntries(Object.entries(m && typeof m === 'object' ? m : {}).slice(0, MAX_BULK).filter(([id]) => touchable(id))); };
    if (body.action === 'propose') {
      const r = await app.review.propose(ids, by(request), { message: body.message });
      JOURNAL.noterLot(request, 'proposees', r.proposed.length);
      return ok(proposedText(request.t, r));
    }

    try {
      switch (body.action) {
        case 'publish':
        case 'draft': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // Publier : seulement les photos prêtes ; à vérifier → leur fiche (confirmation) ; bloquées → refus.
          // Seulement les brouillons : une photo déjà en ligne n'est ni republiée ni annoncée « restée en brouillon ».
          const online = body.action === 'publish' ? ids.filter(id => repo.photo(id)?.status === 'published') : [];
          const g = body.action === 'publish' ? app.readiness.gate(ids.filter(id => !online.includes(id))) : { ok: ids, verify: [], blocked: [] };
          const refusedOnline = online.filter(id => repo.refusalOf(id));
          const refused = g.blocked.map(b => b.id);
          const before = repo.setStatuses(body.action === 'publish' ? Object.fromEntries(g.ok.map(id => [id, 'published'])) : each('draft'));
          queued(before);
          if (refused.length + refusedOnline.length === n) {
            return ko(422, n > 1
              ? (refusedOnline.length ? t('Ces photos ne peuvent pas être publiées : la personne photographiée refuse la publication (voir Personnes) ; déjà en ligne : appliquez le refus.') : t('Ces photos ne peuvent pas être publiées : la personne photographiée refuse la publication (voir Personnes).'))
              : (refusedOnline.length ? t('Cette photo ne peut pas être publiée : la personne photographiée refuse la publication (voir Personnes) ; déjà en ligne : appliquez le refus.') : t('Cette photo ne peut pas être publiée : la personne photographiée refuse la publication (voir Personnes).')));
          }
          if (g.verify.length && !g.ok.length && !refused.length) {
            // Raisons dans la langue de l'admin (gate les garde en français, telles qu'elles sont confirmées).
            const reason = `${app.readiness.state(g.verify[0].id, null, t).site.reasons[0]}${g.verify.length > 1 ? '…' : ''}`;
            return ko(422, n > 1 ? t('Ces photos sont à vérifier ({reason}) : confirmez dans leur fiche pour publier.', { reason }) : t('Cette photo est à vérifier ({reason}) : confirmez dans sa fiche pour publier.', { reason }));
          }
          // Publication en un clic : un titre provisoire (nom du fichier) est rappelé dans le message.
          const prov = body.action === 'publish' ? ids.filter(id => repo.photoView(id)?.provisional).length : 0;
          const note = !prov ? ''
            : ` ${prov === n ? (n > 1 ? t('Elles gardent le nom du fichier comme titre : corrigez-le dans la photothèque.') : t('Elle garde le nom du fichier comme titre : corrigez-le dans la photothèque.'))
              : prov > 1 ? t('{n} gardent le nom du fichier comme titre : corrigez-le dans la photothèque.', { n: prov }) : t('{n} garde le nom du fichier comme titre : corrigez-le dans la photothèque.', { n: prov })}`;
          const r = refused.length, v = g.verify.length;
          const blocked = (r ? ` ${r > 1 ? t('{n} photos restent en brouillon : la personne photographiée refuse la publication (voir Personnes).', { n: r }) : t('{n} photo reste en brouillon : la personne photographiée refuse la publication (voir Personnes).', { n: r })}` : '')
            + (v ? ` ${v > 1 ? t('{n} photos à vérifier restent en brouillon : confirmez dans leur fiche.', { n: v }) : t('{n} photo à vérifier reste en brouillon : confirmez dans sa fiche.', { n: v })}` : '');
          const m = n - refused.length - g.verify.length - refusedOnline.length;
          JOURNAL.noterLot(request, body.action === 'publish' ? 'publiees' : 'repassees', m);
          const main = body.action === 'publish'
            ? (m > 1 ? t('{n} photos publiées.', { n: m }) : t('{n} photo publiée.', { n: m }))
            : (m > 1 ? t('{n} photos repassées en brouillon.', { n: m }) : t('{n} photo repassée en brouillon.', { n: m }));
          return ok(`${main}${note}${blocked}`, { undo: { action: 'statuses', map: before } });
        }
        case 'map_on':
        case 'map_off': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // Sur la carte : seulement les photos qui ont une ville ; les autres sont signalées.
          const before = repo.setOnMap(ids, body.action === 'map_on');
          edited(request, Object.keys(before));                          // seulement les photos dont la carte a changé
          const changed = Object.keys(before).length;
          JOURNAL.noterLot(request, body.action === 'map_on' ? 'carte_ajoutees' : 'carte_retirees', changed);
          const skipped = body.action === 'map_on' ? n - repo.withCity(ids).length : 0;
          const word = c => (c > 1 ? t('{n} photos', { n: c }) : t('{n} photo', { n: c }));
          const text = body.action === 'map_on'
            ? `${t('{photos} sur la carte.', { photos: word(changed) })}${skipped ? ` ${t('{photos} sans ville : choisissez sa ville dans la fiche.', { photos: word(skipped) })}` : ''}`
            : changed > 1 ? t('{n} photos retirées de la carte.', { n: changed }) : t('{n} photo retirée de la carte.', { n: changed });
          return ok(text, { undo: { action: 'map_restore', map: before } });
        }
        // Lot de la v2 (MQ-08, repère 6) : la barre « Pour les photos cochées » applique d'un coup la série, le lieu, la
        // date et la ville de la carte choisis (un champ vide : celui de chaque photo) ; « Défaire » rend à chaque photo
        // ce qu'elle avait. Sans script, le même envoi (formulaire) revient au lot avec son message.
        case 'appliquer': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          if (body.category_id === 'new' && !request.can('series.gerer')) return app.forbid(request, reply);
          const selected = body.category_id && body.category_id !== 'new' ? repo.categories().find(c => c.id === Number(body.category_id)) : null;
          if (body.category_id && body.category_id !== 'new' && !selected) return ko(422, t('Choisissez une série.'));
          const city = String(body.city_label || '').trim();
          if (!body.category_id && !String(body.place || '').trim() && !String(body.taken_on || '').trim() && !city) return ko(422, t('Rien à appliquer : choisissez une série, un lieu, une date ou une ville.'));
          // La création de série, la ville, les champs et le retour en proposition forment un seul geste : une saisie
          // invalide ne doit laisser ni contenu modifié ni programmation encore active.
          const { target, undo } = app.db.transaction(() => {
            const targetId = body.category_id === 'new' ? repo.saveCategory(null, { name: body.new_category }) : selected?.id ?? null;
            const target = targetId ? repo.categories().find(c => c.id === targetId) : null;
            const snap = snapshot(ids);
            const undo = { action: 'restaurer', map: Object.fromEntries(ids.map(id => { const p = repo.photo(id); return [id, { category_id: p.category_id, place: p.place, taken_on: p.taken_on, city_label: cities.labelOf(p, 'fr'), city_id: p.city_id ?? null, on_map: p.on_map }]; })) };
            if (city) for (const id of ids) repo.patchPhoto(id, { city_label: city, city_id: body.city_id, on_map: repo.photo(id).on_map ? 'on' : '' });
            if (String(body.place || '').trim() || String(body.taken_on || '').trim()) repo.setFields(ids, body);
            if (target) repo.setCategories(each(target.id));
            editedIfChanged(request, snap);
            return { target, undo };
          })();
          app.variants.schedule();
          const what = [target && t('série « {name} »', { name: target.name }), String(body.place || '').trim() && t('lieu'), String(body.taken_on || '').trim() && t('date'), city && t('ville de la carte')].filter(Boolean).join(', ');
          const photos = ids.map(id => { const p = repo.photoView(id); return { id, category_id: p.category_id, place: p.place, taken_on: p.taken_on, when: readDate(p.taken_on, t.lang), city: cities.labelOf(p, t.lang) }; });
          return ok(t('{what} : appliqué à {photos}.', { what: what.charAt(0).toUpperCase() + what.slice(1), photos: photosWord }), { undo, photos });
        }
        case 'restaurer': {
          const m = map(body.map), snap = snapshot(Object.keys(m));
          for (const [id, v] of Object.entries(m)) {
            if (!v || typeof v !== 'object') continue;
            repo.restoreFields({ [id]: { place: v.place, taken_on: v.taken_on } });
            if (repo.categories().some(c => c.id === Number(v.category_id))) repo.setCategories({ [id]: Number(v.category_id) });
            try { repo.patchPhoto(Number(id), { city_label: String(v.city_label || ''), city_id: v.city_id, on_map: v.on_map ? 'on' : '' }); } catch (err) { if (!(err instanceof ValidationError)) throw err; }
          }
          editedIfChanged(request, snap);
          app.variants.schedule();
          return ok(t('Modification défaite.'));
        }
        case 'map_restore': {
          const m = map(body.map), snap = snapshot(Object.keys(m));
          repo.restoreOnMap(m);
          editedIfChanged(request, snap);
          return ok(t('Carte rétablie.'));
        }
        case 'category': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // « Nouvelle série… » : créée à la volée.
          if (body.category_id === 'new' && !request.can('series.gerer')) return app.forbid(request, reply);      // créer une série : son droit à part
          const targetId = body.category_id === 'new' ? repo.saveCategory(null, { name: body.new_category }) : Number(body.category_id);
          const target = repo.categories().find(c => c.id === targetId);
          if (!target) return ko(422, t('Choisissez une série.'));
          const snap = snapshot(ids);
          const before = repo.setCategories(each(target.id));
          editedIfChanged(request, snap);
          app.variants.schedule();
          return ok(n > 1 ? t('{n} photos déplacées vers « {name} ».', { n, name: target.name }) : t('{n} photo déplacée vers « {name} ».', { n, name: target.name }), { undo: { action: 'categories', map: before }, category: { id: target.id, name: target.name } });
        }
        case 'fields': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          const snap = snapshot(ids);
          const { before, ...v } = repo.setFields(ids, body);
          editedIfChanged(request, snap);
          app.variants.schedule();
          const p = { place: v.place, photos: photosWord };
          const text = v.place && v.taken_on ? t('Lieu « {place} » et date appliqués à {photos}.', p) : v.place ? t('Lieu « {place} » appliqué à {photos}.', p)
            : v.taken_on ? t('Date appliquée à {photos}.', p) : t('Rien à changer pour {photos}.', p);
          return ok(text, { values: v, undo: { action: 'restore-fields', map: before } });
        }
        case 'restore-fields': {
          const m = map(body.map), snap = snapshot(Object.keys(m));
          repo.restoreFields(m);
          editedIfChanged(request, snap);
          app.variants.schedule();
          return json ? reply.send({ ok: true, text: t('Modification annulée.') }) : done(reply, back, t('Modification annulée.'));
        }
        // Annulations (JSON) : état précédent renvoyé par l'action annulée.
        case 'statuses': {
          // Republier passe par le même contrôle que publier (à vérifier : seulement si une confirmation couvre ses raisons).
          const m = Object.fromEntries(Object.entries(map(body.map)).filter(([id]) => repo.photo(Number(id))));
          const back2 = Object.entries(m).filter(([id, st]) => st === 'published' && repo.photo(Number(id)).status !== 'published').map(([id]) => Number(id));
          const allowed = new Set(app.readiness.gate(back2).ok);
          const undone = repo.setStatuses(Object.fromEntries(Object.entries(m).filter(([id, st]) => st !== 'published' || !back2.includes(Number(id)) || allowed.has(Number(id)))));
          queued(undone);                 // annuler « publier » retire aussi de la file Instagram
          return json ? reply.send({ ok: true, text: t('Action annulée.') }) : done(reply, back, t('Action annulée.'));
        }
        case 'categories': {
          const m = Object.fromEntries(Object.entries(map(body.map)).filter(([id]) => repo.photo(Number(id)))), snap = snapshot(Object.keys(m));
          repo.setCategories(m);
          editedIfChanged(request, snap);
          app.variants.schedule();
          return json ? reply.send({ ok: true, text: t('Déplacement annulé.') }) : done(reply, back, t('Déplacement annulé.'));
        }
        case 'delete': {
          if (!n) return ko(422, t('Aucune photo sélectionnée.'));
          // Sans confirmation explicite, rien n'est supprimé : page de confirmation (ou refus en JSON).
          if (body.confirm !== '1' && body.confirm !== true) {
            if (json) return ko(422, t('Confirmation requise.'));
            return render(request, reply, 'confirm-delete', { title: t('Supprimer des photos'), photos: ids.map(id => repo.photo(id)), back });
          }
          for (const id of ids) {
            const file = repo.deletePhoto(id);
            if (file) removePhotoFiles(storageDir, file);
          }
          JOURNAL.noterLot(request, 'supprimees', n);
          return ok(n > 1 ? t('{n} photos supprimées.', { n }) : t('{n} photo supprimée.', { n }));
        }
        default:
          return ko(400, t('Action inconnue.'));
      }
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return ko(422, Object.values(err.errors).map(e => t.msg(e)).join(' '));
    }
  });

  // Réordonnancement par glisser-déposer (fetch JSON, en-tête x-csrf-token).
  app.post('/admin/photos/order', W('photos.modifier'), async (request, reply) => {
    if (!request.scope('photos.modifier')?.all) return app.forbid(request, reply);      // l'ordre de la galerie touche toutes les photos
    try {
      repo.orderPhotos(Array.isArray(request.body?.ids) ? request.body.ids : []);
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(422).send({ error: request.t(err.errors.order) });
      throw err;
    }
    return { ok: true };
  });

  app.get('/admin/photos/:id', P('photos.voir'), async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    return render(request, reply, 'photo', {
      title: photo.title, photo, values: { ...photo, city_label: cities.labelOf(photo, request.t.lang) }, errors: {}, categories: repo.categories(), authors: request.mine('photos.modifier', repo.authors(), 'id'),
      ...photoExtras(photo, request.t, request),
    });
  });

  app.post('/admin/photos/:id', W('photos.modifier'), async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const body = request.body || {};
    if ((body.status === 'published' ? 'published' : 'draft') !== photo.status && !request.owns('photos.publier', photo.author_id)) return app.forbid(request, reply);
    if (!request.owns('photos.modifier', Number(body.author_id))) return app.forbid(request, reply);          // pas à un autre photographe
    if (!editable(request, photo)) return app.forbid(request, reply);
    try {
      // Publier une photo à vérifier : confirmation explicite exigée, puis gardée (le blocage, lui, est refusé plus bas).
      const publishing = body.status === 'published' && photo.status !== 'published';
      const site = app.readiness.state(photo.id, null, request.t).site;      // reasons : affichées ; stored : gardées (français)
      const covered = app.readiness.confirmed(photo.id, 'site');
      if (publishing && site.level === 'warn' && !covered && body.confirmer !== '1') {
        const err = new ValidationError({ status: request.t('Photo à vérifier ({reasons}) : cochez la confirmation pour la publier.', { reasons: site.reasons.join(' ; ') }) });
        err.values = body;
        throw err;
      }
      const before = snapshot(photo.id);
      repo.updatePhoto(photo.id, body);
      editedIfChanged(request, before);
      if (body.serie_choisie === '1') repo.keepSeries(photo.id);          // série proposée : choix fait sur la fiche
      // Confirmation cochée (brouillon publié, ou photo déjà en ligne à vérifier) : gardée avec ses raisons.
      if (site.level === 'warn' && !covered && body.confirmer === '1' && body.status === 'published') app.readiness.confirm(photo.id, 'site', request.session.name, site.stored);
      app.variants.schedule();          // auteur, date, titre ou option de filigrane ont pu changer
      queued({ [photo.id]: photo.status });
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      reply.code(422);
      return render(request, reply, 'photo', {
        title: photo.title, photo, values: { ...photo, ...err.values }, errors: err.errors, categories: repo.categories(), authors: request.mine('photos.modifier', repo.authors(), 'id'),
        ...photoExtras(photo, request.t, request),
      });
    }
    return done(reply, `/admin/photos/${photo.id}`, request.t('Photo enregistrée.'));
  });

  // ---------- preuve d'antériorité ----------
  const ext = file => path.extname(file).slice(1);
  const attachment = (reply, name) => reply.header('cache-control', 'no-store').header('content-disposition', `attachment; filename="${name}"`);

  app.get('/admin/photos/:id/original', { config: { perm: 'photos.original', audit: true } }, async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    return attachment(reply, `${photo.slug}.${ext(photo.file)}`).sendFile(photo.file, path.join(storageDir, 'originals'), { cacheControl: false });
  });

  app.get('/admin/photos/:id/preuve.tsr', P('photos.voir'), async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    const t = photo && app.proofs.get(photo.id);
    if (!t || t.status !== 'ok' || t.sha256 !== photo.sha256) return reply.callNotFound();   // jeton d'un autre original
    return attachment(reply, `${photo.slug}.tsr`).type('application/timestamp-reply').send(t.token);
  });

  app.get('/admin/photos/:id/preuve.txt', P('photos.voir'), async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    const t = photo && app.proofs.get(photo.id);
    if (!t || t.status !== 'ok' || t.sha256 !== photo.sha256) return reply.callNotFound();   // jeton d'un autre original
    const name = `${photo.slug}.${ext(photo.file)}`;
    const ca = app.config.tsa.caFile ? 'autorite-horodatage.pem' : '<certificat racine de l’autorité>';
    const text = [
      `Preuve d'antériorité — « ${photo.title} » (${photo.author})`,
      '',
      `Fichier original      : ${name}`,
      `Empreinte SHA-256     : ${photo.sha256}`,
      `Date certifiée (UTC)  : ${t.gen_time}`,
      `Autorité (TSA)        : ${t.signer}`,
      `Service               : ${t.tsa}`,
      `Numéro de série       : ${t.serial}`,
      '',
      'Le jeton d’horodatage RFC 3161 (fichier .tsr) atteste que le fichier ayant cette empreinte',
      'existait à la date certifiée. Il se vérifie sans le site, avec OpenSSL :',
      '',
      `  sha256sum ${name}`,
      `  openssl ts -reply -in ${photo.slug}.tsr -text`,
      `  openssl ts -verify -in ${photo.slug}.tsr -data ${name} -CAfile ${ca}`,
      '',
      'Conservez ensemble : l’original, le fichier .tsr, cette fiche et le certificat de l’autorité.',
      '',
    ].join('\n');
    return attachment(reply, `${photo.slug}-preuve.txt`).type('text/plain; charset=utf-8').send(text);
  });

  app.get('/admin/preuves/autorite.pem', P('photos.voir'), async (request, reply) => {
    if (!app.config.tsa.caFile) return reply.callNotFound();
    return attachment(reply, 'autorite-horodatage.pem').type('application/x-pem-file').send(fs.readFileSync(app.config.tsa.caFile));
  });

  app.post('/admin/photos/:id/verifier', W('photos.modifier'), async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const r = await app.proofs.verify(photo.id);
    const to = `/admin/photos/${photo.id}#preuve`;
    if (!r.ok) return failed(reply, to, request.t('Preuve non valide : {reason}.', { reason: request.t.msg(r.reason) }));
    const iso = r.genTime.toISOString();
    const when = request.t('{date} à {time}', { date: iso.slice(0, 10), time: iso.slice(11, 19) });
    if (!r.chained) return failed(reply, to, request.t('Signature valide (original intact, horodaté le {when} UTC), mais autorité non vérifiée : aucun certificat racine configuré (TSA_CA_FILE).', { when }));
    return done(reply, to, request.t('Preuve valide : original intact, horodaté le {when} UTC, signature vérifiée jusqu’à l’autorité racine.', { when }));
  });

  // Relance forcée (sans l'attente progressive entre deux essais, et pour toutes les photos en erreur) : une fois toutes
  // les 5 minutes au plus, quel que soit le compte, pour ne pas marteler l'autorité d'horodatage.
  const PROOF_RETRY_GAP = 5 * 60 * 1000;
  let proofRetryAt = 0;
  app.post('/admin/preuves/reessayer', W('photos.modifier'), async (request, reply) => {
    const back = safeBack(request, '/admin');
    if (Date.now() - proofRetryAt < PROOF_RETRY_GAP) return failed(reply, back, request.t('Horodatage déjà relancé il y a moins de 5 minutes : réessayez un peu plus tard.'));
    proofRetryAt = Date.now();
    app.proofs.schedule({ retryNow: true });
    return done(reply, back, request.t('Horodatage relancé : les preuves en attente sont redemandées en arrière-plan.'));
  });

  // Textes seuls (titre, légende, lieu et leurs traductions) : la fiche d'un modérateur ou d'un relecteur.
  app.post('/admin/photos/:id/textes', W('photos.textes'), async (request, reply) => {
    const id = byId(request.params.id);
    const body = request.body || {};
    if (!editable(request, repo.photo(id))) return app.forbid(request, reply);
    const fields = Object.fromEntries([...TEXT_FIELDS].filter(k => k in body).map(k => [k, body[k]]));
    try {
      const before = snapshot(id);
      repo.patchPhoto(id, fields);
      editedIfChanged(request, before);
      app.variants.schedule();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return failed(reply, `/admin/photos/${id}`, Object.values(err.errors).map(m => request.t.msg(m)).join(' '));
    }
    return done(reply, `/admin/photos/${id}`, request.t('Photo enregistrée.'));
  });
  // Remarque adressée au photographe de la photo : elle remonte dans son « Aujourd'hui ».
  app.post('/admin/photos/:id/remarques', W('taches.adresser'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!repo.photo(id)) return noPhoto(request, reply);
    try {
      app.notes.add(id, request.body?.message, { sub: request.session.sub, name: request.session.name });
    } catch (err) {
      if (!(err instanceof NoteError)) throw err;
      return failed(reply, `/admin/photos/${id}#remarques`, request.t.msg(err.message));
    }
    return done(reply, `/admin/photos/${id}#remarques`, request.t('Remarque envoyée au photographe.'));
  });
  // Marquer une remarque faite : le photographe de la photo, ou qui peut en adresser.
  app.post('/admin/remarques/:id/fait', W('photos.voir'), async (request, reply) => {
    const n = app.notes.get(byId(request.params.id));
    if (!n || !(request.owns('photos.voir', n.author_id))) return reply.callNotFound();
    if (!request.can('taches.adresser') && app.accounts.authorIdOf(request.session.sub) !== n.author_id) return app.forbid(request, reply);
    app.notes.done(n.id, request.session.name);
    return done(reply, safeBack(request, `/admin/photos/${n.photo_id}#remarques`), request.t('Remarque marquée comme faite.'));
  });

  // ---------- circuit de publication (server/review.js) ----------
  const by = request => ({ sub: request.session.sub, name: request.session.name });
  const proposedText = (t, r) => [r.proposed.length ? (r.proposed.length > 1 ? t('{n} photos proposées à la publication.', { n: r.proposed.length }) : t('{n} photo proposée à la publication.', { n: r.proposed.length })) : t('Aucune photo proposée.'),
    r.verify.length ? (r.verify.length > 1 ? t('{n} à vérifier : confirmez les accords dans leur fiche.', { n: r.verify.length }) : t('{n} à vérifier : confirmez les accords dans sa fiche.', { n: r.verify.length })) : '',
    r.blocked.length ? (r.blocked.length > 1 ? t('{n} bloquées par un refus.', { n: r.blocked.length }) : t('{n} bloquée par un refus.', { n: r.blocked.length })) : '',
    r.skipped?.length ? t('{n} déjà proposée(s) ou programmée(s), laissée(s) telle(s) quelle(s).', { n: r.skipped.length }) : ''].filter(Boolean).join(' ');
  const approvedText = (t, r, at) => [r.done.length ? (at ? (r.done.length > 1 ? t('{n} photos programmées.', { n: r.done.length }) : t('{n} photo programmée.', { n: r.done.length })) : (r.done.length > 1 ? t('{n} photos publiées.', { n: r.done.length }) : t('{n} photo publiée.', { n: r.done.length }))) : t('Aucune photo publiée.'),
    r.verify.length + r.blocked.length ? t('{n} ne sont pas prêtes (accords) : renvoyez-les au photographe.', { n: r.verify.length + r.blocked.length }) : ''].filter(Boolean).join(' ');
  // Date de publication programmée : champ datetime-local, heure de Paris.
  const parisOffset = ms => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' }).formatToParts(ms).find(x => x.type === 'timeZoneName').value;
    const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(p);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
  };
  // Heure de Paris saisie (« 2026-10-25T01:30 ») → instant. Deux passes, pour les jours de changement d'heure ;
  // une heure qui n'existe pas (le dernier dimanche de mars, 2 h 30) est avancée d'une heure.
  const parseAt = raw => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(String(raw || ''));
    if (!m) return null;
    const guess = Date.parse(`${m[1]}T${m[2]}:00Z`);
    // Date impossible (31 avril, 29 février d'une année non bissextile) : refusée, pas décalée au jour suivant.
    if (!Number.isFinite(guess) || new Date(guess).toISOString().slice(0, 16) !== `${m[1]}T${m[2]}`) return null;
    let t = guess - parisOffset(guess) * 60000;
    t = guess - parisOffset(t) * 60000;                 // heure inexistante : tombe d'elle-même une heure plus tard
    return t;
  };

  app.post('/admin/photos/:id/proposer', W('photos.proposer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (['proposee', 'programmee'].includes(repo.photo(id)?.review)) return failed(reply, `/admin/photos/${id}#publication`, request.t('Cette photo est déjà proposée.'));
    const r = await app.review.propose([id], by(request), { message: request.body?.message, confirm: request.body?.confirmer === '1' });
    return (r.proposed.length ? done : failed)(reply, `/admin/photos/${id}#publication`, proposedText(request.t, r));
  });
  app.post('/admin/photos/:id/retirer-proposition', W('photos.proposer'), async (request, reply) => {
    const id = byId(request.params.id);
    if (!app.review.withdraw(id, by(request))) return failed(reply, `/admin/photos/${id}#publication`, request.t('Rien à retirer : la photo n’est pas proposée.'));
    return done(reply, `/admin/photos/${id}#publication`, request.t('Proposition retirée : la photo reste en brouillon.'));
  });
  app.post('/admin/photos/:id/valider', W('photos.publier'), async (request, reply) => {
    const id = byId(request.params.id);
    const at = request.body?.quand === 'date' ? parseAt(request.body?.date) : null;
    if (request.body?.quand === 'date' && !at) return failed(reply, safeBack(request, `/admin/photos/${id}#publication`), request.t('Choisissez une date et une heure.'));
    try {
      const r = await app.review.approve([id], by(request), { at });
      return (r.done.length ? done : failed)(reply, safeBack(request, `/admin/photos/${id}#publication`), approvedText(request.t, r, at));
    } catch (err) {
      if (!(err instanceof ReviewError)) throw err;
      return failed(reply, safeBack(request, `/admin/photos/${id}#publication`), request.t.msg(err.message));
    }
  });
  app.post('/admin/photos/:id/deprogrammer', W('photos.publier'), async (request, reply) => {
    const id = byId(request.params.id);
    // Déjà publiée, déprogrammée ou renvoyée entre-temps (page restée ouverte) : rien n'a été fait, on le dit.
    if (!app.review.unschedule(id, by(request))) return failed(reply, safeBack(request, `/admin/photos/${id}#publication`), request.t('Rien à annuler : la photo n’est pas programmée.'));
    return done(reply, safeBack(request, `/admin/photos/${id}#publication`), request.t('Programmation annulée.'));
  });
  app.post('/admin/photos/:id/renvoyer', W('photos.publier'), async (request, reply) => {
    const id = byId(request.params.id);
    try {
      await app.review.sendBack(id, by(request), request.body?.message);
    } catch (err) {
      if (!(err instanceof ReviewError) && !(err instanceof NoteError)) throw err;
      return failed(reply, safeBack(request, `/admin/photos/${id}#publication`), request.t.msg(err.message));
    }
    return done(reply, safeBack(request, `/admin/photos/${id}#publication`), request.t('Photo renvoyée au photographe avec votre remarque.'));
  });
  app.post('/admin/photos/:id/depublier', W('photos.publier'), async (request, reply) => {
    const id = byId(request.params.id);
    try {
      // Déjà dépubliée (par un autre modérateur) : ni remarque ni e-mail ; la raison saisie n'est pas perdue en silence.
      if (!(await app.review.unpublish(id, by(request), request.body?.raison))) return failed(reply, `/admin/photos/${id}#publication`, request.t('Rien à dépublier : la photo n’est pas en ligne.'));
    } catch (err) {
      if (!(err instanceof ReviewError) && !(err instanceof NoteError)) throw err;
      return failed(reply, `/admin/photos/${id}#publication`, request.t.msg(err.message));
    }
    return done(reply, `/admin/photos/${id}#publication`, request.t('Photo dépubliée ; le photographe reçoit la raison.'));
  });
  // Page « À valider » : les propositions (la plus ancienne d'abord) et les publications programmées.
  app.get('/admin/a-valider', P('photos.publier'), async (request, reply) => {
    const all = new Map(request.mine('photos.publier', repo.photos()).map(p => [p.id, p]));
    const names = new Map(repo.authors().map(a => [a.id, a.name]));
    const states = new Map();
    const withState = p => ({ ...withReady(p), site: (states.get(p.id) ?? states.set(p.id, app.readiness.state(p, null, request.t)).get(p.id)).site });
    const when = ms => new Intl.DateTimeFormat(request.t.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(ms);
    return render(request, reply, 'review', {
      title: request.t('À valider'),
      pending: app.review.pending().filter(r => all.has(r.id)).map(r => { const photo = withState(all.get(r.id)); return { ...r, photo, author: names.get(r.author_id) || '', when: r.at ? when(r.at) : '',
        // « À vérifier » déjà confirmée par le photographe à la proposition : validable comme une photo prête.
        ready: photo.site.level === 'ok' || (photo.site.level === 'warn' && app.readiness.confirmed(photo.id, 'site')) }; }),
      scheduled: app.review.scheduled().filter(r => all.has(r.id)).map(r => ({ ...r, photo: withReady(all.get(r.id)), author: names.get(r.author_id) || '', when: when(r.publish_at) })),
      // Propositions Instagram : pour qui gère toute la file.
      instagram: request.scope('instagram.file')?.all ? app.instagram.proposals().map(pr => { const photo = repo.photo(pr.photo_id); return photo && { ...pr, photo: withReady(photo), author: names.get(photo.author_id) || '', when: when(pr.at),
        caption: app.instagram.captionOf({ photo_id: pr.photo_id, caption: pr.caption }), frameLabel: FRAMES[pr.frame] || pr.frame }; }).filter(Boolean) : null,
    });
  });
  // Valider plusieurs propositions d'un coup : publier ou programmer la sélection.
  app.post('/admin/a-valider', W('photos.publier'), async (request, reply) => {
    if ([].concat(request.body?.ids || []).length > MAX_BULK) return failed(reply, '/admin/a-valider', request.t('Trop de photos à la fois : {n} au plus.', { n: MAX_BULK }));
    const checked = repo.existingIds(request.body?.ids).filter(id => request.owns('photos.publier', repo.photo(id)?.author_id));
    if (!checked.length) return failed(reply, '/admin/a-valider', request.t('Cochez au moins une photo.'));
    // Page restée ouverte : une photo dont la proposition a été retirée, ou déjà renvoyée, publiée ou programmée par un
    // autre modérateur entre-temps, n'est plus « à valider » : rien n'est fait pour elle (sa fiche, elle, le permet).
    const ids = checked.filter(id => repo.photo(id)?.review === 'proposee');
    const stale = checked.length - ids.length;
    const at = request.body?.quand === 'date' ? parseAt(request.body?.date) : null;
    if (request.body?.quand === 'date' && !at) return failed(reply, '/admin/a-valider', request.t('Choisissez une date et une heure.'));
    try {
      const r = await app.review.approve(ids, by(request), { at });
      JOURNAL.noterLot(request, at ? 'programmees' : 'validees', r.done.length);
      const text = [approvedText(request.t, r, at), stale ? (stale > 1 ? request.t('{n} photos ne sont plus proposées : rien n’a été fait pour elles.', { n: stale }) : request.t('{n} photo n’est plus proposée : rien n’a été fait pour elle.', { n: stale })) : ''].filter(Boolean).join(' ');
      return (r.done.length ? done : failed)(reply, '/admin/a-valider', text);
    } catch (err) {
      if (!(err instanceof ReviewError)) throw err;
      return failed(reply, '/admin/a-valider', request.t.msg(err.message));
    }
  });
  // Réglages du circuit, photographe par photographe : publier sans validation, modifier ses photos publiées.
  app.get('/admin/circuit', P('circuit.regler'), async (request, reply) => {
    const authors = new Map(repo.authors().map(a => [a.id, a.name]));
    // Un droit qu'un autre rôle du compte donne déjà (Relecteur, Modérateur) ne se retire pas ici : la page le dit.
    const byRole = a => grantsOf(a.roles.filter(r => r !== 'photographe'));
    const list = app.accounts.list().filter(a => a.roles.includes('photographe') && !a.roles.includes('admin'))
      .map(a => ({ ...a, author: authors.get(a.author_id) || '', publishAlone: a.adjust.add.includes('photos.publier'), editPublished: !a.adjust.remove.includes('photos.publiees.modifier'), igAlone: a.adjust.add.includes('instagram.file'), byRole: byRole(a) }));
    return render(request, reply, 'circuit', { title: request.t('Circuit de publication'), list });
  });
  app.post('/admin/circuit/:id', W('circuit.regler'), async (request, reply) => {
    const a = app.accounts.byId(byId(request.params.id));
    if (!a || !a.roles.includes('photographe') || a.roles.includes('admin')) return reply.callNotFound();
    const alone = request.body?.publier === '1', edit = request.body?.modifier === '1', igAlone = request.body?.instagram === '1';
    app.accounts.setAdjust(a.id, 'photos.publier', alone ? true : null, request.session.sub);
    app.accounts.setAdjust(a.id, 'photos.publiees.modifier', edit ? null : false, request.session.sub);
    app.accounts.setAdjust(a.id, 'instagram.file', igAlone ? true : null, request.session.sub);
    app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'circuit réglé', target: a.name || a.sub, status: 303,
      detail: `publier sans validation : ${alone ? 'oui' : 'non'} ; modifier ses photos publiées : ${edit ? 'oui' : 'non'} ; Instagram sans validation : ${igAlone ? 'oui' : 'non'}` });
    request.audited = true;
    const message = request.t('Réglages de {name} enregistrés.', { name: a.name || a.sub });
    // Admin v2 : enregistré au geste ; l'état gardé, pour « Défaire » (qui renvoie l'état d'avant par cette route).
    if (asJson(request)) return { ok: true, message, circuit: { publier: alone, modifier: edit, instagram: igAlone } };
    return done(reply, '/admin/circuit', message);
  });
  // Préférence de chacun : être prévenu par e-mail (propositions, décisions).
  app.post('/admin/compte/notifications', W('admin.acceder'), async (request, reply) => {
    try {
      app.accounts.setNotify(request.session.sub, { on: request.body?.email === '1', to: request.body?.adresse, digest: request.body?.recap });
    } catch (err) {
      if (!(err instanceof AccountError)) throw err;
      return failed(reply, safeBack(request, '/admin#compte'), request.t.msg(err.message));
    }
    return done(reply, safeBack(request, '/admin#compte'), request.t('Préférence enregistrée.'));
  });

  app.post('/admin/photos/:id/status', W('photos.publier'), async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const published = request.body?.status === 'published';
    if (published && photo.status !== 'published') {
      // Publication en un clic : seulement une photo prête ; à vérifier → la fiche (confirmation), bloquée → refus.
      const g = app.readiness.gate([photo.id]);
      const reasons = () => app.readiness.state(photo.id, null, request.t).site.reasons.join(' ; ');     // dans la langue de l'admin
      if (g.blocked.length) return failed(reply, safeBack(request, '/admin/photos'), request.t('« {title} » ne peut pas être publiée : {reasons}.', { title: photo.title, reasons: reasons() }));
      if (g.verify.length) return failed(reply, `/admin/photos/${photo.id}`, request.t('« {title} » est à vérifier ({reasons}) : confirmez dans la fiche pour la publier.', { title: photo.title, reasons: reasons() }));
    }
    repo.setStatus(photo.id, request.body?.status);
    queued({ [photo.id]: photo.status });
    return done(reply, safeBack(request, '/admin/photos'), published ? request.t('« {title} » publiée.', { title: photo.title }) : request.t('« {title} » repassée en brouillon.', { title: photo.title }));
  });

  // Visages : correction à la main (il y a quelqu'un / personne de reconnaissable / revenir à la détection).
  app.post('/admin/photos/:id/visages', W('personnes.gerer'), async (request, reply) => {
    const photo = repo.photo(byId(request.params.id));
    if (!photo) return reply.callNotFound();
    const v = { oui: 1, non: 0 }[request.body?.valeur];
    app.readiness.setFaces(photo.id, v ?? null);
    app.instagram.dropBlocked();
    return done(reply, `/admin/photos/${photo.id}`, v === 1 ? request.t('Indiqué : quelqu’un est sur la photo.') : v === 0 ? request.t('Indiqué : personne de reconnaissable sur la photo.') : request.t('La détection des visages fait de nouveau foi.'));
  });

  app.post('/admin/photos/:id/move', W('photos.modifier'), async (request, reply) => {
    if (!request.scope('photos.modifier')?.all) return app.forbid(request, reply);      // l'ordre de la galerie touche toutes les photos
    repo.movePhoto(byId(request.params.id), request.body?.dir);
    return reply.redirect(`/admin/photos?vue=liste#photo-${byId(request.params.id)}`, 303);   // « Monter » et « Descendre » sont dans la vue liste
  });

  app.post('/admin/photos/:id/delete', W('photos.supprimer'), async (request, reply) => {
    const file = repo.deletePhoto(byId(request.params.id));
    if (!file) return reply.callNotFound();
    removePhotoFiles(storageDir, file);
    return done(reply, '/admin/photos', request.t('Photo supprimée.'));
  });

  // ---------- séries ----------
  const seriesPage = (request, reply, extra = {}) => render(request, reply, 'series', {
    title: request.t('Séries'), categories: repo.categories(), covers: Object.fromEntries(Object.entries(repo.covers()).map(([k, p]) => [k, withReady(p)])),
    boards: Object.fromEntries(Object.entries(repo.boards(3)).map(([k, list]) => [k, list.map(withReady).filter(p => p.ready)])), errors: {}, values: {},
    suggest: app.seriesSuggest.state(), describe: app.describer.state(), describeModels: app.describer.MODELS, translate: app.translator.enabled, limits: LIMITS, ...extra,
  });
  app.get('/admin/series', P('series.gerer'), async (request, reply) => seriesPage(request, reply));
  // Réglages › Assistants d'analyse (admin v2, MQ-07) : les réglages des assistants, sortis du bas de la page Séries
  // (UX-A-17). En v1, ils restent sur la page Séries.
  app.get('/admin/reglages/assistants', P('series.propositions'), async (request, reply) => {
    if (adminVersion.of(request.session.sub) !== 'v2' || !adminVersion.hasV2('assistants')) return reply.redirect('/admin/series#propositions', 303);
    return render(request, reply, 'assistants', { title: request.t('Assistants d’analyse'), suggest: app.seriesSuggest.state(), describe: app.describer.state(), describeModels: app.describer.MODELS, translate: app.translator.enabled });
  });

  // Série proposée : allumer (téléchargement du modèle puis analyse, en arrière-plan) ou éteindre et tout effacer.
  app.get('/admin/series/propositions', P('series.propositions'), async () => app.seriesSuggest.state());
  // Interrupteur de la v2 (Réglages › Assistants d'analyse) : « action » vaut off (champ caché) puis on (la case cochée) ;
  // la dernière décide. Retour à la page d'où vient le formulaire (back), en JSON pour l'enregistrement au geste.
  const switchAction = v => { const all = [].concat(v ?? []); return all.includes('on') ? 'on' : all.includes('off') ? 'off' : undefined; };
  const answer = (request, reply, ok, to, text) => (request.headers.accept?.includes('text/html') || !request.headers.accept ? (ok ? done : failed)(reply, safeBack(request, to), text) : reply.code(ok ? 200 : 422).send(ok ? { ok: true, text } : { error: text }));
  app.post('/admin/series/propositions', W('series.propositions'), async (request, reply) => {
    if (switchAction(request.body?.action) === 'on') {
      app.seriesSuggest.enable();
      return answer(request, reply, true, '/admin/series#propositions', request.t('Propositions de série allumées : le modèle se télécharge, puis les photos sont analysées.'));
    }
    await app.seriesSuggest.disable();
    return answer(request, reply, true, '/admin/series#propositions', request.t('Propositions de série éteintes : modèle et empreintes effacés.'));
  });

  // Descriptions suggérées (Florence-2) : allumer avec le modèle et les heures de nuit choisis, ou éteindre et effacer.
  app.post('/admin/series/descriptions', W('series.propositions'), async (request, reply) => {
    const b = request.body || {};
    if (switchAction(b.action) === 'off') {
      await app.describer.remove();
      return answer(request, reply, true, '/admin/series#descriptions', request.t('Descriptions éteintes : modèle effacé (les descriptions déjà faites restent).'));
    }
    let s;
    try {
      s = app.describer.save({ on: true, model: b.model, from: b.from, to: b.to });
    } catch (err) {
      if (!(err instanceof DescribeError)) throw err;
      return answer(request, reply, false, '/admin/series#descriptions', request.t.msg(err.message));
    }
    app.describer.run();
    return answer(request, reply, true, '/admin/series#descriptions', request.t('Descriptions allumées : au premier calcul, le modèle se télécharge ; les photos sont décrites la nuit, de {from} h à {to} h.', { from: s.from, to: s.to }));
  });

  app.post('/admin/series', W('series.gerer'), async (request, reply) => {
    try {
      const id = repo.saveCategory(null, request.body || {});
      return done(reply, `/admin/series#serie-${id}`, request.t('Série « {name} » créée.', { name: repo.categories().find(c => c.id === id).name }));
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return seriesPage(request, reply.code(422), { errors: err.errors, values: err.values });
    }
  });

  app.post('/admin/series/:id', W('series.gerer'), async (request, reply) => {
    const id = byId(request.params.id);
    const before = repo.categories().find(c => c.id === id);
    if (!before) return reply.callNotFound();
    // Admin v2 : la carte d'une série s'enregistre au champ quitté (le formulaire entier, envoyé en JSON par
    // public/admin/v2/contenus-v2.js) ; la réponse est alors en JSON. Le formulaire envoyé sans script reste celui de la v1.
    const json = Boolean(request.headers.accept) && !request.headers.accept.includes('text/html');
    try {
      repo.saveCategory(id, request.body || {});
      noteChanges(request, before, repo.categories().find(c => c.id === id));
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      if (json) return reply.code(422).send({ errors: translateDeep(request.t, err.errors) });
      return seriesPage(request, reply.code(422), { editErrors: { id, errors: err.errors, values: err.values } });
    }
    if (json) { const c = repo.categories().find(x => x.id === id); return { ok: true, serie: { name: c.name, slug: c.slug } }; }
    return done(reply, `/admin/series#serie-${id}`, request.t('Série enregistrée.'));
  });

  // Ordre des séries par glisser-déposer ou flèches du clavier (fetch JSON).
  app.post('/admin/series/order', W('series.gerer'), async (request, reply) => {
    try {
      repo.orderCategories(Array.isArray(request.body?.ids) ? request.body.ids : []);
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(422).send({ error: request.t(err.errors.order) });
      throw err;
    }
    return { ok: true };
  });

  app.post('/admin/series/:id/move', W('series.gerer'), async (request, reply) => {
    repo.moveCategory(byId(request.params.id), request.body?.dir);
    return reply.redirect(`/admin/series#serie-${byId(request.params.id)}`, 303);
  });

  app.post('/admin/series/:id/delete', W('series.gerer'), async (request, reply) => {
    // Supprimer une série qui a des photos les reclasse toutes (publiées comprises, de tous les photographes) : c'est
    // changer leur série, ce qui demande de pouvoir modifier toutes les photos. Le modérateur supprime une série vide.
    const c = repo.categories().find(x => x.id === byId(request.params.id));
    if (c?.count && !(request.scope('photos.modifier')?.all && request.scope('photos.publiees.modifier')?.all)) return app.forbid(request, reply);
    let r;
    try {
      r = repo.deleteCategory(byId(request.params.id), { moveTo: request.body?.move_to });
      if (!r) return reply.callNotFound();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return failed(reply, '/admin/series', request.t.msg(err.errors.delete));
    }
    if (r.moved) app.variants.schedule();
    const target = r.moved ? repo.categories().find(c => c.id === Number(request.body.move_to)) : null;
    return done(reply, '/admin/series', r.moved
      ? (r.moved > 1 ? request.t('Série « {name} » supprimée ; {n} photos déplacées vers « {target} ».', { name: r.name, n: r.moved, target: target.name })
        : request.t('Série « {name} » supprimée ; {n} photo déplacée vers « {target} ».', { name: r.name, n: r.moved, target: target.name }))
      : request.t('Série « {name} » supprimée.', { name: r.name }));
  });

  // ---------- auteurs ----------
  // holds : ce qui empêche encore de supprimer chaque photographe (photos, rencontres, voyages, compte lié).
  const authorsPage = (request, reply, extra = {}) => render(request, reply, 'authors', {
    title: request.t('Photographes'), authors: repo.authors().map(a => ({ ...a, holds: repo.authorHolds(a.id).map(m => request.t.msg(m)) })), errors: {}, values: {}, limits: LIMITS, ...extra,
  });
  app.get('/admin/auteurs', P('photographes.gerer'), async (request, reply) => authorsPage(request, reply));

  app.post('/admin/auteurs', W('photographes.gerer'), async (request, reply) => {
    try {
      repo.saveAuthor(null, request.body || {});
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return authorsPage(request, reply.code(422), { errors: err.errors, values: err.values });
    }
    return done(reply, '/admin/auteurs', request.t('Auteur ajouté.'));
  });

  app.post('/admin/auteurs/:id', W('photographes.gerer'), async (request, reply) => {
    const id = byId(request.params.id);
    const before = repo.authors().find(a => a.id === id);
    if (!before) return reply.callNotFound();
    try {
      repo.saveAuthor(id, request.body || {});
      noteChanges(request, before, repo.authors().find(a => a.id === id));
      app.variants.schedule();          // le nom de l'auteur peut figurer dans le filigrane et l'EXIF
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return authorsPage(request, reply.code(422), { editErrors: { id, errors: err.errors, values: err.values } });
    }
    return done(reply, '/admin/auteurs', request.t('Auteur enregistré.'));
  });

  app.post('/admin/auteurs/:id/delete', W('photographes.gerer'), async (request, reply) => {
    try {
      if (!repo.deleteAuthor(byId(request.params.id))) return reply.callNotFound();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      return failed(reply, '/admin/auteurs', (err.messages || [err.errors.delete]).map(m => request.t.msg(m)).join(' '));
    }
    return done(reply, '/admin/auteurs', request.t('Auteur supprimé.'));
  });

  // ---------- images : filigrane et métadonnées ----------
  const firstPhotoId = () => repo.photos({ status: 'published' })[0]?.id ?? repo.photos()[0]?.id;
  const imagesPage = (request, reply) => {
    const { watermark, exif } = app.variants.context();
    return render(request, reply, 'images', {
      title: request.t('Filigrane et métadonnées'), watermark, exif, FONTS, POSITIONS, KINDS, TONE_LABELS, EXIF_MODES, MIN_WIDTHS, brand: app.appearance.brand(),
      photos: repo.photos(), previewId: Number(request.query.photo) || firstPhotoId(),
    });
  };
  app.get('/admin/images', P('site.filigrane'), imagesPage);

  app.post('/admin/images', W('site.filigrane'), async (request, reply) => {
    const { watermark: current } = app.variants.context();
    const watermark = normalizeWatermark(request.body || {}, current);
    repo.saveImageSettings(watermark, normalizeExif(request.body || {}));
    app.variants.schedule();
    const brand = app.appearance.brand();
    const note = !watermark.enabled ? ''
      : watermark.kind === 'image' && !watermark.image ? ` ${request.t('Aucun logo envoyé : pas de filigrane pour l’instant.')}`
        : (watermark.kind === 'emblem' || watermark.kind === 'logotype') && !brand[watermark.kind] ? ` ${request.t('Ce dessin n’est pas encore envoyé dans Apparence : pas de filigrane pour l’instant.')}` : '';
    return done(reply, '/admin/images', `${request.t('Réglages enregistrés, images en cours de mise à jour.')}${note}`);
  });

  const sendPreview = async (reply, id, override) => {
    const buf = await app.variants.preview(id, override);
    if (!buf) return reply.callNotFound();
    return reply.header('cache-control', 'no-store').type('image/webp').send(buf);
  };
  // Aperçu des réglages enregistrés (affiché sur la page).
  app.get('/admin/images/apercu.webp', P('site.filigrane'), async (request, reply) => sendPreview(reply, byId(request.query.photo || firstPhotoId())));
  // Aperçu des réglages du formulaire, sans les enregistrer (bouton « Aperçu »).
  app.post('/admin/images/apercu', W('site.filigrane'), async (request, reply) => {
    const { watermark: current } = app.variants.context();
    return sendPreview(reply, byId(request.body?.preview_photo), { watermark: normalizeWatermark(request.body || {}, current) });
  });

  app.get('/admin/images/etat', P('site.filigrane'), async () => app.variants.status());

  app.get('/admin/images/logo', P('site.filigrane'), async (request, reply) => {
    const { watermark } = app.variants.context();
    if (!watermark.image) return reply.callNotFound();
    // cacheControl: false — sinon le cache d'un an de /static/ (production) remplacerait le no-store.
    return reply.header('cache-control', 'no-store').sendFile(watermark.image, app.variants.watermarkDir, { cacheControl: false });
  });

  // Logo : PNG ou WebP, réencodé en PNG (aucune donnée du fichier envoyé n'est servie telle quelle).
  app.post('/admin/images/logo', P('site.filigrane'), async (request, reply) => {
    let checked = false;
    let error = null;
    let saved = null;
    try {
      for await (const part of request.parts({ limits: { fileSize: LOGO_MAX_BYTES, files: 1 } })) {
        if (part.type === 'field') {
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked) { part.file.resume(); break; }
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        if (part.file.truncated) { error = request.t('Logo trop lourd (5 Mo au plus).'); continue; }
        const buf = Buffer.concat(chunks);
        let meta;
        try { meta = await sharp(buf, { limitInputPixels: LOGO_MAX_SIDE * LOGO_MAX_SIDE }).metadata(); } catch { meta = null; }
        if (!meta || !['png', 'webp'].includes(meta.format)) { error = request.t('Le logo doit être une image PNG ou WebP (de préférence à fond transparent).'); continue; }
        if (meta.width > LOGO_MAX_SIDE || meta.height > LOGO_MAX_SIDE) { error = request.t('Logo trop grand ({n} px de côté au plus).', { n: LOGO_MAX_SIDE }); continue; }
        if (Math.min(meta.width, meta.height) < 8 || Math.max(meta.width, meta.height) > 10 * Math.min(meta.width, meta.height)) {
          error = request.t('Logo trop étiré ou trop petit (8 px de côté au moins, rapport largeur/hauteur de 10 au plus).'); continue;
        }
        saved = `${crypto.randomUUID()}.png`;
        // Écrit sous un nom provisoire (« .part », jamais effacé par le ménage d'un passage en cours),
        // puis renommé au moment même où les réglages le désignent (sans attente entre les deux).
        await sharp(buf).png().toFile(path.join(app.variants.watermarkDir, `${saved}.part`));
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = request.t('Envoi invalide.');
    }
    if (!checked) return reply.code(403).send(request.t('Jeton CSRF invalide.'));
    if (!saved) return failed(reply, '/admin/images', error || request.t('Aucun fichier reçu.'));
    // L'ancien logo n'est pas effacé ici : un passage en cours l'utilise peut-être ; le ménage de fin de passage s'en charge.
    const { watermark, exif } = app.variants.context();
    repo.saveImageSettings({ ...watermark, image: saved }, exif);
    fs.renameSync(path.join(app.variants.watermarkDir, `${saved}.part`), path.join(app.variants.watermarkDir, saved));
    app.variants.schedule();
    return done(reply, '/admin/images', request.t('Logo enregistré.'));
  });

  app.post('/admin/images/logo/delete', W('site.filigrane'), async (request, reply) => {
    const { watermark, exif } = app.variants.context();
    repo.saveImageSettings({ ...watermark, image: null }, exif);
    app.variants.schedule();
    return done(reply, '/admin/images', request.t('Logo supprimé.'));
  });

  // ---------- apparence : thème et marque ----------
  const brandDir = path.join(storageDir, 'brand');
  fs.mkdirSync(brandDir, { recursive: true });
  const saveBrand = brand => repo.saveSetting('brand', brand);

  app.get('/admin/apparence', P('site.apparence'), async (request, reply) => render(request, reply, 'appearance', {
    title: request.t('Apparence'), THEMES, BRAND_MODES, BRAND_SLOTS, themeId: app.appearance.themeId(), brand: app.appearance.brand(),
    DESIGNS, SECTIONS, designSettings: app.publicVersion.designSettings(), publicVersion: app.publicVersion.setting(), vueSession: app.publicVersion.viewOf(request),
  }));

  app.post('/admin/apparence/compositions', W('site.apparence'), async (request, reply) => {
    const b = request.body || {};
    const reject = message => {
      app.securite.emit('input_validation_fail', { request, emetteur: 'server/routes/admin.js · compositions',
        detail: { raison: 'configuration de thèmes invalide' } });
      return reply.code(400).send({ error: request.t(message) });
    };
    const fields = Object.keys(b);
    const allowed = b.reset === '1' ? ['_csrf', 'reset'] : ['_csrf', 'default', ...Object.keys(SECTIONS).map(s => `section_${s}`)];
    if (fields.some(k => !allowed.includes(k))) return reject('Réglage de thème inconnu.');
    let value = null;
    if (b.reset !== '1') {
      const sections = {};
      for (const section of Object.keys(SECTIONS)) {
        const id = b[`section_${section}`];
        if (id !== undefined && id !== 'inherit') sections[section] = id;
      }
      value = { default: b.default, sections };
      if (!validDesignSettings(value)) return reject('Thème inconnu. Aucun changement enregistré.');
    }
    const before = app.publicVersion.designSettings();
    app.publicVersion.saveDesign(value);
    request.audited = true;
    app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'POST /admin/apparence/compositions', target: 'site public', status: asJson(request) ? 200 : 303,
      detail: `compositions : ${JSON.stringify(before)} → ${JSON.stringify(value)}` });
    if (asJson(request)) return { ok: true, design: app.publicVersion.designSettings() };
    return done(reply, '/admin/apparence#compositions', request.t('Thèmes enregistrés.'));
  });

  app.post('/admin/apparence', W('site.apparence'), async (request, reply) => {
    const body = request.body || {};
    // Champs changés, notés au journal (noms seulement) : thème, mode de la marque, sous-titre.
    const was = { theme: app.appearance.themeId(), brand_mode: app.appearance.brand().mode, subtitle: app.appearance.brand().subtitle || '' };
    if (ownKey(THEMES, body.theme)) repo.saveSetting('theme', body.theme);
    // Site public v1 ou v2 : pour tous les visiteurs. Le changement est noté au journal avec son sens.
    const before = app.publicVersion.setting();
    if (typeof body.site_public === 'string' && body.site_public !== before && app.publicVersion.save(body.site_public)) {
      request.audited = true;
      app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'POST /admin/apparence', target: 'site public', status: 303, detail: `site public : ${before} → ${body.site_public}` });
    }
    const brand = app.appearance.brand();
    saveBrand({
      ...brand,
      mode: ownKey(BRAND_MODES, body.brand_mode) ? body.brand_mode : brand.mode,
      subtitle: typeof body.subtitle === 'string' ? body.subtitle.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 60) : brand.subtitle,
    });
    const now = { theme: app.appearance.themeId(), brand_mode: app.appearance.brand().mode, subtitle: app.appearance.brand().subtitle || '' };
    noteChanges(request, was, now);
    // Admin v2 : ce qui est enregistré (le sous-titre tel que gardé), pour le champ et « Défaire ».
    if (asJson(request)) return { ok: true, ...now, site_public: app.publicVersion.setting() };
    return done(reply, '/admin/apparence', request.t('Apparence enregistrée.'));
  });

  // Vue de la session sur le site public (server/version-publique.js, bouton « Voir en v1 / Voir en v2 » des pages
  // publiques) : « vue=v1 » ou « vue=v2 » la force pour cette session seulement, « vue=suivre » l'oublie (la session suit
  // le réglage, comme les visiteurs). Ancienne forme gardée : « apercu=1 » vaut « vue=v2 », « apercu=0 » « vue=suivre ».
  // Retour à la page « vers » (du site seulement) ; noté au journal d'audit. Ce n'est pas un réglage : rien ne change
  // pour les visiteurs.
  app.post('/admin/apparence/apercu-v2', W('site.apparence'), async (request, reply) => {
    const b = request.body || {};
    const vue = typeof b.vue === 'string' ? b.vue : b.apercu === '1' ? 'v2' : b.apercu === '0' ? 'suivre' : '';
    if (!app.publicVersion.setView(request, vue)) return reply.code(400).send({ error: request.t('Vue inconnue.') });
    request.audited = true;
    const to = safeNext(typeof b.vers === 'string' ? b.vers : '', vue === 'suivre' ? '/admin/apparence' : '/');
    const target = /^\/(?:admin|auth)(?:[/?#]|$)/.test(to) && vue !== 'suivre' ? '/' : to;
    const applied = app.publicVersion.forRequest({ url: target }).appliedDesign;
    app.audit.log({ sub: request.session.sub, name: request.session.name, action: 'POST /admin/apparence/apercu-v2', target: 'site public', status: 303,
      detail: vue === 'suivre' ? `vue de la session : suit le réglage (${applied})` : `vue de la session : ${vue} (visiteurs : ${applied})` });
    return reply.redirect(target, 303);
  });

  // Marque : quatre emplacements (emblème, icône, logo complet, image de partage). PNG, WebP ou JPEG ;
  // jeton CSRF avant le fichier ; fichiers aux noms versionnés, l'ancien est effacé au remplacement.
  const PROCESS = { mask: processEmblem, icon: processIcon, share: processShare };
  const brandFiles = b => [b.emblem, b.icon, b.logotype, b.share, b.favicon64, b.favicon180].filter(Boolean);
  const sweepBrand = b => { const keep = new Set(brandFiles(b).flatMap(f => [f, `${f}.source`])); for (const f of fs.readdirSync(brandDir)) if (!keep.has(f)) fs.rmSync(path.join(brandDir, f), { force: true }); };
  // Les icônes d'onglet viennent de l'icône simplifiée si elle existe, sinon de l'emblème.
  async function faviconsFrom(b, id) {
    const source = b.icon || b.emblem;
    if (!source) return { favicon64: null, favicon180: null };
    const original = path.join(brandDir, `${source}.source`);
    const input = fs.readFileSync(fs.existsSync(original) ? original : path.join(brandDir, source));   // à défaut, le masque lui-même
    const made = await (b.icon ? processIcon : processEmblem)(input);
    const files = { favicon64: `favicon-${id}-64.png`, favicon180: `favicon-${id}-180.png` };
    fs.writeFileSync(path.join(brandDir, files.favicon64), made.favicon64);
    fs.writeFileSync(path.join(brandDir, files.favicon180), made.favicon180);
    return files;
  }

  app.post('/admin/apparence/marque/:slot', P('site.apparence'), async (request, reply) => {
    const slot = ownKey(BRAND_SLOTS, request.params.slot) ? BRAND_SLOTS[request.params.slot] : null;
    if (!slot) return reply.callNotFound();
    let checked = false;
    let error = null;
    let upload = null;
    try {
      for await (const part of request.parts({ limits: { fileSize: EMBLEM_MAX_BYTES, files: 1 } })) {
        if (part.type === 'field') {
          if (part.fieldname === '_csrf') checked = sameToken(part.value, request.session.csrf);
          continue;
        }
        if (!checked) { part.file.resume(); break; }
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        if (part.file.truncated) { error = request.t('Image trop lourde ({n} Mo au plus).', { n: EMBLEM_MAX_BYTES / 1024 / 1024 }); continue; }
        upload = Buffer.concat(chunks);
      }
    } catch (err) {
      if (!err.code?.startsWith('FST_')) throw err;
      error = request.t('Envoi invalide.');
    }
    if (!checked) return asJson(request) ? reply.code(403).send({ error: request.t('Jeton CSRF invalide.') }) : reply.code(403).send(request.t('Jeton CSRF invalide.'));
    let made = null;
    if (upload) {
      try {
        made = await PROCESS[slot.kind](upload);
      } catch (err) {
        if (!(err instanceof BrandError)) throw err;
        error = request.t('{label} refusé : {error}.', { label: request.t(slot.label), error: request.t.msg(err.message) });
      }
    }
    if (!made) return asJson(request) ? refusedJson(request, reply, error || request.t('Aucun fichier reçu.')) : failed(reply, '/admin/apparence', error || request.t('Aucun fichier reçu.'));

    const id = crypto.randomUUID().slice(0, 8);
    const file = `${request.params.slot}-${id}.${slot.kind === 'share' ? 'jpg' : 'png'}`;
    fs.writeFileSync(path.join(brandDir, file), slot.kind === 'share' ? made.image : made.mask);
    // Original conservé (privé, jamais servi) pour régénérer les icônes d'onglet.
    if (slot.kind !== 'share') fs.writeFileSync(path.join(brandDir, `${file}.source`), upload);
    const was = app.appearance.brand();
    let brand = { ...was, [slot.field]: file };
    if (slot.ratio) brand[slot.ratio] = Math.round((made.width / made.height) * 1000) / 1000;
    if (slot.field === 'emblem' || slot.field === 'icon') {
      brand = { ...brand, ...(await faviconsFrom(brand, id)), mode: 'embleme' };
    }
    saveBrand(brand);
    sweepBrand(brand);
    app.variants.schedule();            // le dessin peut servir de filigrane
    noteChanges(request, was, brand);
    const message = request.t('{label} enregistré.', { label: request.t(slot.label) });
    // Admin v2 : le fichier enregistré (aperçu sans recharger) et le mode d'avant (« Défaire » d'un emplacement vide).
    if (asJson(request)) return { ok: true, message, slot: request.params.slot, file, mode: brand.mode, modeBefore: was.mode, favicon180: brand.favicon180 || null };
    return done(reply, '/admin/apparence', message);
  });

  app.post('/admin/apparence/marque/:slot/delete', W('site.apparence'), async (request, reply) => {
    const slot = ownKey(BRAND_SLOTS, request.params.slot) ? BRAND_SLOTS[request.params.slot] : null;
    if (!slot) return reply.callNotFound();
    const was = app.appearance.brand();
    let brand = { ...was, [slot.field]: null };
    if (slot.ratio) brand[slot.ratio] = null;
    if (slot.field === 'emblem' || slot.field === 'icon') {
      brand = { ...brand, ...(await faviconsFrom(brand, crypto.randomUUID().slice(0, 8))) };
      if (!brand.emblem && !brand.icon) brand.mode = 'texte';
    }
    saveBrand(brand);
    sweepBrand(brand);
    app.variants.schedule();
    noteChanges(request, was, brand);
    const message = request.t('{label} retiré.', { label: request.t(slot.label) });
    if (asJson(request)) return { ok: true, message, slot: request.params.slot, file: null, mode: brand.mode };
    return done(reply, '/admin/apparence', message);
  });

  // ---------- aide en ligne ----------
  // Relue à chaque affichage en développement (édition de docs/aide), une fois pour toutes en production.
  // Aide dans la langue de l'admin (français si la traduction manque) ; gardée en mémoire en production.
  const helpCache = {};
  const helpIn = lang => (app.config.production ? (helpCache[lang] ??= loadHelp(lang)) : loadHelp(lang));
  // Chapitres de l'aide réservés : ils n'apparaissent qu'à qui peut ouvrir l'une des pages qu'ils décrivent.
  const HELP_PERMS = { preuves: ['photos.voir'], series: ['series.gerer'], auteurs: ['photographes.gerer'], 'filigrane-exif': ['site.filigrane'], apparence: ['site.apparence'],
    reglages: ['site.textes', 'reglages.droits', 'comptes.gerer', 'journal.voir'], statistiques: ['statistiques.voir'], instagram: ['instagram.voir'], rencontres: ['personnes.voir', 'terrain.app'], 'galeries-privees': ['galeries.voir'], saisons: ['saisons.voir'] };
  const helpAllowed = (request, id) => !HELP_PERMS[id] || HELP_PERMS[id].some(perm => request.can(perm));
  app.get('/admin/aide', P('admin.acceder'), async (request, reply) => {
    const help = helpIn(request.t.lang);
    const sections = help.sections.filter(sec => helpAllowed(request, sec.id));
    return render(request, reply, 'help', { title: request.t('Aide'), help: { ...help, sections } });
  });
  // Admin v2 (UX-A-22) : un chapitre de l'aide sur sa page, et ce que le panneau d'aide contextuelle lit. Le contenu est celui
  // de /admin/aide (mêmes ancres, mêmes chapitres réservés) ; une adresse en lecture seule derrière l'admin, par un nom de
  // chapitre pris dans la liste fermée de docs/aide/ (jamais une valeur de la requête dans un chemin de fichier). Un chapitre
  // inconnu ou réservé est introuvable ; un compte en v1 est renvoyé à la page entière, à l'ancre du chapitre.
  app.get('/admin/aide/:chapitre', P('admin.acceder'), async (request, reply) => {
    const id = String(request.params.chapitre);
    if (!chapterIds().includes(id) || !helpAllowed(request, id)) return reply.callNotFound();
    if (adminVersion.of(request.session.sub) !== 'v2') return reply.redirect(`/admin/aide#${id}`, 303);
    const help = helpIn(request.t.lang);
    const sections = help.sections.filter(sec => helpAllowed(request, sec.id));
    const i = sections.findIndex(sec => sec.id === id);
    if (i < 0) return reply.callNotFound();
    return render(request, reply, 'help', { title: `${sections[i].title} · ${request.t('Aide')}`, help: { ...help, sections }, chapitre: sections[i], precedent: sections[i - 1] || null, suivant: sections[i + 1] || null });
  });

  // ---------- rencontres (page /bonjour, cartes) ----------
  registerEncounters(app, { repo, render, P, W, done, failed, withReady, adminVersion, identity: identityOf });
  registerOutings(app, { repo, render, P, W, done, failed, withReady });
  registerTrips(app, { repo, render, P, W, done, failed, withReady, noteChanges });
  registerGaleries(app, { repo, render, P, W, done, failed });
  registerCarnet(app, { repo, render, P, W, done, failed, withReady });
  registerSaisons(app, { repo, render, P, W, done, failed, withReady, zone: 'UTC' });
  registerSaisonsPropositions(app, { repo, render, P, W, done, withReady });
  registerSaisonsBilans(app, { repo, render, P, W, done, withReady });
  registerMessages(app, { render, P, W, done, withReady });

  // ---------- traductions ----------
  // Proposition de traduction d'un champ (LibreTranslate du réseau local) : l'auteur la relit avant d'enregistrer.
  app.post('/admin/traduction', W('admin.acceder'), async (request, reply) => {
    const { text, source, target } = request.body || {};
    try {
      return { text: await app.translator.translate(String(text || '').slice(0, 20000), String(source), String(target)) };
    } catch (err) {
      if (!(err instanceof TranslateError)) throw err;
      return reply.code(422).send({ error: request.t.msg(err.message) });
    }
  });

  // ---------- réglages ----------
  const mapCounts = app.db.prepare("SELECT COUNT(*) AS mapCount, COUNT(DISTINCT city_id) AS mapCities FROM photos WHERE status = 'published' AND on_map = 1 AND city_id IS NOT NULL");
  const defaultsNow = () => rightsDefaults(repo.authors().map(a => a.name), app.siteName());
  // Deux pages, un seul enregistrement : « Site public » (textes, ouverture, carte du monde) et « Droits &
  // confidentialité ». Chaque formulaire n'enregistre que ses propres champs (part).
  const settingsPage = (request, reply, part) => render(request, reply, 'settings', {
    heroMax: 8, part, section: part, v2: part,
    title: part === 'site' ? request.t('Site public') : request.t('Droits & confidentialité'), settings: repo.settings(), published: repo.photos({ status: 'published' }), defaultName: app.config.siteName,
    rights: LANGS.map(l => ({ lang: l, ...RIGHTS[l] })), rightsDefaults: defaultsNow(),
    ...mapCounts.get(), encrypted: app.encounters.encrypted, legalMissing: legalMissing(repo.settings()),
  });
  app.get('/admin/site', P('site.textes'), async (request, reply) => settingsPage(request, reply, 'site'));
  app.get('/admin/droits', P('reglages.droits'), async (request, reply) => settingsPage(request, reply, 'droits'));
  // Ancienne adresse : renvoie vers Site public (le #fragment ne parvient pas au serveur ; les liens de l'admin et de
  // l'aide pointent déjà vers /admin/site ou /admin/droits).
  app.get('/admin/reglages', P('site.textes'), async (request, reply) => reply.redirect('/admin/site', 301));

  app.post('/admin/reglages', W('site.textes'), async (request, reply) => {
    const part = ['site', 'droits'].includes(request.body?.part) ? request.body.part : null;
    if (part !== 'site' && !request.can('reglages.droits')) return app.forbid(request, reply);
    // Contacts des droits et de la confidentialité : une adresse e-mail ou une page https, sans guillemet, chevron, apostrophe
    // ni esperluette (recopiés dans des liens, dont ceux des pages des galeries privées ; revue de sécurité de la PR #149).
    if (part === 'droits') {
      const SAFE = /^[^\s@"<>'&]+@[^\s@"<>'&]+\.[^\s@"<>'&]+$|^https:\/\/[^\s"<>'&]+$/;
      const bad = ['rights_contact', 'privacy_contact'].find(k => String(request.body?.[k] ?? '').trim() && !SAFE.test(String(request.body[k]).trim()));
      if (bad) return failed(reply, '/admin/droits', request.t('Contact refusé : écrivez une adresse e-mail (nom@exemple.fr) ou une adresse de page en https://, sans guillemet, chevron, apostrophe ni esperluette.'));
    }
    // Champs changés, notés au journal (noms seulement : un texte peut porter une donnée personnelle).
    const was = repo.settings();
    repo.saveSettings(withoutDefaults(request.body || {}, defaultsNow()), part);
    noteChanges(request, was, repo.settings());
    app.variants.schedule();            // {site} peut figurer dans le filigrane
    // Admin v2 : enregistrement au geste (le formulaire entier, comme sans script) ; l'ouverture telle qu'enregistrée.
    if (asJson(request)) return { ok: true, hero: repo.settings().hero || [], hero_tel: repo.settings().hero_tel || [] };
    if (request.body?.hero_tel_op) return done(reply, '/admin/site#ouverture-tel', request.t('Ordre de l’ouverture enregistré.'));
    if (request.body?.hero_op || request.body?.hero_save) return done(reply, '/admin/site#ouverture', request.t('Ordre de l’ouverture enregistré.'));
    return done(reply, part === 'droits' ? '/admin/droits' : '/admin/site', request.t('Réglages enregistrés.'));
  });
}

// Retour à la liste filtrée d'où vient le formulaire (champ « back »), toujours dans l'admin.
function safeBack(request, fallback) {
  const back = safeNext(request.body?.back, fallback);
  return /^\/admin(\/|\?|#|$)/.test(back) ? back : fallback;
}
