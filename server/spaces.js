import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { monthYear } from './format.js';
import { pick } from './i18n.js';
import { truncateIp } from './ip.js';
import { generatePassword, hashPassword } from './passwords.js';
import { hashToken } from './visitor-sessions.js';
import { BOTS, countryOf } from './stats.js';
import { facesOf } from './readiness.js';

// Galeries privées (étude docs/etudes/blog-galeries-boutique.md, partie 2 ; annexe de sécurité ; décisions « Tranché »
// de docs/etudes/vigie-besoins-des-briques.md). Un seul module pour l'état des galeries, de leurs photos et de leurs
// accès, et le seul point d'émission vers la Vigie des accès donnés, élargis ou retirés (BV-23) : les routes de l'admin
// (server/routes/galeries.js) et celles des invités (server/routes/prive.js) passent par lui.
//
// Durées (Tranché 2) : un accès dure 30 jours par défaut, 6 mois au plus, jamais au-delà de la fermeture de la galerie.
// Essais (Tranché 3, G19) : 5 refus de suite → 1 min de pause ; 10 → 15 min (puis tous les 5) ; 30 sans succès →
// suspension, levée par l'équipe. Appareils (Tranché 4, G31) : signal à 3, aucun refus. Lien de groupe permis et signalé
// (Tranché 6). Téléchargement : non, web (2 048 px), grande (4 000 px au plus, Tranché 7).
// Autorisations (G26) : 12 h sans visite et 7 jours au plus ; 30 jours avec « se souvenir » ; jamais au-delà de l'accès.
// Purges (G71, § 2.7) : un accès fini (révoqué, effacé ou échu) est effacé 6 mois après, avec son journal, ses favoris
// et ses appareils ; une galerie fermée garde ses photos et ses textes jusqu'à sa suppression.

export const DAY = 864e5;
export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 183;
export const GRANT_IDLE = 12 * 3600e3;
export const GRANT_MAX = 7 * DAY;
export const REMEMBER = 30 * DAY;
export const PURGE_AFTER = 183 * DAY;
export const DEVICES_SIGNAL = 3;
export const LIMITS = { pause1: 5, pause15: 10, suspend: 30 };
export const SIZES = { web: 2048, grande: 4000 };
export const DOWNLOADS = ['non', 'web', 'grande'];
export const STATES = ['brouillon', 'ouverte', 'fermee'];
export const LANGS = ['fr', 'en', 'de'];
const PID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const PID_RE = /^[A-Za-z0-9]{12}$/;
export const TOKEN_RE = /^[\w-]{32}$/;

export class SpaceError extends Error {
  constructor(errors) { super(Object.values(errors)[0]); this.errors = errors; }
}

const newPid = () => Array.from({ length: 12 }, () => PID_CHARS[crypto.randomInt(PID_CHARS.length)]).join('');
export const newLinkToken = () => crypto.randomBytes(24).toString('base64url');   // 192 bits, 32 caractères (G6)
const parseRights = v => { try { const r = JSON.parse(v || '{}'); return { favoris: r.favoris !== false, telechargement: DOWNLOADS.includes(r.telechargement) ? r.telechargement : 'non' }; } catch { return { favoris: true, telechargement: 'non' }; } };

// Fin de journée (23 h 59 à Paris) d'un jour « AAAA-MM-JJ » : un accès « jusqu'au 30 nov. » vaut toute la journée.
export function endOfDay(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return null;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  if (Number.isNaN(guess) || new Date(guess).toISOString().slice(0, 10) !== day) return null;
  // Décalage de Paris ce jour-là (heure d'été ou d'hiver).
  const paris = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return guess - (paris - utc);
}
export const parisDayOf = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

// Saisie libre d'une date (« 30/11/2026 », « 30 nov. 2026 », « 2026-11-30 », « 30 nov. ») : jour « AAAA-MM-JJ », ou null.
const MONTHS = { janv: 1, jan: 1, janvier: 1, january: 1, januar: 1, jän: 1, fevr: 2, févr: 2, fev: 2, fév: 2, février: 2, fevrier: 2, feb: 2, february: 2, februar: 2,
  mars: 3, mar: 3, march: 3, märz: 3, maerz: 3, avr: 4, avril: 4, apr: 4, april: 4, mai: 5, may: 5, juin: 6, jun: 6, june: 6, juni: 6,
  juil: 7, juillet: 7, jul: 7, july: 7, juli: 7, aout: 8, août: 8, aug: 8, august: 8, sept: 9, sep: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10, okt: 10, oktober: 10, nov: 11, novembre: 11, november: 11, dec: 12, déc: 12, décembre: 12, decembre: 12, december: 12, dez: 12, dezember: 12 };
export function parseDay(input, ref = Date.now()) {
  const s = String(input ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s || s.length > 40) return null;
  const pad = n => String(n).padStart(2, '0');
  const ok = (y, m, d) => { const day = `${y}-${pad(m)}-${pad(d)}`; return endOfDay(day) ? day : null; };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return ok(m[1], m[2], m[3]);
  m = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})$/.exec(s);
  if (m) return ok(m[3].length === 2 ? `20${m[3]}` : m[3], m[2], m[1]);
  m = /^(?:[a-zäéû]+\.? )?(\d{1,2})(?:er)?\.? ([a-zäéû]+)\.?(?: (\d{4}))?$/.exec(s);
  if (m && MONTHS[m[2]]) {
    const refYear = Number(parisDayOf(ref).slice(0, 4));
    let y = m[3] ? Number(m[3]) : refYear;
    let day = ok(y, MONTHS[m[2]], m[1]);
    if (day && !m[3] && endOfDay(day) < ref) { y += 1; day = ok(y, MONTHS[m[2]], m[1]); }
    return day;
  }
  return null;
}

