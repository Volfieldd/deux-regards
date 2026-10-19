/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Admin v2, dernière vague, partie B : Instagram, et Carnets et Galeries privées dans la coquille v2. Amélioration
// progressive : sans ce script, les formulaires partent tels quels vers les routes de la v1 (boutons .sans-script, dialogues
// par leur ancre). Avec lui (MQ-00 § 5 et 6, MQ-09) :
//   - Instagram : « Avancer » et « Reculer » sans recharger, avec « Défaire » (le geste inverse) ; « Publier maintenant »,
//     confirmé dans son dialogue, suivi sur place (étapes, barre) ; les réglages s'enregistrent au geste (le formulaire
//     entier, comme sans script), avec « Défaire » qui remet les réglages d'avant ;
//   - Galeries privées : ce que faisait admin.js pour elles (textes réservés au script, « Copier », champ jamais caché
//     sous la barre d'onglets du téléphone). L'éditeur de billet garde son script (admin/carnet.js).
// Mêmes routes : le serveur reste seul juge (droits, jeton, portée, journal, Vigie).
// Chargé après admin-v2.js, dont il reprend les outils ($, $$, T, Th, esc, post, toast, temoin, fieldError, CSRF).

// Une seule écriture à la fois : les gestes rapides partent dans l'ordre.
const enFile = (() => { let chain = Promise.resolve(); return fn => (chain = chain.then(fn, fn)); })();

// ----- Galeries privées (repris d'admin.js de la v1, que la coquille v2 ne charge pas) -----
$$('.v2-publier [data-js-only]').forEach(el => { el.hidden = false; });
// Au téléphone, le champ qui prend le focus ne reste jamais sous les barres fixes (onglets, actions de l'en-tête) : un
// champ en partie visible n'est pas défilé par le navigateur (WCAG 2.4.12). Étendu à tous les écrans de ce lot.
if ($('.v2-publier')) document.addEventListener('focusin', e => {
  const el = e.target;
  if (!el.closest?.('.v2-publier') || el.closest('dialog')) return;
  const clear = () => {
    const bars = $$('.tabbar, .ep-actions').filter(b => getComputedStyle(b).position === 'fixed' && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0);
    if (!bars.length) return;
    const top = Math.min(...bars.map(b => b.getBoundingClientRect().top));
    const r = el.getBoundingClientRect();
    // Le bas du champ au-dessus des barres ; un champ plus haut que la place libre, son haut en tête de l'écran.
    if (r.bottom > top - 8 && r.top < top) window.scrollBy(0, Math.min(r.bottom - top + 16, r.top - 16));
  };
  // Tout de suite, puis après le défilement que le navigateur fait lui-même.
  clear();
  requestAnimationFrame(clear);
});
$$('.v2-publier [data-copier]').forEach(b => b.addEventListener('click', async () => {
  const src = document.getElementById(b.dataset.copier);
  if (!src) return;
  try {
    await navigator.clipboard.writeText(src.textContent.trim());
    const label = b.textContent;
    b.textContent = `✓ ${b.dataset.copie || label}`;
    setTimeout(() => { b.textContent = label; }, 2500);
  } catch { /* presse-papiers refusé : le texte reste sélectionnable */ }
}));

// ----- Instagram : l'ordre de la file, sans recharger -----
(function () {
  const list = $('[data-ig-file]');
  if (!list) return;
  const items = () => $$(':scope > li[data-ig-item]', list);
  // Rangs et flèches : la première ne monte pas, la dernière ne descend pas.
  const sync = () => items().forEach((li, i, all) => {
    const rang = $('[data-ig-rang]', li);
    if (rang) rang.textContent = String(i + 1);
    const up = $('form[data-ig-deplacer="monter"] button', li), down = $('form[data-ig-deplacer="descendre"] button', li);
    if (up) up.disabled = i === 0;
    if (down) down.disabled = i === all.length - 1;
  });
  const move = (li, dir, undoing = false) => enFile(async () => {
    const form = $(`form[data-ig-deplacer="${dir}"]`, li);
    const title = li.dataset.titre;
    try {
      await post(form.action, {});
      if (dir === 'monter' && li.previousElementSibling) li.previousElementSibling.before(li);
      if (dir === 'descendre' && li.nextElementSibling) li.nextElementSibling.after(li);
      sync();
      const n = items().indexOf(li) + 1;
      // Le focus reste sur la flèche du même sens, ou sur l'autre si elle est devenue inactive.
      const same = $(`form[data-ig-deplacer="${dir}"] button`, li), other = $(`form[data-ig-deplacer="${dir === 'monter' ? 'descendre' : 'monter'}"] button`, li);
      (same && !same.disabled ? same : other)?.focus();
      if (undoing) { toast.show(Th('« {title} » remise en place {n}.', { title, n })); return; }
      toast.show(Th('« {title} » en place {n} dans la file.', { title, n }), { undo: async () => { await move(li, dir === 'monter' ? 'descendre' : 'monter', true); } });
    } catch (err) {
      toast.show(esc(err.message), { error: true, retry: err.kind === 'reseau' || err.kind === 'session' ? () => move(li, dir, undoing) : null });
    }
  });
  list.addEventListener('submit', e => {
    const form = e.target.closest('form[data-ig-deplacer]');
    if (!form) return;
    e.preventDefault();
    move(form.closest('li[data-ig-item]'), form.dataset.igDeplacer);
  });
})();

