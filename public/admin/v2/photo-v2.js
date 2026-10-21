/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Fiche d'une photo (admin v2) : ce que le script ajoute à views/admin/v2/photo.eta, après admin-v2.js (dont il reprend
// $, T, post, toast, temoin, fieldError…). L'enregistrement au champ quitté est celui d'admin-v2.js ; ici : la ville de la
// carte (liste proposée), les suggestions (série, mots-clés, traductions, description), qui remplissent un champ sans rien
// enregistrer avant « Enregistrer » (une suggestion n'est jamais publiée d'elle-même), le suivi de la description sans
// recharger la page (UX-A-05), l'aperçu Instagram, les rubriques ouvertes par une ancre.
(function () {
  const form = $('#fiche-f');
  const base = location.pathname.replace(/\/$/, '');

  // ----- une suggestion dans un champ : rien n'est enregistré avant « Enregistrer » ; « Défaire » la retire -----
  // status : la ligne (role="status") où le dire.
  function suggest(field, value, status, others = []) {
    if (!field) return;
    const before = field.value;
    field.closest('details')?.setAttribute('open', '');
    field.value = value;
    temoin.ko(field, field.dataset.label || field.name);
    if (status) {
      status.textContent = `${T('Suggestion à relire : rien n’est enregistré avant « Enregistrer ».')} `;
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'btn ghost';
      save.textContent = T('Enregistrer');
      save.dataset.enregistrerSuggestion = '';
      save.addEventListener('click', () => { field._commit?.(); others.forEach(({ el }) => el._commit?.()); });
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'btn ghost';
      undo.textContent = T('Défaire');
      undo.addEventListener('click', () => { field.value = before; temoin.drop(field); others.forEach(({ el, before }) => { el.value = before; temoin.drop(el); }); status.textContent = T('Suggestion retirée.'); field.focus(); });
      status.append(save, ' ', undo);
    }
    field.focus();
  }
  // Une fois le champ enregistré, sa ligne de suggestion se tait ; le titre et la date lue suivent ce qui est enregistré.
  form?.addEventListener('enregistre', e => {
    const k = e.detail.key, p = e.detail.photo || {};
    const lines = [$(`[data-trad-statut="${k}"]`), k === 'keywords' && $('[data-kw-statut]'), /^alt_text/.test(k) && $('[data-desc-statut]')];
    for (const s of lines) if (s && s.querySelector('button')) s.textContent = '';
    if (k === 'title' && p.title) { const h = $('[data-fiche-titre]'); if (h) h.textContent = p.title; }
    if (k === 'taken_on') { const lu = $('[data-lu]'); if (lu) lu.textContent = p.read ? lu.dataset.texte.replace('{date}', p.read) : ''; }
  });

  // ----- série : « ✦ Suggestion : Rue, Accepter » remplit la série et l'enregistre comme un choix ; « Garder » -----
  $('[data-suggest-fiche]')?.addEventListener('click', async e => {
    const box = e.currentTarget;
    const sel = $('#category_id');
    const b = e.target.closest('[data-accepter]');
    if (b && sel) {
      sel.value = b.dataset.accepter;
      sel.dispatchEvent(new Event('blur'));
      box.remove();
      sel.focus();
      return;
    }
    if (!e.target.closest('[data-garder-serie]')) return;
    try {
      const r = await post(`${base}/serie`, { garder: '1' });
      box.remove();
      sel?.focus();
      toast.show(esc(r.text));
    } catch (err) { toast.show(esc(err.message), { error: true }); }
  });

  // ----- mots-clés suggérés : un clic ajoute le mot (sans doublon), à enregistrer -----
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-kw-add]');
    if (!b) return;
    const field = $('#keywords');
    if (!field) return;
    const words = field.value.split(',').map(w => w.trim()).filter(Boolean);
    if (!words.some(w => w.toLowerCase() === b.dataset.kwAdd.toLowerCase())) words.push(b.dataset.kwAdd);
    b.remove();
    suggest(field, words.join(', '), $('[data-kw-statut]'));
  });

  // ----- traduction proposée (LibreTranslate du réseau local) : d'après le français, sinon l'autre langue -----
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-proposer-trad]');
    if (!btn) return;
    const name = btn.dataset.proposerTrad, to = btn.dataset.vers;
    const field = $(`#${name}_${to}`);
    const status = $(`[data-trad-statut="${name}_${to}"]`);
    const sources = [['fr', $(`#${name}`)], ...['en', 'de'].filter(l => l !== to).map(l => [l, $(`#${name}_${l}`)])];
    const [source, input] = sources.find(([, el]) => el && el.value.trim()) || [];
    if (!input) { status.textContent = T('Rien à traduire : remplissez d’abord le texte français.'); return; }
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    status.textContent = T('Traduction en cours…');
    try {
      const { text } = await post('/admin/traduction', { text: input.value, source, target: to });
      suggest(field, text, status);
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });

  // ----- description suggérée : la reprendre dans le texte de remplacement, l'ignorer, en demander une autre -----
  const desc = $('[data-desc]');
  if (desc) {
    const text = $('[data-desc-text]', desc);
    const status = $('[data-desc-statut]', desc);
    desc.addEventListener('click', e => {
      const use = e.target.closest('[data-desc-use]');
      if (use) {
        const main = $(use.dataset.descField === 'alt_text_en' ? '#alt_text_en' : '#alt_text');
        if (!main || main.value.trim() && main.value !== use.dataset.descUse && !confirm(desc.dataset.descConfirm)) return;
        // Les autres langues déjà traduites : seulement dans un champ encore vide (un texte écrit à la main reste).
        const others = [];
        for (const [name, t] of [['alt_text_en', use.dataset.descEn], ['alt_text_de', use.dataset.descDe]]) {
          const el = $(`#${name}`);
          if (el && el !== main && t && !el.value.trim()) { el.closest('details')?.setAttribute('open', ''); const before = el.value; el.value = t; temoin.ko(el, el.dataset.label); others.push({ el, before }); }
        }
        suggest(main, use.dataset.descUse, status, others);
        return;
      }
      if (e.target.closest('[data-desc-ignorer]')) { desc.hidden = true; $('#alt_text')?.focus(); }
    });
    // « Décrire cette photo » : demandée sans quitter la page ; la réponse s'écrit dans le bloc, jamais un rechargement.
    $('#desc-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await post(`${base}/description`, {});
        text.textContent = T('en cours de calcul…');
        desc.dataset.descPending = '';
        watch();
      } catch (err) { status.textContent = err.message; }
    });
    let polling = false;
    function watch() {
      if (polling) return;
      polling = true;
      let n = 0;
      const poll = async () => {
        if (++n > 120) { polling = false; return; }
        try {
          const d = await (await fetch(desc.dataset.descUrl, { headers: { accept: 'application/json' } })).json();
          if (!d.pending) {
            polling = false;
            delete desc.dataset.descPending;
            text.textContent = d.text ? `« ${d.text} »` : d.error ? T('Dernier essai sans succès : {error}', { error: d.error }) : '';
            const field = d.use?.text ? d.use.field : null;
            let use = $('[data-desc-use]', desc);
            if (field && !use) {
              use = document.createElement('button');
              use.type = 'button';
              use.className = 'btn ghost';
              $('.actions', desc).prepend(use);
            }
            if (use && field) {
              use.hidden = false;
              use.dataset.descUse = d.use.text;
              use.dataset.descField = field;
              use.textContent = field === 'alt_text' ? T('Reprendre ce texte') : T('Reprendre comme texte de remplacement anglais');
              use.dataset.descEn = d.use.en || ''; use.dataset.descDe = d.use.de || '';
            }
            if (use && !field) use.hidden = true;
            status.textContent = d.text ? T('Description prête : à relire, puis « Reprendre ce texte ».') : '';
            return;
          }
        } catch { /* réseau : on réessaie */ }
        setTimeout(poll, 4000);
      };
      setTimeout(poll, 3000);
    }
    if ('descPending' in desc.dataset) watch();
  }

  // ----- ville de la carte : la liste suit la frappe (↑ ↓, Entrée, Échap) ; enregistrée au choix, ou telle que tapée -----
  const cityBox = $('[data-city]');
  const city = cityBox && $('[data-city-input]', cityBox);
  const cityId = cityBox && $('[data-city-id]', cityBox);
  if (form && city && cityId) {
    const list = document.createElement('ul');
    list.className = 'city-list';
    list.id = 'villes-fiche';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', T('Villes proposées'));
    list.hidden = true;
    city.after(list);
    city.setAttribute('role', 'combobox');
    city.setAttribute('aria-autocomplete', 'list');
    city.setAttribute('aria-controls', list.id);
    city.setAttribute('aria-expanded', 'false');
    let items = [], active = -1, timer = null, seq = 0;
    let saved = { city_label: city.value, city_id: cityId.value };
    const close = () => { list.hidden = true; city.setAttribute('aria-expanded', 'false'); city.removeAttribute('aria-activedescendant'); active = -1; };
    const mark = i => {
      active = i;
      $$('li', list).forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
      if (i >= 0) city.setAttribute('aria-activedescendant', `${list.id}-${i}`); else city.removeAttribute('aria-activedescendant');
    };
    async function save(body, { undoing = false } = {}) {
      const previous = saved;
      try {
        const r = await post(form.dataset.url, body);
        saved = { city_label: r.photo.city || '', city_id: r.photo.city_id ? String(r.photo.city_id) : '' };
        city.value = saved.city_label;
        cityId.value = saved.city_id;
        fieldError(city, '');
        temoin.ok(city);
        const onMap = $('#on_map');
        if (onMap) { onMap.checked = Boolean(r.photo.on_map); onMap.dataset.saved = onMap.checked ? 'on' : ''; }
        if (undoing) { toast.show(Th('« {champ} » rétabli.', { champ: city.dataset.label })); city.focus(); return; }
        toast.show(Th('« {champ} » enregistré.', { champ: city.dataset.label }), { undo: async () => save({ city_label: previous.city_label, city_id: previous.city_id }, { undoing: true }) });
      } catch (err) {
        fieldError(city, T('Erreur : {msg}', { msg: err.data?.errors?.city || err.message }));
        temoin.ko(city, city.dataset.label);
        if (err.kind === 'reseau' || err.kind === 'session') toast.show(esc(err.message), { error: true, retry: () => save(body) });
      }
    }
    const choose = i => {
      const v = items[i];
      if (!v) return;
      city.value = v.label;
      cityId.value = v.id;
      close();
      save({ city_id: v.id, city_label: v.label });
    };
    const draw = () => {
      list.replaceChildren(...items.map((v, i) => {
        const li = document.createElement('li');
        li.id = `${list.id}-${i}`;
        li.setAttribute('role', 'option');
        li.textContent = v.label;
        li.addEventListener('mousedown', e => { e.preventDefault(); choose(i); });
        return li;
      }));
      list.hidden = !items.length;
      city.setAttribute('aria-expanded', String(items.length > 0));
      mark(-1);
    };
    city.addEventListener('input', () => {
      cityId.value = '';
      clearTimeout(timer);
      const q = city.value.trim();
      if (q.length < 2) { items = []; draw(); return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const data = await (await fetch(`/admin/villes?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } })).json();
          if (mine === seq) { items = data.villes || []; draw(); }
        } catch { /* réseau : pas de proposition */ }
      }, 150);
    });
    city.addEventListener('keydown', e => {
      if (!list.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); mark(Math.min(active + 1, items.length - 1)); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(active - 1, 0)); return; }
        if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); return; }
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      }
      if (e.key === 'Enter') { e.preventDefault(); commitTyped(); }
    });
    // Tapée sans choisir : enregistrée telle quelle (le serveur la reconnaît si le nom est exact) ; vide : la ville s'efface.
    const commitTyped = () => { if (!cityId.value && city.value.trim() !== saved.city_label) save({ city_label: city.value.trim() }); };
    city.addEventListener('blur', () => setTimeout(() => { close(); commitTyped(); }, 150));
  }

  // ----- dialogue : « Corriger le titre » le ferme et mène au champ -----
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-annuler-vers]');
    if (!a) return;
    const d = a.closest('dialog');
    if (!d?.open) return;
    e.preventDefault();
    d.close();
    const f = document.getElementById(a.dataset.annulerVers);
    f?.closest('details')?.setAttribute('open', '');
    f?.focus();
  });

  // ----- Instagram : l'aperçu suit le cadre et le filigrane ; la légende personnelle, son compteur, « Revenir au modèle » -----
  const ig = $('[data-ig-form]');
  if (ig) {
    const id = ig.elements.photo_id.value;
    const preview = $('[data-ig-preview]');
    const frame = $('[data-ig-frame]', ig), wm = $('[data-ig-watermark]', ig), custom = $('[data-ig-custom]', ig);
    const text = $('[data-ig-caption]', ig), count = $('[data-ig-count]', ig), back = $('[data-ig-template]', ig);
    const refresh = () => { if (preview) preview.src = `/admin/instagram/apercu.jpg?photo=${encodeURIComponent(id)}&cadre=${encodeURIComponent(frame.value)}&filigrane=${wm.checked ? 1 : 0}`; };
    frame?.addEventListener('change', refresh);
    wm?.addEventListener('change', refresh);
    const counter = () => { count.textContent = `${text.value.length} / 2200`; back.hidden = !custom.checked; };
    async function template() {
      try {
        const r = await (await fetch(`/admin/instagram/legende?photo=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } })).json();
        text.value = r.caption || '';
        custom.checked = false;
        counter();
      } catch { /* l'envoi reprendra le modèle de toute façon */ }
    }
    text.addEventListener('input', () => { custom.checked = true; counter(); });
    custom.addEventListener('change', async () => { if (!custom.checked) await template(); counter(); });
    back.addEventListener('click', template);
    counter();
  }

  // ----- une ancre (#instagram, #rencontres, #description) ouvre la rubrique repliée qui la contient -----
  function openFor(hash) {
    if (!hash || hash.length < 2) return;
    let el = null;
    try { el = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
    for (let d = el && el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
  }
  openFor(location.hash);
  addEventListener('hashchange', () => openFor(location.hash));
  document.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (a && !a.dataset.ouvre) openFor(a.hash); });

  // ----- après un envoi sans le script refusé (résumé d'erreurs), le focus va au résumé -----
  $('#resume-fiche')?.focus();
})();
