import { byId as cityById, norm } from './geo/cities.js';
import { formsOf } from './keywords-suggest.js';
import { foldLetters } from './slug.js';

// Recherche par mots-clés sur le site public : parmi les photos publiées, dans le titre, la légende, le lieu, les
// mots-clés, la ville (et sa région), la série et le photographe, dans toutes les langues (« München » trouve une photo
// légendée « Munich »). Sans accents ni majuscules ; chaque mot cherché doit commencer un mot de la photo (« brum »
// trouve « brume ») ; tous les mots doivent être trouvés. Les photos publiées se comptent en centaines : une recherche
// en mémoire, sans dépendance ni index à tenir à jour.
const FIELDS = [
  // [colonnes, poids] : un mot du titre compte plus qu'un mot de la légende.
  [['title', 'title_en', 'title_de'], 4],
  [['keywords'], 3],
  [['place', 'place_en', 'place_de', 'city'], 2.5],
  [['category', 'category_en', 'category_de', 'author'], 1.5],
  [['legend', 'legend_en', 'legend_de'], 1],
];
export const MAX_QUERY = 100;

export function createSearch({ db }) {
  // Dans l'ordre de la galerie : à score égal, l'ordre choisi par les auteurs.
  const rows = db.prepare(`SELECT p.id, p.title, p.title_en, p.title_de, p.legend, p.legend_en, p.legend_de, p.place, p.place_en, p.place_de,
      p.keywords, p.city_id, p.city_name, c.name AS category, c.name_en AS category_en, c.name_de AS category_de, a.name AS author
    FROM photos p JOIN categories c ON c.id = p.category_id JOIN authors a ON a.id = p.author_id WHERE p.status = 'published'
    ORDER BY p.position, p.id`);
  const COLS = rows.columns().map(c => c.name);
  // Sans accents ni majuscules, ß, œ, æ, ø… repliés (« strasse » trouve « Straße », « coeur » trouve « cœur »).
  const words = s => foldLetters(norm(s)).split(' ').filter(Boolean);
  // Mots de chaque champ d'une photo, une fois par champ (pondération).
  const docOf = r => {
    const city = r.city_id ? cityById(r.city_id) : null;
    // Un mot-clé du vocabulaire est cherchable dans les trois langues (« phare » : aussi lighthouse, Leuchtturm).
    const keywords = String(r.keywords || '').split(',').flatMap(k => formsOf(k) || [k]).join(' ');
    const v = { ...r, keywords, city: city ? city.labels.join(' ') : r.city_name || '' };
    return FIELDS.map(([cols, w]) => [new Set(cols.flatMap(k => words(v[k] || ''))), w]);
  };
  // Mots de chaque photo gardés d'une recherche à l'autre (le calcul coûte bien plus que la lecture des lignes) :
  // recalculés seulement pour une photo dont un champ lu a changé ; les photos qui ne sont plus publiées sont oubliées.
  let cache = new Map();
  const docs = () => {
    const next = new Map();
    const list = rows.all().map(r => {
      const key = COLS.map(k => r[k] ?? '').join('\u0001');
      const hit = cache.get(r.id);
      const doc = hit && hit.key === key ? hit.doc : docOf(r);
      next.set(r.id, { key, doc });
      return { id: r.id, doc };
    });
    cache = next;
    return list;
  };
  return {
    // Mots retenus d'une requête (2 lettres au moins, 8 au plus).
    terms: q => [...new Set(words(String(q || '').slice(0, MAX_QUERY)).filter(w => w.length >= 2))].slice(0, 8),
    // Identifiants des photos trouvées, la plus pertinente d'abord ; score : somme des poids des champs touchés.
    find(q) {
      const terms = this.terms(q);
      if (!terms.length) return [];
      const found = [];
      for (const { id, doc } of docs()) {
        let score = 0;
        const all = terms.every(t => {
          let best = 0;
          for (const [set, w] of doc) {
            for (const word of set) {
              if (word === t) { best = Math.max(best, w + 0.5); break; }
              if (word.startsWith(t)) best = Math.max(best, w);
            }
          }
          score += best;
          return best > 0;
        });
        if (all) found.push({ id, score });
      }
      return found.sort((a, b) => b.score - a.score).map(f => f.id);
    },
  };
}
