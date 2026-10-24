import fs from 'node:fs';
import path from 'node:path';
import { variantName, widthsFor } from './images.js';

// Projection publique S2 : une annonce ne révèle que son titre, ses dates et sa couverture. La visite complète
// s’arrête douze mois calendaires UTC après clôture ; le bilan garde son adresse sans restituer l’accrochage.
const LANGS = ['fr', 'en', 'de'];
const TEXTS = ['title', 'subtitle', 'intro', 'prologue', 'conclusion'];
const col = (field, lang) => lang === 'fr' ? field : `${field}_${lang}`;
const validInstant = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
const id = value => Number.isSafeInteger(value) && value > 0;

export function archiveEndsAt(closesAt) {
  if (!validInstant(closesAt)) return null;
  const d = new Date(closesAt), year = d.getUTCFullYear() + 1, month = d.getUTCMonth();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const end = Date.UTC(year, month, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
  return validInstant(end) ? end : closesAt;
}

export function createSaisonsPubliques({ saisons, repo, readiness = null, storageDir, now = Date.now }) {
  const complete = (s, fields, required = false) => fields.every(field => {
    const values = LANGS.map(lang => s[col(field, lang)] || '');
    return !required && values.every(value => !value) || values.every(value => typeof value === 'string' && value.trim());
  });
  const eligible = s => s && ['programme', 'publie'].includes(s.state)
    && validInstant(s.opens_at) && validInstant(s.closes_at) && s.closes_at > s.opens_at
    && complete(s, ['title', 'intro'], true) && complete(s, ['subtitle', 'prologue', 'conclusion'])
    && (s.cartels || []).every(c => complete(c, ['cartel']));
  const readyVariant = photo => Boolean(storageDir && photo.file && fs.existsSync(path.join(storageDir, 'variants', variantName(photo.file, widthsFor(photo.width).at(-1), 'webp', photo.variant_key))));
  const visiblePhotos = (s, lang) => {
    const all = repo.photosByIds(s.photo_ids, lang);
    const allowed = readiness ? new Set(readiness.gate(s.photo_ids).ok) : new Set(s.photo_ids);
    return s.photo_ids.map(pid => all.get(pid)).filter(p => p && p.status === 'published' && allowed.has(p.id) && readyVariant(p));
  };
  function project(s, lang, at) {
    if (!eligible(s)) return null;
    const language = LANGS.includes(lang) ? lang : 'fr';
    const local = field => s[col(field, language)] || '';
    const archive_ends_at = archiveEndsAt(s.closes_at);
    const phase = at < s.opens_at ? 'annonce' : at < s.closes_at ? 'ouverte' : at < archive_ends_at ? 'archive' : 'bilan';
    const full = phase === 'ouverte' || phase === 'archive';
    // Après l’archive, aucune couverture ni autre photo n’est rendue par cette exposition. Avant ouverture,
    // le tri courant reste nécessaire pour retirer immédiatement une couverture dépubliée ou non autorisée.
    const photos = phase === 'bilan' ? [] : visiblePhotos(s, language);
    const cover = photos.find(p => p.id === s.cover_id) || null;
    const cartels = new Map((s.cartels || []).map(c => [c.photo_id, c[col('cartel', language)] || '']));
    const hasReport = at >= s.closes_at && validInstant(s.report_published_at) && s.report_published_at <= at && complete(s, ['report'], true);
    const author = s.author_id ? repo.authors(language).find(a => a.id === s.author_id) : null;
    return {
      id: s.id, slug: s.slug, title: local('title'), opens_at: s.opens_at, closes_at: s.closes_at, archive_ends_at,
      phase, full, author: full && author ? { name: author.name, slug: author.slug } : null,
      subtitle: full ? local('subtitle') : '', intro: full ? local('intro') : '', prologue: full ? local('prologue') : '', conclusion: full ? local('conclusion') : '',
      cover, photos: full ? photos.map(p => ({ ...p, cartel: cartels.get(p.id) || '' })) : [],
      photo_ids: full ? photos.map(p => p.id) : [],
      report: hasReport ? local('report') : '', report_published_at: hasReport ? s.report_published_at : null,
    };
  }
  const time = () => {
    const at = now();
    if (!validInstant(at)) throw new TypeError('Horloge des expositions invalide.');
    return at;
  };
  const list = ({ lang = 'fr' } = {}) => {
    const at = time();
    return saisons.list().map(s => project(s, lang, at)).filter(Boolean).sort((a, b) => b.opens_at - a.opens_at || b.id - a.id);
  };
  const bySlug = (slug, { lang = 'fr' } = {}) => typeof slug === 'string' && slug.length <= 160
    ? project(saisons.list().find(s => s.slug === slug), lang, time()) : null;
  const byId = (saisonId, { lang = 'fr' } = {}) => id(saisonId) ? project(saisons.get(saisonId), lang, time()) : null;
  function photo(slug, photoSlug, { lang = 'fr' } = {}) {
    if (typeof photoSlug !== 'string' || photoSlug.length > 200) return null;
    const exposition = bySlug(slug, { lang });
    if (!exposition?.full) return null;
    const index = exposition.photos.findIndex(p => p.slug === photoSlug);
    if (index < 0) return null;
    return { exposition, photo: exposition.photos[index], index, count: exposition.photos.length,
      prev: index > 0 ? exposition.photos[index - 1] : null, next: index + 1 < exposition.photos.length ? exposition.photos[index + 1] : null };
  }

  // BV-20/BV-21 : colonnes textuelles effectivement visibles, à toutes les langues. La source peut changer à
  // l’heure d’ouverture ou d’échéance sans écriture SQL. Le titre d’annonce est public, ses autres textes non.
  function textRows() {
    const at = time(), rows = [];
    for (const s of saisons.list()) {
      if (!eligible(s)) continue;
      const full = at >= s.opens_at && at < archiveEndsAt(s.closes_at);
      const hasReport = at >= s.closes_at && validInstant(s.report_published_at) && s.report_published_at <= at && complete(s, ['report'], true);
      const fields = Object.fromEntries(LANGS.flatMap(lang => [...TEXTS, 'report'].map(field => {
        const name = col(field, lang), shown = field === 'title' || (field === 'report' ? hasReport : full);
        return [name, shown ? s[name] || '' : ''];
      })));
      rows.push({ key: `saisons#${s.id}`, source: 'saisons', id: s.id, champs: fields });
      if (full) {
        const allowed = new Set(visiblePhotos(s, 'fr').map(p => p.id));
        for (const c of s.cartels || []) if (allowed.has(c.photo_id)) rows.push({ key: `saison_cartels#${s.id}:${c.photo_id}`, source: 'saison_cartels', id: s.id, photo_id: c.photo_id,
          champs: { cartel: c.cartel || '', cartel_en: c.cartel_en || '', cartel_de: c.cartel_de || '' } });
      }
    }
    return rows;
  }
  return { list, bySlug, byId, photo, textRows, archiveEndsAt };
}
