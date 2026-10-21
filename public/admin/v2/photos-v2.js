/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// La photothèque (admin v2) : ce que le script ajoute à views/admin/v2/photos.eta, après admin-v2.js (dont il reprend
// $, T, post, toast, temoin, fieldError, onPick…). Repris de la v1 (public/admin/admin.js : planche, inspecteur, loupe,
// glisser, import), avec les règles de la v2 : un champ refusé se dit sous lui (UX-A-14) ; chaque geste qui se défait
// propose « Défaire » sans recharger la page, le focus reste où il était (UX-A-08) ; « Publier » montre d'abord ce qui
// reste à revoir (titres provisoires, accords : UX-A-02, 03), supprimer demande confirmation ; les touches d'une lettre ne
// valent que dans la planche ou l'inspecteur, et se coupent dans « Mon compte » (UX-A-02) ; l'inspecteur annonce la photo
// par son titre (UX-A-31).
(function () {
  const lib = $('[data-library]');
  if (!lib) return;
  const contact = $('[data-contact]');
  const insp = $('[data-inspector]');
  const form = $('[data-bulk]', insp);
  const shortcuts = lib.dataset.raccourcis !== 'off';
  const dataEl = $('#photos-data');
  const data = new Map((dataEl ? JSON.parse(dataEl.textContent) : []).map(p => [p.id, p]));
  const panes = { empty: $('[data-insp-empty]', insp), one: $('[data-insp-one]', insp), many: $('[data-insp-many]', insp) };
  const boxes = () => $$('input.chk[name=ids][form=bulk]');
  const checked = () => boxes().filter(b => b.checked);
  const selIds = () => checked().map(b => Number(b.value));
  const tileOf = id => document.getElementById(`photo-${id}`);
  const boxOf = id => $(`input.chk[value="${id}"]`, tileOf(id) || document);
  const typing = el => el && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select') || el.isContentEditable);
  const nPhotos = n => T(n > 1 ? '{n} photos' : '{n} photo', { n });
  const STATUS = p => (p.status === 'published' ? T('publiée') : p.review === 'programmee' ? T('programmée') : p.review === 'proposee' ? T('proposée') : p.review === 'a_reprendre' ? T('à reprendre') : T('brouillon'));
  let anchor = null;
  // Le dernier « Défaire » proposé : Ctrl Z le rejoue tant qu'aucune autre action n'a suivi.
  let lastUndo = null;
  const done = (text, undo) => {
    lastUndo = undo || null;
    toast.show(esc(text), undo ? { undo: async () => { lastUndo = null; await undo(); } } : {});
  };

  // Ce qui n'a de sens qu'avec le script (repris de la v1 : l'import en garde la marque data-js-only).
  $$('[data-js-only]').forEach(el => { el.hidden = false; });

  // Taille des vignettes (mémorisée) ; au téléphone, celle de la feuille de style.
  const density = $('[data-density]');
  if (density && contact) {
    const saved = Number(localStorage.getItem('planche-taille'));
    if (saved) density.value = saved;
    const wide = matchMedia('(min-width: 721px)');
    // sizes des tuiles à la hauteur choisie (même formule que server/picture.js, tileSizes) : sans eux, le navigateur
    // garderait les fichiers choisis pour 190 px, flous à 320 px, trop lourds à 110 px.
    const resize = h => contact.querySelectorAll('.tile').forEach(li => {
      const r = Number(/\bar-(\d+)/.exec(li.className)?.[1] || 150) / 100;
      const sizes = `(max-width: 720px) min(calc(100vw - 20px), ${Math.ceil(1.6 * 120 * r)}px), ${Math.ceil(1.3 * h * r)}px`;
      li.querySelectorAll('source, img').forEach(el => { if (el.getAttribute('sizes') !== sizes) el.setAttribute('sizes', sizes); });
    });
    const apply = () => { if (wide.matches) contact.style.setProperty('--rowh', `${density.value}px`); else contact.style.removeProperty('--rowh'); resize(Number(density.value) || 190); };
    wide.addEventListener('change', apply);
    apply();
    density.addEventListener('input', () => { apply(); localStorage.setItem('planche-taille', density.value); });
  }

  // ---------- sélection ----------
  function select(ids, { add = false } = {}) {
    if (!add) boxes().forEach(b => { b.checked = false; });
    ids.forEach(id => { const b = boxOf(id); if (b) b.checked = true; });
    render();
  }
  if (contact) {
    contact.addEventListener('click', e => {
      const tile = e.target.closest('.tile');
      if (!tile || e.target.closest('input, label, .ttl')) return;
      e.preventDefault();
      const id = Number(tile.dataset.id);
      const box = boxOf(id);
      if (e.shiftKey && anchor) {
        const all = $$('.tile', contact).map(t => Number(t.dataset.id));
        const [a, b] = [all.indexOf(anchor), all.indexOf(id)].sort((x, y) => x - y);
        select(all.slice(a, b + 1), { add: e.metaKey || e.ctrlKey });
      } else if (e.metaKey || e.ctrlKey) {
        box.checked = !box.checked;
        anchor = id;
        render();
      } else {
        select([id]);
        anchor = id;
      }
      box.focus({ preventScroll: true });
    });
    contact.addEventListener('dblclick', e => { const t = e.target.closest('.tile'); if (t) loupe.open(Number(t.dataset.id)); });
  }
  // Maj + clic sur les cases (liste) : toute la plage depuis la précédente.
  let lastBox = null;
  document.addEventListener('click', e => {
    const box = e.target.closest('input.chk[name=ids][form=bulk]');
    if (!box) return;
    if (e.shiftKey && lastBox && lastBox !== box) {
      const all = boxes();
      const [a, b] = [all.indexOf(lastBox), all.indexOf(box)].sort((x, y) => x - y);
      all.slice(a, b + 1).forEach(x => { x.checked = box.checked; });
    }
    lastBox = box;
    anchor = Number(box.value);
  });
  document.addEventListener('change', e => { if (e.target.matches('input.chk[name=ids][form=bulk]')) render(); });
  $('[data-bulk-clear]', insp).addEventListener('click', () => { const first = checked()[0]; select([]); (first || boxes()[0])?.focus(); });

  // ---------- inspecteur ----------
  const one = { root: panes.one, preview: $('[data-one-preview]', panes.one), field: k => $(`[data-one-field="${k}"]`, panes.one), id: null };
  const annonce = $('[data-annonce]', insp);
  let lastAnnonce = '';
  const say = text => { if (text === lastAnnonce) return; lastAnnonce = text; annonce.textContent = ''; setTimeout(() => { annonce.textContent = text; }, 30); };
  function stack(ids) {
    const el = $('[data-insp-stack]', insp);
    const imgs = ids.slice(-3).map(id => data.get(id)?.thumb).filter(Boolean);
    el.hidden = !imgs.length;
    el.innerHTML = imgs.map(src => `<img src="${esc(src)}" alt="">`).join('');
  }
  function render() {
    const ids = selIds();
    const n = ids.length;
    insp.classList.toggle('has-sel', n > 0);
    lib.classList.toggle('selecting', n > 0);
    panes.empty.hidden = n !== 0;
    panes.one.hidden = n !== 1;
    panes.many.hidden = n < 2;
    $$('.insp-ft .btn, [data-many-map]', insp).forEach(b => { b.disabled = n === 0; });
    $('[data-bulk-clear]', insp).hidden = n === 0;
    const title = $('[data-insp-title]', insp), sub = $('[data-insp-sub]', insp);
    stack(n > 1 ? ids : []);
    if (n === 0) { title.textContent = T('Photothèque'); sub.textContent = T('Aucune photo sélectionnée'); say(T('Aucune photo sélectionnée')); return; }
    if (n === 1) return showOne(ids[0]);
    const list = ids.map(id => data.get(id)).filter(Boolean);
    const drafts = list.filter(p => p.status !== 'published').length;
    title.textContent = T('{n} photos sélectionnées', { n });
    const detail = [drafts && (drafts > 1 ? T('{n} brouillons', { n: drafts }) : T('{n} brouillon', { n: drafts })), n - drafts && (n - drafts > 1 ? T('{n} publiées', { n: n - drafts }) : T('{n} publiée', { n: n - drafts }))].filter(Boolean).join(', ');
    sub.textContent = detail;
    say(`${T('{n} photos sélectionnées', { n })} (${detail})`);
    const cats = new Set(list.map(p => p.category_id));
    $$('[data-many-series] .pill', insp).forEach(b => b.setAttribute('aria-pressed', String(cats.size === 1 && cats.has(Number(b.dataset.category)))));
    // Titres provisoires de la sélection : à saisir ici (lot qui vient d'arriver) ; un titre en cours de frappe reste.
    const prov = list.filter(p => p.provisional).slice(0, 12);
    $('[data-many-titles]', insp).hidden = !prov.length;
    const titles = $('[data-titles]', insp);
    if (!titles.contains(document.activeElement)) titles.innerHTML = prov.map(p => `<label>${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="ph"></span>'}<input value="${esc(p.title)}" data-title-of="${p.id}" aria-label="${esc(T('Titre de la photo {title}', { title: p.title }))}"></label>`).join('');
    const pub = $('[data-publish]', insp);
    if (pub) { pub.textContent = drafts ? (drafts > 1 ? T('Publier {n} photos…', { n: drafts }) : T('Publier la photo…')) : T('Déjà publiées'); pub.disabled = !drafts; }
    const dep = $('[data-depublier]', insp);
    if (dep) dep.disabled = drafts === n;
  }
  function showOne(id) {
    const p = data.get(id);
    one.id = id;
    if (!p) return;
    $('[data-insp-title]', insp).textContent = p.title;
    $('[data-insp-sub]', insp).textContent = `${STATUS(p)} · ${p.category || ''}`;
    say(T('« {title} » sélectionnée · {state} · {serie}', { title: p.title, state: STATUS(p), serie: p.category || '' }));
    one.preview.innerHTML = p.large ? `<img src="${esc(p.large)}" alt="${esc(p.title)}">` : `<span class="ph">${esc(T('Traitement…'))}</span>`;
    // Le champ en cours de saisie, ou refusé, n'est jamais réécrit.
    const put = (k, v) => { const f = one.field(k); if (f && f !== document.activeElement && f.getAttribute('aria-invalid') !== 'true') { f.value = v; f.dataset.saved = v; } };
    put('title', p.title);
    put('legend', p.legend || '');
    put('alt_text', p.alt_text || '');
    put('place', p.place || '');
    put('taken_on', p.taken_on || '');
    put('author_id', p.author_id ? String(p.author_id) : '');
    const when = $('[data-one-when]', insp);
    if (when && one.field('taken_on')?.getAttribute('aria-invalid') !== 'true') when.textContent = [p.when && T('Lu : {date}', { date: p.when }), p.time && T('prise à {time}', { time: p.time })].filter(Boolean).join(' · ');
    $('[data-one-prov]', insp).hidden = !p.provisional;
    $('[data-one-n]', insp).textContent = `/photo/${p.slug}`;
    $('[data-one-link]', insp).href = `/admin/photos/${p.id}`;
    const cityInput = $('[data-one-city]', insp);
    if (cityInput && cityInput !== document.activeElement) { cityInput.value = p.city || ''; $('[data-city-id]', cityInput.closest('[data-city]')).value = p.city_id || ''; }
    const onMap = $('[data-one-onmap]', insp);
    if (onMap) { onMap.checked = Boolean(p.on_map); onMap.disabled = !p.city_id; }
    const cityNote = $('[data-one-citynote]', insp);
    if (cityNote) cityNote.hidden = !(p.city_source === 'gps' && p.city);
    const sugg = p.suggest || [];
    $$('[data-one-series] .pill', insp).forEach(b => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.category) === p.category_id));
      b.classList.toggle('sug', sugg.some(x => x.id === Number(b.dataset.category)));
    });
    const sugBox = $('[data-one-suggest]', insp);
    if (sugBox && can('photos.modifier')) {
      sugBox.hidden = !sugg.length;
      sugBox.innerHTML = sugg.map(x => `<button class="sugg" type="button" data-category="${x.id}"><span class="s" aria-hidden="true">✦</span>${esc(T('Suggestion : {name}', { name: x.name }))}<span class="sr-only">,</span> <span class="acc">${esc(T('Accepter'))}</span></button>`).join('')
        + (sugg.length ? `<button class="lien-a" type="button" data-keep-series>${esc(T('Garder « {name} »', { name: p.category }))}</button>` : '');
    }
    const pub = $('[data-publish]', insp);
    if (pub) { pub.textContent = p.status === 'published' ? T('Déjà publiée') : T('Publier la photo…'); pub.disabled = p.status === 'published'; }
    const dep = $('[data-depublier]', insp);
    if (dep) dep.disabled = p.status !== 'published';
    audience(id);
  }
  async function audience(id) {
    const box = $('[data-one-aud]', insp);
    if (!box) return;
    box.innerHTML = '<span class="hint">…</span>';
    try {
      const res = await fetch(`/admin/photos/${id}/statistiques`, { headers: { accept: 'application/json' } });
      if (one.id !== id) return;
      if (!res.ok) { box.innerHTML = ''; return; }
      const s = await res.json();
      if (one.id !== id) return;
      box.innerHTML = s.total
        ? `<span>${esc(T(s.total > 1 ? '{n} vues en 30 jours' : '{n} vue en 30 jours', { n: s.total }))}${s.rank ? ` · ${esc(s.rank === 1 ? T('1ʳᵉ photo la plus vue') : T('{rank}ᵉ photo la plus vue', { rank: s.rank }))}` : ''}</span>${s.spark}`
        : `<span class="hint">${esc(T('Pas encore ouverte en grand ces 30 derniers jours.'))}</span>`;
    } catch { box.innerHTML = ''; }
  }

  // La planche suit les données (titre, série, statut, titre provisoire, série suggérée).
  function refreshTile(p) {
    const t = tileOf(p.id);
    if (!t) return;
    const ttl = $('.ttl', t);
    if (ttl) ttl.textContent = p.title;
    const small = $('.cap small, .info .sec', t);
    if (small && t.matches('.tile')) small.textContent = [p.category, p.when, p.status === 'published' ? T('publiée') : ''].filter(Boolean).join(' · ');
    t.toggleAttribute('data-provisional', Boolean(p.provisional));
    const box = $('.chk', t);
    if (box) box.setAttribute('aria-label', T('Sélectionner « {title} »', { title: p.title }));
    const badges = $('.badges', t);
    if (badges) {
      const keep = $$('.badge[data-accord]', badges);
      const out = [];
      if (p.status !== 'published' || p.review) out.push(`<span class="badge" data-statut>${esc(STATUS(p).replace(/^./, c => c.toUpperCase()))}</span>`);
      if (p.provisional) out.push(`<span class="badge warn" data-prov>${esc(T('Titre provisoire'))}</span>`);
      badges.innerHTML = out.join('');
      keep.forEach(b => badges.append(b));
      const first = (p.suggest || [])[0];
      if (first) badges.insertAdjacentHTML('beforeend', `<span class="badge sug"><span aria-hidden="true">✦</span> ${esc(first.name)}</span>`);
    }
  }
  async function reload(id) {
    try {
      const res = await fetch(`/admin/photos/${id}/donnees`, { headers: { accept: 'application/json' } });
      if (res.ok) { const p = await res.json(); data.set(p.id, { ...data.get(p.id), ...p }); refreshTile(data.get(p.id)); return data.get(p.id); }
    } catch { /* réseau */ }
    return null;
  }
  async function reloadMany(ids) {
    try {
      const res = await fetch(`/admin/photos/donnees?ids=${ids.join(',')}`, { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      for (const p of (await res.json()).photos) { data.set(p.id, { ...data.get(p.id), ...p }); refreshTile(data.get(p.id)); }
    } catch { /* réseau */ }
  }

  // Une photo : chaque champ s'enregistre en le quittant ; refusé, l'erreur est sous le champ (UX-A-14).
  const LABELS = { title: T('Titre'), legend: T('Légende'), alt_text: T('Texte de remplacement'), place: T('Lieu'), taken_on: T('Date'), author_id: T('Photographe'), category_id: T('Série') };
  async function saveOne(key, value, previous, { undoing = false } = {}) {
    const id = one.id;
    const field = one.field(key);
    try {
      const r = await post(`/admin/photos/${id}/champs`, { [key]: value });
      Object.assign(data.get(id), r.photo);
      if (field) { field.dataset.saved = String(value); fieldError(field, ''); temoin.ok(field); }
      await reload(id);
      if (one.id === id) showOne(id);
      const what = T('« {champ} » de « {photo} »', { champ: LABELS[key] || key, photo: data.get(id).title });
      if (undoing) { toast.show(Th('« {champ} » rétabli.', { champ: what })); field?.focus(); return; }
      lastUndo = previous === undefined ? null : () => saveOne(key, previous, undefined, { undoing: true });
      toast.show(Th('« {champ} » enregistré.', { champ: what }), previous === undefined ? {} : { undo: async () => { lastUndo = null; await saveOne(key, previous, undefined, { undoing: true }); } });
    } catch (err) {
      const msg = err.data?.errors?.[key] || err.message;
      if (field) { fieldError(field, T('Erreur : {msg}', { msg })); temoin.ko(field, LABELS[key] || key); }
      if (err.kind === 'reseau' || err.kind === 'session' || !field) toast.show(esc(err.message), { error: true, retry: () => saveOne(key, value, previous) });
    }
  }
  ['title', 'legend', 'alt_text', 'place', 'taken_on', 'author_id'].forEach(k => {
    const f = one.field(k);
    if (!f || f.readOnly) return;
    const commit = () => { const prev = f.dataset.saved ?? ''; if (f.value !== prev) saveOne(k, f.value, prev); else if (f.getAttribute('aria-invalid') === 'true') { fieldError(f, ''); temoin.ok(f); } };
    if (f.matches('select')) onPick(f, commit);
    else f.addEventListener('change', commit);
    if (f.matches('input')) f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  });
  $('[data-one-series]', insp).addEventListener('click', e => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    const p = data.get(one.id);
    if (String(p.category_id) !== b.dataset.category) saveOne('category_id', b.dataset.category, String(p.category_id));
  });
  $('[data-one-suggest]', insp)?.addEventListener('click', async e => {
    const id = one.id;
    const p = data.get(id);
    const b = e.target.closest('[data-category]');
    if (b) return saveOne('category_id', b.dataset.category, String(p.category_id));
    if (!e.target.closest('[data-keep-series]')) return;
    try {
      const r = await post(`/admin/photos/${id}/serie`, { garder: '1' });
      await reload(id);
      if (one.id === id) showOne(id);
      $('[data-one-series] .pill[aria-pressed="true"]', insp)?.focus();
      done(r.text);
    } catch (err) { toast.show(esc(err.message), { error: true }); }
  });

  // Ville et carte : enregistrées au choix d'une ville proposée, ou telles que tapées ; « Défaire » rend l'ancienne.
  const cityBox = $('[data-one-city]', insp)?.closest('[data-city]');
  if (cityBox) {
    const input = $('[data-one-city]', cityBox), hidden = $('[data-city-id]', cityBox), onMap = $('[data-one-onmap]', insp);
    const before = () => { const p = data.get(one.id); return { city_id: p.city_id || '', city_label: p.city || '', on_map: p.on_map ? '1' : '0' }; };
    async function saveLocation(body, undoBody, { undoing = false } = {}) {
      const id = one.id;
      try {
        const r = await post(`/admin/photos/${id}/champs`, body);
        Object.assign(data.get(id), r.photo);
        fieldError(input, '');
        temoin.ok(input);
        if (one.id === id) showOne(id);
        const what = T('« {champ} » de « {photo} »', { champ: T('Ville de la carte'), photo: data.get(id).title });
        if (undoing) { toast.show(Th('« {champ} » rétabli.', { champ: what })); return; }
        lastUndo = () => saveLocation(undoBody, null, { undoing: true });
        toast.show(Th('« {champ} » enregistré.', { champ: what }), { undo: async () => { lastUndo = null; await saveLocation(undoBody, null, { undoing: true }); } });
      } catch (err) {
        fieldError(input, T('Erreur : {msg}', { msg: err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message }));
        temoin.ko(input, T('Ville de la carte'));
      }
    }
    // Liste proposée au fil de la frappe (↑ ↓, Entrée, Échap).
    const list = document.createElement('ul');
    list.className = 'city-list';
    list.id = 'villes-insp';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', T('Villes proposées'));
    list.hidden = true;
    input.after(list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    let items = [], active = -1, timer = null, seq = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const mark = i => { active = i; $$('li', list).forEach((li, k) => li.setAttribute('aria-selected', String(k === i))); if (i >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${i}`); else input.removeAttribute('aria-activedescendant'); };
    const choose = i => { const v = items[i]; if (!v) return; input.value = v.label; hidden.value = v.id; close(); saveLocation({ city_id: v.id, city_label: v.label }, before()); };
    const draw = () => {
      list.replaceChildren(...items.map((v, i) => { const li = document.createElement('li'); li.id = `${list.id}-${i}`; li.setAttribute('role', 'option'); li.textContent = v.label; li.addEventListener('mousedown', e => { e.preventDefault(); choose(i); }); return li; }));
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', String(items.length > 0));
      mark(-1);
    };
    input.addEventListener('input', () => {
      hidden.value = '';
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { items = []; draw(); return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try { const r = await (await fetch(`/admin/villes?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } })).json(); if (mine === seq) { items = r.villes || []; draw(); } } catch { /* pas de proposition */ }
      }, 150);
    });
    const typed = () => { const v = input.value.trim(); if (v !== (data.get(one.id)?.city || '') && !hidden.value) saveLocation({ city_label: v }, before()); };
    input.addEventListener('keydown', e => {
      if (!list.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); mark(Math.min(active + 1, items.length - 1)); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(active - 1, 0)); return; }
        if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); return; }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      }
      if (e.key === 'Enter') { e.preventDefault(); typed(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { close(); typed(); }, 150));
    onMap?.addEventListener('change', e => saveLocation({ on_map: e.target.checked ? '1' : '0' }, { on_map: e.target.checked ? '0' : '1' }));
  }

  // ---------- plusieurs photos : série, lieu, date, carte ; « Défaire » sans recharger ----------
  async function applyMany(action, extra, { button = null } = {}) {
    const ids = selIds();
    if (!ids.length) return null;
    if (button) button.disabled = true;
    try {
      const r = await post('/admin/photos/actions', { ids, action, ...extra });
      // Nouvelle série : le menu doit l'afficher ; la page se recharge, la sélection se perd mais pas la série.
      if (r.category && !$(`[data-many-series] [data-category="${r.category.id}"]`, insp)) { location.reload(); return r; }
      if (action === 'delete') {
        ids.forEach(id => { tileOf(id)?.remove(); data.delete(id); });
        render();
        boxes()[0]?.focus();
        done(r.text);
        return r;
      }
      await reloadMany(ids);
      render();
      done(r.text, r.undo ? async () => { const u = await post('/admin/photos/actions', r.undo); await reloadMany(ids); render(); toast.show(esc(u.text)); } : null);
      return r;
    } catch (err) {
      toast.show(esc(err.message), { error: true });
      return null;
    } finally { if (button) button.disabled = !selIds().length; }
  }
  const newName = $('[data-bulk-new]', insp);
  $('[data-many-series]', insp).addEventListener('click', e => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    if (b.dataset.category === 'new') { newName.classList.add('on'); newName.focus(); return; }
    applyMany('category', { category_id: b.dataset.category });
  });
  const catSelect = $('[data-bulk-category]', insp);
  catSelect?.addEventListener('change', () => newName.classList.toggle('on', catSelect.value === 'new'));
  newName.addEventListener('change', () => { if (newName.value.trim()) applyMany('category', { category_id: 'new', new_category: newName.value }); });
  newName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); newName.blur(); } });
  $$('[data-many-field]', insp).forEach(f => {
    f.addEventListener('change', async () => { if (!f.value.trim()) return; const r = await applyMany('fields', { [f.dataset.manyField]: f.value }); if (r) f.value = ''; });
    f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); f.focus(); } });
  });
  $('[data-titles]', insp).addEventListener('change', async e => {
    const f = e.target.closest('[data-title-of]');
    if (!f) return;
    const id = Number(f.dataset.titleOf);
    try {
      await post(`/admin/photos/${id}/champs`, { title: f.value });
      fieldError(f, '');
      await reload(id);
      toast.show(Th('« {champ} » enregistré.', { champ: T('Titre de la photo {title}', { title: f.value }) }));
    } catch (err) { fieldError(f, T('Erreur : {msg}', { msg: err.data?.errors?.title || err.message })); }
  });
  $('[data-titles]', insp).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); const next = e.target.closest('label').nextElementSibling; e.target.blur(); $('input', next || document.body)?.focus?.(); } });

  // ---------- Publier : ce qui reste à revoir d'abord (titres provisoires, accords), puis « Défaire » ----------
  const dlgPub = $('[data-dlg-publier]');
  function publishDialog(ids, { opener = null } = {}) {
    const list = ids.map(id => data.get(id)).filter(p => p && p.status !== 'published');
    if (!list.length || !dlgPub) return;
    const prov = list.filter(p => p.provisional);
    const n = list.length;
    $('[data-dlg-titre]', dlgPub).textContent = n > 1 ? T('Publier les {n} photos ?', { n }) : T('Publier « {title} » ?', { title: list[0].title });
    $('[data-dlg-texte]', dlgPub).textContent = prov.length
      ? T(prov.length > 1 ? '{n} gardent le nom du fichier comme titre : l’adresse de leur page se fige à la publication. Corrigez-les d’abord, ou publiez quand même.' : '{n} garde le nom du fichier comme titre : l’adresse de sa page se fige à la publication. Corrigez-le d’abord, ou publiez quand même.', { n: prov.length })
      : T('Elles seront en ligne tout de suite ; celles dont un accord est à vérifier ou refusé restent en brouillon. « Défaire » les dépublie.');
    $('[data-dlg-liste]', dlgPub).innerHTML = prov.map(p => `<li>${p.thumb ? `<img src="${esc(p.thumb)}" alt="" width="64" height="43">` : '<span class="ph" aria-hidden="true"></span>'}<div><p><b>${esc(p.title)}</b> : ${esc(T('titre provisoire'))}</p><p><a class="lien-a" href="/admin/photos/${p.id}#title">${esc(T('Corriger dans sa fiche'))}</a></p></div></li>`).join('');
    const ok = $('[data-dlg-ok]', dlgPub);
    ok.textContent = prov.length ? T('Publier quand même') : n > 1 ? T('Publier les {n} photos', { n }) : T('Publier la photo');
    ok.onclick = async () => { dlgPub.close(); await applyMany('publish', {}, { button: $('[data-publish]', insp) }); };
    dlgPub.addEventListener('close', () => (opener && document.contains(opener) ? opener : $('[data-publish]', insp))?.focus(), { once: true });
    dlgPub.showModal();
    $('[data-annuler]', dlgPub).focus();
  }
  const dlgDel = $('[data-dlg-supprimer]');
  const confirmDelete = n => new Promise(resolve => {
    if (!dlgDel) return resolve(false);
    $('[data-dlg-titre]', dlgDel).textContent = n > 1 ? T('Supprimer les {n} photos ?', { n }) : T('Supprimer « {title} » ?', { title: data.get(selIds()[0])?.title || '' });
    $('[data-dlg-bouton]', dlgDel).textContent = n > 1 ? T('Supprimer les {n} photos', { n }) : T('Supprimer la photo');
    let answer = false;
    $('[data-dlg-ok]', dlgDel).onclick = () => { answer = true; dlgDel.close(); };
    dlgDel.addEventListener('close', () => resolve(answer), { once: true });
    dlgDel.showModal();
    $('[data-annuler]', dlgDel).focus();
  });

  form.addEventListener('submit', async e => {
    // Avec le script, rien ne part d'un bloc : chaque bouton agit ici (Entrée dans un champ : le champ s'applique seul).
    e.preventDefault();
    const action = e.submitter?.value;
    const ids = selIds();
    if (!action || !ids.length || e.submitter?.matches('.sans-script')) return;
    if (action === 'publish') return publishDialog(ids, { opener: e.submitter });
    if (action === 'delete') {
      if (!(await confirmDelete(ids.length))) { e.submitter.focus(); return; }
      return applyMany('delete', { confirm: true });
    }
    if (action === 'propose') return applyMany('propose', {}, { button: e.submitter });
    return applyMany(action, {}, { button: e.submitter });
  });

  // ---------- loupe ----------
  const loupe = (() => {
    let el = null, current = null, opener = null;
    const order = () => $$('.tile', contact).map(t => Number(t.dataset.id)).filter(id => data.get(id)?.large);
    const strip = () => { const o = order(); const i = Math.max(0, o.indexOf(current) - 20); return o.slice(i, i + 40); };
    function draw() {
      const p = data.get(current);
      $('.stage img', el).src = p.large;
      $('.stage img', el).alt = p.title;
      $('[data-loupe-title]', el).textContent = `${p.title} · ${p.category}${p.when ? ` · ${p.when}` : ''}`;
      $$('.strip button', el).forEach(b => b.toggleAttribute('aria-current', Number(b.dataset.id) === current));
      $(`.strip button[data-id="${current}"]`, el)?.scrollIntoView({ block: 'nearest', inline: 'center' });
      select([current]);
      anchor = current;
    }
    function open(id) {
      if (!contact || !data.get(id)?.large) return;
      if (el) close();
      opener = document.activeElement;
      current = id;
      el = document.createElement('div');
      el.className = 'loupe';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', T('Loupe'));
      el.innerHTML = `<div class="lbar"><span data-loupe-title></span><span class="sp"></span><span>${esc(T('← → photo suivante · Échap : fermer'))}</span><button class="iconbtn" type="button" data-loupe-close aria-label="${esc(T('Fermer la loupe'))}">✕</button></div>
        <div class="stage"><button class="iconbtn nav-l" type="button" data-loupe-prev aria-label="${esc(T('Photo précédente'))}">←</button><img alt=""><button class="iconbtn nav-r" type="button" data-loupe-next aria-label="${esc(T('Photo suivante'))}">→</button></div>
        <div class="strip">${strip().map(i => `<button type="button" data-id="${i}" aria-label="${esc(data.get(i).title)}"><img src="${esc(data.get(i).thumb)}" alt=""></button>`).join('')}</div>`;
      $('[data-canvas]').appendChild(el);
      el.addEventListener('click', e => {
        if (e.target.closest('[data-loupe-close]')) close();
        else if (e.target.closest('[data-loupe-prev]')) step(-1);
        else if (e.target.closest('[data-loupe-next]')) step(1);
        else { const b = e.target.closest('.strip button'); if (b) { current = Number(b.dataset.id); draw(); } }
      });
      el.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const f = $$('button', el);
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      });
      draw();
      $('[data-loupe-close]', el).focus();
    }
    function step(d) {
      const o = order(); const i = o.indexOf(current);
      if (i + d < 0 || i + d >= o.length) return;
      current = o[i + d];
      if (!$(`.strip button[data-id="${current}"]`, el)) { const id = current; close(); open(id); return; }
      draw();
    }
    function close() { el?.remove(); el = null; (boxOf(current) || opener)?.focus(); }
    return { open, close, step, get isOpen() { return Boolean(el); } };
  })();

  // ---------- raccourcis ----------
  // Ctrl A, Ctrl Z, Échap : toujours. P, I, L, Espace : seulement si la vignette ou l'inspecteur a le focus (WCAG 2.1.4),
  // et si le compte ne les a pas coupés (« Mon compte ») ; P ouvre le dialogue de publication, jamais une publication directe.
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || $('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (loupe.isOpen) {
      if (e.key === 'Escape' || (e.key === ' ' && !typing(document.activeElement))) { e.preventDefault(); loupe.close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); loupe.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); loupe.step(1); }
      return;
    }
    if (typing(document.activeElement)) return;
    if (mod && e.key.toLowerCase() === 'a' && contact) { e.preventDefault(); select(boxes().map(b => Number(b.value))); }
    else if (mod && e.key.toLowerCase() === 'z' && lastUndo) { e.preventDefault(); const u = lastUndo; lastUndo = null; toast.hide(); u(); }
    else if (mod || e.altKey) return;
    else if (e.key === 'Escape' && selIds().length) { e.preventDefault(); const first = checked()[0]; select([]); first?.focus(); }
    else if (!shortcuts || !document.activeElement?.closest?.('[data-contact], .plist, [data-inspector]')) return;
    else if (e.key.toLowerCase() === 'p' && selIds().length && can('photos.publier')) { e.preventDefault(); publishDialog(selIds(), { opener: document.activeElement }); }
    else if (e.key.toLowerCase() === 'i' && $('[data-import-open]')) { e.preventDefault(); $('[data-import-open]').click(); }
    else if (contact && (e.key.toLowerCase() === 'l' || (e.key === ' ' && !document.activeElement?.matches('button, a, input')))) {
      const id = selIds()[0] || Number(document.activeElement?.closest?.('.tile')?.dataset.id);
      if (id) { e.preventDefault(); loupe.open(id); }
    }
  });

  // ---------- glisser : l'ordre de la planche ou de la liste (toutes les photos, sans filtre) ----------
  const sortable = $('[data-contact][data-sortable], .plist[data-sortable]');
  if (sortable) {
    const isList = sortable.matches('.plist');
    const item = el => el.closest(isList ? 'li' : '.tile');
    let dragged = null;
    const clear = () => $$('.drop-before, .drop-after', sortable).forEach(t => t.classList.remove('drop-before', 'drop-after'));
    const after = (t, e) => (isList ? e.clientY > t.getBoundingClientRect().top + t.offsetHeight / 2 : e.clientX > t.getBoundingClientRect().left + t.offsetWidth / 2);
    const prepare = t => { t.draggable = true; $$('a, img', t).forEach(x => { x.draggable = false; }); };
    [...sortable.children].forEach(prepare);
    sortable.addEventListener('dragstart', e => { const t = item(e.target); if (!t || e.target.closest?.('input, details')) return; dragged = t; t.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.dataset.id); });
    sortable.addEventListener('dragend', () => { dragged?.classList.remove('dragging'); clear(); dragged = null; });
    sortable.addEventListener('dragover', e => { const t = item(e.target); if (!dragged || !t || t === dragged) return; e.preventDefault(); clear(); t.classList.add(after(t, e) ? 'drop-after' : 'drop-before'); });
    sortable.addEventListener('drop', async e => {
      const t = item(e.target);
      if (!dragged || !t || t === dragged) return;
      e.preventDefault();
      const before = [...sortable.children];
      sortable.insertBefore(dragged, after(t, e) ? t.nextSibling : t);
      clear();
      const restore = async () => { before.forEach(x => sortable.appendChild(x)); await post('/admin/photos/order', { ids: before.map(x => Number(x.dataset.id)) }); toast.show(esc(T('Ordre rétabli.'))); };
      try {
        await post('/admin/photos/order', { ids: [...sortable.children].map(x => Number(x.dataset.id)) });
        done(T('Ordre enregistré.'), restore);
      } catch {
        before.forEach(x => sortable.appendChild(x));
        toast.show(esc(T('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.')), { error: true });
      }
    });
    window.__prepareTile = prepare;
  }

  // ---------- import : les photos arrivent dans la planche et s'y développent (appelé par l'import ci-dessous) ----------
  const ratio = (w, h) => `ar-${Math.min(300, Math.max(40, Math.round((w / h) * 20) * 5))}`;
  window.__library = contact && {
    arrived(i) {
      data.set(i.photoId, { id: i.photoId, title: i.title, status: 'draft', provisional: true, category: '', ready: false, thumb: i.url || null });
      const li = document.createElement('li');
      li.id = `photo-${i.photoId}`;
      li.className = `tile developing ${i.w && i.h ? ratio(i.w, i.h) : 'ar-150'}`;
      li.dataset.id = i.photoId;
      li.setAttribute('data-provisional', '');
      li.innerHTML = `<label class="chk-l tile-chk"><input class="chk" type="checkbox" name="ids" value="${i.photoId}" form="bulk" aria-label="${esc(T('Sélectionner « {title} »', { title: i.title }))}"></label>
        <a class="img" href="/admin/photos/${i.photoId}" tabindex="-1" aria-hidden="true">${i.url ? `<img src="${i.url}" alt="">` : `<span class="ph">${esc(T('Développement…'))}</span>`}</a>
        <span class="badges"><span class="badge" data-statut>${esc(T('Développement'))}</span></span><span class="dev"><i></i></span>
        <span class="cap"><a class="ttl" href="/admin/photos/${i.photoId}">${esc(i.title)}</a><small>${esc(T('brouillon'))}</small></span>`;
      contact.appendChild(li);
      window.__prepareTile?.(li);
      this.progress(i);
      li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    progress(i) {
      const t = tileOf(i.photoId);
      if (!t) return;
      const f = i.total ? i.done / i.total : 0;
      const img = $('img', t);
      if (img) img.style.filter = `blur(${((1 - f) * 12).toFixed(1)}px) grayscale(${(1 - f).toFixed(2)}) brightness(${(0.6 + 0.4 * f).toFixed(2)})`;
      $('.dev i', t).style.width = `${Math.round(f * 100)}%`;
      $('.badge', t).textContent = i.total ? T('Développement · {done} / {total}', { done: i.done, total: i.total }) : T('En file');
    },
    async ready(i) {
      const t = tileOf(i.photoId);
      const p = await reload(i.photoId);
      if (!t) return;
      t.classList.remove('developing');
      $('.dev', t)?.remove();
      const img = $('img', t);
      if (img) { img.style.filter = ''; if (p?.thumb) img.src = p.thumb; }
      if (selIds().includes(i.photoId)) render();
    },
    gone(i) { tileOf(i.photoId)?.remove(); data.delete(i.photoId); if (anchor === i.photoId) anchor = null; },
    finished(ids) {
      if (!ids.length || typing(document.activeElement) || selIds().length) return;
      select(ids);
    },
  };

  render();
})();

