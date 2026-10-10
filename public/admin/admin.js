// Amélioration progressive de l'admin : tout fonctionne sans ce script (formulaires classiques).
document.documentElement.classList.add('js');
const CSRF = document.body.dataset.csrf;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, accept: 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) throw Object.assign(new Error(data.error || (res.status === 0 ? 'Session expirée ? Rechargez la page.' : `Erreur ${res.status}`)), { data, status: res.status });
  return data;
}

// ----- message de confirmation, avec « Annuler » pendant 10 s -----
// Il survit à un rechargement de page (sessionStorage) : les actions groupées rechargent la liste.
const toast = (() => {
  const box = $('[data-toast]');
  let timer = null;
  function show(text, { undo = null, error = false } = {}) {
    if (!box) return;
    clearTimeout(timer);
    box.classList.toggle('error', error);
    box.innerHTML = `<span>${esc(text)}</span>`;
    if (undo) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Annuler';
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { await undo(); } catch (err) { show(`Annulation impossible : ${err.message}`, { error: true }); }
      });
      box.appendChild(b);
    }
    box.hidden = false;
    timer = setTimeout(() => { box.hidden = true; }, undo ? 10000 : 6000);
  }
  // Après rechargement : message (et annulation d'action groupée) mis de côté avant.
  const saved = sessionStorage.getItem('toast');
  if (saved) {
    sessionStorage.removeItem('toast');
    try {
      const t = JSON.parse(saved);
      if (Date.now() - t.at < 15000) {
        show(t.text, {
          error: t.error,
          undo: t.undo && (async () => { const r = await postJson('/admin/photos/actions', t.undo); keep(r.text); location.reload(); }),
        });
      }
    } catch { /* ignoré */ }
  }
  function keep(text, undo = null, error = false) { sessionStorage.setItem('toast', JSON.stringify({ text, undo, error, at: Date.now() })); }
  return { show, keep };
})();

// ----- textes réservés au JavaScript / sans JavaScript -----
$$('[data-js-only]').forEach(el => { el.hidden = false; });

// ----- menu mobile -----
(function () {
  const top = $('[data-top]');
  const btn = $('[data-menu]');
  if (!top || !btn) return;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const open = top.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
})();

// ----- menus « ⋯ » : un seul ouvert, fermés par Échap ou un clic ailleurs -----
(function () {
  const menus = () => $$('details.menu[open]');
  document.addEventListener('click', e => menus().forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    menus().forEach(d => { d.open = false; d.querySelector('summary').focus(); });
  });
})();

// ----- filtres : appliqués dès qu'une liste change -----
(function () {
  const form = $('[data-filters]');
  if (!form) return;
  $$('select', form).forEach(s => s.addEventListener('change', () => form.requestSubmit()));
  const hint = $('[data-drop-hint]');
  if (hint) hint.hidden = false;
})();

// ----- indicateur « Traitement : n photos » (en-tête) -----
const activity = (() => {
  const box = $('[data-activity]');
  let timer = null;
  function set(n) {
    if (!box) return;
    box.hidden = !n;
    $('[data-activity-text]', box).textContent = `Traitement : ${plural(n, 'photo')}`;
  }
  async function poll() {
    try {
      const res = await fetch('/admin/photos/traitement', { headers: { accept: 'application/json' }, redirect: 'manual' });
      if (!res.ok) return;
      const { active } = await res.json();
      set(active);
      if (!active) { clearInterval(timer); timer = null; }
    } catch { /* réseau : on réessaie au prochain tour */ }
  }
  const watch = () => { if (!timer) timer = setInterval(poll, 2000); };
  if (box && !box.hidden) watch();
  return { set, watch };
})();

