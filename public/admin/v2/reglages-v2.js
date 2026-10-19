/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Admin v2, vague 3 : Identité et apparence, Comptes et rôles, Site public. Amélioration progressive : sans ce script, les
// formulaires partent tels quels vers les routes de la v1 (boutons .sans-script, dialogues par leur ancre). Avec lui, ce qui
// se défait s'enregistre au geste avec « Défaire » 10 s (MQ-00 § 5 et 6, MQ-09) ; ce qui ne se défait pas (remplacer ou
// retirer un logo, supprimer un compte) passe d'abord par un dialogue. Mêmes routes : le serveur reste seul juge (droits,
// jeton, garde-fous des comptes, journal, Vigie).
// Chargé après admin-v2.js, dont il reprend les outils ($, $$, T, Th, esc, icon, post, toast, temoin, fieldError, CSRF).

// Valeur d'un choix pour le message : le mot de l'option (data-mot), sinon la valeur.
const motDe = input => input?.dataset.mot || input?.value || '';
// Une seule écriture à la fois par formulaire : les gestes rapides partent dans l'ordre.
const fileDAttente = () => { let chain = Promise.resolve(); return fn => (chain = chain.then(fn, fn)); };

// ----- Identité et apparence : sous-titre, marque et thème au geste (POST /admin/apparence, un champ à la fois) -----
$$('form[data-apparence]').forEach(form => {
  const queue = fileDAttente();
  const url = form.action;
  form.addEventListener('submit', e => { if (!e.submitter || !e.submitter.closest('.sans-script')) e.preventDefault(); });

  // Champ texte : enregistré quand on le quitte (ou Entrée) ; le serveur renvoie la valeur gardée (espaces retirés).
  $$('[data-rg-champ]', form).forEach(field => {
    const label = field.dataset.label || field.name;
    field.dataset.saved = field.value;
    const save = (value, previous, undoing = false) => queue(async () => {
      try {
        const r = await post(url, { [field.name]: value });
        const kept = r[field.name] ?? value;
        field.value = kept;
        field.dataset.saved = kept;
        fieldError(field, '');
        temoin.ok(field);
        if (undoing) { toast.show(Th('« {champ} » rétabli.', { champ: label })); field.focus(); return; }
        toast.show(Th('« {champ} » enregistré.', { champ: label }), { undo: async () => { field.value = previous; await save(previous, undefined, true); } });
      } catch (err) {
        fieldError(field, T('Erreur : {msg}', { msg: err.message }));
        temoin.ko(field, label);
        if (err.kind === 'reseau' || err.kind === 'session') toast.show(esc(err.message), { error: true, retry: () => save(value, previous, undoing) });
      }
    });
    const commit = () => { if (field.value !== field.dataset.saved) save(field.value, field.dataset.saved); };
    field.addEventListener('change', commit);
    field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  });

  // Choix (marque, thème) : enregistré dès qu'il est fait ; « Défaire » remet le choix d'avant.
  $$('[data-rg-choix]', form).forEach(set => {
    const label = set.dataset.label;
    const radios = $$('input[type="radio"]', set);
    let saved = radios.find(r => r.checked)?.value ?? '';
    const pick = v => { const r = radios.find(x => x.value === v); if (r) r.checked = true; return r; };
    const save = (value, previous, undoing = false) => queue(async () => {
      const input = radios.find(r => r.value === value);
      try {
        await post(url, { [input.name]: value });
        saved = value;
        temoin.ok(input);
        if (undoing) { toast.show(Th('« {champ} » rétabli : {valeur}.', { champ: label, valeur: motDe(input) })); input.focus(); return; }
        toast.show(Th('« {champ} » enregistré : {valeur}.', { champ: label, valeur: motDe(input) }), { undo: async () => { pick(previous); await save(previous, undefined, true); } });
      } catch (err) {
        pick(saved);
        toast.show(esc(err.message), { error: true, retry: err.kind === 'reseau' || err.kind === 'session' ? () => { pick(value); return save(value, previous, undoing); } : null });
      }
    });
    radios.forEach(r => r.addEventListener('change', () => { if (r.checked && r.value !== saved) save(r.value, saved); }));
    set.rgPick = v => { pick(v); saved = v; };
  });
});