// ----- import : vérifier avant d'envoyer, puis envoi et traitement photo par photo (repris de la v1, textes de la v2) -----
(function () {
  const section = $('[data-importer]');
  if (!section) return;
  const form = $('[data-import]', section);
  const input = $('input[type=file]', form);
  const list = $('[data-files]', section);
  const send = $('[data-send]', form);
  const cancel = $('[data-cancel]', form);
  const note = $('[data-import-note]', form);
  const sub = $('[data-import-sub]', section);
  const summary = $('[data-summary]', section);
  const next = $('[data-sum-next]', section);
  const defaults = $('[data-defaults]', section);
  const steps = $$('.steps li', section);
  const MAX_BYTES = Number(section.dataset.maxBytes);
  const MAX_PIXELS = 120e6;
  const PARALLEL = 3;
  const INFLIGHT_BYTES = 100 * 1000 * 1000;
  const LOCALE = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE' }[LANG];
  input.required = false;
  if ($('[data-contact]')) section.classList.add('with-grid');

  const items = [];
  let seq = 0, started = 0, firstStep = 0, lastDone = 0, sending = false;
  const mb = n => (n < 1024 * 1024 ? T('{n} Ko', { n: Math.max(1, Math.round(n / 1024)) }) : T('{n} Mo', { n: (n / 1024 / 1024).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) }));

  const open = () => {
    section.hidden = false;
    history.replaceState(null, '', `${location.pathname}?importer${location.hash}`);
    $('#import-title').setAttribute('tabindex', '-1');
    $('#import-title').focus();
  };
  $$('[data-import-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(); input.click(); }));
  $('[data-import-close]', section).addEventListener('click', e => {
    if (items.some(i => i.photoId)) return;
    e.preventDefault();
    if (sending) return;
    items.splice(0).forEach(i => i.url && URL.revokeObjectURL(i.url));
    render();
    section.hidden = true;
    history.replaceState(null, '', location.pathname);
    $('[data-import-open]')?.focus();
  });

  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; document.body.classList.add('dropping'); } });
  document.addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; document.body.classList.remove('dropping'); } });
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dropping');
    if (section.hidden) open();
    add([...e.dataTransfer.files]);
  });
  input.addEventListener('change', () => { add([...input.files]); input.value = ''; });

  async function sniff(file) {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const at = (o, ...v) => v.every((x, i) => b[o + i] === x);
    const str = (o, s) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
    if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
    if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'png';
    if (str(0, 'RIFF') && str(8, 'WEBP')) return 'webp';
    if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return 'tiff';
    if (str(4, 'ftyp')) return /^(heic|heix|hevc|hevx|mif1|msf1|avif|avis)/.test(String.fromCharCode(...b.slice(8, 12))) ? 'heif' : null;
    return null;
  }
  const size = url => new Promise(resolve => { const img = new Image(); img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = () => resolve(null); img.src = url; });

  async function add(files) { await check(files); start(); }
  async function check(files) {
    for (const file of files) {
      if (items.some(i => !i.removed && i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified)) continue;
      const item = { key: ++seq, file, state: 'checking', reason: '', meta: mb(file.size) };
      items.push(item);
      render();
      if (file.size > MAX_BYTES) { Object.assign(item, { state: 'bad', reason: T('Trop lourde ({max} max.)', { max: mb(MAX_BYTES) }) }); render(); continue; }
      const kind = await sniff(file);
      if (!kind) { Object.assign(item, { state: 'bad', reason: T('Ce n’est pas une image') }); render(); continue; }
      if (['jpeg', 'png', 'webp'].includes(kind)) {
        item.url = URL.createObjectURL(file);
        const d = await size(item.url);
        if (d) { item.meta += ` · ${d.w} × ${d.h}`; item.w = d.w; item.h = d.h; }
        if (d && d.w * d.h > MAX_PIXELS) { Object.assign(item, { state: 'bad', reason: T('Trop grande (120 Mpx max.)') }); render(); continue; }
      } else item.label = kind.toUpperCase();
      item.state = 'ready';
      render();
    }
  }

  const live = () => items.filter(i => !i.removed);
  const BADGE = {
    checking: ['wait', T('… Vérification')], ready: ['ok', T('✓ Prête à envoyer')], queued: ['wait', T('… En attente')],
    uploading: ['wait', T('↑ Envoi')], waiting: ['wait', T('… En file')], processing: ['wait', T('… Traitement')],
    done: ['ok', T('✓ Prête')], failed: ['err', T('! Échec')], bad: ['err', null], cancelled: ['wait', T('— Annulée')],
  };
  function row(i) {
    const [cls, label] = BADGE[i.state];
    let middle;
    if (i.state === 'bad') middle = `<span class="hint">${esc(T('Ne sera pas envoyée'))}</span>`;
    else if (i.state === 'ready' || i.state === 'checking') middle = `<span class="hint">${esc(T('Sera envoyée'))}</span>`;
    else if (i.state === 'uploading') middle = `<div class="bar"><i data-w="${i.up}"></i></div><span class="cap">${esc(T('Envoi {pct} % · {done} / {total}', { pct: i.up, done: mb(i.file.size * i.up / 100), total: mb(i.file.size) }))}</span>`;
    else if (i.state === 'waiting' || i.state === 'processing') {
      const pct = i.total ? Math.round(100 * i.done / i.total) : 0;
      middle = `<div class="bar proc"><i data-w="${pct}"></i></div><span class="cap">${esc(i.total ? T('Traitement : images {done} / {total}', { done: i.done, total: i.total }) : T('Envoyée · traitement en attente'))}</span>`;
    } else if (i.state === 'done') middle = `<div class="bar"><i data-w="100"></i></div><span class="cap">${esc(T('Envoyée · images prêtes'))}</span>`;
    else if (i.state === 'failed') middle = `<div class="bar fail"><i data-w="${i.up || 0}"></i></div><span class="cap">${esc(i.reason)}</span>`;
    else middle = `<span class="hint">${esc(i.state === 'queued' ? T('Sera envoyée') : T('Non envoyée'))}</span>`;
    let act = '';
    if (['ready', 'bad', 'checking'].includes(i.state)) act = `<button class="iconbtn" type="button" data-remove="${i.key}" aria-label="${esc(T('Retirer {name}', { name: i.file.name }))}">✕</button>`;
    else if ((i.state === 'failed' && i.retry) || i.state === 'cancelled') act = `<button class="btn ghost" type="button" data-retry="${i.key}">${esc(T('Réessayer'))}</button>`;
    const thumb = i.url ? `<img class="thumbf" src="${i.url}" alt="">` : `<span class="thumbf" aria-hidden="true">${i.state === 'bad' ? '✕' : esc(i.label || '…')}</span>`;
    return `<li class="${i.state === 'bad' ? 'bad' : ''}" data-key="${i.key}">${thumb}<span class="name">${esc(i.file.name)}<span class="meta">${esc(i.meta)}</span></span>`
      + `<span>${middle}</span><span class="st ${cls}">${esc(label || `✕ ${i.reason}`)}</span><span class="act">${act}</span></li>`;
  }
  // La liste n'est réécrite que si une ligne change de forme : un bouton qui a le focus (Retirer, Réessayer) le garde (UX-A-08).
  let drawn = '';
  function render() {
    const all = live();
    list.hidden = !all.length;
    const html = all.map(row).join('');
    if (html !== drawn) {
      const focusKey = document.activeElement?.closest?.('[data-files] li')?.dataset.key;
      const focusSel = document.activeElement?.matches?.('[data-remove]') ? '[data-remove]' : document.activeElement?.matches?.('[data-retry]') ? '[data-retry]' : null;
      list.innerHTML = html;
      drawn = html;
      if (focusKey && focusSel) $(`li[data-key="${focusKey}"] ${focusSel}`, list)?.focus();
    }
    $$('[data-w]', list).forEach(el => { el.style.width = `${el.dataset.w}%`; });
    const count = s => all.filter(i => (Array.isArray(s) ? s : [s]).includes(i.state)).length;
    const valid = count('ready'), bad = count('bad');
    if (!started) {
      send.textContent = valid ? (valid > 1 ? T('Envoyer les {n} photos valides', { n: valid }) : T('Envoyer la photo valide')) : T('Envoyer');
      send.disabled = !valid || count('checking') > 0;
      note.textContent = bad ? (bad > 1 ? T('{n} fichiers écartés : ils ne seront pas envoyés.', { n: bad }) : T('{n} fichier écarté : il ne sera pas envoyé.', { n: bad })) : '';
      $('[data-drop-title]', form).textContent = all.length ? T('Ajoutez d’autres photos') : T('Glissez vos photos ici');
      return;
    }
    const sent = all.filter(i => i.state !== 'bad');
    const ready = count('done'), proc = count(['waiting', 'processing']), working = count('processing'), up = count(['uploading', 'queued']), failed = count(['failed', 'cancelled']);
    const frac = sent.length ? sent.reduce((a, i) => a + (i.state === 'done' ? 1 : i.state === 'processing' || i.state === 'waiting' ? 0.5 + 0.5 * (i.total ? i.done / i.total : 0) : i.state === 'uploading' ? 0.5 * i.up / 100 : 0), 0) / sent.length : 0;
    const left = proc + up;
    let eta = '';
    if (left) {
      const doneN = sent.filter(i => i.state === 'done').length;
      if (doneN && firstStep && lastDone > firstStep) {
        const perPhoto = (lastDone - firstStep) / 1000 / doneN;
        const remaining = sent.filter(i => !['done', 'failed', 'cancelled', 'bad'].includes(i.state)).reduce((a, i) => a + 1 - (i.state === 'processing' && i.total ? i.done / i.total : 0), 0);
        const sec = Math.max(1, Math.round(remaining * perPhoto));
        const time = sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`;
        eta = ` — ${sec > 1 ? T('environ {time} restantes', { time }) : T('environ {time} restante', { time })}`;
      } else eta = ` — ${T('calcul du temps restant…')}`;
    }
    summary.hidden = false;
    $('[data-sum-title]', summary).textContent = ready > 1 ? T('{ready} photos prêtes sur {total}', { ready, total: sent.length }) : T('{ready} photo prête sur {total}', { ready, total: sent.length });
    $('[data-sum-detail]', summary).textContent = [working && T('· {n} en traitement', { n: working }), proc - working && T('· {n} en file', { n: proc - working }), up && T('· {n} en envoi', { n: up }), failed && (failed > 1 ? T('· {n} en échec ou annulées', { n: failed }) : T('· {n} en échec ou annulée', { n: failed }))].filter(Boolean).join(' ') + eta;
    $('[data-sum-bar]', summary).style.width = `${Math.round(frac * 100)}%`;
    const ids = all.filter(i => i.photoId && i.state !== 'failed').map(i => i.photoId);
    sending = up > 0;
    next.hidden = sending || !ids.length;
    next.href = `/admin/photos/lot?ids=${ids.join(',')}`;
    next.textContent = ids.length > 1 ? T('Compléter et publier les {n} photos →', { n: ids.length }) : T('Compléter et publier la photo →');
    if (!next.hidden && !next.dataset.focused) {
      next.dataset.focused = '1';
      const at = document.activeElement;
      if (!at || at === document.body || section.contains(at)) next.focus();
    }
    cancel.hidden = !up;
    send.hidden = true;
    defaults.hidden = true;
    steps[0].removeAttribute('aria-current'); steps[0].classList.add('done');
    if (!left) { steps[1].removeAttribute('aria-current'); steps[1].classList.add('done'); steps[2].setAttribute('aria-current', 'step'); } else steps[1].setAttribute('aria-current', 'step');
    sub.textContent = sending ? T('Envoi en cours : gardez cette page ouverte. Le traitement des photos déjà envoyées continue même si vous la quittez.')
      : left ? T('Envoi terminé. Le traitement continue sur le serveur : vous pouvez compléter les photos dès maintenant.') : T('Toutes les photos sont prêtes.');
  }
  const announce = text => { note.textContent = text; };

  list.addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    const retry = e.target.closest('[data-retry]');
    if (rm) {
      const i = items.find(x => x.key === Number(rm.dataset.remove));
      i.removed = true;
      if (i.url) URL.revokeObjectURL(i.url);
      render();
      (list.querySelector('[data-remove]') || input).focus();
    }
    if (retry) {
      const i = items.find(x => x.key === Number(retry.dataset.retry));
      Object.assign(i, { state: 'queued', up: 0, reason: '' });
      render();
      pump();
    }
  });
  function start() {
    const ready = live().filter(i => i.state === 'ready');
    if (!ready.length) return;
    if (!started) started = Date.now();
    ready.forEach(i => { i.state = 'queued'; i.up = 0; });
    announce(ready.length > 1 ? T('Envoi de {n} photos commencé.', { n: ready.length }) : T('Envoi de {n} photo commencé.', { n: ready.length }));
    pump();
  }
  form.addEventListener('submit', e => { e.preventDefault(); start(); });
  cancel.addEventListener('click', () => {
    live().forEach(i => { if (i.state === 'queued') i.state = 'cancelled'; if (i.state === 'uploading') { i.xhr?.abort(); i.state = 'cancelled'; } });
    render();
    announce(T('Envoi des photos restantes annulé. Les photos déjà envoyées sont conservées en brouillon.'));
  });
  addEventListener('beforeunload', e => { if (sending) { e.preventDefault(); e.returnValue = ''; } });
  function pump() {
    for (;;) {
      const sendingNow = live().filter(i => i.state === 'uploading');
      const i = live().find(x => x.state === 'queued');
      if (!i || sendingNow.length >= PARALLEL) break;
      const inflight = sendingNow.reduce((sum, x) => sum + x.file.size, 0);
      if (sendingNow.length && inflight + i.file.size > INFLIGHT_BYTES) break;
      upload(i);
    }
    render();
  }
  function upload(i) {
    i.state = 'uploading';
    i.up = 0;
    const fd = new FormData();
    fd.append('_csrf', CSRF);
    fd.append('author_id', $('select[name=author_id]', form).value);
    fd.append('category_id', $('select[name=category_id]', form).value);
    fd.append('photos', i.file, i.file.name);
    const xhr = new XMLHttpRequest();
    i.xhr = xhr;
    let last = 0;
    xhr.upload.onprogress = e => { if (!e.lengthComputable) return; i.up = Math.min(99, Math.round(100 * e.loaded / e.total)); if (Date.now() - last > 250) { last = Date.now(); render(); } };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* vide */ }
      if (xhr.status === 200 && data.id) {
        Object.assign(i, { state: 'waiting', photoId: data.id, up: 100, done: 0, total: 0, title: data.title });
        window.__library?.arrived(i);
        watch();
      } else if (xhr.status >= 400 && xhr.status < 500 && xhr.status !== 403) {
        Object.assign(i, { state: 'bad', reason: data.error ? data.error.charAt(0).toUpperCase() + data.error.slice(1) : T('Refusée') });
        announce(T('{name} refusée : {reason}.', { name: i.file.name, reason: i.reason }));
      } else {
        Object.assign(i, { state: 'failed', retry: true, reason: xhr.status === 403 ? T('Session expirée : rechargez la page') : T('Erreur du serveur ({status})', { status: xhr.status }) });
      }
      pump();
    };
    xhr.onerror = () => { Object.assign(i, { state: 'failed', retry: true, reason: T('Connexion interrompue à {n} %', { n: i.up }) }); announce(T('{name} : connexion interrompue. Vous pouvez réessayer cette photo.', { name: i.file.name })); pump(); };
    xhr.onabort = () => { if (i.state === 'uploading') i.state = 'cancelled'; pump(); };
    xhr.open('POST', '/admin/photos/envoi');
    xhr.setRequestHeader('accept', 'application/json');
    xhr.send(fd);
  }
  let timer = null;
  function watch() {
    if (timer) return;
    timer = setInterval(async () => {
      const pending = live().filter(i => i.state === 'waiting' || i.state === 'processing');
      if (!pending.length) { clearInterval(timer); timer = null; return; }
      try {
        const res = await fetch(`/admin/photos/traitement?ids=${pending.map(i => i.photoId).join(',')}`, { headers: { accept: 'application/json' }, redirect: 'manual' });
        if (!res.ok) return;
        const data = await res.json();
        const job = $('[data-activity]');
        if (job) { job.hidden = !data.active; $('[data-activity-text]', job).textContent = T(data.active > 1 ? 'Traitement : {n} photos' : 'Traitement : {n} photo', { n: data.active }); }
        if (!firstStep && data.photos.some(p => p.state === 'processing' || p.state === 'ready')) firstStep = Date.now() - 1000;
        for (const p of data.photos) {
          const i = pending.find(x => x.photoId === p.id);
          if (p.state === 'ready') { Object.assign(i, { state: 'done', done: p.total, total: p.total }); lastDone = Date.now(); announce(T('{name} prête.', { name: i.file.name })); window.__library?.ready(i); }
          else if (p.state === 'error' || p.state === 'missing') { window.__library?.gone(i); Object.assign(i, { state: 'failed', retry: false, photoId: null, reason: p.error || T('photo supprimée entre-temps') }); }
          else { Object.assign(i, { state: p.state, done: p.done, total: p.total }); window.__library?.progress(i); }
        }
        render();
        if (!live().some(i => ['queued', 'uploading', 'waiting', 'processing'].includes(i.state))) {
          const ok = live().filter(i => i.state === 'done').length;
          announce(ok > 1 ? T('Import terminé : {n} photos prêtes.', { n: ok }) : T('Import terminé : {n} photo prête.', { n: ok }));
          window.__library?.finished(live().filter(i => i.state === 'done').map(i => i.photoId));
        }
      } catch { /* réseau : prochain tour */ }
    }, 1000);
  }
  if (!section.hidden) $('#import-title').setAttribute('tabindex', '-1');
})();
