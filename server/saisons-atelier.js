import { SaisonError, LIMITS, EDITORIAL_FIELDS } from './saisons.js';
import { formatSaisonDate, parseSaisonDate } from './saisons-calendrier.js';

// Contrat des formulaires S1 : les routes fournissent le fuseau décidé et contrôlent leurs permissions avant
// chaque appel ; ce module ne crée ni route ni autorisation.
const TEXTS = EDITORIAL_FIELDS.flatMap(f => [f, `${f}_en`, `${f}_de`]);
const CARTEL_FIELDS = ['cartel', 'cartel_en', 'cartel_de'];
const cartelField = (field, id) => field.replace('cartel', `cartel_${id}`);
const idOf = (value, field) => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new SaisonError('Identifiant entier positif attendu.', { field });
  return Number(value);
};
const listOf = (body, field) => {
  const values = body[field] == null ? [] : [].concat(body[field]);
  if (values.length > LIMITS.photos) throw new SaisonError('Accrochage trop long.', { field: 'photo_ids' });
  const ids = values.map(value => idOf(value, 'photo_ids'));
  if (new Set(ids).size !== ids.length) throw new SaisonError('Une photographie ne peut figurer qu’une fois.', { field: 'photo_ids' });
  return ids;
};

export function createSaisonsAtelier({ db, saisons, zone }) {
  // Pas de fuseau déduit du navigateur ou de la machine : son choix reste une décision du branchement.
  if (typeof zone !== 'string' || !zone) throw new TypeError('Fuseau des saisons attendu.');
  new Intl.DateTimeFormat('fr-FR', { timeZone: zone });
  const photo = db.prepare('SELECT status FROM photos WHERE id = ?').pluck();
  const row = id => {
    const s = saisons.get(id);
    if (!s) throw new SaisonError('Saison introuvable.', { status: 404 });
    return s;
  };
  const fields = s => ({ ...Object.fromEntries(TEXTS.map(f => [f, s[f] || ''])), author_id: s.author_id == null ? '' : String(s.author_id), cover_id: s.cover_id == null ? '' : String(s.cover_id),
    ...Object.fromEntries(s.cartels.flatMap(c => CARTEL_FIELDS.map(field => [cartelField(field, c.photo_id), c[field]]))),
    opens_at: formatSaisonDate(s.opens_at, zone), closes_at: formatSaisonDate(s.closes_at, zone) });

  function save(id, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SaisonError('Formulaire de saison attendu.');
    return db.transaction(() => {
      const s = row(id), version = idOf(body.version, 'version');
      // La précondition est vérifiée avant de relire les champs d’un ancien écran, puis dans revise avant écriture.
      if (s.version !== version) throw new SaisonError('Modifié entre-temps : rechargez la page pour voir la dernière version.', { field: 'version', status: 409 });
      const input = {};
      for (const field of TEXTS) {
        if (typeof body[field] !== 'string') throw new SaisonError('Texte attendu.', { field });
        input[field] = body[field];
      }
      if (Object.hasOwn(body, 'author_id')) input.author_id = body.author_id === '' ? null : idOf(body.author_id, 'author_id');
      input.cover_id = body.cover_id === '' ? null : idOf(body.cover_id, 'cover_id');
      for (const field of ['opens_at', 'closes_at']) {
        // L’écran saisit à la minute ; changer un texte ne doit pas tronquer un instant S0 plus précis.
        if (body[field] === formatSaisonDate(s[field], zone)) { input[field] = s[field]; continue; }
        if (body[field] === '') { input[field] = null; continue; }
        const instant = parseSaisonDate(body[field], zone);
        if (instant == null) throw new SaisonError('Date invalide ou heure ambiguë : choisissez une autre heure.', { field });
        input[field] = instant;
      }
      const current = listOf(body, 'photo_ids[]');
      if (current.length !== s.photo_ids.length || current.some(pid => !s.photo_ids.includes(pid)))
        throw new SaisonError('L’accrochage a changé : rechargez la page.', { field: 'photo_ids', status: 409 });
      const add = listOf(body, 'ajouter[]');
      if (add.some(pid => current.includes(pid) || photo.get(pid) !== 'published'))
        throw new SaisonError('Choisissez uniquement des photographies publiées et absentes de l’accrochage.', { field: 'photo_ids' });
      const remove = body.retirer_photo == null ? null : idOf(body.retirer_photo, 'photo_ids');
      if (remove != null && !current.includes(remove)) throw new SaisonError('Photographie absente de l’accrochage.', { field: 'photo_ids' });
      const positioned = current.map(pid => ({ id: pid, position: idOf(body[`position_${pid}`], 'photo_ids') }));
      if (positioned.some(p => p.position > LIMITS.photos) || new Set(positioned.map(p => p.position)).size !== positioned.length)
        throw new SaisonError('Donnez des positions distinctes entre 1 et 500.', { field: 'photo_ids' });
      const ordered = positioned.sort((a, b) => a.position - b.position).map(p => p.id).filter(pid => pid !== remove);
      const photo_ids = [...ordered, ...add];
      // Retirer la couverture laisse la saison à compléter : aucune autre image n’est choisie à sa place.
      if (remove === input.cover_id) input.cover_id = null;
      if (input.cover_id != null && !photo_ids.includes(input.cover_id))
        throw new SaisonError('Choisissez une couverture dans l’accrochage.', { field: 'cover_id' });
      const cartels = ordered.map(photo_id => ({ photo_id, ...Object.fromEntries(CARTEL_FIELDS.map(field => {
        const name = cartelField(field, photo_id);
        if (typeof body[name] !== 'string') throw new SaisonError('Texte attendu.', { field: name });
        return [field, body[name]];
      })) }));
      return saisons.revise(id, { version, input, photo_ids, cartels });
    })();
  }

  // Recherche bornée, avec ordre stable et pagination ; aucun brouillon ni chemin d’image dans les résultats.
  function candidates({ search = '', page = 1, author_id = null } = {}) {
    if (typeof search !== 'string' || search.length > 120 || !Number.isSafeInteger(page) || page < 1 || page > 10000 || (author_id !== null && (!Number.isSafeInteger(author_id) || author_id <= 0)))
      throw new SaisonError('Recherche ou page invalide.');
    const term = `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`, size = 24;
    const total = db.prepare("SELECT count(*) FROM photos WHERE status = 'published' AND (? IS NULL OR author_id = ?) AND title LIKE ? ESCAPE '\\'").pluck().get(author_id, author_id, term);
    const photos = db.prepare("SELECT id, title FROM photos WHERE status = 'published' AND (? IS NULL OR author_id = ?) AND title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ? OFFSET ?").all(author_id, author_id, term, size, (page - 1) * size);
    return { photos, total, page, pages: Math.max(1, Math.ceil(total / size)) };
  }
  return { fields, save, candidates };
}