// ----- Logos : enregistrés au choix du fichier (POST /admin/apparence/marque/:slot, jeton dans le formulaire) ; dans un
// emplacement vide, « Défaire » le retire ; un emplacement plein passe d'abord par le dialogue « Remplacer » -----
(function () {
  const forms = $$('form[data-logo]');
  if (!forms.length) return;
  const marque = $('fieldset#marque');
  const dlg = $('#dlg-remplacer');
  // La marque suit le serveur : « Emblème + nom » possible dès qu'un emblème ou une icône existe.
  const syncMarque = mode => {
    if (!marque) return;
    const has = $$('.rg-slot[data-slot="embleme"][data-plein], .rg-slot[data-slot="icone"][data-plein]').length > 0;
    const emb = $('input[value="embleme"]', marque);
    if (emb) { emb.disabled = !has; emb.closest('label')?.classList.toggle('inactif', !has); }
    const note = $('[data-embleme-manque]', marque);
    if (note) note.hidden = has;
    if (mode) marque.rgPick?.(mode);
  };
  const confirmer = name => new Promise(resolve => {
    if (!dlg) { resolve(true); return; }
    $('[data-remplacer-titre]', dlg).textContent = T('Remplacer « {name} » ?', { name });
    $('[data-confirmer-ok]', dlg).onclick = () => { dlg.close(); resolve(true); };
    dlg.addEventListener('close', () => resolve(false), { once: true });
    dlg.showModal();
    $('[data-annuler]', dlg)?.focus();
  });
  async function send(form, body) {
    let res;
    try {
      res = await fetch(form.action, { method: 'POST', body, redirect: 'manual', credentials: 'same-origin', headers: { accept: 'application/json' } });
    } catch {
      throw new Refus(T('Réseau coupé : rien n’est enregistré. Réessayez quand le réseau revient.'), { kind: 'reseau' });
    }
    let data = {};
    try { data = await res.json(); } catch { /* vide */ }
    if (res.type === 'opaqueredirect' || res.status === 0 || res.status === 401 || (res.status === 403 && /CSRF/i.test(data.error || ''))) throw new Refus(T('Session expirée : reconnectez-vous dans un nouvel onglet, puis réessayez ici.'), { kind: 'session' });
    if (!res.ok) throw new Refus(data.error || T('Erreur {status}', { status: res.status }), { status: res.status, data });
    return data;
  }
  // Aperçu, libellé du champ et « Retirer… » d'un emplacement, d'après le fichier enregistré (ou aucun).
  function show(slot, file, extra = {}) {
    const box = $('[data-apercu]', slot);
    const name = slot.dataset.label;
    box.replaceChildren();
    if (file) {
      const img = document.createElement('img');
      img.src = `/brand/${file}`;
      img.alt = T('{name} actuel', { name });
      box.append(img);
      if (extra.favicon180 && slot.dataset.slot !== 'partage') {
        const fav = document.createElement('img');
        fav.className = 'rg-favicon'; fav.src = `/brand/${extra.favicon180}`; fav.alt = ''; fav.width = 48; fav.height = 48;
        box.append(fav);
      }
    } else {
      const s = document.createElement('span');
      s.className = 'vide'; s.textContent = T('Aucun fichier');
      box.append(s);
    }
    slot.toggleAttribute('data-plein', Boolean(file));
    const lab = $('label[data-plein-mot]', slot);
    if (lab?.firstChild) lab.firstChild.textContent = file ? lab.dataset.pleinMot : lab.dataset.videMot;
    const rem = $('.rg-retirer', slot);
    if (rem) rem.hidden = !file;
  }
  forms.forEach(form => {
    const slot = form.closest('.rg-slot');
    const input = $('input[type="file"]', form);
    const name = slot.dataset.label;
    form.addEventListener('submit', e => { if (!e.submitter || !e.submitter.closest('.sans-script')) e.preventDefault(); });
    input.addEventListener('change', async () => {
      if (!input.files.length) return;
      const wasEmpty = !slot.hasAttribute('data-plein');
      if (!wasEmpty && !(await confirmer(name))) { input.value = ''; input.focus(); return; }
      input.setAttribute('aria-busy', 'true');
      try {
        const r = await send(form, new FormData(form));
        input.value = '';
        input.removeAttribute('aria-busy');
        fieldError(input, '');
        show(slot, r.file, r);
        syncMarque(r.mode);
        temoin.ok(input);
        // Emplacement vide : « Défaire » retire le fichier et remet la marque d'avant. Remplacé : rien à défaire.
        const undo = wasEmpty ? async () => {
          const d = await post(`${form.action}/delete`, {});
          show(slot, null);
          syncMarque(d.mode);
          if (r.modeBefore && d.mode !== r.modeBefore) { await post('/admin/apparence', { brand_mode: r.modeBefore }); syncMarque(r.modeBefore); }
          toast.show(esc(d.message));
          input.focus();
        } : null;
        toast.show(esc(r.message), undo ? { undo } : {});
      } catch (err) {
        input.value = '';
        input.removeAttribute('aria-busy');
        fieldError(input, T('Erreur : {msg}', { msg: err.message }));
        toast.show(esc(err.message), { error: true });
        input.focus();
      }
    });
  });
})();