// ----- import : vérifier avant d'envoyer, puis envoi et traitement photo par photo -----
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
  const PARALLEL = 2;
  input.required = false;

  const items = [];
  let seq = 0;
  let started = 0;
  let firstStep = 0;            // début du traitement observé (premier état reçu)
  let lastDone = 0;             // dernière photo devenue prête
  let sending = false;
  const mb = n => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);

  // Ouvrir / fermer sans recharger la page.
  const open = () => {
    section.hidden = false;
    history.replaceState(null, '', `${location.pathname}?importer${location.hash}`);
    $('#import-title').setAttribute('tabindex', '-1');
    $('#import-title').focus();
  };
  // « Importer des photos » ouvre directement le choix des fichiers.
  $$('[data-import-open]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(); input.click(); }));
  $('[data-import-close]', section).addEventListener('click', e => {
    if (items.some(i => i.photoId)) return;          // des photos ont été envoyées : la liste se recharge
    e.preventDefault();
    if (sending) return;
    items.splice(0).forEach(i => i.url && URL.revokeObjectURL(i.url));
    render();
    section.hidden = true;
    history.replaceState(null, '', location.pathname);
    $('[data-import-open]')?.focus();
  });

  // Déposer des photos n'importe où sur la page.
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

  // Nature réelle du fichier, d'après ses premiers octets (une extension ne prouve rien).
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
  const size = (url) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });

  async function add(files) {
    await check(files);
    start();                     // les photos valides partent aussitôt : aucun bouton à cliquer
  }
  async function check(files) {
    for (const file of files) {
      if (items.some(i => !i.removed && i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified)) continue;
      const item = { key: ++seq, file, state: 'checking', reason: '', meta: mb(file.size) };
      items.push(item);
      render();
      if (file.size > MAX_BYTES) { Object.assign(item, { state: 'bad', reason: `Trop lourde (${mb(MAX_BYTES)} max.)` }); render(); continue; }
      const kind = await sniff(file);
      if (!kind) { Object.assign(item, { state: 'bad', reason: 'Ce n’est pas une image' }); render(); continue; }
      if (['jpeg', 'png', 'webp'].includes(kind)) {
        item.url = URL.createObjectURL(file);
        const d = await size(item.url);
        if (d) item.meta += ` · ${d.w} × ${d.h}`;
        if (d && d.w * d.h > MAX_PIXELS) { Object.assign(item, { state: 'bad', reason: 'Trop grande (120 Mpx max.)' }); render(); continue; }
      } else item.label = kind.toUpperCase();
      item.state = 'ready';
      render();
    }
  }

  // ----- affichage -----
  const live = () => items.filter(i => !i.removed);
  const BADGE = {
    checking: ['wait', '… Vérification'], ready: ['ok', '✓ Prête à envoyer'], queued: ['wait', '… En attente'],
    uploading: ['wait', '↑ Envoi'], waiting: ['wait', '… En file'], processing: ['wait', '… Traitement'],
    done: ['ok', '✓ Prête'], failed: ['err', '! Échec'], bad: ['err', null], cancelled: ['wait', '— Annulée'],
  };
  function row(i) {
    const [cls, label] = BADGE[i.state];
    let middle;
    if (i.state === 'bad') middle = '<span class="hint">Ne sera pas envoyée</span>';
    else if (i.state === 'ready' || i.state === 'checking') middle = '<span class="hint">Sera envoyée</span>';
    else if (i.state === 'uploading') middle = `<div class="bar"><i data-w="${i.up}"></i></div><span class="cap">Envoi ${i.up} % · ${mb(i.file.size * i.up / 100)} / ${mb(i.file.size)}</span>`;
    else if (i.state === 'waiting' || i.state === 'processing') {
      const pct = i.total ? Math.round(100 * i.done / i.total) : 0;
      middle = `<div class="bar proc"><i data-w="${pct}"></i></div><span class="cap">${i.total ? `Traitement : images ${i.done} / ${i.total}` : 'Envoyée · traitement en attente'}</span>`;
    } else if (i.state === 'done') middle = `<div class="bar"><i data-w="100"></i></div><span class="cap">Envoyée · images prêtes</span>`;
    else if (i.state === 'failed') middle = `<div class="bar fail"><i data-w="${i.up || 0}"></i></div><span class="cap">${esc(i.reason)}</span>`;
    else middle = `<span class="hint">${i.state === 'queued' ? 'Sera envoyée' : 'Non envoyée'}</span>`;
    let act = '';
    if (['ready', 'bad', 'checking'].includes(i.state)) act = `<button class="iconbtn" type="button" data-remove="${i.key}" aria-label="Retirer ${esc(i.file.name)}">✕</button>`;
    else if (i.state === 'failed' && i.retry || i.state === 'cancelled') act = `<button class="btn ghost" type="button" data-retry="${i.key}">Réessayer</button>`;
    const thumb = i.url ? `<img class="thumbf" src="${i.url}" alt="">` : `<span class="thumbf" aria-hidden="true">${i.state === 'bad' ? '✕' : esc(i.label || '…')}</span>`;
    return `<li class="${i.state === 'bad' ? 'bad' : ''}" data-key="${i.key}">${thumb}<span class="name">${esc(i.file.name)}<span class="meta">${esc(i.meta)}</span></span>`
      + `<span>${middle}</span><span class="st ${cls}">${esc(label || '✕ ' + i.reason)}</span><span class="act">${act}</span></li>`;
  }

  function render() {
    const all = live();
    list.hidden = !all.length;
    list.innerHTML = all.map(row).join('');
    // Largeurs posées par le CSSOM : la politique de sécurité interdit les attributs style.
    $$('[data-w]', list).forEach(el => { el.style.width = `${el.dataset.w}%`; });
    const count = s => all.filter(i => (Array.isArray(s) ? s : [s]).includes(i.state)).length;
    const valid = count('ready');
    const bad = count('bad');
    if (!started) {
      send.textContent = valid ? `Envoyer ${valid > 1 ? `les ${valid} photos valides` : 'la photo valide'}` : 'Envoyer';
      send.disabled = !valid || count('checking') > 0;
      note.textContent = bad ? `${plural(bad, 'fichier écarté', 'fichiers écartés')} : ${bad > 1 ? 'ils ne seront pas envoyés' : 'il ne sera pas envoyé'}.` : '';
      $('[data-drop-title]', form).textContent = all.length ? 'Ajoutez d’autres photos' : 'Glissez vos photos ici';
      return;
    }
    // Étape 2 : barre du lot, décompte par état, temps restant.
    const sent = all.filter(i => i.state !== 'bad');
    const ready = count('done');
    const proc = count(['waiting', 'processing']);
    const working = count('processing');
    const up = count(['uploading', 'queued']);
    const failed = count(['failed', 'cancelled']);
    const frac = sent.length ? sent.reduce((a, i) => a + (i.state === 'done' ? 1 : i.state === 'processing' || i.state === 'waiting' ? 0.5 + 0.5 * (i.total ? i.done / i.total : 0) : i.state === 'uploading' ? 0.5 * i.up / 100 : 0), 0) / sent.length : 0;
    const left = proc + up;
    // Temps restant : d'après la durée de traitement des photos déjà prêtes (les tailles d'images
    // n'ont pas toutes le même coût : on attend une photo complète avant d'estimer).
    let eta = '';
    if (left) {
      const doneN = sent.filter(i => i.state === 'done').length;
      if (doneN && firstStep && lastDone > firstStep) {
        const perPhoto = (lastDone - firstStep) / 1000 / doneN;
        const remaining = sent.filter(i => !['done', 'failed', 'cancelled', 'bad'].includes(i.state))
          .reduce((a, i) => a + 1 - (i.state === 'processing' && i.total ? i.done / i.total : 0), 0);
        const sec = Math.max(1, Math.round(remaining * perPhoto));
        eta = ` — environ ${sec < 60 ? `${sec} s` : `${Math.round(sec / 60)} min`} restante${sec > 1 ? 's' : ''}`;
      } else eta = ' — calcul du temps restant…';
    }
    summary.hidden = false;
    $('[data-sum-title]', summary).textContent = `${ready} photo${ready > 1 ? 's' : ''} prête${ready > 1 ? 's' : ''} sur ${sent.length}`;
    $('[data-sum-detail]', summary).textContent = [working && `· ${working} en traitement`, proc - working && `· ${proc - working} en file`, up && `· ${up} en envoi`, failed && `· ${failed} en échec ou annulée${failed > 1 ? 's' : ''}`].filter(Boolean).join(' ') + eta;
    $('[data-sum-bar]', summary).style.width = `${Math.round(frac * 100)}%`;
    const ids = all.filter(i => i.photoId && i.state !== 'failed').map(i => i.photoId);
    sending = up > 0;
    next.hidden = sending || !ids.length;
    next.href = `/admin/photos/lot?ids=${ids.join(',')}`;
    next.textContent = `Compléter et publier ${ids.length > 1 ? `les ${ids.length} photos` : 'la photo'} →`;
    if (!next.hidden && !next.dataset.focused) { next.dataset.focused = '1'; next.focus(); }
    cancel.hidden = !up;
    send.hidden = true;
    defaults.hidden = true;
    steps[0].removeAttribute('aria-current'); steps[0].classList.add('done');
    if (!left) { steps[1].removeAttribute('aria-current'); steps[1].classList.add('done'); steps[2].setAttribute('aria-current', 'step'); }
    else steps[1].setAttribute('aria-current', 'step');
    sub.textContent = sending
      ? 'Envoi en cours : gardez cette page ouverte. Le traitement des photos déjà envoyées continue même si vous la quittez.'
      : left ? 'Envoi terminé. Le traitement continue sur le serveur : vous pouvez compléter les photos dès maintenant.' : 'Toutes les photos sont prêtes.';
  }

  // Annonce vocale : seulement les changements d'état importants (pas chaque pourcentage).
  const announce = text => { note.textContent = text; };

  list.addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    const retry = e.target.closest('[data-retry]');
    if (rm) {
      const i = items.find(x => x.key === Number(rm.dataset.remove));
      i.removed = true;
      if (i.url) URL.revokeObjectURL(i.url);
      render();
      (list.querySelector('[data-remove]') || $('input[type=file]', form)).focus();
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
    announce(`Envoi de ${plural(ready.length, 'photo')} commencé.`);
    pump();
  }
  form.addEventListener('submit', e => { e.preventDefault(); start(); });

  cancel.addEventListener('click', () => {
    live().forEach(i => {
      if (i.state === 'queued') i.state = 'cancelled';
      if (i.state === 'uploading') { i.xhr?.abort(); i.state = 'cancelled'; }
    });
    render();
    announce('Envoi des photos restantes annulé. Les photos déjà envoyées sont conservées en brouillon.');
  });

  addEventListener('beforeunload', e => { if (sending) { e.preventDefault(); e.returnValue = ''; } });

  function pump() {
    while (live().filter(i => i.state === 'uploading').length < PARALLEL) {
      const i = live().find(x => x.state === 'queued');
      if (!i) break;
      upload(i);
    }
    render();
  }

  function upload(i) {
    i.state = 'uploading';
    i.up = 0;
    const fd = new FormData();
    fd.append('_csrf', CSRF);                                  // le jeton d'abord : rien n'est lu sans lui
    fd.append('author_id', $('select[name=author_id]', form).value);
    fd.append('category_id', $('select[name=category_id]', form).value);
    fd.append('photos', i.file, i.file.name);
    const xhr = new XMLHttpRequest();
    i.xhr = xhr;
    let last = 0;
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      i.up = Math.min(99, Math.round(100 * e.loaded / e.total));
      if (Date.now() - last > 250) { last = Date.now(); render(); }
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* vide */ }
      if (xhr.status === 200 && data.id) {
        Object.assign(i, { state: 'waiting', photoId: data.id, up: 100, done: 0, total: 0 });
        watch();
      } else if (xhr.status >= 400 && xhr.status < 500 && xhr.status !== 403) {
        Object.assign(i, { state: 'bad', reason: data.error ? data.error.charAt(0).toUpperCase() + data.error.slice(1) : 'Refusée' });
        announce(`${i.file.name} refusée : ${i.reason}.`);
      } else {
        Object.assign(i, { state: 'failed', retry: true, reason: xhr.status === 403 ? 'Session expirée : rechargez la page' : `Erreur du serveur (${xhr.status})` });
      }
      pump();
    };
    xhr.onerror = () => {
      Object.assign(i, { state: 'failed', retry: true, reason: `Connexion interrompue à ${i.up} %` });
      announce(`${i.file.name} : connexion interrompue. Vous pouvez réessayer cette photo.`);
      pump();
    };
    xhr.onabort = () => { if (i.state === 'uploading') i.state = 'cancelled'; pump(); };
    xhr.open('POST', '/admin/photos/envoi');
    xhr.setRequestHeader('accept', 'application/json');
    xhr.send(fd);
  }

  // Suivi du traitement côté serveur.
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
        activity.set(data.active);
        if (!firstStep && data.photos.some(p => p.state === 'processing' || p.state === 'ready')) firstStep = Date.now() - 1000;
        for (const p of data.photos) {
          const i = pending.find(x => x.photoId === p.id);
          if (p.state === 'ready') { Object.assign(i, { state: 'done', done: p.total, total: p.total }); lastDone = Date.now(); announce(`${i.file.name} prête.`); }
          else if (p.state === 'error' || p.state === 'missing') Object.assign(i, { state: 'failed', retry: false, photoId: null, reason: p.error || 'photo supprimée entre-temps' });
          else Object.assign(i, { state: p.state, done: p.done, total: p.total });
        }
        render();
        if (!live().some(i => ['queued', 'uploading', 'waiting', 'processing'].includes(i.state))) {
          const ok = live().filter(i => i.state === 'done').length;
          announce(`Import terminé : ${plural(ok, 'photo prête', 'photos prêtes')}.`);
        }
      } catch { /* réseau : prochain tour */ }
    }, 1000);
  }

  if (!section.hidden) $('#import-title').setAttribute('tabindex', '-1');
})();

