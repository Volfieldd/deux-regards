import crypto from 'node:crypto';
import { SaisonError, LIMITS } from './saisons.js';

// V1 : le cookie est créé par la route après consentement. Aucun compte, réseau ni appareil n’entre dans l’index.
export const NOTICE_VERSION = 'expositions-vote-1';
export const createVoteToken = () => crypto.randomBytes(32).toString('base64url');
export class SaisonVoteError extends SaisonError {}
const identifier = value => Number.isSafeInteger(value) && value > 0;
const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const token = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value, 'base64url').toString('base64url') === value;

export function createSaisonsVotes({ db, vault, saisons, approvedIds, readiness = null, now = Date.now }) {
  if (typeof approvedIds !== 'function') throw new TypeError('La liste des propositions validées est obligatoire.');
  if (typeof saisons?.get !== 'function') throw new TypeError('Le modèle des expositions est obligatoire.');
  if (readiness != null && typeof readiness.gate !== 'function') throw new TypeError('Le contrôle de publication est invalide.');
  const q = {
    photo: db.prepare('SELECT p.status FROM saison_photos s JOIN photos p ON p.id = s.photo_id WHERE s.saison_id = ? AND s.photo_id = ?'),
    voter: db.prepare('SELECT consentement FROM saison_vote_votants WHERE saison_id = ? AND navigateur_index = ?'),
    addVoter: db.prepare('INSERT INTO saison_vote_votants (saison_id, navigateur_index, consentement) VALUES (?, ?, ?)'),
    consent: db.prepare('UPDATE saison_vote_votants SET consentement = ? WHERE saison_id = ? AND navigateur_index = ?'),
    addVote: db.prepare('INSERT INTO saison_votes (saison_id, photo_id, navigateur_index) VALUES (?, ?, ?) ON CONFLICT (saison_id, photo_id, navigateur_index) DO NOTHING'),
    addTotal: db.prepare('INSERT INTO saison_vote_totaux (saison_id, photo_id, total) VALUES (?, ?, 1) ON CONFLICT (saison_id, photo_id) DO UPDATE SET total = total + 1'),
    votes: db.prepare('SELECT photo_id FROM saison_votes WHERE saison_id = ? AND navigateur_index = ? ORDER BY photo_id').pluck(),
    removeVoter: db.prepare('DELETE FROM saison_vote_votants WHERE saison_id = ? AND navigateur_index = ?'),
    removeTotal: db.prepare('UPDATE saison_vote_totaux SET total = total - 1 WHERE saison_id = ? AND photo_id = ?'),
    counts: db.prepare('SELECT photo_id, total FROM saison_vote_totaux WHERE saison_id = ? ORDER BY photo_id'),
    purge: db.prepare("DELETE FROM saison_vote_votants WHERE saison_id IN (SELECT id FROM saisons WHERE state NOT IN ('programme', 'publie') OR opens_at IS NULL OR closes_at IS NULL OR closes_at <= opens_at OR closes_at <= ?)"),
  };
  const time = () => {
    const t = now();
    if (!instant(t)) throw new SaisonVoteError('Horloge invalide.');
    return t;
  };
  const requireSaison = id => {
    const s = identifier(id) ? saisons.get(id) : null;
    if (!s) throw new SaisonVoteError('Exposition introuvable.', { status: 404 });
    return s;
  };
  const open = (s, t) => ['programme', 'publie'].includes(s.state) && instant(s.opens_at) && instant(s.closes_at)
    && s.opens_at <= t && t < s.closes_at;
  const requireVault = () => {
    if (!vault?.enabled) throw new SaisonVoteError('Le vote est temporairement indisponible.', { status: 503 });
  };
  const index = (id, raw) => {
    requireVault();
    return vault.index(`vote:${id}:${raw}`);
  };
  const proof = row => {
    let value;
    try { value = JSON.parse(vault.open(row.consentement)); } catch { /* une preuve illisible ne vaut jamais consentement */ }
    if (!vault.sealed(row.consentement) || !value || !instant(value.at) || typeof value.version !== 'string' || value.version.length > 100)
      throw new SaisonVoteError('Le consentement est temporairement illisible.', { status: 503 });
    return { at: value.at, version: value.version };
  };
  const purgeDue = () => q.purge.run(time()).changes;
  const validatePhoto = (sid, pid) => {
    if (!identifier(pid)) throw new SaisonVoteError('Photo invalide.', { field: 'photo_id' });
    // Le circuit V0 est relu pour chaque vote, même si ce navigateur a déjà consenti ou voté.
    const ids = approvedIds(sid);
    if (!Array.isArray(ids) || ids.length > LIMITS.photos || ids.some(id => !identifier(id)) || new Set(ids).size !== ids.length)
      throw new SaisonVoteError('Les propositions sont temporairement indisponibles.', { status: 503 });
    if (!ids.includes(pid) || q.photo.get(sid, pid)?.status !== 'published' || (readiness && !readiness.gate([pid]).ok.includes(pid)))
      throw new SaisonVoteError('Cette photo n’est pas proposée au vote.', { field: 'photo_id', status: 409 });
  };
  const cast = db.transaction((sid, pid, raw, options = {}) => {
    requireVault();
    const s = requireSaison(sid);
    if (!open(s, time())) throw new SaisonVoteError('Le vote n’est pas ouvert pour cette exposition.', { status: 409 });
    if (!token(raw)) throw new SaisonVoteError('Identifiant de vote invalide.', { field: 'token' });
    if (!options || typeof options !== 'object' || Array.isArray(options)
      || (options.consent !== undefined && typeof options.consent !== 'boolean')
      || options.noticeVersion !== NOTICE_VERSION)
      throw new SaisonVoteError('L’information sur le vote doit être confirmée.', { field: 'consent' });
    validatePhoto(sid, pid);
    const key = index(sid, raw), voter = q.voter.get(sid, key);
    const previous = voter ? proof(voter) : null;
    // Le contrôle du média peut prendre du temps : la clôture reste exclusive juste avant toute écriture.
    const t = time();
    if (!open(s, t)) throw new SaisonVoteError('Le vote n’est pas ouvert pour cette exposition.', { status: 409 });
    if (!previous || previous.version !== NOTICE_VERSION) {
      if (options.consent !== true) throw new SaisonVoteError('Votre consentement est nécessaire pour voter.', { field: 'consent' });
      const sealed = vault.seal(JSON.stringify({ at: t, version: NOTICE_VERSION }));
      if (!vault.sealed(sealed)) throw new SaisonVoteError('Le vote est temporairement indisponible.', { status: 503 });
      if (voter) q.consent.run(sealed, sid, key);
      else q.addVoter.run(sid, key, sealed);
    }
    const recorded = q.addVote.run(sid, pid, key).changes === 1;
    if (recorded) q.addTotal.run(sid, pid);
    return { recorded, alreadyVoted: !recorded, photo_id: pid, closes_at: s.closes_at };
  });
  function browser(sid, raw, exported) {
    purgeDue();
    const s = requireSaison(sid), closed = !open(s, time());
    const empty = { photo_ids: [], consented: false, closes_at: s.closes_at, closed };
    if (closed || !token(raw)) return exported ? { ...empty, consent: null } : empty;
    const key = index(sid, raw), voter = q.voter.get(sid, key);
    if (!voter) return exported ? { ...empty, consent: null } : empty;
    const consent = proof(voter);
    const result = { ...empty, photo_ids: q.votes.all(sid, key), consented: consent.version === NOTICE_VERSION };
    return exported ? { ...result, consent } : result;
  }
  const withdraw = db.transaction((sid, raw) => {
    const s = requireSaison(sid), closed = !open(s, time());
    if (closed || !token(raw)) return { removed: 0, closed };
    const key = index(sid, raw), ids = q.votes.all(sid, key);
    for (const pid of ids) q.removeTotal.run(sid, pid);
    q.removeVoter.run(sid, key);
    return { removed: ids.length, closed };
  });
  return {
    cast: (...args) => cast.immediate(...args),
    forBrowser: (sid, raw) => browser(sid, raw, false),
    exportForBrowser: (sid, raw) => browser(sid, raw, true),
    withdraw(sid, raw) { purgeDue(); return withdraw.immediate(sid, raw); },
    counts(sid) { purgeDue(); requireSaison(sid); return q.counts.all(sid); },
    purgeDue,
  };
}
