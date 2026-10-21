import crypto from 'node:crypto';
import { noterLecture } from '../securite/donnees.js';
import { SpaceError, DOWNLOADS, LANGS, DAY, PURGE_AFTER, DEVICES_SIGNAL, endOfDay, parisDayOf, parseDay } from '../spaces.js';
import { showPassword } from '../passwords.js';
import { variantName, widthsFor } from '../images.js';
import { coverSet } from '../picture.js';
import { inviteMessage, passwordMessage } from '../prive-i18n.js';
import { insecables } from '../typographie.js';

// Admin « Galeries privées » (maquette MQ-18 ; étude, partie 2, § 2.4 et § 2.8 ; annexe de sécurité, § 5). Enregistré
// dans le plugin d'administration (session d'admin exigée, permission par route, CSRF sur chaque écriture).
// Portée sur le modèle de voyages.js (G56) : une galerie est celle d'un photographe, ou commune (author_id NULL, portée
// « tout » seulement, G1) ; contrôlée par request.owns(perm, galerie.author_id), jamais request.can seul (G55, C8). Une
// galerie hors portée est introuvable comme une galerie qui n'existe pas, et signalée à la Vigie (« hors portée », BV-14).
// Routes par identifiants numériques seulement : jamais de jeton dans une adresse, donc jamais dans audit_log (G13, C4).
// Lien et mot de passe : montrés une seule fois, sur une page GET « no-store » qui les lit dans une mémoire du serveur liée
// à la session (effacée à la première lecture) ; jamais dans un message flash, un journal ni une adresse (G22, G57).
// Création protégée contre le renvoi du formulaire (F5, « Précédent ») par un jeton de formulaire à usage unique (G57).
// Chaque action sur un accès est notée au journal d'audit avec son détail (identifiants, droits, durées ; jamais
// l'étiquette), et part vers la Vigie par server/spaces.js (BV-23). Lire les données d'un invité (fiche d'un accès,
// activité) est noté au journal et signalé comme lecture sensible (BV-24) ; l'export d'une sélection est un export.

const SECRET_TTL = 15 * 60e3;
const TOKEN_TTL = 6 * 3600e3;
const TABS = ['acces', 'photos', 'selections', 'activite', 'reglages'];