// ----- sélection multiple et actions groupées (Photos, Compléter le lot) -----
(function () {
  const bar = $('[data-bulk]');
  if (!bar) return;
  const batch = bar.hasAttribute('data-batch');
  const boxes = () => $$(`input.chk[name=ids][form=bulk]`);
  const checked = () => boxes().filter(b => b.checked);
  const count = $('[data-bulk-count]', bar);
  const clear = $('[data-bulk-clear]', bar);
  const allBox = $('[data-select-all] input') || $('[data-select-all-lot]');
  const allLabel = $('[data-select-all]');
  const newName = $('[data-bulk-new]', bar);
  const catSelect = $('[data-bulk-category]', bar);
  if (allLabel) allLabel.hidden = false;
  if (clear) clear.hidden = false;

  function update() {
    const n = checked().length;
    count.textContent = n ? `${n} sélectionnée${n > 1 ? 's' : ''}` : 'Aucune photo sélectionnée';
    if (!batch) bar.hidden = n === 0;
    $$('button[name=action]', bar).forEach(b => { b.disabled = n === 0; });
    if (allBox) { allBox.checked = n > 0 && n === boxes().length; allBox.indeterminate = n > 0 && n < boxes().length; }
  }
  document.addEventListener('change', e => { if (e.target.matches('input.chk[name=ids][form=bulk]')) update(); });
  // Maj + clic : toute la plage depuis la case précédente (comme dans un gestionnaire de fichiers).
  let last = null;
  document.addEventListener('click', e => {
    const box = e.target.closest('input.chk[name=ids][form=bulk]');
    if (!box) return;
    if (e.shiftKey && last && last !== box) {
      const all = boxes();
      const [a, b] = [all.indexOf(last), all.indexOf(box)].sort((x, y) => x - y);
      all.slice(a, b + 1).forEach(x => { x.checked = box.checked; });
      update();
    }
    last = box;
  });
  allBox?.addEventListener('change', () => { boxes().forEach(b => { b.checked = allBox.checked; }); update(); });
  clear?.addEventListener('click', () => { boxes().forEach(b => { b.checked = false; }); update(); boxes()[0]?.focus(); });
  catSelect?.addEventListener('change', () => {
    const isNew = catSelect.value === 'new';
    newName.classList.toggle('on', isNew);
    if (isNew) newName.focus();
  });
  update();

  // Confirmation avant suppression, et avant de publier des titres provisoires.
  const confirmDelete = n => new Promise(resolve => {
    const d = $('[data-confirm-delete]');
    if (!d) return resolve(confirm(`Supprimer ${plural(n, 'photo')} ?`));
    $('[data-del-count]', d).textContent = plural(n, 'photo');
    const done = v => { d.close(); resolve(v); };
    $('[data-del-ok]', d).onclick = () => done(true);
    $('[data-del-cancel]', d).onclick = () => done(false);
    d.oncancel = () => resolve(false);
    d.showModal();
  });
  const confirmPublish = rows => new Promise(resolve => {
    const prov = rows.filter(r => r.hasAttribute('data-provisional'));
    const d = $('[data-confirm-publish]');
    if (!prov.length || !d) return resolve(true);
    $('[data-pub-count]', d).textContent = plural(rows.length, 'photo');
    $('[data-pub-prov]', d).textContent = prov.length > 1 ? `${prov.length} photos ont` : '1 photo a';
    $('[data-pub-names]', d).textContent = prov.map(r => `« ${r.dataset.title} »`).join(', ');
    $('[data-pub-ok]', d).onclick = () => { d.close(); resolve(true); };
    $('[data-pub-fix]', d).onclick = () => { d.close(); resolve(false); $('input[data-field=title]', prov[0])?.focus(); };
    d.oncancel = () => resolve(false);
    d.showModal();
  });

  // Compléter le lot : série, lieu et date s'appliquent aux photos cochées dès qu'on les change.
  if (batch) {
    const apply = (action, extra) => run(action, extra, null);
    catSelect.addEventListener('change', () => { if (catSelect.value && catSelect.value !== 'new') apply('category', { category_id: catSelect.value }); });
    newName.addEventListener('change', () => { if (newName.value.trim()) apply('category', { category_id: 'new', new_category: newName.value }); });
    bar.elements.place.addEventListener('change', () => { if (bar.elements.place.value.trim()) apply('fields', { place: bar.elements.place.value }); });
    bar.elements.taken_on.addEventListener('change', () => { if (bar.elements.taken_on.value.trim()) apply('fields', { taken_on: bar.elements.taken_on.value }); });
  }

  async function run(action, extra, button) {
    const ids = checked().map(b => Number(b.value));
    if (!ids.length) return toast.show('Cochez au moins une photo.', { error: true });
    const body = { ids, action, back: bar.elements.back.value, ...extra };
    if (button) button.disabled = true;
    try {
      const r = await postJson('/admin/photos/actions', body);
      if (batch && (action === 'fields' || action === 'category')) {
        // Mise à jour sur place : pas de rechargement, la saisie continue.
        for (const id of ids) {
          const tr = $(`tr[data-id="${id}"]`);
          if (!tr) continue;
          if (action === 'category') {
            const sel = $('select[data-field=category_id]', tr);
            if (r.category && !$(`option[value="${r.category.id}"]`, sel)) sel.add(new Option(r.category.name, r.category.id));
            if (r.category) { sel.value = r.category.id; sel.dataset.saved = sel.value; }
          }
          if (action === 'fields' && r.values.place) { const f = $('input[data-field=place]', tr); f.value = r.values.place; f.dataset.saved = f.value; }
          if (action === 'fields' && r.values.taken_on) {
            const f = $('input[data-field=taken_on]', tr);
            f.value = r.values.taken_on; f.dataset.saved = f.value;
            f.removeAttribute('aria-invalid');
            const note = $('.cellnote', f.closest('td')); note.classList.remove('err'); note.textContent = `compris : ${r.values.taken_on}`;
          }
          $('[data-state]', tr).textContent = '✓ Enregistré';
        }
        if (action === 'category' && r.category && !$(`option[value="${r.category.id}"]`, catSelect)) catSelect.add(new Option(r.category.name, r.category.id), catSelect.options[catSelect.options.length - 1]);
        if (action === 'category') { catSelect.value = ''; newName.value = ''; newName.classList.remove('on'); }
        toast.show(r.text, r.undo ? { undo: async () => { const u = await postJson('/admin/photos/actions', r.undo); toast.keep(u.text); location.reload(); } } : {});
        return;
      }
      toast.keep(r.text, r.undo || null);
      location.reload();
    } catch (err) {
      if (button) button.disabled = false;
      toast.show(err.message, { error: true });
    }
  }

  bar.addEventListener('submit', async e => {
    e.preventDefault();
    const action = e.submitter?.value;
    const ids = checked().map(b => Number(b.value));
    if (!action || !ids.length) return;
    const body = { ids, action, back: bar.elements.back.value };
    if (action === 'category') Object.assign(body, { category_id: catSelect.value, new_category: newName.value });
    if (action === 'fields') Object.assign(body, { place: bar.elements.place.value, taken_on: bar.elements.taken_on.value });
    if (action === 'delete') { if (!(await confirmDelete(ids.length))) return; body.confirm = true; }
    if (action === 'publish' && batch && !(await confirmPublish(checked().map(b => b.closest('tr'))))) return;
    const { ids: _, action: __, back: ___, ...extra } = body;
    run(action, extra, e.submitter);
  });
})();

