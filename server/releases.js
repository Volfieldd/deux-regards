import fs from 'node:fs';

// Nouveautés de l'admin (server/nouveautes.json, en trois langues, la plus récente d'abord). Version = 1.<numéro de
// la PR>.0 ; celle de package.json est la version installée et doit être la plus récente du fichier (test).
// Chaque compte garde la dernière version vue (accounts.seen_release) : la fenêtre « Nouveautés » montre, une seule
// fois, tout ce qui est arrivé depuis. Une nouveauté peut ne concerner qu'un droit (perm) : elle n'est montrée qu'à
// qui l'a.
const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
export const CURRENT = read('../package.json').version;
const parts = v => String(v || '0').split('.').map(Number);
export const compare = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
export const RELEASES = read('./nouveautes.json').sort((a, b) => compare(b.version, a.version));

// Dans la langue de l'admin, réduite aux nouveautés que le compte peut voir (can : request.can).
export function localize(r, lang, can = () => true) {
  const l = ['fr', 'en', 'de'].includes(lang) ? lang : 'fr';
  return { version: r.version, date: r.date, pr: r.pr, title: r.title[l] || r.title.fr, items: r.items.filter(i => !i.perm || can(i.perm)).map(i => i[l] || i.fr) };
}
// Versions arrivées après celle déjà vue (aucune vue : toutes).
export const unseen = seen => RELEASES.filter(r => !seen || compare(r.version, seen) > 0);