// ----- Comptes et rôles : l'envoi du compte sur place (même route, même garde-fous), « Défaire » renvoie l'état d'avant ;
// le résumé de la carte est relu sur la page du serveur (mêmes mots que sans script) -----
$$('form[data-compte-form]').forEach(form => {
  const card = form.closest('[data-compte]');
  const errBox = $('[data-compte-err]', form);
  const name = form.dataset.nom;
  const state = () => ({
    roles: $$('input[name="roles"]', form).filter(b => b.checked && !b.disabled).map(b => b.value),
    author_id: $('select[name="author_id"]', form)?.value ?? '',
    status: $('input[name="status"]', form)?.checked ? 'desactive' : '',
  });
  const apply = s => {
    $$('input[name="roles"]', form).forEach(b => { if (!b.disabled) b.checked = s.roles.includes(b.value); });
    const sel = $('select[name="author_id"]', form); if (sel) sel.value = s.author_id;
    const st = $('input[name="status"]', form); if (st) st.checked = s.status === 'desactive';
  };
  let saved = state();
  const refresh = async () => {
    try {
      const html = await (await fetch('/admin/comptes', { headers: { accept: 'text/html' }, credentials: 'same-origin' })).text();
      const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector(`[data-compte="${card.dataset.compte}"] [data-resume]`);
      if (fresh) $('[data-resume]', card).replaceChildren(...fresh.childNodes);
    } catch { /* le résumé sera juste au prochain affichage */ }
  };
  const fail = msg => { errBox.hidden = false; errBox.innerHTML = `${icon('alerte')}<span><b>${esc(T('Erreur :'))}</b> ${esc(msg)}</span>`; };
  const send = async (s, undoing = false) => {
    const before = saved;
    try {
      const r = await post(form.action, s);
      saved = { roles: r.account.roles, author_id: r.account.author_id ? String(r.account.author_id) : '', status: r.account.status === 'desactive' ? 'desactive' : '' };
      apply(saved);
      errBox.hidden = true;
      temoin.ok(form);
      await refresh();
      if (undoing) { toast.show(Th('Compte « {name} » rétabli.', { name })); form.querySelector('[type="submit"]')?.focus(); return; }
      toast.show(esc(r.message), { undo: async () => { apply(before); await send(before, true); } });
    } catch (err) {
      fail(err.message);
      if (err.kind === 'reseau' || err.kind === 'session') toast.show(esc(err.message), { error: true, retry: () => send(s, undoing) });
    }
  };
  form.addEventListener('submit', e => { e.preventDefault(); send(state()); });
});