// ----- compléter le lot : enregistrement à la sortie de chaque champ -----
(function () {
  const lot = $('[data-lot]');
  if (!lot) return;
  const stateOf = tr => $('[data-state]', tr);
  const status = tr => (tr.dataset.status ??= stateOf(tr).textContent);

  lot.addEventListener('submit', e => e.preventDefault());       // Entrée : le champ s'enregistre au change
  lot.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); e.target.blur(); e.target.focus(); } });

  async function save(field, value, previous) {
    const tr = field.closest('tr');
    const id = tr.dataset.id;
    const key = field.dataset.field;
    const cell = field.closest('td');
    const note = key === 'taken_on' ? $('.cellnote', cell) : null;
    status(tr);
    stateOf(tr).textContent = '● Enregistrement…';
    try {
      const { photo } = await postJson(`/admin/photos/${id}/champs`, { [key]: value });
      field.removeAttribute('aria-invalid');
      field.dataset.saved = key === 'taken_on' ? (photo.taken_on || '') : value;
      if (note) { note.classList.remove('err'); note.textContent = photo.when ? `compris : ${photo.when}` : ''; }
      if (key === 'title') {
        tr.dataset.title = photo.title;
        tr.toggleAttribute('data-provisional', photo.provisional);
        $('[id^=prov-]', tr).hidden = !photo.provisional;
      }
      stateOf(tr).textContent = '✓ Enregistré';
      const label = tr.dataset.title;
      toast.show(`« ${label} » enregistré`, previous === undefined ? {} : {
        undo: async () => { field.value = previous; await save(field, previous); toast.show('Modification annulée.'); },
      });
    } catch (err) {
      const msg = err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message;
      field.setAttribute('aria-invalid', 'true');
      if (note) { note.classList.add('err'); note.textContent = msg; }
      stateOf(tr).textContent = '! Non enregistré';
      toast.show(msg, { error: true });
    }
  }
  $$('[data-field]', lot).forEach(f => {
    f.dataset.saved = f.value;
    f.addEventListener('change', () => { const prev = f.dataset.saved; save(f, f.value, prev); });
  });

  // Vignettes des photos encore en traitement.
  const pending = () => $$('[data-processing]', lot).map(ph => ph.closest('tr'));
  if (pending().length) {
    const timer = setInterval(async () => {
      const rows = pending();
      if (!rows.length) return clearInterval(timer);
      try {
        const res = await fetch(`/admin/photos/traitement?ids=${rows.map(r => r.dataset.id).join(',')}`, { headers: { accept: 'application/json' } });
        const data = await res.json();
        for (const p of data.photos) {
          const tr = rows.find(r => Number(r.dataset.id) === p.id);
          const ph = $('[data-processing]', tr);
          if (p.state === 'ready') ph.outerHTML = `<img src="${p.thumb}" alt="" width="84" height="56">`;
          else if (p.total) ph.textContent = `Images ${p.done} / ${p.total}`;
        }
      } catch { /* prochain tour */ }
    }, 1500);
  }
})();

