// Données des tests de la vague 3b (Personnes, une rencontre, Sorties, Voyages) : le jeu de démonstration n'a ni rencontre
// ni voyage. Chaque test crée les siens par les routes de l'admin (formulaire « Saisir une carte signée », « Nouveau
// voyage ») et les efface ensuite (effacement RGPD, suppression du voyage).
export const csrfOf = async page => {
  if (!/\/admin/.test(page.url())) await page.goto('/admin');
  return page.locator('body').getAttribute('data-csrf');
};

// Une rencontre de Sébastien, accord signé (site), datée du jour donné : elle crée aussi la sortie de ce jour-là.
export async function creerRencontre(page, { jour = '2025-10-12', nom = 'Inès Essai' } = {}) {
  await page.goto('/admin/rencontres');
  const csrf = await page.locator('body').getAttribute('data-csrf');
  const auteur = await page.locator('select[name="author_id"] option', { hasText: 'Sébastien' }).first().getAttribute('value');
  const res = await page.request.post('/admin/rencontres', { multipart: { _csrf: csrf, ref: '', author_id: auteur, name: nom, email: 'essai@exemple.fr', met_on: jour, place: 'Quai de la Loire', details: 'manteau rouge', signed: 'on', scope_site: 'on' } });
  const id = Number(/\/admin\/rencontres\/(\d+)/.exec(res.url())?.[1]);
  if (!id) throw new Error(`rencontre non créée : ${res.status()} ${res.url()}`);
  return { id, auteur: Number(auteur), jour };
}
export async function effacerRencontre(page, id) {
  const csrf = await csrfOf(page);
  await page.request.post(`/admin/rencontres/${id}/effacer`, { form: { _csrf: csrf } });
}
export async function creerVoyage(page, nom = 'Voyage d’essai') {
  const csrf = await csrfOf(page);
  const res = await page.request.post('/admin/voyages', { form: { _csrf: csrf, name: nom } });
  const id = Number(/\/admin\/voyages\/(\d+)/.exec(res.url())?.[1]);
  if (!id) throw new Error(`voyage non créé : ${res.status()} ${res.url()}`);
  return id;
}
export async function supprimerVoyage(page, id) {
  const csrf = await csrfOf(page);
  await page.request.post(`/admin/voyages/${id}/supprimer`, { form: { _csrf: csrf } });
}
