import { SaisonError, LIMITS } from './saisons.js';
import { formatSaisonDate, parseSaisonDate } from './saisons-calendrier.js';

// Contrat des formulaires S1, indépendant des futurs droits HTTP. Le branchement devra fournir le fuseau décidé
// et contrôler ses permissions avant tout appel ; ce module ne crée ni route ni autorisation.
const TEXTS = ['title', 'intro'].flatMap(f => [f, `${f}_en`, `${f}_de`]);
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
  const fields = s => ({ ...Object.fromEntries(TEXTS.map(f => [f, s[f] || ''])), opens_at: formatSaisonDate(s.opens_at, zone), closes_at: formatSaisonDate(s.closes_at, zone) });

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
      return saisons.revise(id, { version, input, photo_ids: [...ordered, ...add] });
    })();
  }

  // Recherche bornée, avec ordre stable et pagination ; aucun brouillon ni chemin d’image dans les résultats.
  function candidates({ search = '', page = 1 } = {}) {
    if (typeof search !== 'string' || search.length > 120 || !Number.isSafeInteger(page) || page < 1 || page > 10000)
      throw new SaisonError('Recherche ou page invalide.');
    const term = `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`, size = 24;
    const total = db.prepare("SELECT count(*) FROM photos WHERE status = 'published' AND title LIKE ? ESCAPE '\\'").pluck().get(term);
    const photos = db.prepare("SELECT id, title FROM photos WHERE status = 'published' AND title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT ? OFFSET ?").all(term, size, (page - 1) * size);
    return { photos, total, page, pages: Math.max(1, Math.ceil(total / size)) };
  }
  return { fields, save, candidates };
}
