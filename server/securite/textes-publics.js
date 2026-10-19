import crypto from 'node:crypto';

// Textes publiés (registre des besoins de la Vigie, BV-20 et BV-21) : titres, légendes et textes de remplacement des
// photos publiées (et leurs lieux et mots-clés, affichés sous la photo et cherchables), noms et textes d'intention des séries, noms, présentations et descriptions courtes des
// photographes, billets publiés des Carnets. Instantané comparé à l'état d'avant après chaque écriture de l'admin et chaque publication
// programmée :
//   - BV-20 : un texte qui GAGNE un lien, une adresse e-mail ou un numéro de téléphone (vecteur d'hameçonnage, comme un
//     contact remplacé, DS9) ; jamais le texte ni le contact dans l'événement : la nature, le domaine, le champ, l'objet ;
//   - BV-21 : le nombre de textes changés par geste (défacement : beaucoup de textes réécrits par un même compte).
// Les liens vers le site lui-même ne comptent pas.

export const SOURCES = [
  { table: 'photos', where: "status = 'published'", champs: ['title', 'title_en', 'title_de', 'legend', 'legend_en', 'legend_de', 'alt_text', 'alt_text_en', 'alt_text_de', 'place', 'place_en', 'place_de', 'keywords'] },
  { table: 'categories', where: '1', champs: ['name', 'name_en', 'name_de', 'intent', 'intent_en', 'intent_de'] },
  { table: 'authors', where: '1', champs: ['name', 'bio', 'bio_en', 'bio_de', 'short_bio', 'short_bio_en', 'short_bio_de'] },
  // Billets des Carnets publiés (un billet retiré sort de l'instantané : compté comme textes changés, BV-21).
  { table: 'posts', where: "state = 'publie'", champs: ['title', 'title_en', 'title_de', 'dek', 'dek_en', 'dek_de', 'body', 'body_en', 'body_de', 'mention', 'mention_en', 'mention_de', 'reply', 'reply_en', 'reply_de'] },
];

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'()\]]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
// Numéro : 9 à 15 chiffres, séparés au plus par des espaces, points, tirets ou parenthèses, commençant par « + » ou 0.
const TEL_RE = /\+?\d(?:[\s.()-]{0,2}\d){8,14}/g;

const hostOf = s => {
  try { return new URL(/^www\./i.test(s) ? `https://${s}` : s).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
};
const empreinte = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

// Contacts d'un texte : Map clé → { ajout, domaine } (clé stable : le numéro par son empreinte, jamais en clair).
export function contactsOf(text, { ownHosts = [] } = {}) {
  const out = new Map();
  const s = String(text || '');
  if (!s) return out;
  for (const m of s.matchAll(URL_RE)) {
    const host = hostOf(m[0].replace(/[.,;:!?]+$/, ''));
    if (!host || ownHosts.some(h => host === h || host.endsWith(`.${h}`))) continue;
    out.set(`lien:${host}`, { ajout: 'lien', domaine: host });
  }
  for (const m of s.matchAll(EMAIL_RE)) {
    const dom = m[1].toLowerCase();
    out.set(`email:${empreinte(m[0].toLowerCase())}`, { ajout: 'email', domaine: dom });
  }
  for (const m of s.replace(URL_RE, ' ').matchAll(TEL_RE)) {
    const digits = m[0].replace(/\D/g, '');
    // Un numéro commence par « + » ou par 0 (une date ou une heure, « 2026-10-18 14:05 », jamais).
    if (digits.length < 9 || !(m[0].startsWith('+') || digits.startsWith('0'))) continue;
    out.set(`telephone:${empreinte(digits)}`, { ajout: 'telephone', domaine: null });
  }
  return out;
}

const SEP = '\u001f';

export function createPublicTexts({ db, ownHosts = [] }) {
  // Une chaîne par ligne, assemblée par SQLite (champs séparés par U+001F) : instantané et comparaison restent de
  // l'ordre de 20 ms pour 10 000 photos (une chaîne par champ en coûtait 150). Seules les lignes changées sont détaillées.
  const stmts = SOURCES.map(src => {
    let cols;
    try { cols = new Set(db.prepare(`PRAGMA table_info(${src.table})`).all().map(c => c.name)); } catch { return null; }
    const champs = src.champs.filter(c => cols.has(c));
    if (!champs.length) return null;
    const expr = champs.map(c => `coalesce(${c}, '')`).join(` || char(31) || `);
    return { src, champs, stmt: db.prepare(`SELECT id, ${expr} FROM ${src.table} WHERE ${src.where}`).raw() };
  }).filter(Boolean);
  const byTable = new Map(stmts.map(x => [x.src.table, x.champs]));
  // Instantané : « table#id » → champs assemblés.
  function snapshot() {
    const m = new Map();
    for (const { src, stmt } of stmts) for (const [id, txt] of stmt.iterate()) m.set(`${src.table}#${id}`, txt);
    return m;
  }
  // Différence : textes changés (« table.champ#id » : ajoutés, modifiés ou retirés) et contacts gagnés.
  function diff(before, after) {
    const changes = [];
    const ajouts = [];
    const compare = (key, oldRow, newRow) => {
      const [table, id] = key.split('#');
      const champs = byTable.get(table) || [];
      const o = oldRow ? oldRow.split(SEP) : [];
      const n = newRow ? newRow.split(SEP) : [];
      champs.forEach((c, i) => {
        const was = o[i] || '', now = n[i] || '';
        if (was === now) return;
        changes.push(`${table}.${c}#${id}`);
        if (!now) return;
        const avant = contactsOf(was, { ownHosts });
        for (const [k, x] of contactsOf(now, { ownHosts })) if (!avant.has(k)) ajouts.push({ champ: `${table}.${c}`, id: Number(id), ...x });
      });
    };
    for (const [k, row] of after) { const old = before.get(k); if (old !== row) compare(k, old, row); }
    for (const [k, row] of before) if (!after.has(k)) compare(k, row, null);
    return { changes, ajouts };
  }
  return { snapshot, diff };
}