export function createSpaces({ db, vault, readiness, encounters, storageDir, securite = () => null, variants = () => null, trustCountry = false, now = Date.now }) {
  const sec = () => securite() || { emit: () => null };
  const privateDir = path.join(storageDir, 'private');
  const q = {
    space: db.prepare('SELECT * FROM private_spaces WHERE id = ?'),
    byPid: db.prepare('SELECT * FROM private_spaces WHERE public_id = ?'),
    spaces: db.prepare('SELECT * FROM private_spaces ORDER BY (state = \'fermee\'), closes_at, id'),
    insertSpace: db.prepare(`INSERT INTO private_spaces (public_id, author_id, title, title_en, title_de, intro, intro_en, intro_de, state, closes_at, created_by, created_at, updated_at)
      VALUES (@public_id, @author_id, @title, @title_en, @title_de, @intro, @intro_en, @intro_de, 'brouillon', @closes_at, @created_by, @t, @t)`),
    items: db.prepare(`SELECT i.id AS item_id, i.position AS item_position, i.confirmed_by, i.confirmed_at, i.photo_id, p.id, p.slug, p.title, p.title_en, p.title_de, p.place, p.place_en, p.place_de,
      p.legend, p.legend_en, p.legend_de, p.alt_text, p.alt_text_en, p.alt_text_de, p.taken_on, p.status, p.file, p.width, p.height, p.variant_key, p.source_name, p.faces, p.faces_override,
      a.id AS author_id, a.name AS author
      FROM space_items i JOIN photos p ON p.id = i.photo_id JOIN authors a ON a.id = p.author_id WHERE i.space_id = ? ORDER BY i.position, i.id`),
    item: db.prepare('SELECT * FROM space_items WHERE id = ? AND space_id = ?'),
    hasPhoto: db.prepare('SELECT 1 FROM space_items i JOIN photos p ON p.id = i.photo_id WHERE i.space_id = ? AND p.file = ?'),
    maxPos: db.prepare('SELECT COALESCE(MAX(position), 0) FROM space_items WHERE space_id = ?').pluck(),
    addItem: db.prepare('INSERT OR IGNORE INTO space_items (space_id, photo_id, position, added_at) VALUES (?, ?, ?, ?)'),
    invite: db.prepare('SELECT * FROM space_invites WHERE id = ?'),
    invites: db.prepare('SELECT * FROM space_invites WHERE space_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC, id DESC'),
    byToken: db.prepare('SELECT * FROM space_invites WHERE token_hash = ?'),
    oldLink: db.prepare('SELECT o.*, i.space_id FROM space_invite_old_links o JOIN space_invites i ON i.id = o.invite_id WHERE o.token_hash = ?'),
    insertInvite: db.prepare(`INSERT INTO space_invites (space_id, token_hash, password_hash, label, lang, is_group, rights, expires_at, created_by, created_at)
      VALUES (@space_id, @token_hash, @password_hash, @label, @lang, @is_group, @rights, @expires_at, @created_by, @t)`),
    grants: db.prepare('SELECT * FROM visitor_grants WHERE session_id = ?'),
    grantsOfInvite: db.prepare('SELECT session_id FROM visitor_grants WHERE invite_id = ?').pluck(),
    devices: db.prepare('SELECT COUNT(*) FROM space_invite_devices WHERE invite_id = ?').pluck(),
    favorites: db.prepare('SELECT f.item_id, f.added_at FROM space_favorites f JOIN space_items i ON i.id = f.item_id WHERE f.invite_id = ? ORDER BY f.added_at'),
    events: db.prepare('SELECT * FROM space_events WHERE invite_id = ? ORDER BY created_at DESC, id DESC LIMIT 200'),
    spaceEvents: db.prepare('SELECT * FROM space_events WHERE space_id = ? ORDER BY created_at DESC, id DESC LIMIT 300'),
  };

  // ---------- galeries ----------
  const titleOf = (s, lang) => pick(s, 'title', lang);
  function checkClose(s) {
    // Fermeture automatique à l'échéance (G3) : vue à chaque lecture, et par la tâche horaire.
    if (s && s.state === 'ouverte' && s.closes_at <= now()) {
      db.prepare("UPDATE private_spaces SET state = 'fermee', closed_at = ?, updated_at = ? WHERE id = ?").run(s.closes_at, now(), s.id);
      return { ...s, state: 'fermee', closed_at: s.closes_at };
    }
    return s;
  }
  const get = id => checkClose(q.space.get(Number(id)) || null);
  const byPid = pid => (PID_RE.test(String(pid || '')) ? checkClose(q.byPid.get(pid) || null) : null);

  function readSpaceFields(body, current = {}) {
    const clean = (v, max) => String(v ?? '').replace(/\r\n/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim().slice(0, max);
    const errors = {};
    const out = {};
    for (const l of ['', '_en', '_de']) {
      if (`title${l}` in body) out[`title${l}`] = clean(body[`title${l}`], 160);
      if (`intro${l}` in body) out[`intro${l}`] = clean(body[`intro${l}`], 2000);
    }
    if ('title' in out && !out.title) errors.title = 'Donnez un titre à la galerie.';
    if ('closes' in body) {
      const day = parseDay(body.closes, now());
      const at = day && endOfDay(day);
      if (!at) errors.closes = 'Date de fermeture illisible : écrivez par exemple « 30/11/2026 ».';
      else if (at <= now()) errors.closes = 'La date de fermeture est déjà passée.';
      else if (at > now() + 366 * DAY) errors.closes = 'Une galerie ferme dans l’année : un an au plus.';
      else out.closes_at = at;
    }
    if (Object.keys(errors).length) throw new SpaceError(errors);
    return { ...current, ...out };
  }

  function createSpace(body, { authorId, by }) {
    const f = readSpaceFields({ title: '', closes: '', ...body });
    let pid = newPid();
    while (q.byPid.get(pid)) pid = newPid();
    const t = now();
    return Number(q.insertSpace.run({ public_id: pid, author_id: authorId ?? null, title: f.title, title_en: f.title_en || '', title_de: f.title_de || '',
      intro: f.intro || '', intro_en: f.intro_en || '', intro_de: f.intro_de || '', closes_at: f.closes_at, created_by: by, t }).lastInsertRowid);
  }
  function updateSpace(id, body) {
    const s = get(id);
    const f = readSpaceFields(body);
    const keys = ['title', 'title_en', 'title_de', 'intro', 'intro_en', 'intro_de', 'closes_at'].filter(k => k in f);
    if (!keys.length) return s;
    db.transaction(() => {
      db.prepare(`UPDATE private_spaces SET ${keys.map(k => `${k} = @${k}`).join(', ')}, updated_at = @t WHERE id = @id`).run({ ...f, t: now(), id: s.id });
      // Fermeture avancée : aucun accès ne va au-delà (G8), ni aucune autorisation ouverte.
      if (f.closes_at) {
        db.prepare('UPDATE space_invites SET expires_at = MIN(expires_at, ?) WHERE space_id = ?').run(f.closes_at, s.id);
        db.prepare('UPDATE visitor_grants SET expires_at = MIN(expires_at, ?) WHERE invite_id IN (SELECT id FROM space_invites WHERE space_id = ?)').run(f.closes_at, s.id);
        // L'état ne change jamais ici : une galerie fermée dont on repousse la date reste fermée jusqu'à « Ouvrir »
        // (setState, qui le note au journal et le dit à la Vigie, BV-23).
      }
    })();
    return get(id);
  }
  function setState(id, state, request) {
    const s = get(id);
    if (!STATES.includes(state)) throw new SpaceError({ state: 'État inconnu.' });
    if (state === 'ouverte' && s.closes_at <= now()) throw new SpaceError({ closes: 'La date de fermeture est passée : repoussez-la d’abord, dans les réglages.' });
    db.transaction(() => {
      db.prepare('UPDATE private_spaces SET state = ?, closed_at = ?, updated_at = ? WHERE id = ?').run(state, state === 'fermee' ? now() : null, now(), s.id);
      // Fermer : toutes les autorisations tombent tout de suite (G63).
      if (state !== 'ouverte') revokeGrantsOf(db.prepare('SELECT id FROM space_invites WHERE space_id = ?').pluck().all(s.id), s.id, 'acces_revoque');
    })();
    if (state === 'ouverte' && s.state !== 'ouverte') exposure(request, 'espace_ouvert', { space: s });
    return get(id);
  }
  function removeSpace(id) {
    const s = get(id);
    const invites = db.prepare('SELECT id FROM space_invites WHERE space_id = ?').pluck().all(s.id);
    db.transaction(() => {
      revokeGrantsOf(invites, s.id, 'acces_efface');
      db.prepare('DELETE FROM private_spaces WHERE id = ?').run(s.id);
    })();
    for (const inv of invites) removeArchives(inv);
  }

  // ---------- photos d'une galerie ----------
  // État d'une photo pour l'usage « privé » (G61, règle de l'étude § 2.7 précisée par MQ-18) :
  //   - bloquée (no) : une personne concernée (liée, ou de la même sortie si la photo a un visage) a refusé ; un refus vaut
  //     pour tout ;
  //   - prête (ok) : aucun visage, ou toutes les personnes concernées ont accepté, de façon sûre, « expositions et tirages »
  //     (montrer une photo à des tiers choisis sort d'un accord « site » seul, MQ-18 repère 6) ;
  //   - à vérifier (warn) : sinon ; l'équipe peut le confirmer, et sa confirmation est gardée (space_items.confirmed_by).
  function privateState(photo, cache = null) {
    const st = readiness.state(photo, cache);
    if (!st) return { level: 'no', reasons: ['photo introuvable'] };
    const concerned = st.people || [];
    const refused = concerned.filter(e => e.refused);
    const who = e => (e.anonymized ? 'refus anonymisé' : e.ref || `rencontre n°${e.id}`);
    if (refused.length) return { level: 'no', reasons: refused.map(e => `${who(e)} refuse la publication`) };
    const faces = facesOf(photo);
    if (!faces.has) return { level: 'ok', reasons: [] };
    if (!concerned.length) return { level: 'warn', reasons: ['quelqu’un est sur la photo, sans accord'] };
    const reasons = [];
    for (const e of concerned) {
      if (!e.consent) reasons.push(`${who(e)} n’a pas encore décidé`);
      else if (!e.consent.print) reasons.push(`l’accord de ${who(e)} couvre le site seulement`);
      else if (!(['carte', 'signature'].includes(e.consent_source) || e.verified)) reasons.push(`${who(e)} : accord en ligne non vérifié`);
    }
    return { level: reasons.length ? 'warn' : 'ok', reasons };
  }
  const decorate = lang => p => ({ ...p, title: pick(p, 'title', lang), place: pick(p, 'place', lang), legend: pick(p, 'legend', lang), alt: pick(p, 'alt_text', lang), when: monthYear(p.taken_on, lang) });
  // Photos de la galerie dans l'ordre ; withState : leur état pour l'usage privé. Une photo devenue bloquée (refus après
  // l'ajout) n'est jamais montrée aux invités (forGuests).
  function items(spaceId, { lang = 'fr', withState = false, forGuests = false } = {}) {
    const cache = new Map();
    let list = q.items.all(spaceId).map(decorate(lang)).map((p, i) => ({ ...p, n: i + 1 }));
    if (withState || forGuests) list = list.map(p => ({ ...p, prive: privateState(p, cache) }));
    if (forGuests) list = list.filter(p => guestVisible(p.prive.level, p.confirmed_at)).map((p, i) => ({ ...p, n: i + 1 }));
    return list;
  }
  // Ce que voit un invité : une photo prête, ou à vérifier ET confirmée par l'équipe (G61, M17) ; jamais une bloquée.
  const guestVisible = (level, confirmedAt) => level === 'ok' || (level === 'warn' && Boolean(confirmedAt));
  // Photos cachées aux invités tant qu'elles ne sont pas confirmées (ou bloquées), pour l'admin.
  const hiddenFromGuests = spaceId => items(spaceId, { withState: true }).filter(p => !guestVisible(p.prive.level, p.confirmed_at));
  function addPhotos(spaceId, photoIds) {
    const cache = new Map();
    const added = [], blocked = [];
    db.transaction(() => {
      let pos = q.maxPos.get(spaceId);
      for (const id of [...new Set(photoIds.map(Number))].filter(Number.isInteger)) {
        const p = db.prepare('SELECT id, title, faces, faces_override, status FROM photos WHERE id = ?').get(id);
        if (!p) continue;
        if (privateState(p, cache).level === 'no') { blocked.push(p.title); continue; }
        if (q.addItem.run(spaceId, id, ++pos, now()).changes) added.push(id);
      }
    })();
    return { added, blocked };
  }
  const removeItem = (spaceId, itemId) => db.prepare('DELETE FROM space_items WHERE id = ? AND space_id = ?').run(itemId, spaceId).changes;
  const confirmItem = (spaceId, itemId, by) => db.prepare('UPDATE space_items SET confirmed_by = ?, confirmed_at = ? WHERE id = ? AND space_id = ?').run(String(by).slice(0, 120), now(), itemId, spaceId).changes;
  function moveItem(spaceId, itemId, dir) {
    const list = q.items.all(spaceId);
    const i = list.findIndex(x => x.item_id === itemId), j = i + (dir === 'haut' ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    const set = db.prepare('UPDATE space_items SET position = ? WHERE id = ?');
    db.transaction(() => list.forEach((x, k) => set.run(k + 1, x.item_id)))();
    return true;
  }
  // Le nom de fichier d'une variante appartient-il à une photo de la galerie (G38) ?
  const hasFile = (spaceId, file) => Boolean(q.hasPhoto.get(spaceId, file));

  // ---------- accès ----------
  const openInvite = inv => inv && { ...inv, label: vault.open(inv.label), rights: parseRights(inv.rights), devices: q.devices.get(inv.id) };
  const invite = id => openInvite(q.invite.get(Number(id)) || null);
  const invitesOf = spaceId => q.invites.all(spaceId).map(openInvite);
  // État d'un accès : revoque | expire | suspendu | pause | ouvert | envoye (lien créé, mot de passe jamais accepté).
  function inviteState(inv, s = get(inv.space_id)) {
    if (inv.revoked_at) return 'revoque';
    if (inv.expires_at <= now() || !s || s.state === 'fermee' || s.closes_at <= now()) return 'expire';
    if (inv.suspended_at) return 'suspendu';
    if (inv.locked_until && inv.locked_until > now()) return 'pause';
    return inv.first_opened_at ? 'ouvert' : 'envoye';
  }
  function readInviteFields(body, s, current = null) {
    const errors = {};
    const out = {};
    if (!current || 'label' in body) {
      out.label = String(body.label ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);
      if (!out.label) errors.label = 'Écrivez le nom de la personne (seule l’équipe le voit).';
    }
    if (!current) {
      out.lang = LANGS.includes(body.lang) ? body.lang : 'fr';
      out.is_group = body.groupe === '1' ? 1 : 0;
    }
    if (!current || 'expires' in body) {
      const day = parseDay(body.expires, now());
      const at = day && endOfDay(day);
      if (!at) errors.expires = 'Date illisible : écrivez par exemple « 30/11/2026 ».';
      else if (at <= now()) errors.expires = 'Cette date est déjà passée.';
      else if (at > s.closes_at) errors.expires = 'La galerie ferme avant : l’accès ne peut pas aller au-delà de sa fermeture.';
      else if (at > now() + MAX_DAYS * DAY) errors.expires = 'Un accès dure 6 mois au plus.';
      else out.expires_at = at;
    }
    // Droits : cases du formulaire (favoris, telecharger, grande).
    const dl = body.telecharger ? (body.grande ? 'grande' : 'web') : 'non';
    out.rights = { favoris: Boolean(body.favoris), telechargement: dl };
    if (Object.keys(errors).length) throw new SpaceError(errors);
    return out;
  }
  // Date de fin proposée : 30 jours, ou la fermeture de la galerie si elle vient avant.
  const defaultEnd = s => Math.min(endOfDay(parisDayOf(now() + DEFAULT_DAYS * DAY)), s.closes_at);

  async function createInvite(spaceId, body, { by, request }) {
    const s = get(spaceId);
    const f = readInviteFields(body, s);
    const token = newLinkToken(), password = generatePassword();
    const hash = await hashPassword(password);
    const id = Number(q.insertInvite.run({ space_id: s.id, token_hash: hashToken(token), password_hash: hash, label: vault.seal(f.label), lang: f.lang, is_group: f.is_group,
      rights: JSON.stringify(f.rights), expires_at: f.expires_at, created_by: by, t: now() }).lastInsertRowid);
    logEvent(s.id, id, 'cree', {});
    const inv = invite(id);
    exposure(request, 'cree', { space: s, invite: inv });
    return { id, token, password };
  }
  function updateInvite(id, body, request) {
    const inv = invite(id), s = get(inv.space_id);
    const f = readInviteFields(body, s, inv);
    db.prepare('UPDATE space_invites SET expires_at = ?, rights = ?, ended_at = NULL WHERE id = ?').run(f.expires_at ?? inv.expires_at, JSON.stringify(f.rights), inv.id);
    db.prepare('UPDATE visitor_grants SET expires_at = MIN(expires_at, ?) WHERE invite_id = ?').run(f.expires_at ?? inv.expires_at, inv.id);
    const after = invite(id);
    const rank = d => DOWNLOADS.indexOf(d);
    const wider = rank(f.rights.telechargement) > rank(inv.rights.telechargement) || (f.rights.favoris && !inv.rights.favoris);
    if (wider) exposure(request, 'droits_elargis', { space: s, invite: after });
    if ((f.expires_at ?? inv.expires_at) > inv.expires_at) exposure(request, 'prolonge', { space: s, invite: after });
    return after;
  }
  // Nouveau lien : l'ancien cesse de marcher aussitôt ; son empreinte est gardée pour reconnaître un rejeu (BV-22).
  function newLink(id, request) {
    const inv = invite(id);
    const token = newLinkToken();
    db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO space_invite_old_links (token_hash, invite_id, replaced_at) VALUES (?, ?, ?)').run(inv.token_hash, inv.id, now());
      db.prepare('UPDATE space_invites SET token_hash = ? WHERE id = ?').run(hashToken(token), inv.id);
    })();
    logEvent(inv.space_id, inv.id, 'nouveau_lien', {});
    exposure(request, 'nouveau_lien', { space: get(inv.space_id), invite: inv });
    return token;
  }
  // Nouveau mot de passe : le lien reste (G10) ; les essais repartent de zéro.
  async function newPassword(id, request) {
    const inv = invite(id);
    const password = generatePassword();
    const hash = await hashPassword(password);
    db.prepare('UPDATE space_invites SET password_hash = ?, failed_count = 0, failed_total = 0, locked_until = NULL, suspended_at = NULL WHERE id = ?').run(hash, inv.id);
    logEvent(inv.space_id, inv.id, 'nouveau_mot_de_passe', {});
    exposure(request, 'nouveau_mot_de_passe', { space: get(inv.space_id), invite: inv });
    return password;
  }
  function unlock(id, request) {
    const inv = invite(id);
    db.prepare('UPDATE space_invites SET failed_count = 0, failed_total = 0, locked_until = NULL, suspended_at = NULL WHERE id = ?').run(inv.id);
    logEvent(inv.space_id, inv.id, 'debloque', {});
    exposure(request, 'debloque', { space: get(inv.space_id), invite: inv, suspendu: Boolean(inv.suspended_at) });
  }
  // Autorisations des accès retirées dans la même transaction (G9) ; gardées 48 h pour reconnaître un accès tenté après.
  function revokeGrantsOf(inviteIds, spaceId, raison) {
    const add = db.prepare('INSERT OR REPLACE INTO visitor_grants_revoked (session_id, invite_id, space_id, raison, revoked_at) VALUES (?, ?, ?, ?, ?)');
    for (const inv of inviteIds) {
      for (const sid of q.grantsOfInvite.all(inv)) add.run(sid, inv, spaceId, raison, now());
      db.prepare('DELETE FROM visitor_grants WHERE invite_id = ?').run(inv);
    }
  }
  function revoke(id, request) {
    const inv = invite(id);
    db.transaction(() => {
      db.prepare('UPDATE space_invites SET revoked_at = COALESCE(revoked_at, ?), ended_at = COALESCE(ended_at, ?) WHERE id = ?').run(now(), now(), inv.id);
      revokeGrantsOf([inv.id], inv.space_id, 'acces_revoque');
    })();
    logEvent(inv.space_id, inv.id, 'revoque', {});
    exposure(request, 'revoque', { space: get(inv.space_id), invite: inv });
  }
  // Effacer : l'accès cesse de marcher, puis tout ce qui le concerne est effacé (étiquette, journal, favoris, appareils).
  function erase(id, request) {
    const inv = invite(id);
    db.transaction(() => {
      revokeGrantsOf([inv.id], inv.space_id, 'acces_efface');
      db.prepare('DELETE FROM space_invites WHERE id = ?').run(inv.id);
    })();
    removeArchives(inv.id);
    exposure(request, 'efface', { space: get(inv.space_id), invite: inv });
  }
  // Suspension (30 refus, G19 ; ou décision suspendre_acces de la Vigie, BV-18) : les autorisations ouvertes tombent
  // aussi, le lien ayant fui ; l'équipe débloque, ou donne un nouveau mot de passe.
  function suspend(id, raison = 'refus') {
    const inv = q.invite.get(Number(id));
    if (!inv) return false;
    db.transaction(() => {
      db.prepare('UPDATE space_invites SET suspended_at = COALESCE(suspended_at, ?) WHERE id = ?').run(now(), inv.id);
      revokeGrantsOf([inv.id], inv.space_id, 'acces_suspendu');
    })();
    logEvent(inv.space_id, inv.id, 'suspension', { detail: raison });
    return true;
  }

  // Lien reçu : { invite, space } d'un lien valide ou fini ; { old: true } d'un lien remplacé ; null sinon. Format vérifié
  // avant toute lecture de la base (G6) ; recherche par empreinte (aucun secret comparé caractère par caractère).
  function byLink(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const h = hashToken(token);
    const inv = q.byToken.get(h);
    if (inv) return { invite: openInvite(inv), space: get(inv.space_id) };
    const old = q.oldLink.get(h);
    if (old) return { old: true, invite: openInvite(q.invite.get(old.invite_id)), space: get(old.space_id) };
    return null;
  }

  // ---------- essais de mot de passe (G19, annexe § 3.3) ----------
  // Avant le calcul scrypt, dans une même transaction synchrone : contrôle de la suspension et de la pause, puis l'essai
  // est compté comme un refus (et la pause ou la suspension posée si un seuil est atteint). Des essais lancés en parallèle
  // ne passent donc jamais au-delà des seuils. Après le calcul, en cas de succès seulement, succeed() annule ce refus.
  const begin = db.transaction(id => {
    const inv = q.invite.get(id);
    if (!inv) return { state: 'inconnu' };
    if (inv.suspended_at) return { state: 'suspendu', inv };
    if (inv.locked_until && inv.locked_until > now()) return { state: 'pause', until: inv.locked_until, inv };
    const count = inv.failed_count + 1, total = inv.failed_total + 1;
    let palier = null, until = null, suspended = null;
    if (total >= LIMITS.suspend) { palier = 'suspension'; suspended = now(); }
    else if (count >= LIMITS.pause15 && count % 5 === 0) { palier = 'pause_15min'; until = now() + 15 * 60e3; }
    else if (count === LIMITS.pause1) { palier = 'pause_1min'; until = now() + 60e3; }
    db.prepare('UPDATE space_invites SET failed_count = ?, failed_total = ?, locked_until = COALESCE(?, locked_until), suspended_at = COALESCE(?, suspended_at) WHERE id = ?')
      .run(count, total, until, suspended, id);
    return { state: 'compte', count, total, palier, until, suspended, inv };
  });
  const beginAttempt = id => begin(Number(id));
  function succeed(attempt) {
    const id = attempt.inv.id;
    db.prepare('UPDATE space_invites SET failed_count = 0, failed_total = 0, locked_until = NULL, suspended_at = CASE WHEN suspended_at = ? THEN NULL ELSE suspended_at END WHERE id = ?')
      .run(attempt.suspended ?? -1, id);
  }
  // Après un refus qui pose la suspension : les autorisations ouvertes tombent.
  const failed = attempt => { if (attempt.palier === 'suspension') suspend(attempt.inv.id, 'refus'); };
  // Essais restants avant le prochain palier (message de l'invité, G21).
  function remaining(count) {
    if (count < LIMITS.pause1) return { n: LIMITS.pause1 - count, pause: 1 };
    const next = Math.max(LIMITS.pause15, Math.ceil((count + 1) / 5) * 5);
    return { n: next - count, pause: 15 };
  }

  // ---------- autorisations des sessions visiteur ----------
  function grant(session, inv, remember) {
    const s = get(inv.space_id);
    const t = now();
    const expires = Math.min(t + (remember ? REMEMBER : GRANT_MAX), inv.expires_at, s.closes_at);
    let rank = null;
    db.transaction(() => {
      db.prepare(`INSERT INTO visitor_grants (session_id, invite_id, remember, granted_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (session_id, invite_id) DO UPDATE SET remember = excluded.remember, granted_at = excluded.granted_at, last_seen_at = excluded.last_seen_at, expires_at = excluded.expires_at`)
        .run(session.id, inv.id, remember ? 1 : 0, t, t, expires);
      db.prepare('DELETE FROM visitor_grants_revoked WHERE session_id = ? AND invite_id = ?').run(session.id, inv.id);
      const fresh = db.prepare('INSERT OR IGNORE INTO space_invite_devices (invite_id, session_id, first_at) VALUES (?, ?, ?)').run(inv.id, session.id, t).changes;
      rank = q.devices.get(inv.id);
      if (!fresh) rank = null;                                   // même appareil que la dernière fois
      db.prepare('UPDATE space_invites SET first_opened_at = COALESCE(first_opened_at, ?), last_seen_at = ? WHERE id = ?').run(t, t, inv.id);
    })();
    return { devices: q.devices.get(inv.id), deviceRank: rank, expires };
  }
  // Autorisation valide de cette session pour cette galerie : { invite, space, grant }, sinon null. Contrôlée à chaque
  // requête, autorisation par autorisation (G26) : inactivité, plafond, accès révoqué, suspendu ou échu, galerie fermée.
  function access(session, s) {
    if (!session || !s || s.state !== 'ouverte' || s.closes_at <= now()) return null;
    const t = now();
    for (const g of q.grants.all(session.id)) {
      const inv = q.invite.get(g.invite_id);
      if (!inv || inv.space_id !== s.id) continue;
      const idle = g.remember ? REMEMBER : GRANT_IDLE;
      if (g.expires_at <= t || t - g.last_seen_at > idle || inv.revoked_at || inv.suspended_at || inv.expires_at <= t) continue;
      if (t - g.last_seen_at > 60e3) {
        db.prepare('UPDATE visitor_grants SET last_seen_at = ? WHERE session_id = ? AND invite_id = ?').run(t, session.id, inv.id);
        db.prepare('UPDATE space_invites SET last_seen_at = ? WHERE id = ?').run(t, inv.id);
      }
      return { invite: openInvite(inv), space: s, grant: g };
    }
    return null;
  }
  // La session a-t-elle eu accès à cette galerie (autorisation échue, ou retirée depuis moins de 48 h) ?
  // { raison } d'un retrait (révocation, effacement, « Quitter », suspension), { echue: true } sinon, ou null.
  function hadAccess(session, s) {
    if (!session || !s) return null;
    const r = db.prepare('SELECT * FROM visitor_grants_revoked WHERE session_id = ? AND space_id = ? AND revoked_at > ? ORDER BY revoked_at DESC LIMIT 1').get(session.id, s.id, now() - 48 * 3600e3);
    if (r) return { raison: r.raison, invite_id: r.invite_id };
    const g = q.grants.all(session.id).find(x => q.invite.get(x.invite_id)?.space_id === s.id);
    return g ? { echue: true, invite_id: g.invite_id } : null;
  }
  // « Quitter » : toutes les autorisations de la session sont retirées (pas la session), gardées 48 h comme « quitte ».
  function leave(session) {
    const rows = q.grants.all(session.id);
    const add = db.prepare('INSERT OR REPLACE INTO visitor_grants_revoked (session_id, invite_id, space_id, raison, revoked_at) VALUES (?, ?, ?, ?, ?)');
    db.transaction(() => {
      for (const g of rows) { const inv = q.invite.get(g.invite_id); if (inv) add.run(session.id, inv.id, inv.space_id, 'quitte', now()); }
      db.prepare('DELETE FROM visitor_grants WHERE session_id = ?').run(session.id);
    })();
    return rows.map(g => q.invite.get(g.invite_id)).filter(Boolean);
  }

  // ---------- favoris et sélection ----------
  const favorites = inviteId => q.favorites.all(inviteId);
  function toggleFavorite(inv, itemId) {
    const has = db.prepare('SELECT 1 FROM space_favorites WHERE invite_id = ? AND item_id = ?').get(inv.id, itemId);
    if (has) db.prepare('DELETE FROM space_favorites WHERE invite_id = ? AND item_id = ?').run(inv.id, itemId);
    else db.prepare('INSERT INTO space_favorites (invite_id, item_id, added_at) VALUES (?, ?, ?)').run(inv.id, itemId, now());
    return !has;
  }
  const sendSelection = inv => db.prepare('UPDATE space_invites SET selection_sent_at = ?, selection_seen_at = NULL WHERE id = ?').run(now(), inv.id);
  // Reprendre (l'invité) : tant que l'équipe ne l'a pas vue. Rouvrir (l'équipe) : toujours.
  const takeBack = inv => db.prepare('UPDATE space_invites SET selection_sent_at = NULL WHERE id = ? AND selection_seen_at IS NULL').run(inv.id).changes > 0;
  const reopen = inv => db.prepare('UPDATE space_invites SET selection_sent_at = NULL, selection_seen_at = NULL WHERE id = ?').run(inv.id);
  const markSeen = inv => { if (inv.selection_sent_at && !inv.selection_seen_at) db.prepare('UPDATE space_invites SET selection_seen_at = ? WHERE id = ?').run(now(), inv.id); };
  const countDownload = inv => db.prepare('UPDATE space_invites SET downloads = downloads + 1 WHERE id = ?').run(inv.id);

  // ---------- journal des accès (§ 3.9) ----------
  // Réseau (/24, /48) et pays seulement ; ni navigateur (un indicateur « robot ou aperçu » seulement) ni jeton.
  function logEvent(spaceId, inviteId, kind, { request = null, item = null, detail = '' } = {}) {
    const ua = request?.headers?.['user-agent'] || '';
    db.prepare('INSERT INTO space_events (space_id, invite_id, kind, item_id, detail, robot, ip, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(spaceId, inviteId, kind, item, String(detail).slice(0, 300), request && (!ua || BOTS.test(ua)) ? 1 : 0, request ? truncateIp(request.ip) : null,
        request ? ((c => (c === 'XX' ? null : c))(countryOf(request.headers, trustCountry))) : null, now());
  }
  // Une ligne « lien consulté » par adresse et par jour.
  function linkViewed(inv, request) {
    const day0 = endOfDay(parisDayOf(now())) - DAY;
    const seen = db.prepare("SELECT 1 FROM space_events WHERE invite_id = ? AND kind = 'lien_consulte' AND ip = ? AND created_at > ? LIMIT 1").get(inv.id, truncateIp(request.ip), day0);
    if (!seen) logEvent(inv.space_id, inv.id, 'lien_consulte', { request });
  }
  // Nombres lus dans le journal, sur 24 h, pour un accès (BV-16 : répartition des refus).
  function spread(inviteId) {
    const rows = db.prepare("SELECT ip, country FROM space_events WHERE invite_id = ? AND kind = 'mot_de_passe_refuse' AND created_at > ?").all(inviteId, now() - DAY);
    return { refus_24h: rows.length, reseaux_24h: new Set(rows.map(r => r.ip)).size, pays_24h: new Set(rows.map(r => r.country).filter(Boolean)).size };
  }
  const eventsOf = inviteId => q.events.all(inviteId);
  const spaceEvents = spaceId => q.spaceEvents.all(spaceId);

  // ---------- Vigie : accès donnés, élargis ou retirés (BV-23) ----------
  // Un seul point d'émission. Identifiants numériques seulement : jamais l'étiquette, le lien ni le mot de passe.
  function exposure(request, action, { space, invite: inv = null, suspendu = false }) {
    const rights = inv?.rights || { telechargement: 'non' };
    const wide = rights.telechargement === 'grande';
    const items = space ? q.items.all(space.id) : [];
    const severity = (action === 'droits_elargis' && wide) || (action === 'debloque' && suspendu) || (['cree', 'prolonge'].includes(action) && wide) ? 'bas' : undefined;
    sec().emit('privacy_exposure_changed', { request, severity, emetteur: 'server/spaces.js · accès privé',
      detail: { objet: 'acces_prive', action, espace: space?.id ?? null, acces: inv?.id ?? null, auteur_espace: space?.author_id ?? null, groupe: Boolean(inv?.is_group),
        telechargement: rights.telechargement, sans_filigrane: items.some(i => !variants()?.specOf(i.photo_id)?.mark),
        echeance_jours: inv ? Math.max(0, Math.round((inv.expires_at - now()) / DAY)) : space ? Math.max(0, Math.round((space.closes_at - now()) / DAY)) : null,
        appareils_max: null, photos_a_verifier_confirmees: items.filter(i => i.confirmed_at).length, debloque_apres_suspension: action === 'debloque' ? suspendu : undefined } });
  }

  // ---------- fichiers privés (téléchargements, archives) : storage/private, hors sauvegarde (G76) ----------
  const downloadsDir = path.join(privateDir, 'telechargements');
  const archivesDir = path.join(privateDir, 'archives');
  function removeArchives(inviteId) {
    for (const a of db.prepare('SELECT file FROM space_archives WHERE invite_id = ?').pluck().all(inviteId)) fs.rmSync(path.join(archivesDir, a), { force: true });
    db.prepare('DELETE FROM space_archives WHERE invite_id = ?').run(inviteId);
  }

  // ---------- purges (G71) ----------
  function purge() {
    const t = now();
    let n = 0;
    db.transaction(() => {
      // Galeries arrivées à échéance : fermées, autorisations retirées.
      for (const s of db.prepare("SELECT * FROM private_spaces WHERE state = 'ouverte' AND closes_at <= ?").all(t)) checkClose(s);
      db.prepare('UPDATE space_invites SET ended_at = expires_at WHERE ended_at IS NULL AND expires_at <= ?').run(t);
      db.prepare("UPDATE space_invites SET ended_at = (SELECT closed_at FROM private_spaces s WHERE s.id = space_id) WHERE ended_at IS NULL AND space_id IN (SELECT id FROM private_spaces WHERE state = 'fermee' AND closed_at IS NOT NULL)").run();
      const old = db.prepare('SELECT id FROM space_invites WHERE ended_at IS NOT NULL AND ended_at < ?').pluck().all(t - PURGE_AFTER);
      for (const id of old) { removeArchives(id); n += db.prepare('DELETE FROM space_invites WHERE id = ?').run(id).changes; }
      db.prepare('DELETE FROM visitor_grants WHERE expires_at <= ?').run(t);
      db.prepare('DELETE FROM visitor_grants_revoked WHERE revoked_at < ?').run(t - 48 * 3600e3);
    })();
    // Archives : 24 h.
    for (const a of db.prepare('SELECT id, file FROM space_archives WHERE created_at < ?').all(t - DAY)) {
      fs.rmSync(path.join(archivesDir, a.file), { force: true });
      db.prepare('DELETE FROM space_archives WHERE id = ?').run(a.id);
    }
    // Rendus de téléchargement : 30 jours après la dernière galerie ouverte qui contient la photo.
    try {
      const open = new Set(db.prepare("SELECT p.file FROM space_items i JOIN private_spaces s ON s.id = i.space_id JOIN photos p ON p.id = i.photo_id WHERE s.state <> 'fermee' OR s.closed_at > ?").pluck().all(t - 30 * DAY).map(f => path.parse(f).name));
      for (const f of fs.readdirSync(downloadsDir)) {
        const stem = f.split('-').slice(0, 5).join('-');                        // l'UUID de l'original
        if (!open.has(stem)) fs.rmSync(path.join(downloadsDir, f), { force: true });
      }
    } catch { /* dossier absent */ }
    return n;
  }

  // ---------- « Aujourd'hui » (G62) ----------
  // Signaux des galeries d'un compte (spaceFilter : galeries visibles).
  function signals(spaceFilter = () => true) {
    const out = [];
    for (const s of q.spaces.all().map(checkClose).filter(spaceFilter)) {
      if (s.state === 'ouverte' && s.closes_at - now() <= 7 * DAY) out.push({ kind: 'ferme_bientot', space: s, days: Math.max(0, Math.ceil((s.closes_at - now()) / DAY)) });
      for (const inv of q.invites.all(s.id).filter(i => !i.revoked_at && i.expires_at > now())) {
        if (inv.selection_sent_at && !inv.selection_seen_at) out.push({ kind: 'selection', space: s, invite: openInvite(inv) });
        if (inv.suspended_at) out.push({ kind: 'suspendu', space: s, invite: openInvite(inv) });
        const d = q.devices.get(inv.id);
        if (d > DEVICES_SIGNAL) out.push({ kind: 'appareils', space: s, invite: openInvite(inv), devices: d });
      }
    }
    return out;
  }

  return {
    get, byPid, list: () => q.spaces.all().map(checkClose), titleOf, createSpace, updateSpace, setState, removeSpace,
    items, guestVisible, hiddenFromGuests, addPhotos, removeItem, confirmItem, moveItem, hasFile, privateState, item: (spaceId, itemId) => q.item.get(itemId, spaceId),
    invite, invitesOf, inviteState, defaultEnd, createInvite, updateInvite, newLink, newPassword, unlock, revoke, erase, suspend, byLink,
    beginAttempt, succeed, failed, remaining, grant, access, hadAccess, leave,
    favorites, toggleFavorite, sendSelection, takeBack, reopen, markSeen, countDownload,
    logEvent, linkViewed, spread, eventsOf, spaceEvents, exposure, purge, signals,
    dirs: { downloads: downloadsDir, archives: archivesDir },
    archives: {
      today: inviteId => db.prepare('SELECT COUNT(*) FROM space_archives WHERE invite_id = ? AND created_at > ?').pluck().get(inviteId, now() - DAY),
      // Place réservée d'un coup (transaction synchrone, avant tout calcul) : des demandes simultanées ne dépassent jamais
      // la limite du jour. null : limite atteinte. La ligne est complétée à la fin (done) ou retirée en cas d'échec (drop).
      reserve: db.transaction((inviteId, file, max) => {
        if (db.prepare('SELECT COUNT(*) FROM space_archives WHERE invite_id = ? AND created_at > ?').pluck().get(inviteId, now() - DAY) >= max) return null;
        return Number(db.prepare('INSERT INTO space_archives (invite_id, file, bytes, photos, created_at) VALUES (?, ?, 0, 0, ?)').run(inviteId, file, now()).lastInsertRowid);
      }),
      done: (id, bytes, photos) => db.prepare('UPDATE space_archives SET bytes = ?, photos = ? WHERE id = ?').run(bytes, photos, id),
      drop: id => db.prepare('DELETE FROM space_archives WHERE id = ?').run(id),
      get: (inviteId, id) => db.prepare('SELECT * FROM space_archives WHERE id = ? AND invite_id = ? AND created_at > ? AND photos > 0').get(id, inviteId, now() - DAY) || null,
    },
  };
}