// ----- réordonnancement des photos par glisser-déposer -----
// Le menu ⋯ de chaque ligne (Monter, Descendre) reste l'alternative clavier et sans JS.
(function () {
  const list = $('.plist[data-sortable]');
  if (!list) return;
  let dragged = null;
  const clear = () => $$('.drop-before, .drop-after', list).forEach(li => li.classList.remove('drop-before', 'drop-after'));
  const after = (li, e) => e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
  const renumber = () => [...list.children].forEach((el, i) => { $('.handle', el).textContent = `N°${String(i + 1).padStart(2, '0')}`; });
  $$('li', list).forEach(li => {
    li.draggable = true;
    $$('a, img', li).forEach(el => { el.draggable = false; });      // la ligne entière se déplace
    li.addEventListener('dragstart', e => {
      if (e.target.closest && e.target.closest('input, details')) return;
      dragged = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); clear(); dragged = null; });
    li.addEventListener('dragover', e => {
      if (!dragged || dragged === li) return;
      e.preventDefault();
      clear();
      li.classList.add(after(li, e) ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('drop', async e => {
      if (!dragged || dragged === li) return;
      e.preventDefault();
      e.stopPropagation();
      const before = [...list.children];
      list.insertBefore(dragged, after(li, e) ? li.nextSibling : li);
      clear();
      try {
        await postJson('/admin/photos/order', { ids: [...list.children].map(el => Number(el.dataset.id)) });
        renumber();
        toast.show('Ordre enregistré.');
      } catch {
        before.forEach(el => list.appendChild(el));
        renumber();
        toast.show('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.', { error: true });
      }
    });
  });
})();

// ----- séries : glisser une carte, ou flèches du clavier sur sa poignée -----
(function () {
  const grid = $('[data-series-list]');
  if (!grid) return;
  const cards = () => $$('.scard[data-id]', grid);
  const name = card => $('.title', card).textContent;
  async function persist(before) {
    try {
      await postJson('/admin/series/order', { ids: cards().map(c => Number(c.dataset.id)) });
      return true;
    } catch {
      before.forEach(c => grid.appendChild(c));
      toast.show('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.', { error: true });
      return false;
    }
  }
  let dragged = null;
  const clear = () => cards().forEach(c => c.classList.remove('drop-before', 'drop-after'));
  const after = (c, e) => e.clientX > c.getBoundingClientRect().left + c.offsetWidth / 2;
  cards().forEach(card => {
    const grip = $('[data-grip]', card);
    grip.hidden = false;
    grip.addEventListener('mousedown', () => { card.draggable = true; });
    card.addEventListener('dragstart', e => { dragged = card; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.draggable = false; card.classList.remove('dragging'); clear(); dragged = null; });
    card.addEventListener('dragover', e => { if (!dragged || dragged === card) return; e.preventDefault(); clear(); card.classList.add(after(card, e) ? 'drop-after' : 'drop-before'); });
    card.addEventListener('drop', async e => {
      if (!dragged || dragged === card) return;
      e.preventDefault();
      const before = cards();
      const moved = dragged;
      grid.insertBefore(moved, after(card, e) ? card.nextSibling : card);
      clear();
      if (await persist(before)) toast.show(`« ${name(moved)} » : place ${cards().indexOf(moved) + 1} sur ${cards().length}.`);
    });
    grip.addEventListener('keydown', async e => {
      const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
      const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
      if (!back && !fwd) return;
      e.preventDefault();
      const list = cards();
      const i = list.indexOf(card);
      const j = i + (back ? -1 : 1);
      if (j < 0 || j >= list.length) return;
      if (back) grid.insertBefore(card, list[j]); else grid.insertBefore(card, list[j].nextSibling);
      grip.focus();
      if (await persist(list)) toast.show(`« ${name(card)} » : place ${j + 1} sur ${list.length}.`);
    });
  });

  // « Nouvelle série » : le champ de la carte de création.
  $('[data-new-series]')?.addEventListener('click', e => {
    e.preventDefault();
    const input = $('[data-new-card] input[name=name]');
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus();
  });
  $('[data-new-card] input[name=name]')?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); } });

  // Suppression : la confirmation s'ouvre dans une fenêtre.
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  dialog.setAttribute('aria-labelledby', 'del-serie-title');
  document.body.appendChild(dialog);
  $$('.menu-pop .danger > summary', grid).forEach(summary => summary.addEventListener('click', e => {
    e.preventDefault();
    const card = summary.closest('.scard');
    summary.closest('details.menu').open = false;
    const form = $('form[data-delete-series]', summary.parentElement).cloneNode(true);
    dialog.innerHTML = `<h2 id="del-serie-title">Supprimer la série « ${esc(name(card))} » ?</h2>`;
    dialog.appendChild(form);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn ghost';
    cancel.textContent = 'Annuler';
    cancel.addEventListener('click', () => dialog.close());
    (form.querySelector('.btn') || form).after(cancel);
    if (form.querySelector('.btn')) { const p = document.createElement('p'); p.className = 'actions'; form.querySelector('.btn').before(p); p.append(form.querySelector('.btn'), cancel); }
    else form.append(cancel);
    dialog.showModal();
    (form.querySelector('select') || cancel).focus();
  }));
})();

