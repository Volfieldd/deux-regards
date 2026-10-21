/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// À valider (admin v2) : ce que le script ajoute à views/admin/v2/review.eta, après admin-v2.js. Valider les photos
// cochées passe d'abord par un dialogue qui dit combien de photos partent, quand, et lesquelles gardent un titre
// provisoire (UX-A-03) ; « Annuler » d'abord, le focus revient au bouton. Sans script, le formulaire part tel quel.
(function () {
  const form = $('[data-valider]');
  if (!form) return;
  const boxes = () => $$('input[name="ids"]', form);
  const checked = () => boxes().filter(b => b.checked);
  const button = $('[data-rv-valider]', form);
  const count = $('[data-rv-compte]', form);
  const date = $('#rv-date', form);
  const when = () => form.elements.quand?.value || 'maintenant';
  function update() {
    const n = checked().length;
    if (count) count.textContent = n ? T(n > 1 ? '{n} photos cochées' : '{n} photo cochée', { n }) : T('Aucune photo cochée.');
    if (button) button.textContent = !n ? T('Valider les photos cochées') : when() === 'date' ? (n > 1 ? T('Programmer les {n} photos…', { n }) : T('Programmer la photo…')) : (n > 1 ? T('Publier les {n} photos…', { n }) : T('Publier la photo…'));
  }
  form.addEventListener('change', update);
  // Choisir un jour coche « Programmer » ; revenir à « maintenant » ne l'efface pas.
  date?.addEventListener('input', () => { const r = $('input[name="quand"][value="date"]', form); if (r && date.value) { r.checked = true; update(); } });
  update();

  const dlg = $('[data-dlg-valider]');
  let confirmed = false;
  form.addEventListener('submit', e => {
    if (confirmed || !dlg) { confirmed = false; return; }
    e.preventDefault();
    const rows = checked().map(b => b.closest('tr'));
    const n = rows.length;
    if (!n) { toast.show(esc(T('Cochez au moins une photo.')), { error: true }); boxes()[0]?.focus(); return; }
    const at = when() === 'date';
    if (at && !date.value) { fieldError(date, T('Choisissez une date et une heure.')); date.focus(); return; }
    fieldError(date, '');
    const shown = at ? new Intl.DateTimeFormat(document.documentElement.lang || 'fr', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(date.value)) : '';
    $('[data-dlg-titre]', dlg).textContent = at ? (n > 1 ? T('Programmer les {n} photos le {date} ?', { n, date: shown }) : T('Programmer la photo le {date} ?', { date: shown })) : (n > 1 ? T('Publier les {n} photos ?', { n }) : T('Publier « {title} » ?', { title: rows[0].dataset.titre }));
    const prov = rows.filter(r => 'provisoire' in r.dataset);
    $('[data-dlg-texte]', dlg).textContent = prov.length
      ? T(prov.length > 1 ? '{n} gardent le nom du fichier comme titre : l’adresse de leur page se fige à la publication. Renvoyez-les plutôt au photographe, ou publiez quand même.' : '{n} garde le nom du fichier comme titre : l’adresse de sa page se fige à la publication. Renvoyez-la plutôt au photographe, ou publiez quand même.', { n: prov.length })
      : at ? T('Elles partiront en ligne à l’heure dite ; d’ici là, « Annuler la programmation » les retient.') : T('Elles seront en ligne tout de suite ; leurs photographes sont prévenus.');
    $('[data-dlg-liste]', dlg).innerHTML = prov.map(r => `<li><span class="ph" aria-hidden="true"></span><div><p><b>${esc(r.dataset.titre)}</b> : ${esc(T('titre provisoire'))}</p></div></li>`).join('');
    const ok = $('[data-dlg-ok]', dlg);
    ok.textContent = prov.length ? T('Valider quand même') : at ? (n > 1 ? T('Programmer les {n} photos', { n }) : T('Programmer la photo')) : (n > 1 ? T('Publier les {n} photos', { n }) : T('Publier la photo'));
    ok.onclick = () => { confirmed = true; dlg.close(); form.requestSubmit(button); };
    dlg.addEventListener('close', () => { if (!confirmed) button.focus(); }, { once: true });
    dlg.showModal();
    $('[data-annuler]', dlg).focus();
  });
})();
