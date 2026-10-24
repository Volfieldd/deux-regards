// Limites du protocole : nombre d’URL et taille UTF-8 du document complet, sans compression. Les lignes sont
// déjà sérialisées par le site ; aucune photo ni donnée supplémentaire n’est lue pour les répartir.
export const SITEMAP_LIMITS = Object.freeze({ urls: 50_000, bytes: 50 * 1024 * 1024 });
export const SITEMAP_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';
export const SITEMAP_TAIL = '\n</urlset>\n';
const size = text => Buffer.byteLength(text, 'utf8');
const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function partitionSitemaps(entries, { maxUrls = SITEMAP_LIMITS.urls, maxBytes = SITEMAP_LIMITS.bytes } = {}) {
  const overhead = size(SITEMAP_HEAD) + size(SITEMAP_TAIL);
  if (!Number.isSafeInteger(maxUrls) || maxUrls < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < overhead) throw new RangeError('Limites du plan du site invalides.');
  const documents = [];
  let rows = [], bytes = overhead;
  const flush = () => { documents.push(SITEMAP_HEAD + rows.join('\n') + SITEMAP_TAIL); rows = []; bytes = overhead; };
  for (const entry of entries) {
    if (typeof entry !== 'string') throw new TypeError('Entrée du plan du site invalide.');
    const length = size(entry);
    if (rows.length && (rows.length === maxUrls || bytes + 1 + length > maxBytes)) flush();
    const separator = rows.length ? 1 : 0;
    if (bytes + separator + length > maxBytes) throw new RangeError('Une entrée dépasse la taille maximale du plan du site.');
    rows.push(entry); bytes += separator + length;
  }
  if (rows.length || !documents.length) flush();
  return documents;
}

export function createSitemapIndex(publicUrl, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > SITEMAP_LIMITS.urls) throw new RangeError('Nombre de plans du site invalide.');
  const rows = Array.from({ length: count }, (_, i) => `  <sitemap><loc>${xml(publicUrl)}/sitemaps/${i + 1}.xml</loc></sitemap>`);
  const document = '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + rows.join('\n') + '\n</sitemapindex>\n';
  if (size(document) > SITEMAP_LIMITS.bytes) throw new RangeError('L’index dépasse la taille maximale des plans du site.');
  return document;
}