// ----- ouverture : composer l'ordre du diaporama -----
(function () {
  const box = $('[data-hero]');
  if (!box) return;
  const MAX = Number(box.dataset.max);
  const strip = $('[data-hero-chosen]', box);
  const pool = $('[data-hero-pool]', box);
  const counter = $('[data-hero-count]', box);
  const full = $('[data-hero-full]', box);
  const items = () => $$('.it', strip);
  function refresh() {
    const n = items().length;
    items().forEach((li, i, all) => {
      $('.n', li).textContent = i + 1;
      $('[data-hero-left]', li).disabled = i === 0;
      $('[data-hero-right]', li).disabled = i === all.length - 1;
    });
    counter.textContent = `${n} / ${MAX} choisie${n > 1 ? 's' : ''}`;
    full.hidden = n < MAX;
    $$('.pick', pool).forEach(l => { const c = $('input', l); if (!l.hidden) c.disabled = n >= MAX; });
    const empty = $('[data-hero-empty]', box);
    if (empty) empty.hidden = n > 0;
  }
  function item(label) {
    const slug = label.dataset.slug;
    const title = label.dataset.title;
    const li = document.createElement('li');
    li.className = 'it';
    li.dataset.slug = slug;
    li.innerHTML = `<input type="hidden" name="hero" value="${esc(slug)}"><span class="n mono" aria-hidden="true"></span>`
      + `<span class="t">${esc(title)}</span><span class="mv">`
      + `<button type="submit" name="hero_op" value="left:${esc(slug)}" aria-label="Avancer « ${esc(title)} »" data-hero-left>←</button>`
      + `<button type="submit" name="hero_op" value="right:${esc(slug)}" aria-label="Reculer « ${esc(title)} »" data-hero-right>→</button>`
      + `<button type="submit" name="hero_op" value="remove:${esc(slug)}" aria-label="Retirer « ${esc(title)} » de l’ouverture" data-hero-remove>✕</button></span>`;
    $('.n', li).after($('picture', label).cloneNode(true));
    wire(li);
    return li;
  }
  function wire(li) {
    li.draggable = true;
    li.addEventListener('dragstart', e => { li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); refresh(); });
  }
  items().forEach(wire);
  strip.addEventListener('dragover', e => {
    const dragging = $('.dragging', strip);
    if (!dragging) return;
    e.preventDefault();
    const target = items().find(li => li !== dragging && e.clientX < li.getBoundingClientRect().left + li.offsetWidth / 2 && e.clientY < li.getBoundingClientRect().bottom);
    strip.insertBefore(dragging, target || null);
  });
  strip.addEventListener('click', e => {
    const b = e.target.closest('button[name=hero_op]');
    if (!b) return;
    e.preventDefault();
    const li = b.closest('.it');
    const title = $('.t', li).textContent;
    if (b.matches('[data-hero-left]') && li.previousElementSibling) { strip.insertBefore(li, li.previousElementSibling); $('[data-hero-left]', li).focus(); }
    if (b.matches('[data-hero-right]') && li.nextElementSibling) { strip.insertBefore(li.nextElementSibling, li); $('[data-hero-right]', li).focus(); }
    if (b.matches('[data-hero-remove]')) {
      const label = $(`.pick[data-slug="${CSS.escape(li.dataset.slug)}"]`, pool);
      li.remove();
      if (label) { label.hidden = false; const c = $('input', label); c.checked = false; c.disabled = false; }
      refresh();
      (items()[0] ? $('button', items()[0]) : counter).focus?.();
      toast.show(`« ${title} » retirée de l’ouverture (pensez à enregistrer).`);
      return;
    }
    refresh();
    toast.show(`« ${title} » : place ${items().indexOf(li) + 1} (pensez à enregistrer).`);
  });
  pool.addEventListener('change', e => {
    const c = e.target;
    if (!c.matches('input[type=checkbox]') || !c.checked) return;
    if (items().length >= MAX) { c.checked = false; return; }
    const label = c.closest('.pick');
    strip.appendChild(item(label));
    label.hidden = true;
    c.disabled = true;
    refresh();
    toast.show(`« ${label.dataset.title} » ajoutée en place ${items().length} (pensez à enregistrer).`);
  });
  refresh();
})();