// ----- Site public : le formulaire entier part à chaque geste (POST /admin/reglages, part=site), comme sans script -----
(function () {
  const form = $('form[data-site]');
  if (!form) return;
  const queue = fileDAttente();
  const body = () => {
    const b = {};
    for (const [k, v] of new FormData(form)) {
      if (k === '_csrf') continue;
      if (k === 'hero') (b.hero ||= []).push(v); else b[k] = v;
    }
    return b;
  };
  const save = (what, { undo = null, undoing = false, field = null, label = '' } = {}) => queue(async () => {
    try {
      await post(form.action, body());
      if (field) { field.dataset.saved = field.type === 'checkbox' ? String(field.checked) : field.value; fieldError(field, ''); temoin.ok(field); } else temoin.ok(form);
      toast.show(what, undoing || !undo ? {} : { undo });
    } catch (err) {
      if (field) { fieldError(field, T('Erreur : {msg}', { msg: err.message })); temoin.ko(field, label); }
      toast.show(esc(err.message), { error: true, retry: err.kind === 'reseau' || err.kind === 'session' ? () => save(what, { undo, undoing, field, label }) : null });
    }
  });
  form.addEventListener('submit', e => { if (!e.submitter || !e.submitter.closest('.sans-script')) e.preventDefault(); });

  // Textes et cases : un champ quitté (ou une case cochée) enregistre la page ; « Défaire » remet sa valeur d'avant.
  $$('input[data-label], textarea[data-label]', form).forEach(field => {
    const label = field.dataset.label;
    const cur = () => (field.type === 'checkbox' ? String(field.checked) : field.value);
    const set = v => { if (field.type === 'checkbox') field.checked = v === 'true'; else field.value = v; };
    field.dataset.saved = cur();
    const commit = () => {
      const prev = field.dataset.saved, now = cur();
      if (now === prev) return;
      $(`[data-trad-statut="${field.name}"]`)?.replaceChildren();
      save(Th('« {champ} » enregistré.', { champ: label }), { field, label, undo: async () => { set(prev); await save(Th('« {champ} » rétabli.', { champ: label }), { field, label, undoing: true }); field.focus(); } });
    };
    field.addEventListener('change', commit);
    field._commit = commit;
    if (field.matches('input[type="text"]')) field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  });

  // Traduction proposée : elle remplit le champ, rien n'est enregistré avant « Enregistrer la traduction » (ou le champ quitté
  // après l'avoir retouchée).
  form.addEventListener('click', async e => {
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
      field.value = text;
      temoin.ko(field, field.dataset.label);
      status.textContent = `${T('Traduction proposée, pas encore enregistrée : relisez-la, puis « Enregistrer la traduction ».')} `;
      const ok = document.createElement('button');
      ok.type = 'button'; ok.className = 'btn ghost'; ok.textContent = T('Enregistrer la traduction');
      ok.addEventListener('click', () => { field._commit(); });
      status.append(ok);
      field.focus();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  });

  // Ouverture de l'accueil : ← → ✕ et les cases de la réserve changent la liste sur place, puis enregistrent la page.
  const box = $('[data-hero]', form);
  if (!box) return;
  const list = $('[data-hero-chosen]', box);
  const pool = $('[data-hero-pool]', box);
  const max = Number(box.dataset.max) || 8;
  const items = () => $$('li[data-slug]', list);
  const picks = () => $$('label.pick', pool);
  function sync() {
    const n = items().length;
    items().forEach((li, i) => {
      $('.n', li).textContent = String(i + 1);
      $('[data-hero-op="left"]', li).disabled = i === 0;
      $('[data-hero-op="right"]', li).disabled = i === n - 1;
    });
    $('[data-hero-count]', box).textContent = T(n > 1 ? '{n} / {max} choisies' : '{n} / {max} choisie', { n, max });
    $('[data-hero-empty]', box).hidden = n > 0;
    $('[data-hero-full]', box).hidden = n < max;
    picks().forEach(l => { const cb = $('input', l); cb.disabled = !l.hidden ? n >= max : true; });
  }
  const snapshot = () => ({ html: list.innerHTML, pool: picks().map(l => l.hidden) });
  const restore = s => { list.innerHTML = s.html; picks().forEach((l, i) => { l.hidden = s.pool[i]; $('input', l).checked = false; }); sync(); };
  const titleOf = li => li.dataset.title;
  function make(label) {
    const slug = label.dataset.slug, title = label.dataset.title;
    const li = document.createElement('li');
    li.className = 'it'; li.dataset.slug = slug; li.dataset.title = title;
    const pic = $('picture, img', label)?.cloneNode(true);
    const btn = (op, sym, aria) => `<button type="submit" name="hero_op" value="${op}:${esc(slug)}" aria-label="${esc(aria)}" data-hero-op="${op}">${sym}</button>`;
    li.innerHTML = `<input type="hidden" name="hero" value="${esc(slug)}"><span class="n mono" aria-hidden="true"></span><span class="t">${esc(title)}</span>`
      + `<span class="mv">${btn('left', '←', T('Avancer « {title} »', { title }))}${btn('right', '→', T('Reculer « {title} »', { title }))}${btn('remove', '✕', T('Retirer « {title} » de l’ouverture', { title }))}</span>`;
    if (pic) $('.n', li).after(pic);
    return li;
  }
  const changed = (before, what, focus) => {
    sync();
    focus?.focus();
    save(what, { undo: async () => { restore(before); await save(Th('Ouverture rétablie.', {}), { undoing: true }); } });
  };
  list.addEventListener('click', e => {
    const b = e.target.closest('[data-hero-op]');
    if (!b) return;
    e.preventDefault();
    const li = b.closest('li');
    const before = snapshot();
    const op = b.dataset.heroOp;
    const title = titleOf(li);
    if (op === 'remove') {
      const next = li.nextElementSibling || li.previousElementSibling;
      li.remove();
      const p = picks().find(l => l.dataset.slug === li.dataset.slug);
      if (p) { p.hidden = false; $('input', p).checked = false; }
      changed(before, Th('Ouverture : « {title} » retirée.', { title }), next ? $('[data-hero-op="remove"]', next) : $('input:not(:disabled)', pool));
      return;
    }
    if (op === 'left' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
    if (op === 'right' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
    const n = items().indexOf(li) + 1;
    // Le focus reste sur la flèche ; arrivée au bout, sur l'autre flèche (une flèche désactivée ne le garde pas).
    sync();
    const keep = b.disabled ? $(`[data-hero-op="${op === 'left' ? 'right' : 'left'}"]`, li) : b;
    changed(before, Th('Ouverture : « {title} » en place {n}.', { title, n }), keep);
  });
  pool.addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb || !cb.checked) return;
    const label = cb.closest('label.pick');
    if (items().length >= max) { cb.checked = false; return; }
    const before = snapshot();
    list.append(make(label));
    cb.checked = false;
    label.hidden = true;
    const next = picks().find(l => !l.hidden && !$('input', l).disabled && l.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_PRECEDING);
    changed(before, Th('Ouverture : « {title} » ajoutée.', { title: label.dataset.title }), next ? $('input', next) : $('[data-hero-op="remove"]', list.lastElementChild));
  });
  sync();
})();