export function registerGaleries(app, { repo, render, P, W, done, failed }) {
  const { spaces } = app;
  // Espaces insécables des pages des galeries privées (lexique des maquettes, § 2), dans la langue de l'admin.
  app.addHook('onSend', async (request, reply, payload) => (typeof payload === 'string' && /^\/admin\/galeries(?:\/|$)/.test(request.routeOptions?.url || '')
    && /^text\/html/.test(String(reply.getHeader('content-type') || '')) ? insecables(payload, request.t?.lang) : payload));
  const secrets = new Map();            // « session:accès » → { link?, password?, at }
  const formTokens = new Map();         // « session:jeton » → { at, invite: id | null }
  const sweep = (map, ttl) => { const t = Date.now(); for (const [k, v] of map) if (t - v.at > ttl) map.delete(k); if (map.size > 2000) map.delete(map.keys().next().value); };
  const keep = (request, invId, data) => { sweep(secrets, SECRET_TTL); const k = `${request.session.id}:${invId}`; secrets.set(k, { ...(secrets.get(k) || {}), ...data, at: Date.now() }); };
  const take = (request, invId) => { const k = `${request.session.id}:${invId}`; const v = secrets.get(k); secrets.delete(k); return v && Date.now() - v.at <= SECRET_TTL ? v : null; };
  const newFormToken = request => { sweep(formTokens, TOKEN_TTL); const j = crypto.randomBytes(16).toString('base64url'); formTokens.set(`${request.session.id}:${j}`, { at: Date.now(), invite: null }); return j; };
  const formToken = (request, j) => (typeof j === 'string' && /^[\w-]{22}$/.test(j) ? formTokens.get(`${request.session.id}:${j}`) || null : null);

  const host = () => app.config.publicUrl.replace(/^https?:\/\//, '');
  const authorsById = () => new Map(repo.authors().map(a => [a.id, a]));
  const t0 = request => request.t;
  // Admin v2 : un geste qui se défait (réglages, ordre) part sans recharger et demande une réponse JSON (comme Instagram).
  const wantsJson = request => Boolean(request.headers.accept?.includes('application/json'));
  const fmtDate = (ms, t, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => new Intl.DateTimeFormat(t.locale, { ...opts, timeZone: 'Europe/Paris' }).format(ms);
  const fmtTime = (ms, t) => { const s = new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' }).format(ms); return t.lang === 'fr' ? s.replace(':', ' h ').replace(/^0/, '') : s; };
  const fmtDay = ms => fmtDate(ms, { locale: 'fr-FR' }).replace(/ | /g, ' ');
  const lu = (ms, t) => t('{date}, jusqu’à {time}', { date: fmtDate(ms, t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), time: fmtTime(ms, t) });

  // ---------- portée (BV-14) ----------
  const outOfScope = (request, perm, objet, id, ecriture) => app.securite.emit('authz_fail', { request, emetteur: 'server/routes/galeries.js · portée', detail: { raison: 'hors portée', permission: perm, objet, id, ecriture } });
  const writing = request => request.method !== 'GET' && request.method !== 'HEAD';
  function load(request) {
    const s = spaces.get(Number(request.params.id));
    if (!s) return null;
    if (request.owns('galeries.voir', s.author_id)) return s;
    outOfScope(request, request.routeOptions.config?.perm ?? 'galeries.voir', 'galerie', s.id, writing(request));
    return null;
  }
  const can = (request, perm, s) => request.owns(perm, s.author_id);
  function loadInvite(request, s) {
    const inv = spaces.invite(Number(request.params.inv));
    if (!inv) return null;
    if (inv.space_id !== s.id) {
      // L'accès d'une autre galerie, désigné sous celle-ci : signalé s'il est hors portée du compte.
      const other = spaces.get(inv.space_id);
      if (other && !request.owns('galeries.voir', other.author_id)) outOfScope(request, request.routeOptions.config?.perm ?? 'galeries.voir', 'acces', inv.id, writing(request));
      return null;
    }
    return inv;
  }
  // Une écriture que l'interface ne propose pas à ce compte (portée de l'action) : 403 et signalement (permission).
  const forbidUnless = (request, reply, perm, s) => (can(request, perm, s) ? false : (app.forbid(request, reply), true));

  // ---------- journal d'audit (BV-23) ----------
  const rightsText = r => [r.favoris ? 'favoris' : null, r.telechargement !== 'non' ? `téléchargement ${r.telechargement}` : null].filter(Boolean).join(', ') || 'voir seulement';
  function audit(request, action, s, inv = null, detail = '') {
    request.audited = true;
    app.audit.log({ sub: request.session.sub, name: request.session.name, action: `galerie privée : ${action}`, target: inv ? `galerie ${s.id} / accès ${inv.id}` : `galerie ${s.id}`, status: 200, detail });
  }
  // Lecture des données d'un invité (BV-24) : notée au journal et signalée à la Vigie (lecture sensible, numéro de l'accès).
  function sensitiveRead(request, s, inv, cible) {
    audit(request, `lecture (${cible})`, s, inv);
    noterLecture(request, { objet: inv ? 'acces' : 'galerie', id: inv ? inv.id : s.id, categorie: ['identite'] });
  }

  // ---------- vues ----------
  const STATE_LABEL = t => ({ brouillon: t('Brouillon'), ouverte: t('Ouverte'), fermee: t('Fermée') });
  function spaceView(request, s, authors = authorsById()) {
    const t = t0(request);
    const invites = spaces.invitesOf(s.id);
    const live = invites.filter(i => !i.revoked_at && i.expires_at > Date.now());
    const days = Math.ceil((s.closes_at - Date.now()) / DAY);
    const soon = s.state === 'ouverte' && days <= 7;
    const items = spaces.items(s.id);
    const last = invites.map(i => i.last_seen_at || 0).reduce((a, b) => Math.max(a, b), 0);
    const signals = [];
    for (const i of live) {
      if (i.selection_sent_at && !i.selection_seen_at) signals.push(t('Sélection envoyée par {name}', { name: firstOf(i.label) }));
      if (i.suspended_at) signals.push(t('Accès de {name} suspendu', { name: firstOf(i.label) }));
      else if (i.locked_until && i.locked_until > Date.now()) signals.push(t('Accès de {name} en pause', { name: firstOf(i.label) }));
      if (i.devices > DEVICES_SIGNAL) signals.push(t('Lien de {name} ouvert sur {n} appareils', { name: firstOf(i.label), n: i.devices }));
    }
    return { ...s, who: s.author_id ? authors.get(s.author_id)?.name || '' : t('commune'), nPhotos: items.length, nInvites: invites.length, nLive: live.length,
      nOpened: live.filter(i => i.first_opened_at).length, groups: live.filter(i => i.is_group).length, last, signals,
      hidden: spaces.hiddenFromGuests(s.id).length,
      stateKey: s.state === 'fermee' ? 'arret' : s.state === 'brouillon' ? 'afaire' : soon ? 'attention' : 'abouti',
      stateText: s.state === 'ouverte' && soon ? (days > 1 ? t('Ferme dans {n} jours', { n: days }) : t('Ferme demain')) : STATE_LABEL(t)[s.state],
      stateSec: s.state === 'ouverte' ? t('jusqu’au {date}', { date: fmtDate(s.closes_at, t) }) : s.state === 'fermee' ? t('le {date} · données des invités effacées le {purge}', { date: fmtDate(s.closed_at || s.closes_at, t), purge: fmtDate((s.closed_at || s.closes_at) + PURGE_AFTER, t) }) : t('l’équipe seule'),
      closesText: fmtDate(s.closes_at, t) };
  }
  // Signature des messages à l'invité : le photographe de la galerie, ou le nom du site pour une galerie commune.
  const signOf = s => (s.author_id ? authorsById().get(s.author_id)?.name : null) || app.siteName();
  const firstOf = label => String(label || '').split(/[,(]/)[0].trim().split(/\s+/)[0] || String(label || '');
  const INV_STATE = t => ({ envoye: [t('Envoyé, pas ouvert'), 'encours'], ouvert: [t('Ouvert'), 'abouti'], pause: [t('En pause'), 'attention'], suspendu: [t('Suspendu'), 'attention'],
    expire: [t('Expiré'), 'arret'], revoque: [t('Révoqué'), 'arret'] });
  function inviteView(request, s, inv) {
    const t = t0(request);
    const st = spaces.inviteState(inv, s);
    const [label, key] = INV_STATE(t)[st];
    const favs = spaces.favorites(inv.id);
    const soon = !['revoque', 'expire'].includes(st) && inv.expires_at - Date.now() <= 3 * DAY;
    return { ...inv, state: st, stateText: soon ? t('Expire dans {n} jours', { n: Math.max(1, Math.ceil((inv.expires_at - Date.now()) / DAY)) }) : label, stateKey: soon ? 'attention' : key, nFav: favs.length,
      rightsLabel: [t('Voir'), inv.rights.favoris ? t('choisir des favoris') : null, inv.rights.telechargement === 'web' ? t('télécharger en 2 048 px') : inv.rights.telechargement === 'grande' ? t('télécharger jusqu’à 4 000 px') : null].filter(Boolean).join(', '),
      expiresText: fmtDate(inv.expires_at, t), createdText: fmtDate(inv.created_at, t), lastText: inv.last_seen_at ? `${fmtDate(inv.last_seen_at, t, { day: 'numeric', month: 'short' })}, ${fmtTime(inv.last_seen_at, t)}` : t('jamais'),
      openedText: inv.first_opened_at ? t('le {date} à {time}', { date: fmtDate(inv.first_opened_at, t, { day: 'numeric', month: 'short' }), time: fmtTime(inv.first_opened_at, t) }) : null };
  }
  // Vignettes de l'admin des galeries (56 à 120 px de large) : la plus petite variante en src, et un srcset jusqu'à 640 px
  // (thumbSet) pour un écran à haute densité.
  const thumbOf = p => `/admin/media/${variantName(p.file, widthsFor(p.width)[0], 'webp', p.variant_key)}`;
  const thumbSetOf = p => coverSet(p, { w: 0, h: 0, base: '/admin/media/' }).srcset;
  const levelText = (lvl, t) => ({ ok: t('prête'), warn: t('à vérifier'), no: t('bloquée') })[lvl];
  const eventText = (e, t) => ({
    cree: t('Accès créé.'), lien_consulte: t('Lien consulté sans mot de passe.'), mot_de_passe_ok: t('Mot de passe accepté.'), mot_de_passe_refuse: t('Mot de passe refusé.'),
    verrou: t('Pause de sécurité après des refus.'), suspension: t('Accès suspendu après 30 refus.'), visite: t('Visite de la galerie.'), favori: t('Favori ajouté.'), favori_retire: t('Favori retiré.'),
    selection_envoyee: t('Sélection envoyée.'), selection_reprise: t('Sélection reprise par l’invité.'), telechargement: t('Photo téléchargée.'), archive: t('Archive téléchargée.'),
    quitte: t('L’invité a quitté la galerie.'), nouveau_lien: t('Nouveau lien.'), nouveau_mot_de_passe: t('Nouveau mot de passe.'), debloque: t('Accès débloqué.'), revoque: t('Accès révoqué.'),
  })[e.kind] || e.kind;
  const chrono = (rows, t, items = []) => {
    const byItem = new Map(items.map(p => [p.item_id, p.title]));
    return rows.map(e => ({ at: e.created_at, invite_id: e.invite_id, when: `${fmtDate(e.created_at, t, { day: 'numeric', month: 'short' })}, ${fmtTime(e.created_at, t)}`, text: eventText(e, t),
      photo: e.item_id ? byItem.get(e.item_id) || '' : '', net: e.ip ? `${e.ip}${e.country ? ` · ${e.country}` : ''}` : '', robot: Boolean(e.robot), antivirus: e.kind === 'lien_consulte' }));
  };
  const spaceErrors = (err, t) => Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, t.msg(v)]));

  // ---------- liste ----------
  app.get('/admin/galeries', P('galeries.voir'), async (request, reply) => {
    const t = request.t;
    const s = request.scope('galeries.voir');
    const authors = authorsById();
    // Admin v2 : trois vignettes par galerie (les mêmes variantes que les onglets d'une galerie), sans requête de plus par photo.
    let list = spaces.list().filter(x => request.owns('galeries.voir', x.author_id)).map(x => ({ ...spaceView(request, x, authors),
      strip: spaces.items(x.id).slice(0, 3).map(p => ({ thumb: thumbOf(p), thumbSet: thumbSetOf(p), width: p.width, height: p.height })) }));
    const counts = { toutes: list.length, ouverte: list.filter(x => x.state === 'ouverte').length, brouillon: list.filter(x => x.state === 'brouillon').length, fermee: list.filter(x => x.state === 'fermee').length };
    const etat = ['ouverte', 'brouillon', 'fermee'].includes(request.query.etat) ? request.query.etat : 'toutes';
    if (etat !== 'toutes') list = list.filter(x => x.state === etat);
    const de = s?.all && repo.authors().some(a => a.slug === request.query.de) ? request.query.de : '';
    if (de) list = list.filter(x => authors.get(x.author_id)?.slug === de);
    return render(request, reply, 'galeries', { title: t('Galeries privées'), list, counts, etat, de, authors: s?.all ? repo.authors() : [], canCreate: Boolean(request.can('galeries.gerer')),
      nInvites: list.reduce((n, x) => n + x.nLive, 0) });
  });

  // ---------- nouvelle galerie ----------
  const newSpaceForm = (request, reply, { values = {}, errors = null, code = 200 } = {}) => {
    const t = request.t;
    const s = request.scope('galeries.gerer');
    reply.code(code);
    return render(request, reply, 'galerie-form', { title: t('Nouvelle galerie'), values: { closes: fmtDay(endOfDay(parisDayOf(Date.now() + 60 * DAY))), ...values }, errors,
      authors: s?.all ? repo.authors() : [], allScope: Boolean(s?.all) });
  };
  app.get('/admin/galeries/nouvelle', P('galeries.gerer'), async (request, reply) => newSpaceForm(request, reply));
  app.post('/admin/galeries', W('galeries.gerer'), async (request, reply) => {
    const s = request.scope('galeries.gerer');
    const body = request.body || {};
    // Galerie commune (author_id vide) : portée « tout » seulement (G1) ; sinon, celle du photographe du compte.
    const wanted = Number(body.author_id) || null;
    const authorId = s.all ? (repo.authors().some(a => a.id === wanted) ? wanted : null) : s.authorId;
    if (!s.all && (!authorId || authorId < 0)) return failed(reply, '/admin/galeries', request.t('Aucun photographe lié à votre compte.'));
    if (!s.all && body.author_id !== undefined && Number(body.author_id) !== authorId) {
      app.securite.emit('input_validation_fail', { request, composant: 'site · admin', emetteur: 'server/routes/galeries.js · portée', detail: { raison: 'photographe hors portée', champ: 'author_id' } });
    }
    try {
      const id = spaces.createSpace(body, { authorId, by: request.session.sub });
      audit(request, 'galerie créée', spaces.get(id), null, `photographe ${authorId ?? 'commune'}`);
      return done(reply, `/admin/galeries/${id}/photos`, request.t('Galerie créée : ajoutez-y des photos, puis ouvrez-la.'));
    } catch (err) {
      if (!(err instanceof SpaceError)) throw err;
      return newSpaceForm(request, reply, { values: body, errors: spaceErrors(err, request.t), code: 422 });
    }
  });

  // ---------- fiche d'une galerie, en onglets ----------
  async function showSpace(request, reply, tab, extra = {}) {
    const s = load(request);
    if (!s) return reply.callNotFound();
    const t = request.t;
    const view = spaceView(request, s);
    const data = { title: s.title, s: view, tab, canManage: can(request, 'galeries.gerer', s), canShare: can(request, 'galeries.partager', s), tabs: TABS };
    const items = spaces.items(s.id, { withState: true });
    data.nSelections = spaces.invitesOf(s.id).filter(i => spaces.favorites(i.id).length).length;
    if (tab === 'acces') data.invites = spaces.invitesOf(s.id).map(i => inviteView(request, s, i));
    if (tab === 'photos') {
      data.items = items.map(p => ({ ...p, thumb: thumbOf(p), thumbSet: thumbSetOf(p), level: p.prive.level, levelText: levelText(p.prive.level, t), reasons: p.prive.reasons.map(x => t.msg(x)) }));
      // Ajouter une photo change son exposition : la lecture seule ne suffit pas.
      const inside = new Set(items.map(p => p.photo_id));
      const all = app.db.prepare('SELECT id, title, file, width, height, variant_key, author_id, status, taken_on FROM photos ORDER BY COALESCE(taken_on, \'\') DESC, id DESC LIMIT 400').all();
      data.candidates = request.mine('photos.modifier', all).filter(p => !inside.has(p.id)).slice(0, 200).map(p => ({ ...p, thumb: thumbOf(p), thumbSet: thumbSetOf(p) }));
      data.exifAll = (() => { try { return JSON.parse(app.db.prepare("SELECT value FROM settings WHERE key = 'exif'").pluck().get() || '{}').mode === 'all'; } catch { return false; } })();
    }
    if (tab === 'selections') {
      data.selections = spaces.invitesOf(s.id).map(i => ({ ...inviteView(request, s, i), favs: spaces.favorites(i.id).map(f => items.find(p => p.item_id === f.item_id)).filter(Boolean).map(p => ({ ...p, thumb: thumbOf(p), thumbSet: thumbSetOf(p) })) })).filter(i => i.favs.length || i.selection_sent_at);
      if (data.selections.length) sensitiveRead(request, s, null, 'sélections');
    }
    if (tab === 'activite') {
      const labels = new Map(spaces.invitesOf(s.id).map(i => [i.id, i.label]));
      data.events = chrono(spaces.spaceEvents(s.id), t, items).map(e => ({ ...e, who: e.invite_id ? labels.get(e.invite_id) || t('accès effacé') : '' }));
      sensitiveRead(request, s, null, 'activité');
    }
    if (tab === 'reglages') {
      data.values = { ...s, closes: fmtDay(s.closes_at), ...(extra.values || {}) };
      data.confirmSupprimer = confirmSupprimer(request, s);
      data.confirmFermer = confirmFermer(request, s);
    }
    return render(request, reply, 'galerie', { ...data, ...extra });
  }
  app.get('/admin/galeries/:id', P('galeries.voir'), async (request, reply) => showSpace(request, reply, 'acces'));
  for (const tab of TABS) app.get(`/admin/galeries/:id/${tab}`, P('galeries.voir'), async (request, reply) => showSpace(request, reply, tab));

  // « Voir comme un invité » (G60) : la galerie en vue équipe, sans mot de passe ni événement noté.
  app.get('/admin/galeries/:id/apercu', P('galeries.voir'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    return reply.redirect(`/prive/${s.public_id}`, 303);
  });

  // ---------- réglages, ouverture, fermeture, suppression ----------
  app.post('/admin/galeries/:id', W('galeries.gerer'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.gerer', s)) return reply;
    try {
      // Les fins d'accès avant la mise à jour : avancer la fermeture raccourcit les accès plus longs, ce qui ne se défait pas.
      const ends = new Map(spaces.invitesOf(s.id).map(i => [i.id, i.expires_at]));
      const after = spaces.updateSpace(s.id, request.body || {});
      audit(request, 'réglages', s, null, after.closes_at !== s.closes_at ? `fermeture dans ${Math.round((after.closes_at - Date.now()) / DAY)} jours` : '');
      if (wantsJson(request)) {
        const shortened = spaces.invitesOf(s.id).filter(i => i.expires_at < ends.get(i.id)).length;
        return { ok: true, text: request.t('Galerie enregistrée.'), closes: fmtDay(after.closes_at), reversible: shortened === 0 };
      }
      return done(reply, `/admin/galeries/${s.id}/reglages`, request.t('Galerie enregistrée.'));
    } catch (err) {
      if (!(err instanceof SpaceError)) throw err;
      reply.code(422);
      if (wantsJson(request)) return { error: Object.values(spaceErrors(err, request.t))[0], errors: spaceErrors(err, request.t) };
      return showSpace(request, reply, 'reglages', { errors: spaceErrors(err, request.t), values: request.body || {} });
    }
  });
  for (const [path, state, msg] of [['ouvrir', 'ouverte', 'Galerie ouverte : ses accès marchent.'], ['fermer', 'fermee', 'Galerie fermée : ses accès ne marchent plus.']]) {
    app.post(`/admin/galeries/:id/${path}`, W('galeries.gerer'), async (request, reply) => {
      const s = load(request);
      if (!s) return reply.callNotFound();
      if (forbidUnless(request, reply, 'galeries.gerer', s)) return reply;
      try { spaces.setState(s.id, state, request); } catch (err) {
        if (!(err instanceof SpaceError)) throw err;
        return failed(reply, `/admin/galeries/${s.id}/reglages`, request.t.msg(err.message));
      }
      audit(request, state === 'ouverte' ? 'galerie ouverte' : 'galerie fermée', s);
      return done(reply, `/admin/galeries/${s.id}`, request.t(msg));
    });
  }
  // Les mêmes mots sur la page de confirmation (v1, et v2 sans le dialogue) et dans le dialogue de la v2 (MQ-09 : ce qui ne se défait pas).
  const confirmSupprimer = (request, s) => { const t = request.t; return { id: 'supprimer', title: t('Supprimer la galerie'), action: `/admin/galeries/${s.id}/supprimer`, back: `/admin/galeries/${s.id}/reglages`,
    question: t('Supprimer la galerie « {title} » ?', { title: s.title }), text: t('Tous ses accès cessent de marcher tout de suite, puis la galerie, ses accès, leur journal et leurs favoris sont effacés. Rien ne pourra être rétabli.'),
    consequences: [t('Les photos ne sont ni supprimées ni dépubliées : elles restent dans la photothèque.')], button: t('Supprimer la galerie') }; };
  // Fermer : les autorisations des invités tombent, elles ne reviennent pas avec « Ouvrir » (G63) : un dialogue, pas « Défaire ».
  const confirmFermer = (request, s) => { const t = request.t; return { id: 'fermer', title: t('Fermer la galerie'), action: `/admin/galeries/${s.id}/fermer`, back: `/admin/galeries/${s.id}/reglages`,
    question: t('Fermer la galerie « {title} » ?', { title: s.title }), text: t('Tous ses accès cessent de marcher tout de suite et les personnes qui la regardent en sont déconnectées. Vous pourrez la rouvrir.'),
    consequences: [t('Rouvrir la galerie ne reconnecte personne : chacun devra saisir de nouveau son mot de passe.'), t('Les photos, les accès et les favoris sont gardés.')], button: t('Fermer la galerie'), plain: true }; };
  app.get('/admin/galeries/:id/supprimer', P('galeries.gerer'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.gerer', s)) return reply;
    return render(request, reply, 'galerie-confirmer', { ...confirmSupprimer(request, s), s: spaceView(request, s) });
  });
  app.post('/admin/galeries/:id/supprimer', W('galeries.gerer'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.gerer', s)) return reply;
    for (const inv of spaces.invitesOf(s.id)) spaces.exposure(request, 'efface', { space: s, invite: inv });
    spaces.removeSpace(s.id);
    audit(request, 'galerie supprimée', s);
    return done(reply, '/admin/galeries', request.t('Galerie « {title} » supprimée : ses photos restent dans la photothèque.', { title: s.title }));
  });

  // ---------- photos de la galerie (G2, G61) ----------
  app.post('/admin/galeries/:id/photos', W('galeries.gerer'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.gerer', s)) return reply;
    const ids = [].concat(request.body?.photos || []).map(Number).filter(Number.isInteger).slice(0, 500);
    // Seulement des photos que le compte peut modifier ; une autre est un geste que l'interface ne propose pas (BV-14).
    const rows = ids.map(id => repo.photo(id)).filter(Boolean);
    const editable = rows.filter(p => request.owns('photos.modifier', p.author_id));
    if (editable.length < rows.length) outOfScope(request, 'photos.modifier', 'photo', rows.find(p => !request.owns('photos.modifier', p.author_id)).id, true);
    const r = spaces.addPhotos(s.id, editable.map(p => p.id));
    audit(request, 'photos ajoutées', s, null, `${r.added.length} ajoutées, ${r.blocked.length} refusées (bloquées)`);
    const t = request.t;
    const msg = r.added.length > 1 ? t('{n} photos ajoutées à la galerie.', { n: r.added.length }) : r.added.length ? t('1 photo ajoutée à la galerie.') : t('Aucune photo ajoutée.');
    return (r.blocked.length ? failed : done)(reply, `/admin/galeries/${s.id}/photos`, r.blocked.length ? `${msg} ${t('Refusées, une personne photographiée ayant refusé : {titles}.', { titles: r.blocked.join(', ') })}` : msg);
  });
  for (const [path, label] of [['retirer', 'photo retirée'], ['confirmer', 'usage privé confirmé'], ['monter', 'ordre'], ['descendre', 'ordre']]) {
    app.post(`/admin/galeries/:id/photos/:item/${path}`, W('galeries.gerer'), async (request, reply) => {
      const s = load(request);
      if (!s) return reply.callNotFound();
      if (forbidUnless(request, reply, 'galeries.gerer', s)) return reply;
      const item = Number(request.params.item);
      const row = spaces.item(s.id, item);
      if (!row) return reply.callNotFound();
      if (path === 'confirmer' && !request.owns('photos.modifier', repo.photo(row.photo_id)?.author_id)) return reply.callNotFound();
      if (path === 'retirer') spaces.removeItem(s.id, item);
      else if (path === 'confirmer') spaces.confirmItem(s.id, item, request.session.name || request.session.sub);
      else spaces.moveItem(s.id, item, path === 'monter' ? 'haut' : 'bas');
      audit(request, label, s, null, `photo de la galerie ${item}`);
      if (wantsJson(request) && (path === 'monter' || path === 'descendre')) return { ok: true, text: request.t('Ordre enregistré.') };
      const back = String(request.body?.retour || '') === 'nouvel-acces' ? `/admin/galeries/${s.id}/acces/nouveau` : `/admin/galeries/${s.id}/photos#photo-${item}`;
      return done(reply, back, { retirer: request.t('Photo retirée de la galerie (elle reste dans la photothèque).'), confirmer: request.t('Usage privé confirmé pour cette photo.'), monter: request.t('Ordre enregistré.'), descendre: request.t('Ordre enregistré.') }[path]);
    });
  }

  // ---------- nouvel accès (G57) ----------
  function newInviteForm(request, reply, s, { values = {}, errors = null, code = 200 } = {}) {
    const t = request.t;
    const def = spaces.defaultEnd(s);
    const day30 = endOfDay(parisDayOf(Date.now() + 30 * DAY));
    const v = { label: '', groupe: '0', lang: 'fr', expires: fmtDay(Math.min(def, s.closes_at)), favoris: '1', ...values };
    const parsed = (d => (d ? endOfDay(d) : null))(parseDay(v.expires));
    const items = spaces.items(s.id, { withState: true });
    reply.code(code);
    return render(request, reply, 'galerie-nouvel-acces', { title: t('Nouvel accès'), s: spaceView(request, s), values: v, errors, jeton: newFormToken(request),
      pills: [{ value: fmtDay(Math.min(day30, s.closes_at)), label: day30 < s.closes_at ? t('Dans 30 jours, le {date}', { date: fmtDate(day30, t, { day: 'numeric', month: 'short' }) }) : null },
        { value: fmtDay(s.closes_at), label: t('À la fermeture de la galerie, le {date}', { date: fmtDate(s.closes_at, t, { day: 'numeric', month: 'short' }) }) }].filter(p => p.label),
      lu: parsed ? lu(parsed, t) : '', items: items.map(p => ({ ...p, thumb: thumbOf(p), thumbSet: thumbSetOf(p) })), toCheck: items.filter(p => p.prive.level === 'warn' && !p.confirmed_at),
      otherInvites: spaces.invitesOf(s.id).filter(i => !i.revoked_at).length,
      message: inviteMessage(LANGS.includes(v.lang) ? v.lang : 'fr', { title: spaces.titleOf(s, LANGS.includes(v.lang) ? v.lang : 'fr'), link: null, who: signOf(s), until: parsed || def, host: host() }) });
  }
  app.get('/admin/galeries/:id/acces/nouveau', P('galeries.partager'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.partager', s)) return reply;
    return newInviteForm(request, reply, s);
  });
  app.post('/admin/galeries/:id/acces', W('galeries.partager'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.partager', s)) return reply;
    const body = request.body || {};
    // Choix rapide d'une date (bouton d'envoi, sans script) : le formulaire revient avec la date, rien n'est créé.
    if (body.fin_rapide) return newInviteForm(request, reply, s, { values: { ...body, expires: String(body.fin_rapide).slice(0, 40) } });
    // Jeton de formulaire à usage unique : un renvoi (F5, « Précédent ») ne crée pas un second accès.
    const ft = formToken(request, body.jeton);
    if (!ft) return newInviteForm(request, reply, s, { values: body, errors: { jeton: request.t('Ce formulaire a expiré : vérifiez les champs, puis créez l’accès.') }, code: 422 });
    if (ft.invite) return done(reply, `/admin/galeries/${s.id}/acces/${ft.invite}`, request.t('Cet accès est déjà créé : le lien et le mot de passe ont été montrés une seule fois.'));
    if (!LANGS.includes(body.lang) && body.lang !== undefined) app.securite.emit('input_validation_fail', { request, composant: 'site · admin', emetteur: 'server/routes/galeries.js · accès', detail: { raison: 'valeur hors liste', champ: 'lang' } });
    try {
      const r = await spaces.createInvite(s.id, body, { by: request.session.sub, request });
      ft.invite = r.id;
      keep(request, r.id, { link: `${app.config.publicUrl}/g/${r.token}`, password: r.password });
      const inv = spaces.invite(r.id);
      audit(request, 'accès créé', s, inv, `${rightsText(inv.rights)} ; ${inv.is_group ? 'lien de groupe' : 'lien personnel'} ; fin dans ${Math.round((inv.expires_at - Date.now()) / DAY)} jours`);
      return reply.header('cache-control', 'no-store').redirect(`/admin/galeries/${s.id}/acces/${r.id}/secrets`, 303);
    } catch (err) {
      if (!(err instanceof SpaceError)) throw err;
      return newInviteForm(request, reply, s, { values: body, errors: spaceErrors(err, request.t), code: 422 });
    }
  });

  // Lien et mot de passe, une seule fois (G7, G57).
  app.get('/admin/galeries/:id/acces/:inv/secrets', P('galeries.partager'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    const inv = loadInvite(request, s);
    if (!inv) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.partager', s)) return reply;
    const sec = take(request, inv.id);
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    const view = spaceView(request, s), pw = sec?.password ? showPassword(sec.password) : null;
    return render(request, reply, 'galerie-secrets', { title: request.t('Accès de {name}', { name: inv.label }), s: view, inv: inviteView(request, s, inv),
      secret: sec ? { link: sec.link || null, password: pw } : null, who: view.who, first: firstOf(inv.label),
      mail: sec?.link ? inviteMessage(inv.lang, { title: spaces.titleOf(s, inv.lang), link: sec.link, who: signOf(s), until: Math.min(inv.expires_at, s.closes_at), host: host() }).join('\n\n') : null,
      sms: pw ? passwordMessage(inv.lang, { password: pw, who: signOf(s) }) : null });
  });

  // ---------- suivi d'un accès ----------
  async function showInvite(request, reply, extra = {}) {
    const s = load(request);
    if (!s) return reply.callNotFound();
    const inv = loadInvite(request, s);
    if (!inv) return reply.callNotFound();
    const t = request.t;
    const items = spaces.items(s.id);
    const v = inviteView(request, s, inv);
    // Vue par l'équipe : la sélection envoyée se fige pour l'invité (MQ-18 ; « Rouvrir » la lui rend).
    if (inv.selection_sent_at && !inv.selection_seen_at && can(request, 'galeries.gerer', s)) spaces.markSeen(inv);
    sensitiveRead(request, s, inv, 'fiche d’un accès');
    const favs = spaces.favorites(inv.id).map(f => ({ ...items.find(p => p.item_id === f.item_id), added: f.added_at })).filter(p => p.item_id).map(p => ({ ...p, thumb: thumbOf(p), thumbSet: thumbSetOf(p), when: fmtTime(p.added, t) }));
    const day = parisDayOf(Math.min(inv.expires_at, s.closes_at));
    // Admin v2 : les confirmations en dialogues (mêmes mots que les pages de confirmation) ; le lien et le mot de passe d'un
    // nouvel accès ne se montrent toujours qu'une fois, sur la page des secrets.
    const confirms = Object.keys(CONFIRM).map(path => confirmInvite(request, s, inv, path));
    return render(request, reply, 'galerie-acces', { title: t('Accès de {name}', { name: inv.label }), s: spaceView(request, s), inv: v, favs, confirms, events: chrono(spaces.eventsOf(inv.id), t, items),
      canShare: can(request, 'galeries.partager', s), canManage: can(request, 'galeries.gerer', s), nPhotos: items.length,
      values: { expires: fmtDay(inv.expires_at), favoris: inv.rights.favoris ? '1' : '', telecharger: inv.rights.telechargement !== 'non' ? '1' : '', grande: inv.rights.telechargement === 'grande' ? '1' : '', ...(extra.values || {}) },
      lu: lu(inv.expires_at, t), closesText: fmtDate(s.closes_at, t), purgeText: fmtDate(Math.max(inv.expires_at, inv.ended_at || 0) + PURGE_AFTER, t), sentText: inv.selection_sent_at ? `${fmtDate(inv.selection_sent_at, t, { day: 'numeric', month: 'short' })}, ${fmtTime(inv.selection_sent_at, t)}` : '',
      lockedText: inv.locked_until && inv.locked_until > Date.now() ? fmtTime(inv.locked_until, t) : '', day, ...extra });
  }
  app.get('/admin/galeries/:id/acces/:inv', P('galeries.voir'), async (request, reply) => showInvite(request, reply));
  app.post('/admin/galeries/:id/acces/:inv', W('galeries.partager'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    const inv = loadInvite(request, s);
    if (!inv) return reply.callNotFound();
    if (forbidUnless(request, reply, 'galeries.partager', s)) return reply;
    try {
      const after = spaces.updateInvite(inv.id, request.body || {}, request);
      audit(request, 'accès modifié', s, after, `${rightsText(after.rights)} ; fin dans ${Math.round((after.expires_at - Date.now()) / DAY)} jours`);
      if (wantsJson(request)) return { ok: true, text: request.t('Accès enregistré.'), expires: fmtDay(after.expires_at), lu: lu(after.expires_at, request.t) };
      return done(reply, `/admin/galeries/${s.id}/acces/${inv.id}`, request.t('Accès enregistré.'));
    } catch (err) {
      if (!(err instanceof SpaceError)) throw err;
      reply.code(422);
      if (wantsJson(request)) return { error: Object.values(spaceErrors(err, request.t))[0], errors: spaceErrors(err, request.t) };
      return showInvite(request, reply, { errors: spaceErrors(err, request.t), values: request.body || {} });
    }
  });

  // Gestes qui demandent une confirmation (sans script, la question sur une page ; MQ-18 repères 18 et 19).
  const CONFIRM = {
    revoquer: t => ({ title: t('Révoquer l’accès'), question: name => t('Révoquer l’accès de {name} ?', { name }), text: t('Son lien et son mot de passe cessent de marcher tout de suite. Sa sélection reste visible ici. Pour lui rendre l’accès, il faudra en créer un nouveau.'),
      consequences: [t('Si la galerie est ouverte chez la personne, la page suivante lui dira que l’accès n’est plus valable.'), t('Les photos ne sont ni supprimées ni dépubliées.')], button: name => t('Révoquer l’accès de {name}', { name }) }),
    effacer: t => ({ title: t('Effacer l’accès et ses données'), question: name => t('Effacer l’accès de {name} et ses données ?', { name }), text: t('L’accès cesse de marcher tout de suite, puis tout ce qui le concerne est effacé. Rien ne pourra être rétabli.'),
      consequences: [t('Effacés : son nom, l’activité de cet accès, ses favoris et la sélection envoyée.'), t('Gardés : la galerie et ses photos.'), t('Besoin de sa sélection ? Exportez-la d’abord.')], button: () => t('Effacer l’accès et ses données') }),
    'nouveau-lien': t => ({ title: t('Nouveau lien'), question: name => t('Donner un nouveau lien à {name} ?', { name }), text: t('L’ancien lien cesse de marcher aussitôt ; le mot de passe reste le même. Le nouveau lien s’affiche une seule fois.'), consequences: [], button: () => t('Créer un nouveau lien'), plain: true }),
    'nouveau-mot-de-passe': t => ({ title: t('Nouveau mot de passe'), question: name => t('Donner un nouveau mot de passe à {name} ?', { name }), text: t('L’ancien mot de passe cesse de marcher aussitôt ; le lien reste le même, et une pause ou une suspension en cours est levée. Le nouveau mot de passe s’affiche une seule fois.'), consequences: [], button: () => t('Créer un nouveau mot de passe'), plain: true }),
  };
  function confirmInvite(request, s, inv, path) {
    const c = CONFIRM[path](request.t);
    return { id: path, title: c.title, action: `/admin/galeries/${s.id}/acces/${inv.id}/${path}`, back: `/admin/galeries/${s.id}/acces/${inv.id}`,
      question: c.question(inv.label), text: c.text, consequences: c.consequences, button: c.button(inv.label), plain: Boolean(c.plain) };
  }
  for (const path of Object.keys(CONFIRM)) {
    app.get(`/admin/galeries/:id/acces/:inv/${path}`, P('galeries.partager'), async (request, reply) => {
      const s = load(request);
      if (!s) return reply.callNotFound();
      const inv = loadInvite(request, s);
      if (!inv) return reply.callNotFound();
      if (forbidUnless(request, reply, 'galeries.partager', s)) return reply;
      return render(request, reply, 'galerie-confirmer', { ...confirmInvite(request, s, inv, path), s: spaceView(request, s) });
    });
  }
  const inviteAction = (path, fn) => app.post(`/admin/galeries/:id/acces/:inv/${path}`, W(path === 'selection/rouvrir' ? 'galeries.gerer' : 'galeries.partager'), async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    const inv = loadInvite(request, s);
    if (!inv) return reply.callNotFound();
    if (forbidUnless(request, reply, request.routeOptions.config.perm, s)) return reply;
    return fn(request, reply, s, inv);
  });
  inviteAction('revoquer', async (request, reply, s, inv) => {
    spaces.revoke(inv.id, request);
    audit(request, 'accès révoqué', s, inv);
    return done(reply, `/admin/galeries/${s.id}`, request.t('Accès de {name} révoqué.', { name: inv.label }));
  });
  inviteAction('effacer', async (request, reply, s, inv) => {
    spaces.erase(inv.id, request);
    audit(request, 'accès effacé avec ses données', s, inv);
    return done(reply, `/admin/galeries/${s.id}`, request.t('Accès effacé, avec ses données.'));
  });
  inviteAction('debloquer', async (request, reply, s, inv) => {
    spaces.unlock(inv.id, request);
    audit(request, inv.suspended_at ? 'accès débloqué après une suspension' : 'accès débloqué', s, inv);
    return done(reply, `/admin/galeries/${s.id}/acces/${inv.id}`, request.t('Accès débloqué : la personne peut réessayer tout de suite.'));
  });
  inviteAction('nouveau-lien', async (request, reply, s, inv) => {
    if (inv.revoked_at) return failed(reply, `/admin/galeries/${s.id}/acces/${inv.id}`, request.t('Cet accès est révoqué : créez-en un nouveau.'));
    const token = spaces.newLink(inv.id, request);
    keep(request, inv.id, { link: `${app.config.publicUrl}/g/${token}`, password: null });
    audit(request, 'nouveau lien', s, inv);
    return reply.header('cache-control', 'no-store').redirect(`/admin/galeries/${s.id}/acces/${inv.id}/secrets`, 303);
  });
  inviteAction('nouveau-mot-de-passe', async (request, reply, s, inv) => {
    if (inv.revoked_at) return failed(reply, `/admin/galeries/${s.id}/acces/${inv.id}`, request.t('Cet accès est révoqué : créez-en un nouveau.'));
    const password = await spaces.newPassword(inv.id, request);
    keep(request, inv.id, { link: null, password });
    audit(request, 'nouveau mot de passe', s, inv);
    return reply.header('cache-control', 'no-store').redirect(`/admin/galeries/${s.id}/acces/${inv.id}/secrets`, 303);
  });
  inviteAction('selection/rouvrir', async (request, reply, s, inv) => {
    spaces.reopen(inv);
    audit(request, 'sélection rouverte', s, inv);
    return done(reply, `/admin/galeries/${s.id}/acces/${inv.id}`, request.t('Sélection rouverte : la personne peut de nouveau changer ses favoris.'));
  });

  // Export de la sélection (G53) : références et noms de fichiers d'origine. Un export de données d'invité : noté au
  // journal et signalé à la Vigie (config.audit, BV-24). Cellules neutralisées (= + - @ en tête).
  const cell = v => { const s = String(v ?? '').replace(/"/g, '""'); return `"${/^[=+\-@\t\r]/.test(s) ? `'${s}` : s}"`; };
  app.get('/admin/galeries/:id/acces/:inv/selection.csv', { config: { perm: 'galeries.voir', audit: true } }, async (request, reply) => {
    const s = load(request);
    if (!s) return reply.callNotFound();
    const inv = loadInvite(request, s);
    if (!inv) return reply.callNotFound();
    const items = spaces.items(s.id);
    const rows = spaces.favorites(inv.id).map(f => items.find(p => p.item_id === f.item_id)).filter(Boolean);
    noterLecture(request, { objet: 'acces', id: inv.id, categorie: ['image'] });
    const csv = [['position', 'titre', 'fichier d’origine', 'adresse'].map(cell).join(';'), ...rows.map(p => [p.n, p.title, p.source_name || '', p.status === 'published' ? `${app.config.publicUrl}/photo/${p.slug}` : ''].map(cell).join(';'))].join('\r\n');
    return reply.header('cache-control', 'no-store').header('content-disposition', `attachment; filename="selection-galerie-${s.id}-acces-${inv.id}.csv"`).type('text/csv; charset=utf-8').send(`﻿${csv}\r\n`);
  });

  return { DOWNLOADS };
}
