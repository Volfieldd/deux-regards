// Données des tests de la partie B (Instagram, Carnets et Galeries privées dans la coquille v2, Mon QR, Merci) : chaque
// test crée les siennes par les routes de l'admin (comme un navigateur sans script) et les efface ensuite.
import { csrfOf } from './terrain-donnees.js';

const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// Une galerie ouverte de Sébastien, avec trois photos ; renvoie son numéro.
export async function creerGalerie(page, titre = `Galerie v2 ${Date.now()}`) {
  await page.goto('/admin/galeries/nouvelle');
  const csrf = await page.locator('body').getAttribute('data-csrf');
  const auteur = await page.locator('#g-author option', { hasText: 'Sébastien' }).first().getAttribute('value').catch(() => null);
  const res = await page.request.post('/admin/galeries', { form: { _csrf: csrf, title: titre, closes: day(60), ...(auteur ? { author_id: auteur } : {}) } });
  const id = Number(/\/admin\/galeries\/(\d+)/.exec(res.url())?.[1]);
  if (!id) throw new Error(`galerie non créée : ${res.status()} ${res.url()}`);
  await page.goto(`/admin/galeries/${id}/photos`);
  const ids = await page.locator('.gp-candidats input[name="photos"]').evaluateAll(els => els.slice(0, 3).map(e => e.value));
  const body = new URLSearchParams([['_csrf', csrf], ...ids.map(x => ['photos', x])]).toString();
  await page.request.post(`/admin/galeries/${id}/photos`, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, data: body });
  await page.request.post(`/admin/galeries/${id}/ouvrir`, { form: { _csrf: csrf } });
  return id;
}
export async function supprimerGalerie(page, id) {
  const csrf = await csrfOf(page);
  await page.request.post(`/admin/galeries/${id}/supprimer`, { form: { _csrf: csrf } });
}

// Un billet de Sébastien, jamais publié (il se supprime).
export async function creerBillet(page, titre = `Billet v2 ${Date.now()}`) {
  await page.goto('/admin/carnet');
  const csrf = await page.locator('body').getAttribute('data-csrf');
  const auteur = await page.locator('input[name="authors[]"]').first().getAttribute('value').catch(() => null);
  const res = await page.request.post('/admin/carnet', { form: { _csrf: csrf, title: titre, rubrique: 'voyages', ...(auteur ? { 'authors[]': auteur } : {}) } });
  const id = Number(/\/admin\/carnet\/(\d+)/.exec(res.url())?.[1]);
  if (!id) throw new Error(`billet non créé : ${res.status()} ${res.url()}`);
  return id;
}
export async function supprimerBillet(page, id) {
  const csrf = await csrfOf(page);
  await page.request.post(`/admin/carnet/${id}/supprimer`, { form: { _csrf: csrf } });
}

// Deux photos publiées dans la file Instagram ; renvoie les numéros des envois (à retirer ensuite).
export async function remplirFile(page, n = 2) {
  await page.goto('/admin/photos?statut=published');
  const csrf = await page.locator('body').getAttribute('data-csrf');
  await page.goto('/admin/instagram');
  const avant = new Set(await page.locator('[data-ig-item]').evaluateAll(els => els.map(e => e.dataset.igItem)));
  const enFile = new Set(await page.locator('[data-ig-item] .ig-titre a').evaluateAll(els => els.map(a => /\/admin\/photos\/(\d+)/.exec(a.getAttribute('href'))?.[1])));
  await page.goto('/admin/photos?statut=published');
  const photos = (await page.locator('.tile').evaluateAll(ts => ts.map(t => t.dataset.id))).filter(id => !enFile.has(id)).slice(0, n);
  for (const id of photos) await page.request.post('/admin/instagram/file', { form: { _csrf: csrf, photo_id: id } });
  await page.goto('/admin/instagram');
  // Les envois ajoutés par ce test seulement, dans l'ordre de la file.
  return (await page.locator('[data-ig-item]').evaluateAll(els => els.map(e => e.dataset.igItem))).filter(id => !avant.has(id)).map(Number);
}
export async function viderFile(page, posts) {
  const csrf = await csrfOf(page);
  for (const id of posts) await page.request.post(`/admin/instagram/${id}/annuler`, { form: { _csrf: csrf } });
}

// Une rencontre avec une carte (référence) : l'écran « Merci » ; effacée ensuite (terrain-donnees.js).
export async function creerRencontreCarte(page) {
  await page.goto('/admin/rencontres');
  const csrf = await page.locator('body').getAttribute('data-csrf');
  const auteur = await page.locator('select[name="author_id"] option', { hasText: 'Sébastien' }).first().getAttribute('value');
  const ref = `S-${String(9000 + Math.floor(Math.random() * 999)).padStart(4, '0')}`;
  const res = await page.request.post('/admin/rencontres', { multipart: { _csrf: csrf, ref, author_id: auteur, name: 'Merci Essai', email: 'essai@exemple.fr', met_on: day(0), place: 'Quai', signed: 'on', scope_site: 'on' } });
  const id = Number(/\/admin\/rencontres\/(\d+)/.exec(res.url())?.[1]);
  if (!id) throw new Error(`rencontre non créée : ${res.status()} ${res.url()}`);
  return id;
}
