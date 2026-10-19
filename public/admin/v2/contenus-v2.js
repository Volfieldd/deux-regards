// Personnes, une rencontre, Séries, Sorties et Voyages (admin v2, vague 3b) : ce que le script ajoute à leurs gabarits
// (views/admin/v2/), après admin-v2.js (dont il reprend $, $$, T, Th, esc, post, toast, temoin, fieldError, onPick).
// Tout marche sans lui (formulaires POST et jeton, ancres, :target) ; avec lui : une série s'enregistre quand on quitte un
// champ (le formulaire entier, à la route de la v1, avec « Défaire »), l'ordre des séries se change sans recharger la page
// (poignée au clavier, menu ⋯) avec « Défaire », une traduction proposée remplit le champ sans rien enregistrer avant
// « Enregistrer », les boutons des photos cochées disent combien. Le serveur reste seul juge (droits, jeton, validations).
(function () {
  // ----- « ＋ Nouveau voyage », « ＋ Nouvelle série » : le lien déplie son panneau et y met le focus -----
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-ouvre-plier], a[data-nouvelle-serie]');
    if (!a) return;
    const d = document.getElementById(a.hash.slice(1));
    if (!d || d.tagName !== 'DETAILS') return;
    e.preventDefault();
    d.open = true;
    d.scrollIntoView({ block: 'nearest' });
    ($('input:not([type=hidden]), select, textarea', d) || $('summary', d))?.focus();
  });

  // ----- un lien privé (photo offerte) se sélectionne en entier au focus, prêt à copier -----
  $$('[data-select-all]').forEach(i => i.addEventListener('focus', () => i.select()));

  // ----- photos cochées : le bouton dit combien ; aucune cochée, rien ne part -----
  $$('form[data-cocher]').forEach(form => {
    const boxes = () => $$('input[type="checkbox"][name="photo"]', form);
    const count = $('[data-cocher-compte]', form);
    const button = $('[data-cocher-bouton]', form);
    const update = () => {
      const n = boxes().filter(b => b.checked).length;
      if (count) count.textContent = n ? T(n > 1 ? 'Pour les {n} photos cochées :' : 'Pour la photo cochée :', { n }) : count.dataset.zero;
      if (button) button.textContent = n > 1 ? T('Lier les {n} photos cochées', { n }) : n ? T('Lier la photo cochée') : T('Lier les photos cochées');
    };
    form.addEventListener('change', update);
    form.addEventListener('submit', e => {
      // Les boutons « Classer dans… » d'une photo (formaction) n'ont pas besoin de cases cochées.
      if (e.submitter?.hasAttribute('formaction')) return;
      if (boxes().some(b => b.checked)) return;
      e.preventDefault();
      toast.show(esc(T('Cochez au moins une photo.')), { error: true });
      boxes()[0]?.focus();
    });
    update();
  });

  // ----- une série : chaque champ s'enregistre quand on le quitte ; le formulaire part en entier (la route de la v1
  // l'attend ainsi : le nom et l'adresse vont ensemble), en JSON ; « Défaire » renvoie l'état d'avant -----
  $$('form[data-serie-auto]').forEach(form => {
    const card = form.closest('[data-id]');
    const fields = $$('[data-champ]', form);
    const read = () => Object.fromEntries(fields.map(f => [f.name, f.value]));
    let saved = read();
    const refresh = (body, serie) => {
      if (!card) return;
      const name = serie?.name || body.name;
      card.dataset.nom = name;
      const h = $('[data-serie-nom]', card); if (h) h.textContent = name;
      const a = $('[data-serie-adresse]', card); if (a && serie?.slug) a.textContent = `/serie/${serie.slug}`;
      const slug = $('[name="slug"]', form); if (slug && serie?.slug) slug.value = serie.slug;
      const p = $('[data-serie-intention]', card);
      if (p) { p.textContent = body.intent?.trim() || T('Pas encore de texte d’intention : la page de la série n’a que ses photos.'); p.toggleAttribute('data-vide', !body.intent?.trim()); }
    };
    async function save(body, previous, field, { undoing = false } = {}) {
      const label = field.dataset.label || field.name;
      const what = T('« {champ} » de « {photo} »', { champ: label, photo: card?.dataset.nom || '' });
      try {
        const r = await post(form.dataset.url, body);
        saved = { ...body, slug: r.serie?.slug ?? body.slug };
        fields.forEach(f => { fieldError(f, ''); temoin.ok(f); });
        refresh(body, r.serie);
        if (undoing) { fields.forEach(f => { if (f.name in body) f.value = f.name === 'slug' ? saved.slug : body[f.name]; }); toast.show(Th('« {champ} » rétabli.', { champ: what })); field.focus(); return; }
        toast.show(Th('« {champ} » enregistré.', { champ: what }), { undo: async () => save(previous, undefined, field, { undoing: true }) });
      } catch (err) {
        const errs = err.data?.errors || {};
        const msg = errs[field.name] || Object.values(errs)[0] || err.message;
        const bad = errs[field.name] ? field : fields.find(f => errs[f.name]) || field;
        fieldError(bad, T('Erreur : {msg}', { msg }));
        temoin.ko(bad, bad.dataset.label || bad.name);
        bad.closest('details:not([open])')?.setAttribute('open', '');
        if (err.kind === 'reseau' || err.kind === 'session') toast.show(esc(err.message), { error: true, retry: () => save(body, previous, field) });
      }
    }
    const commit = field => () => {
      const now = read();
      if (now[field.name] !== saved[field.name]) save(now, saved, field);
      else if (field.getAttribute('aria-invalid') === 'true') { fieldError(field, ''); temoin.ok(field); }
    };
    fields.forEach(field => {
      field._commit = commit(field);
      field.addEventListener('change', field._commit);
      if (field.matches('input')) field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); field._commit(); } });
    });
    // Avec le script, le formulaire ne part plus en entier : chaque champ s'enregistre quand on le quitte.
    form.addEventListener('submit', e => e.preventDefault());
  });

  // ----- l'ordre des séries : poignée (flèches), « Monter » et « Descendre » du menu ; sans recharger, avec « Défaire » -----
  const list = $('[data-series-l]');
  if (list) {
    const items = () => $$(':scope > [data-id]', list);
    const order = () => items().map(li => Number(li.dataset.id));
    const ranks = () => { const all = items(); all.forEach((li, i) => { const r = $('[data-rang]', li); if (r) r.textContent = i ? T('{n}ᵉ sur {total}', { n: i + 1, total: all.length }) : T('1ʳᵉ sur {total}', { total: all.length }); }); };
    const place = ids => { for (const id of ids) { const li = list.querySelector(`:scope > [data-id="${id}"]`); if (li) list.append(li); } ranks(); };
    async function move(li, dir, focus) {
      const before = order();
      const sib = dir === 'up' ? li.previousElementSibling : li.nextElementSibling;
      if (!sib) return;
      if (dir === 'up') sib.before(li); else sib.after(li);
      ranks();
      focus?.focus();
      const after = order();
      try {
        await post('/admin/series/order', { ids: after });
        const n = after.indexOf(Number(li.dataset.id)) + 1;
        toast.show(esc(n > 1 ? T('« {serie} » : {n}ᵉ sur {total}.', { serie: li.dataset.nom, n, total: after.length }) : T('« {serie} » : 1ʳᵉ sur {total}.', { serie: li.dataset.nom, total: after.length })), {
          undo: async () => { await post('/admin/series/order', { ids: before }); place(before); toast.show(esc(T('Ordre rétabli.'))); focus?.focus(); },
        });
      } catch (err) {
        place(before);
        focus?.focus();
        toast.show(esc(err.message), { error: true });
      }
    }
    list.addEventListener('keydown', e => {
      const grip = e.target.closest('[data-poignee]');
      if (!grip) return;
      const dir = { ArrowUp: 'up', ArrowLeft: 'up', ArrowDown: 'down', ArrowRight: 'down' }[e.key];
      if (!dir) return;
      e.preventDefault();
      move(grip.closest('[data-id]'), dir, grip);
    });
    list.addEventListener('submit', e => {
      const form = e.target.closest('form[data-deplacer]');
      if (!form) return;
      e.preventDefault();
      const li = form.closest('[data-id]');
      const menu = form.closest('details');
      if (menu) menu.open = false;
      move(li, form.dataset.deplacer, $('summary', menu) || $('[data-poignee]', li));
    });
  }

  // ----- traduction proposée (LibreTranslate du réseau local) : d'après le français, sinon l'autre langue ; une suggestion,
  // rien n'est enregistré avant « Enregistrer » (« Défaire » la retire) -----
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-trad]');
    if (!btn) return;
    const field = document.getElementById(btn.dataset.trad);
    const status = $(`[data-trad-statut="${btn.dataset.trad}"]`);
    const ids = (btn.dataset.tradDe || '').split(' ').filter(Boolean);
    const sources = ids.map(id => document.getElementById(id)).filter(Boolean).map(el => [el.lang || 'fr', el]);
    const [source, input] = sources.find(([, el]) => el.value.trim()) || [];
    if (!field || !status) return;
    if (!input) { status.textContent = T('Rien à traduire : remplissez d’abord le texte français.'); return; }
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    status.textContent = T('Traduction en cours…');
    try {
      const { text } = await post('/admin/traduction', { text: input.value, source, target: btn.dataset.tradVers });
      const before = field.value;
      field.value = text;
      temoin.ko(field, field.dataset.label || field.name);
      status.textContent = `${T('Suggestion à relire : rien n’est enregistré avant « Enregistrer ».')} `;
      const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = label; b.addEventListener('click', fn); return b; };
      status.append(mk(T('Enregistrer'), () => { field._commit?.(); status.textContent = ''; }), ' ',
        mk(T('Défaire'), () => { field.value = before; temoin.drop(field); status.textContent = T('Suggestion retirée.'); field.focus(); }));
      field.focus();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });

  // ----- après un enregistrement : le titre d'une sortie (son lieu) ou d'un voyage (son nom) suit (l'événement « enregistre »
  // d'admin-v2.js, sur le formulaire) -----
  $$('form[data-autosave]').forEach(form => form.addEventListener('enregistre', e => {
    const { key, value } = e.detail || {};
    const v = String(value || '').trim();
    if (key === 'lieu') { const h = $('[data-sortie-titre]'); if (h && v) h.textContent = v; }
    if (key === 'name' && form.matches('.voyage-form') && v) { const h = $('[data-voyage-titre]'); if (h) h.textContent = v; form.dataset.objet = v; }
  }));
})();
