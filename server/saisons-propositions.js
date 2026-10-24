import { SaisonError, LIMITS } from './saisons.js';

export class SaisonPropositionsError extends SaisonError {}
const identifier = value => Number.isSafeInteger(value) && value > 0;

// SA-D19/20 : les deux validations concernent la liste et son ordre, jamais un simple instant d’enregistrement.
export function createSaisonsPropositions({ db, saisons, readiness = null, now = Date.now }) {
  const q = {
    get: db.prepare('SELECT version, reviewed_version, validated_version FROM saison_propositions WHERE saison_id = ?'),
    photos: db.prepare('SELECT photo_id FROM saison_proposition_photos WHERE saison_id = ? ORDER BY position').pluck(),
    photo: db.prepare('SELECT status FROM photos WHERE id = ?').pluck(),
    clear: db.prepare('DELETE FROM saison_proposition_photos WHERE saison_id = ?'),
    add: db.prepare('INSERT INTO saison_proposition_photos (saison_id, photo_id, position) VALUES (?, ?, ?)'),
    write: db.prepare('INSERT INTO saison_propositions (saison_id, version, reviewed_version, validated_version, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(saison_id) DO UPDATE SET version = excluded.version, reviewed_version = excluded.reviewed_version, validated_version = excluded.validated_version, updated_at = excluded.updated_at'),
  };
  const season = id => {
    const s = identifier(id) ? saisons.get(id) : null;
    if (!s) throw new SaisonPropositionsError('Exposition introuvable.', { status: 404 });
    return s;
  };
  const get = id => {
    season(id);
    return { ...(q.get.get(id) || { version: 1, reviewed_version: null, validated_version: null }), photo_ids: q.photos.all(id) };
  };
  const current = (id, input) => {
    const s = season(id), p = get(id);
    if (!input || typeof input !== 'object' || Array.isArray(input) || !identifier(input.version))
      throw new SaisonPropositionsError('Version entière positive attendue.', { field: 'version' });
    if (input.version !== p.version)
      throw new SaisonPropositionsError('Modifié entre-temps : rechargez la page pour voir la dernière version.', { field: 'version', status: 409 });
    if (['close', 'bilan', 'retire'].includes(s.phase))
      throw new SaisonPropositionsError('Le choix au vote est figé après la clôture ou le retrait.', { status: 409 });
    return { s, p };
  };
  const ids = value => {
    if (!Array.isArray(value) || value.length > LIMITS.photos || value.some(id => !identifier(id)) || new Set(value).size !== value.length)
      throw new SaisonPropositionsError('Liste de photographies invalide.', { field: 'photo_ids' });
    return value;
  };
  const available = (s, list) => {
    const included = new Set(s.photo_ids), published = list.filter(id => included.has(id) && q.photo.get(id) === 'published');
    const allowed = readiness ? new Set(readiness.gate(published).ok) : new Set(published);
    return published.filter(id => allowed.has(id));
  };
  const requireAvailable = (s, list) => {
    if (available(s, list).length !== list.length)
      throw new SaisonPropositionsError('Les propositions doivent être des photos publiées et autorisées de l’accrochage.', { field: 'photo_ids' });
  };
  const write = (id, p) => {
    const t = now();
    if (!Number.isSafeInteger(t) || t < 0) throw new SaisonPropositionsError('Horloge invalide.');
    q.write.run(id, p.version, p.reviewed_version, p.validated_version, t);
  };
  const replace = (id, p, list) => {
    if (JSON.stringify(list) === JSON.stringify(p.photo_ids)) return p;
    const next = { version: p.version + 1, reviewed_version: null, validated_version: null };
    write(id, next); q.clear.run(id); list.forEach((pid, position) => q.add.run(id, pid, position));
    return get(id);
  };
  function propose(id, input) {
    return db.transaction(() => {
      const { s, p } = current(id, input), list = ids(input.photo_ids);
      requireAvailable(s, list);
      // Le photographe choisit les œuvres ; seul le directeur de publication décide de changer leur ordre.
      const retained = new Set(list), existing = new Set(p.photo_ids);
      return replace(id, p, [...p.photo_ids.filter(pid => retained.has(pid)), ...list.filter(pid => !existing.has(pid))]);
    })();
  }
  function reorder(id, input) {
    return db.transaction(() => {
      const { p } = current(id, input), list = ids(input.photo_ids), existing = new Set(p.photo_ids);
      if (list.length !== p.photo_ids.length || list.some(pid => !existing.has(pid)))
        throw new SaisonPropositionsError('L’ordre doit reprendre exactement les photos proposées.', { field: 'photo_ids' });
      return replace(id, p, list);
    })();
  }
  function review(id, input) {
    return db.transaction(() => {
      const { s, p } = current(id, input);
      if (!p.photo_ids.length) throw new SaisonPropositionsError('Proposez au moins une photographie avant validation.', { field: 'photo_ids' });
      requireAvailable(s, p.photo_ids);
      write(id, { ...p, reviewed_version: p.version }); return get(id);
    })();
  }
  function validate(id, input) {
    return db.transaction(() => {
      const { s, p } = current(id, input);
      if (p.reviewed_version !== p.version) throw new SaisonPropositionsError('La relecture de cette version est nécessaire avant la validation.', { status: 409 });
      requireAvailable(s, p.photo_ids);
      write(id, { ...p, validated_version: p.version }); return get(id);
    })();
  }
  function approvedIds(id) {
    const s = identifier(id) ? saisons.get(id) : null;
    if (!s || s.state === 'retire') return [];
    const p = get(id);
    return p.reviewed_version === p.version && p.validated_version === p.version ? available(s, p.photo_ids) : [];
  }
  return { get, propose, reorder, review, validate, approvedIds };
}