// ----- Instagram : « Publier maintenant », confirmé dans son dialogue, suivi sur place -----
(function () {
  const forms = $$('form[data-ig-publish]');
  const watching = $$('[data-ig-watch]');
  if (!forms.length && !watching.length) return;
  const box = id => $(`[data-ig-item="${id}"] [data-ig-progress]`);
  const show = (id, st) => {
    const b = box(id);
    if (!b) return;
    b.hidden = false;
    $('progress', b).value = st.percent || 0;
    $('[data-ig-progress-label]', b).textContent = st.label || T('Envoi en cours…');
  };
  const finish = (id, st) => {
    const b = box(id);
    if (!b) return;
    if (st.ok && st.permalink) { const a = document.createElement('a'); a.className = 'more'; a.href = st.permalink; a.target = '_blank'; a.rel = 'noopener'; a.textContent = T('Voir le post'); b.append(' ', a); }
    // La file, les dernières publications et le journal suivent : la page se recharge après un succès.
    if (st.ok) setTimeout(() => location.reload(), 2500);
    else { const a = document.createElement('a'); a.className = 'more'; a.href = location.pathname; a.textContent = T('Mettre à jour la page'); b.append(' ', a); }
  };
  async function watch(id) {
    for (let k = 0; k < 240; k++) {
      await new Promise(r => setTimeout(r, k ? 1000 : 300));
      let st;
      try { st = await (await fetch(`/admin/instagram/${id}/etat`, { headers: { accept: 'application/json' } })).json(); } catch { st = null; }
      if (!st) continue;
      show(id, st);
      if (st.done) return finish(id, st);
    }
    show(id, { percent: 0, label: T('Suivi interrompu : rechargez la page pour voir où en est l’envoi.') });
  }
  forms.forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const id = form.dataset.igPublish;
    form.closest('dialog')?.close();
    $(`[data-ig-item="${id}"]`)?.querySelector('.ig-titre a')?.focus();
    show(id, { percent: 3, label: T('Envoi en cours…') });
    try {
      const res = await fetch(form.action, { method: 'POST', redirect: 'manual', headers: { 'x-csrf-token': CSRF, accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { show(id, { percent: 0, label: data.error || T('Erreur {status}', { status: res.status }) }); return finish(id, { ok: false }); }
      show(id, data.state);
      if (data.state?.done) return finish(id, data.state);
      watch(id);
    } catch {
      show(id, { percent: 0, label: T('Réseau coupé : rien n’est enregistré. Réessayez quand le réseau revient.') });
      finish(id, { ok: false });
    }
  }));
  watching.forEach(b => watch(b.dataset.igWatch));
})();

// ----- Instagram : les réglages au geste (le formulaire entier part, comme sans script ; POST /admin/instagram/reglages) -----
(function () {
  const form = $('form[data-ig-reglages]');
  if (!form) return;
  const fields = () => $$('input:not([type="hidden"]), select, textarea', form).filter(el => el.name);
  // L'état du formulaire : chaque champ, sa valeur ou sa case.
  const snapshot = () => fields().map(el => [el, el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value]);
  const restore = snap => snap.forEach(([el, v]) => { if (el.type === 'checkbox' || el.type === 'radio') el.checked = v; else el.value = v; });
  const body = () => {
    const b = {};
    for (const [k, v] of new FormData(form)) if (k !== '_csrf') b[k] = v;
    return b;
  };
  let saved = snapshot();
  const times = $('#ig-heures', form);
  const labelOf = el => el.dataset.label || el.closest('fieldset')?.dataset.label || el.closest('fieldset')?.querySelector('legend')?.textContent.trim() || el.name;
  const send = (field, previous, undoing = false) => enFile(async () => {
    const label = labelOf(field);
    try {
      const r = await post(form.action, body());
      // Les heures telles que gardées par le serveur ; une heure illisible est écartée, et dite sous le champ.
      fieldError(field, '');
      temoin.ok(field);
      if (times && r.times) times.value = r.times.join(', ');
      if (times) fieldError(times, r.rejected?.length ? T('Heures ignorées (format HH:MM attendu) : {times}.', { times: r.rejected.join(', ') }) : '');
      saved = snapshot();
      if (undoing) { toast.show(Th('Réglages Instagram rétablis.', {})); field.focus(); return; }
      toast.show(Th('« {champ} » enregistré.', { champ: label }), { undo: async () => { restore(previous); await send(field, null, true); } });
    } catch (err) {
      fieldError(field, T('Erreur : {msg}', { msg: err.message }));
      temoin.ko(field, label);
      if (err.kind === 'reseau' || err.kind === 'session') toast.show(esc(err.message), { error: true, retry: () => send(field, previous, undoing) });
    }
  });
  form.addEventListener('submit', e => { if (!e.submitter || !e.submitter.closest('.sans-script')) e.preventDefault(); });
  fields().forEach(field => {
    const commit = () => {
      const now = snapshot();
      if (now.every(([el, v], i) => saved[i][1] === v)) return;
      const previous = saved;
      send(field, previous);
    };
    if (field.matches('select')) onPick(field, commit);
    else if (field.type === 'checkbox' || field.type === 'radio') field.addEventListener('change', () => { if (field.type !== 'radio' || field.checked) commit(); });
    else {
      field.addEventListener('change', commit);
      if (field.matches('input')) field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    }
  });
})();