// ----- progression de la mise à jour des images -----
// Le nombre se met à jour sans être relu à chaque fois ; seul le message final est annoncé.
(function () {
  const box = document.querySelector('[data-variants]');
  if (!box || !box.querySelector('[data-done]')) return;
  const done = box.querySelector('[data-done]');
  const total = box.querySelector('[data-total]');
  const final = box.querySelector('[data-final]');
  const finish = (text, error) => {
    clearInterval(timer);
    box.querySelector('[data-running]').hidden = true;
    box.classList.toggle('error', Boolean(error));
    final.textContent = text;
  };
  const timer = setInterval(async () => {
    try {
      const res = await fetch('/admin/images/etat', { headers: { accept: 'application/json' }, redirect: 'manual' });
      if (!res.ok) return finish('Suivi interrompu : session expirée ? Rechargez la page.', true);
      const s = await res.json();
      done.textContent = s.done;
      if (total) total.textContent = s.total;
      if (!s.running) {
        finish(s.errors.length
          ? `${s.errors.length} image(s) n’ont pas pu être recalculées : ${s.errors.map(e => e.title).join(', ')}.`
          : 'Images à jour.', s.errors.length);
      }
    } catch {
      finish('Suivi interrompu. Rechargez la page pour voir l’état des images.', true);
    }
  }, 1500);
})();

// ----- aide : recherche dans les sections -----
(function () {
  const input = document.querySelector('[data-help-search]');
  if (!input) return;
  document.querySelectorAll('[data-js-only]').forEach(el => { el.hidden = false; });
  const sections = [...document.querySelectorAll('[data-help-section]')];
  const empty = document.querySelector('[data-help-empty]');
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    let shown = 0;
    for (const s of sections) {
      const hit = !q || norm(s.textContent).includes(q);
      s.hidden = !hit;
      if (hit) shown++;
    }
    empty.hidden = shown > 0;
  });
})();
