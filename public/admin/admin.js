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
    window.__lastUndo = undo;              // ⌘Z rejoue la dernière annulation proposée
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
    timer = setTimeout(() => { box.hidden = true; window.__lastUndo = null; }, undo ? 10000 : 6000);
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
  const side = $('[data-side]');
  const btn = $('[data-menu]');
  if (!side || !btn) return;
  const set = open => {
    side.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => $('a[aria-current], a', side)?.focus(), 50);
  };
  btn.addEventListener('click', e => { e.stopPropagation(); set(!side.classList.contains('open')); });
  document.addEventListener('click', e => { if (side.classList.contains('open') && !side.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) { set(false); btn.focus(); } });
})();

// ----- mode clair / sombre : appliqué tout de suite, mémorisé (cookie lu par le serveur) -----
(function () {
  const form = $('[data-theme-form]');
  if (!form) return;
  const btn = $('[data-theme-toggle]', form);
  const effective = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const label = () => { const next = effective() === 'light' ? 'dark' : 'light'; btn.value = next; btn.setAttribute('aria-label', `Passer en mode ${next === 'light' ? 'clair' : 'sombre'}`); };
  label();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const next = effective() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    $('meta[name=color-scheme]')?.setAttribute('content', next);
    label();
    try { await postJson('/admin/theme', { theme: next }); } catch { /* le choix reste appliqué pour cette page */ }
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
  // Envois simultanés : 3 au plus, et 100 Mo au plus en cours d'envoi (au-delà, la photo suivante attend).
  // Chaque photo est une requête distincte : la limite de Cloudflare (100 Mo par requête) vaut par fichier.
  const PARALLEL = 3;
  const INFLIGHT_BYTES = 100 * 1000 * 1000;
  input.required = false;
  if ($('[data-contact]')) section.classList.add('with-grid');

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
        if (d) { item.meta += ` · ${d.w} × ${d.h}`; item.w = d.w; item.h = d.h; }
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
    for (;;) {
      const sendingNow = live().filter(i => i.state === 'uploading');
      const i = live().find(x => x.state === 'queued');
      if (!i || sendingNow.length >= PARALLEL) break;
      const inflight = sendingNow.reduce((sum, x) => sum + x.file.size, 0);
      if (sendingNow.length && inflight + i.file.size > INFLIGHT_BYTES) break;   // attend qu'un envoi se termine
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
        Object.assign(i, { state: 'waiting', photoId: data.id, up: 100, done: 0, total: 0, title: data.title });
        window.__library?.arrived(i);
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
          if (p.state === 'ready') { Object.assign(i, { state: 'done', done: p.total, total: p.total }); lastDone = Date.now(); announce(`${i.file.name} prête.`); window.__library?.ready(i); }
          else if (p.state === 'error' || p.state === 'missing') { window.__library?.gone(i); Object.assign(i, { state: 'failed', retry: false, photoId: null, reason: p.error || 'photo supprimée entre-temps' }); }
          else { Object.assign(i, { state: p.state, done: p.done, total: p.total }); window.__library?.progress(i); }
        }
        render();
        if (!live().some(i => ['queued', 'uploading', 'waiting', 'processing'].includes(i.state))) {
          const ok = live().filter(i => i.state === 'done').length;
          announce(`Import terminé : ${plural(ok, 'photo prête', 'photos prêtes')}.`);
          window.__library?.finished(live().filter(i => i.state === 'done').map(i => i.photoId));
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
  const library = Boolean(bar.closest('[data-library]'));
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
    if (!batch && !library) bar.hidden = n === 0;
    // D'abord l'état général des boutons, puis l'inspecteur l'affine (ex. « Déjà publiée » reste désactivé).
    $$('button[name=action]', bar).forEach(b => { b.disabled = n === 0; });
    document.dispatchEvent(new CustomEvent('selection', { detail: { n } }));
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

  // Confirmation avant suppression. La publication, elle, se fait en un clic : le titre provisoire est
  // signalé dans la page avant le clic, et le message qui suit propose Annuler.
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

  // Compléter le lot : série, lieu et date s'appliquent aux photos cochées dès qu'on les change.
  if (batch) {
    // Sur téléphone, ces champs (qui changent toutes les photos cochées) sont repliés derrière un bouton.
    const toggle = $('[data-bulk-toggle]', bar);
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        const open = bar.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
        if (open) catSelect.focus();
      });
    }
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

// ----- villes proposées au fil de la frappe (fiche, photothèque) -----
// Liste embarquée côté serveur (/admin/villes) ; ↑ ↓ pour choisir, Entrée pour valider, Échap pour fermer.
// Choisir une ville remplit le champ et l'identifiant caché, puis émet « city-chosen » sur le conteneur [data-city].
// Taper sans choisir efface l'identifiant : le serveur reconnaît alors la ville si le nom est exact.
(function () {
  let n = 0;
  $$('[data-city]').forEach(box => {
    const input = $('[data-city-input]', box);
    const hidden = $('[data-city-id]', box);
    if (!input || !hidden) return;
    const list = document.createElement('ul');
    list.className = 'city-list';
    list.id = `villes-${++n}`;
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    input.after(list);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');
    let items = [], active = -1, timer = null, seq = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const mark = i => {
      active = i;
      $$('li', list).forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
      if (i >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${i}`); else input.removeAttribute('aria-activedescendant');
    };
    const choose = i => {
      const v = items[i];
      if (!v) return;
      input.value = v.label;
      hidden.value = v.id;
      close();
      box.dispatchEvent(new CustomEvent('city-chosen', { detail: v }));
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
        try {
          const res = await fetch(`/admin/villes?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } });
          const data = await res.json();
          if (mine === seq) { items = data.villes || []; draw(); }
        } catch { /* réseau : pas de proposition */ }
      }, 150);
    });
    input.addEventListener('keydown', e => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); mark(Math.min(active + 1, items.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(active - 1, 0)); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  });
})();

// ----- photothèque : planche contact, sélection, inspecteur, loupe, raccourcis -----
(function () {
  const lib = $('[data-library]');
  if (!lib) return;
  const contact = $('[data-contact]');
  const insp = $('[data-inspector]');
  const form = $('[data-bulk]', insp);
  const dataEl = $('#photos-data');
  const data = new Map((dataEl ? JSON.parse(dataEl.textContent) : []).map(p => [p.id, p]));
  window.__photoTitle = id => data.get(id)?.title;
  const panes = { empty: $('[data-insp-empty]', insp), one: $('[data-insp-one]', insp), many: $('[data-insp-many]', insp) };
  const boxes = () => $$('input.chk[name=ids][form=bulk]');
  const checked = () => boxes().filter(b => b.checked);
  const selIds = () => checked().map(b => Number(b.value));
  const tileOf = id => document.getElementById(`photo-${id}`);
  const boxOf = id => $(`input.chk[value="${id}"]`, tileOf(id) || document);
  const typing = el => el && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select') || el.isContentEditable);
  const notify = () => document.dispatchEvent(new Event('change-selection'));
  let anchor = null;

  // Taille des vignettes (mémorisée).
  const density = $('[data-density]');
  if (density && contact) {
    const saved = Number(localStorage.getItem('planche-taille'));
    if (saved) density.value = saved;
    // Sur téléphone, la taille reste celle de la feuille de style (le curseur y est masqué).
    const wide = matchMedia('(min-width: 721px)');
    const apply = () => { if (wide.matches) contact.style.setProperty('--rowh', `${density.value}px`); else contact.style.removeProperty('--rowh'); };
    wide.addEventListener('change', apply);
    apply();
    density.addEventListener('input', () => { apply(); localStorage.setItem('planche-taille', density.value); });
  }

  // ---------- sélection ----------
  function select(ids, { add = false } = {}) {
    if (!add) boxes().forEach(b => { b.checked = false; });
    ids.forEach(id => { const b = boxOf(id); if (b) b.checked = true; });
    boxes()[0]?.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (contact) {
    contact.addEventListener('click', e => {
      const tile = e.target.closest('.tile');
      if (!tile || e.target.closest('input, .ttl')) return;
      e.preventDefault();
      const id = Number(tile.dataset.id);
      const box = boxOf(id);
      if (e.shiftKey && anchor) {
        const all = $$('.tile', contact).map(t => Number(t.dataset.id));
        const [a, b] = [all.indexOf(anchor), all.indexOf(id)].sort((x, y) => x - y);
        select(all.slice(a, b + 1), { add: e.metaKey || e.ctrlKey });
      } else if (e.metaKey || e.ctrlKey) {
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        anchor = id;
      } else {
        select([id]);
        anchor = id;
      }
      box.focus({ preventScroll: true });
    });
    contact.addEventListener('dblclick', e => { const t = e.target.closest('.tile'); if (t) loupe.open(Number(t.dataset.id)); });
    contact.addEventListener('change', e => { if (e.target.matches('.chk')) anchor = Number(e.target.value); });
  }

  // ---------- inspecteur ----------
  const one = {
    root: panes.one,
    preview: $('[data-one-preview]', panes.one),
    field: k => $(`[data-one-field="${k}"]`, panes.one),
    id: null,
  };
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
    $('[data-bulk-clear]', insp).hidden = n === 0;
    $('[data-one-open]', insp).hidden = n !== 1;
    $$('.insp-ft .btn', insp).forEach(b => { b.disabled = n === 0; });
    const title = $('[data-insp-title]', insp);
    stack(n > 1 ? ids : []);
    if (n === 0) { title.textContent = 'Photothèque'; return; }
    if (n === 1) return showOne(ids[0]);
    const list = ids.map(id => data.get(id)).filter(Boolean);
    title.textContent = `${n} photos`;
    const drafts = list.filter(p => p.status === 'draft').length;
    $('[data-bulk-count]', insp).textContent = [drafts && plural(drafts, 'brouillon'), n - drafts && plural(n - drafts, 'publiée')].filter(Boolean).join(' · ');
    const cats = new Set(list.map(p => p.category_id));
    $$('[data-many-series] .pill', insp).forEach(b => b.setAttribute('aria-pressed', String(cats.size === 1 && cats.has(Number(b.dataset.category)))));
    // Titres provisoires de la sélection : à saisir ici (lot qui vient d'arriver).
    const prov = list.filter(p => p.provisional).slice(0, 12);
    $('[data-many-titles]', insp).hidden = !prov.length;
    $('[data-titles]', insp).innerHTML = prov.map(p => `<label>${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '<span class="ph"></span>'}<input value="${esc(p.title)}" data-title-of="${p.id}" aria-label="Titre de la photo ${esc(p.title)}"></label>`).join('');
    const pub = $('[data-publish]', insp);
    pub.textContent = drafts ? `Publier ${n === drafts ? `les ${n}` : `${plural(drafts, 'brouillon')}`}` : 'Déjà publiées';
    pub.disabled = !drafts;
  }
  function showOne(id) {
    const p = data.get(id);
    one.id = id;
    $('[data-insp-title]', insp).textContent = p ? (p.status === 'published' ? 'Publiée' : 'Brouillon') : 'Photo';
    $('[data-bulk-count]', insp).textContent = p ? `N°${String(p.n || '').padStart(2, '0')} · ${p.category}` : '';
    if (!p) return;
    one.preview.innerHTML = p.large ? `<img src="${esc(p.large)}" alt="${esc(p.title)}">` : '<span class="ph">Traitement…</span>';
    // Le champ en cours de saisie n'est jamais réécrit (une réponse qui arrive pendant la frappe).
    const put = (k, v) => { const f = one.field(k); if (f !== document.activeElement) f.value = v; };
    put('title', p.title);
    put('legend', p.legend || '');
    put('place', p.place || '');
    put('taken_on', p.taken_on || '');
    put('author_id', p.author_id ? String(p.author_id) : '');
    $('[data-one-when]', insp).textContent = p.when ? `compris : ${p.when}` : '';
    $('[data-one-prov]', insp).hidden = !p.provisional;
    $('[data-one-n]', insp).textContent = `/photo/${p.slug}`;
    $('[data-one-link]', insp).href = `/admin/photos/${p.id}`;
    const cityInput = $('[data-one-city]', insp);
    if (cityInput && cityInput !== document.activeElement) { cityInput.value = p.city || ''; $('[data-city-id]', cityInput.closest('[data-city]')).value = p.city_id || ''; }
    const onMap = $('[data-one-onmap]', insp);
    if (onMap) { onMap.checked = Boolean(p.on_map); onMap.disabled = !p.city_id; }
    const cityNote = $('[data-one-citynote]', insp);
    if (cityNote) cityNote.hidden = !(p.city_source === 'gps' && p.city);
    $('[data-one-open]', insp).href = `/admin/photos/${p.id}`;
    $$('[data-one-series] .pill', insp).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.category) === p.category_id)));
    $('[data-publish]', insp).textContent = p.status === 'published' ? 'Déjà publiée' : 'Publier';
    $('[data-publish]', insp).disabled = p.status === 'published';
    audience(id);
  }
  // Audience de la photo (30 jours) : chiffre, rang, petite courbe rendue par le serveur.
  async function audience(id) {
    const box = $('[data-one-aud]', insp);
    box.innerHTML = '<span class="hint">…</span>';
    try {
      const res = await fetch(`/admin/photos/${id}/statistiques`, { headers: { accept: 'application/json' } });
      if (!res.ok || one.id !== id) return;
      const s = await res.json();
      if (one.id !== id) return;
      box.innerHTML = s.total
        ? `<span><b>${s.total}</b> ouverture${s.total > 1 ? 's' : ''} en grand${s.rank ? ` · ${s.rank === 1 ? '1ʳᵉ' : `${s.rank}ᵉ`} photo la plus vue` : ''}</span>${s.spark}`
        : '<span class="hint">Pas encore ouverte en grand ces 30 derniers jours.</span>';
    } catch { box.innerHTML = ''; }
  }
  document.addEventListener('change-selection', render);
  document.addEventListener('selection', render);

  // Mise à jour de la planche après une modification.
  function refreshTile(p) {
    const t = tileOf(p.id);
    if (!t) return;
    const ttl = $('.ttl', t);
    if (ttl) ttl.textContent = p.title;
    const small = $('.cap small', t);
    if (small) small.textContent = [p.category, p.when, p.status === 'published' ? 'publiée' : ''].filter(Boolean).join(' · ');
    t.toggleAttribute('data-provisional', p.provisional);
    const box = $('.chk', t);
    if (box) box.setAttribute('aria-label', `Sélectionner « ${p.title} »`);
    let badge = $('.badge', t);
    const want = p.status === 'draft' ? '○ Brouillon' : p.provisional ? 'Titre provisoire' : '';
    if (!want && badge) badge.remove();
    if (want) { if (!badge) { badge = document.createElement('span'); t.querySelector('.img').after(badge); } badge.className = `badge${p.status !== 'draft' ? ' warn' : ''}`; badge.textContent = want; }
  }
  async function reload(id) {
    try {
      const res = await fetch(`/admin/photos/${id}/donnees`, { headers: { accept: 'application/json' } });
      if (res.ok) { const p = await res.json(); data.set(p.id, { ...data.get(p.id), ...p }); refreshTile(data.get(p.id)); return data.get(p.id); }
    } catch { /* réseau */ }
    return null;
  }

  // Une photo : enregistrement champ par champ.
  async function saveOne(key, value, previous) {
    const id = one.id;
    try {
      const r = await postJson(`/admin/photos/${id}/champs`, { [key]: value });
      Object.assign(data.get(id), r.photo);
      await reload(id);                       // série, auteur, « compris : … » : la version du serveur
      window.__paletteReset?.();
      if (one.id === id) showOne(id);
      const field = one.field(key);
      field?.removeAttribute('aria-invalid');
      toast.show(`« ${data.get(id).title} » enregistrée`, previous === undefined ? {} : {
        undo: async () => { await postJson(`/admin/photos/${id}/champs`, { [key]: previous }); await reload(id); if (one.id === id) showOne(id); toast.show('Modification annulée.'); },
      });
    } catch (err) {
      const msg = err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message;
      one.field(key)?.setAttribute('aria-invalid', 'true');
      toast.show(msg, { error: true });
    }
  }
  ['title', 'legend', 'place', 'taken_on', 'author_id'].forEach(k => {
    const f = one.field(k);
    f.addEventListener('focus', () => { f.dataset.before = f.value; });
    f.addEventListener('change', () => saveOne(k, f.value, f.dataset.before));
    if (f.matches('input')) f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } });
  });
  $('[data-one-series]', insp).addEventListener('click', e => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    const p = data.get(one.id);
    saveOne('category_id', b.dataset.category, String(p.category_id));
  });

  // Ville et carte : enregistrées aussitôt (ville choisie dans la liste, effacée, ou tapée telle quelle).
  async function saveLocation(body, undoBody) {
    const id = one.id;
    try {
      const r = await postJson(`/admin/photos/${id}/champs`, body);
      Object.assign(data.get(id), r.photo);
      if (one.id === id) showOne(id);
      toast.show(`« ${data.get(id).title} » enregistrée`, undoBody ? { undo: async () => { const u = await postJson(`/admin/photos/${id}/champs`, undoBody); Object.assign(data.get(id), u.photo); if (one.id === id) showOne(id); toast.show('Modification annulée.'); } } : {});
    } catch (err) {
      toast.show(err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message, { error: true });
      if (one.id === id) showOne(id);
    }
  }
  const cityBox = $('[data-one-city]', insp)?.closest('[data-city]');
  if (cityBox) {
    const before = () => { const p = data.get(one.id); return { city_id: p.city_id || '', city_label: p.city || '', on_map: p.on_map ? '1' : '0' }; };
    cityBox.addEventListener('city-chosen', e => saveLocation({ city_id: e.detail.id, city_label: e.detail.label }, before()));
    $('[data-one-city]', insp).addEventListener('change', e => {
      const v = e.target.value.trim();
      if (v === (data.get(one.id)?.city || '') || $('[data-city-id]', cityBox).value) return;   // inchangé, ou déjà choisi dans la liste
      saveLocation({ city_label: v }, before());
    });
    $('[data-one-onmap]', insp).addEventListener('change', e => saveLocation({ on_map: e.target.checked ? '1' : '0' }, { on_map: e.target.checked ? '0' : '1' }));
  }

  // Plusieurs photos : série, lieu et date appliqués aussitôt.
  async function applyMany(action, extra) {
    const ids = selIds();
    if (!ids.length) return;
    try {
      const before = ids.map(id => data.get(id)?.category_id);
      const r = await postJson('/admin/photos/actions', { ids, action, ...extra });
      await Promise.all(ids.map(reload));
      if (action === 'category' && r.category) { before.forEach(c => bump(c, -1)); bump(r.category.id, ids.length); }
      window.__paletteReset?.();
      render();
      toast.show(r.text, r.undo ? { undo: async () => { await postJson('/admin/photos/actions', r.undo); await Promise.all(ids.map(reload)); render(); toast.show('Annulé.'); } } : {});
      if (r.category && !$(`[data-many-series] [data-category="${r.category.id}"]`, insp)) location.reload();   // nouvelle série : la barre latérale doit l'afficher
    } catch (err) { toast.show(err.message, { error: true }); }
  }
  const newName = $('[data-bulk-new]', insp);
  $('[data-many-series]', insp).addEventListener('click', e => {
    const b = e.target.closest('[data-category]');
    if (!b) return;
    if (b.dataset.category === 'new') { newName.classList.add('on'); newName.focus(); return; }
    applyMany('category', { category_id: b.dataset.category });
  });
  newName.addEventListener('change', () => { if (newName.value.trim()) applyMany('category', { category_id: 'new', new_category: newName.value }); });
  $$('[data-many-map]', insp).forEach(b => b.addEventListener('click', () => applyMany(b.dataset.manyMap, {})));
  newName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); newName.blur(); } });
  $$('[data-many-field]', insp).forEach(f => {
    f.addEventListener('change', async () => { if (!f.value.trim()) return; await applyMany('fields', { [f.dataset.manyField]: f.value }); f.value = ''; });
    f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } });
  });
  $('[data-titles]', insp).addEventListener('change', async e => {
    const f = e.target.closest('[data-title-of]');
    if (!f) return;
    const id = Number(f.dataset.titleOf);
    try { await postJson(`/admin/photos/${id}/champs`, { title: f.value }); await reload(id); toast.show(`« ${f.value} » enregistrée`); } catch (err) { toast.show(err.data?.errors ? Object.values(err.data.errors).join(' ') : err.message, { error: true }); }
  });
  $('[data-titles]', insp).addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); const next = e.target.closest('label').nextElementSibling; e.target.blur(); $('input', next || document.body)?.focus?.(); } });

  // ---------- loupe ----------
  const loupe = (() => {
    let el = null;
    let current = null;
    const order = () => $$('.tile', contact).map(t => Number(t.dataset.id)).filter(id => data.get(id)?.large);
    // Pellicule : 40 vignettes au plus autour de la photo affichée.
    const strip = () => { const o = order(); const i = Math.max(0, o.indexOf(current) - 20); return o.slice(i, i + 40); };
    function draw() {
      const p = data.get(current);
      $('.stage img', el).src = p.large;
      $('.stage img', el).alt = p.title;
      $('[data-loupe-title]', el).textContent = `${p.title} · ${p.category}${p.when ? ` · ${p.when}` : ''}`;
      $$('.strip button', el).forEach(b => b.toggleAttribute('aria-current', Number(b.dataset.id) === current));
      $(`.strip button[data-id="${current}"]`, el)?.scrollIntoView({ block: 'nearest', inline: 'center' });
      select([current]);
    }
    function open(id) {
      if (!contact || !data.get(id)?.large) return;
      if (el) close();
      current = id;
      el = document.createElement('div');
      el.className = 'loupe';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Loupe');
      el.innerHTML = `<div class="lbar"><span data-loupe-title></span><span class="sp"></span><span>← → photo suivante · Échap ou Espace : fermer</span><button class="iconbtn" type="button" data-loupe-close aria-label="Fermer la loupe">✕</button></div>
        <div class="stage"><button class="iconbtn nav-l" type="button" data-loupe-prev aria-label="Photo précédente">←</button><img alt=""><button class="iconbtn nav-r" type="button" data-loupe-next aria-label="Photo suivante">→</button></div>
        <div class="strip">${strip().map(i => `<button type="button" data-id="${i}" aria-label="${esc(data.get(i).title)}"><img src="${esc(data.get(i).thumb)}" alt=""></button>`).join('')}</div>`;
      $('[data-canvas]').appendChild(el);
      el.addEventListener('click', e => {
        if (e.target.closest('[data-loupe-close]')) close();
        else if (e.target.closest('[data-loupe-prev]')) step(-1);
        else if (e.target.closest('[data-loupe-next]')) step(1);
        else { const b = e.target.closest('.strip button'); if (b) { current = Number(b.dataset.id); draw(); } }
      });
      // Le focus reste dans la loupe (Tab et Maj + Tab bouclent).
      el.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const f = $$('button', el);
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      });
      draw();
      $('[data-loupe-close]', el).focus();
    }
    function step(d) {
      const o = order(); const i = o.indexOf(current);
      if (i + d < 0 || i + d >= o.length) return;
      current = o[i + d];
      if (!$(`.strip button[data-id="${current}"]`, el)) { const id = current; close(); open(id); return; }   // hors de la pellicule : on la recentre
      draw();
    }
    function close() { el?.remove(); el = null; boxOf(current)?.focus(); }
    return { open, close, step, get open_() { return Boolean(el); } };
  })();

  // ---------- raccourcis ----------
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || $('dialog[open]')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (loupe.open_) {
      if (e.key === 'Escape' || (e.key === ' ' && !typing(document.activeElement))) { e.preventDefault(); loupe.close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); loupe.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); loupe.step(1); }
      return;
    }
    if (typing(document.activeElement)) return;
    if (mod && e.key.toLowerCase() === 'a' && contact) { e.preventDefault(); select(boxes().map(b => Number(b.value))); }
    else if (mod && e.key.toLowerCase() === 'z' && window.__lastUndo) { e.preventDefault(); const u = window.__lastUndo; window.__lastUndo = null; u(); }
    else if (mod) return;
    else if (e.key === 'Escape' && selIds().length) { e.preventDefault(); select([]); }
    else if (e.key.toLowerCase() === 'p' && selIds().length) { e.preventDefault(); $('[data-publish]', insp).click(); }
    else if (e.key.toLowerCase() === 'i') { e.preventDefault(); $('[data-import-open]')?.click(); }
    else if (contact && (e.key.toLowerCase() === 'l' || (e.key === ' ' && !document.activeElement?.matches('button, a, input')))) {
      const id = selIds()[0] || Number(document.activeElement?.closest?.('.tile')?.dataset.id);
      if (id) { e.preventDefault(); loupe.open(id); }
    }
  });

  // ---------- glisser : ordre de la planche, ou vers une série ----------
  if (contact) {
    let dragged = null;
    const sortable = contact.hasAttribute('data-sortable');
    const clear = () => $$('.drop-before, .drop-after', contact).forEach(t => t.classList.remove('drop-before', 'drop-after'));
    const after = (t, e) => e.clientX > t.getBoundingClientRect().left + t.offsetWidth / 2;
    const prepare = t => { t.draggable = true; $$('a, img', t).forEach(x => { x.draggable = false; }); };
    $$('.tile', contact).forEach(prepare);
    window.__prepareTile = prepare;
    contact.addEventListener('dragstart', e => {
      const t = e.target.closest('.tile');
      if (!t) return;
      dragged = t;
      t.classList.add('dragging');
      const id = Number(t.dataset.id);
      const ids = boxOf(id)?.checked ? selIds() : [id];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-nicephos-photos', JSON.stringify(ids));
      e.dataTransfer.setData('text/plain', ids.join(','));
    });
    contact.addEventListener('dragend', () => { dragged?.classList.remove('dragging'); clear(); dragged = null; });
    contact.addEventListener('dragover', e => {
      const t = e.target.closest('.tile');
      if (!sortable || !dragged || !t || t === dragged) return;
      e.preventDefault();
      clear();
      t.classList.add(after(t, e) ? 'drop-after' : 'drop-before');
    });
    contact.addEventListener('drop', async e => {
      const t = e.target.closest('.tile');
      if (!sortable || !dragged || !t || t === dragged) return;
      e.preventDefault();
      e.stopPropagation();
      const before = $$('.tile', contact);
      contact.insertBefore(dragged, after(t, e) ? t.nextSibling : t);
      clear();
      try {
        await postJson('/admin/photos/order', { ids: $$('.tile', contact).map(x => Number(x.dataset.id)) });
        toast.show('Ordre enregistré.');
      } catch {
        before.forEach(x => contact.appendChild(x));
        toast.show('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.', { error: true });
      }
    });
  }
  // Dépôt sur une série de la barre latérale : les photos glissées y sont classées.
  $$('[data-drop-series]').forEach(a => {
    a.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('application/x-nicephos-photos')) { e.preventDefault(); a.classList.add('over'); } });
    a.addEventListener('dragleave', () => a.classList.remove('over'));
    a.addEventListener('drop', async e => {
      a.classList.remove('over');
      const raw = e.dataTransfer.getData('application/x-nicephos-photos');
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      const ids = JSON.parse(raw);
      try {
        const before = ids.map(id => data.get(id)?.category_id);
        const r = await postJson('/admin/photos/actions', { ids, action: 'category', category_id: a.dataset.dropSeries });
        before.forEach(c => bump(c, -1));
        bump(Number(a.dataset.dropSeries), ids.length);
        window.__paletteReset?.();
        await Promise.all(ids.map(reload));
        render();
        toast.show(r.text, { undo: async () => { await postJson('/admin/photos/actions', r.undo); await Promise.all(ids.map(reload)); render(); toast.show('Annulé.'); } });
      } catch (err) { toast.show(err.message, { error: true }); }
    });
  });

  // Compteurs de la barre latérale après un classement.
  function bump(categoryId, d) {
    const n = $(`[data-drop-series="${categoryId}"] .n`);
    if (n) n.textContent = String(Math.max(0, Number(n.textContent) + d));
  }

  // ---------- import : les photos arrivent dans la planche et s'y développent ----------
  const ratio = (w, h) => `ar-${Math.min(300, Math.max(40, Math.round((w / h) * 20) * 5))}`;
  window.__library = contact && {
    arrived(i) {
      data.set(i.photoId, { id: i.photoId, title: i.title, status: 'draft', provisional: true, category: '', ready: false, thumb: i.url || null });
      const li = document.createElement('li');
      li.id = `photo-${i.photoId}`;
      li.className = `tile developing ${i.w && i.h ? ratio(i.w, i.h) : 'ar-150'}`;
      li.dataset.id = i.photoId;
      li.setAttribute('data-provisional', '');
      li.innerHTML = `<input class="chk" type="checkbox" name="ids" value="${i.photoId}" form="bulk" aria-label="Sélectionner « ${esc(i.title)} »">
        <a class="img" href="/admin/photos/${i.photoId}" tabindex="-1" aria-hidden="true">${i.url ? `<img src="${i.url}" alt="">` : '<span class="ph">Développement…</span>'}</a>
        <span class="badge">Développement</span><span class="dev"><i></i></span>
        <span class="cap"><a class="ttl" href="/admin/photos/${i.photoId}">${esc(i.title)}</a><small>brouillon</small></span>`;
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
      $('.badge', t).textContent = i.total ? `Développement · ${i.done} / ${i.total}` : 'En file';
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
      if (!ids.length) return;
      const busy = typing(document.activeElement);
      select(ids);
      if (!busy) ($('[data-titles] input') || one.field('title'))?.focus();
    },
  };

  // Tout sélectionner (case de la planche).
  render();
})();

// ----- palette de commandes ⌘K : actions, photos, séries, pages -----
(function () {
  const dlg = $('[data-cmdk]');
  if (!dlg) return;
  const input = $('[data-cmdk-input]', dlg);
  const list = $('[data-cmdk-list]', dlg);
  const opener = $('[data-cmdk-open]');
  if (opener) opener.hidden = false;
  let index = null;
  window.__paletteReset = () => { index = null; };
  let items = [];
  let active = 0;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const selection = () => $$('input.chk[name=ids][form=bulk]:checked').length;
  const click = sel => () => $(sel)?.click();
  const go = href => () => { location.href = href; };
  const PAGES = [['Aujourd’hui', '/admin'], ['Photothèque', '/admin/photos'], ['Photos à finir', '/admin/photos?statut=afinir'], ['Brouillons', '/admin/photos?statut=draft'], ['Personnes photographiées', '/admin/rencontres'], ['Nouvelle rencontre', '/admin/rencontre'], ['Séries', '/admin/series'], ['Site public', '/admin/site'], ['Photos de l’ouverture', '/admin/site#ouverture'], ['Carte du monde', '/admin/site#carte'], ['Instagram', '/admin/instagram'], ['Statistiques', '/admin/statistiques'], ['Sur le terrain', '/admin/terrain'], ['Cartes d’accord', '/admin/rencontres/cartes'], ['Photographes', '/admin/auteurs'], ['Apparence', '/admin/apparence'], ['Filigrane & EXIF', '/admin/images'], ['Droits & confidentialité', '/admin/droits'], ['Aide', '/admin/aide']];
  function actions() {
    const n = selection();
    const a = [];
    if (n) {
      a.push({ label: `<b>Publier</b> la sélection`, r: plural(n, 'photo'), key: 'P', run: click('[data-publish]') });
      a.push({ label: `<b>Dépublier</b> la sélection`, r: plural(n, 'photo'), run: click('[data-inspector] button[value=draft]') });
      a.push({ label: `<b>Supprimer</b> la sélection…`, r: plural(n, 'photo'), run: click('[data-bulk-delete]') });
    }
    a.push({ label: '<b>Importer</b> des photos', key: 'I', run: $('[data-import-open]') && location.pathname === '/admin/photos' ? click('[data-import-open]') : go('/admin/photos?importer#import') });
    a.push({ label: '<b>Nouvelle série</b>', run: go('/admin/series#nouvelle-serie') });
    a.push({ label: 'Basculer en mode <b>clair / sombre</b>', run: () => $('[data-theme-form]')?.requestSubmit() });
    a.push({ label: '<b>Voir le site</b> public', run: () => window.open('/', '_blank', 'noopener') });
    return a;
  }
  async function load() {
    if (index) return index;
    try { index = await (await fetch('/admin/recherche.json', { headers: { accept: 'application/json' } })).json(); } catch { index = { photos: [], series: [] }; }
    return index;
  }
  function build(q) {
    const nq = norm(q);
    const hit = s => !nq || norm(s).includes(nq);
    const groups = [];
    const acts = actions().filter(a => hit(a.label.replace(/<[^>]+>/g, '')));
    if (acts.length) groups.push(['Actions', acts]);
    const pages = PAGES.filter(([t]) => hit(t)).map(([t, href]) => ({ label: `Aller à <b>${esc(t)}</b>`, run: go(href) }));
    if (index) {
      const series = index.series.filter(s => hit(s.name)).map(s => ({ label: `Série <b>${esc(s.name)}</b>`, r: plural(s.count, 'photo'), run: go(`/admin/photos?serie=${encodeURIComponent(s.slug)}`) }));
      const photos = nq ? index.photos.filter(p => hit(`${p.title} ${p.category} ${p.place}`)).slice(0, 8).map(p => ({ label: `${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}<b>${esc(p.title)}</b> <span>${esc(p.category)}${p.place ? ` · ${esc(p.place)}` : ''}</span>`, r: p.status === 'draft' ? 'brouillon' : 'publiée', run: go(`/admin/photos/${p.id}`) })) : [];
      if (photos.length) groups.push(['Photos', photos]);
      if (series.length) groups.push(['Séries', series]);
    }
    if (pages.length) groups.push(['Aller à', pages]);
    items = groups.flatMap(([, g]) => g);
    active = Math.min(active, Math.max(items.length - 1, 0));
    let k = 0;
    list.innerHTML = groups.map(([name, g]) => `<li class="sec" role="presentation">${name}</li>` + g.map(it => { const i = k++; return `<li role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === active}">${it.label}${it.r || it.key ? `<span class="r">${it.r || ''}${it.key ? ` <kbd>${it.key}</kbd>` : ''}</span>` : ''}</li>`; }).join('')).join('')
      || '<li class="sec" role="presentation">Aucun résultat</li>';
    input.setAttribute('aria-activedescendant', items.length ? `cmdk-${active}` : '');
  }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    $$('[role=option]', list).forEach(o => o.setAttribute('aria-selected', String(Number(o.dataset.i) === active)));
    $(`#cmdk-${active}`)?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `cmdk-${active}`);
  }
  function run(i) { const it = items[i]; if (!it) return; dlg.close(); it.run(); }
  async function open() {
    active = 0;
    input.value = '';
    build('');
    dlg.showModal();
    input.focus();
    await load();
    build(input.value);
  }
  opener?.addEventListener('click', open);
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dlg.open) dlg.close(); else open(); }
  });
  input.addEventListener('input', () => { active = 0; build(input.value); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  });
  list.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o) run(Number(o.dataset.i)); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();

// ----- fiche d'une photo : partage Instagram (aperçu, légende) -----
(function () {
  const form = $('[data-ig-form]');
  if (!form) return;
  const id = form.elements.photo_id.value;
  const preview = $('[data-ig-preview]');
  const frame = $('[data-ig-frame]', form);
  const wm = $('[data-ig-watermark]', form);
  const custom = $('[data-ig-custom]', form);
  const text = $('[data-ig-caption]', form);
  const count = $('[data-ig-count]', form);
  const back = $('[data-ig-template]', form);
  // L'aperçu suit le cadre et le filigrane choisis (image recalculée par le serveur).
  const refresh = () => { preview.src = `/admin/instagram/apercu.jpg?photo=${encodeURIComponent(id)}&cadre=${encodeURIComponent(frame.value)}&filigrane=${wm.checked ? 1 : 0}`; };
  frame.addEventListener('change', refresh);
  wm.addEventListener('change', refresh);
  const counter = () => { count.textContent = `${text.value.length} / 2200`; back.hidden = !custom.checked; };
  // Modifier la légende la rend personnelle ; « Revenir au modèle » reprend celle du modèle.
  text.addEventListener('input', () => { custom.checked = true; counter(); });
  custom.addEventListener('change', async () => { if (!custom.checked) await template(); counter(); });
  async function template() {
    try {
      const r = await (await fetch(`/admin/instagram/legende?photo=${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } })).json();
      text.value = r.caption || '';
      custom.checked = false;
      counter();
    } catch { /* l'enregistrement reprendra le modèle de toute façon */ }
  }
  back.addEventListener('click', template);
  counter();
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

// ----- réglages : rétablir un texte par défaut (droits d'utilisation) -----
document.addEventListener('click', e => {
  const b = e.target.closest('[data-reset-default]');
  if (!b) return;
  const ta = document.getElementById(b.dataset.resetDefault);
  if (!ta) return;
  ta.value = ta.dataset.default;
  ta.focus();
  toast.show('Texte par défaut rétabli : enregistrez les réglages pour l’appliquer.');
});

// ----- propositions de traduction (LibreTranslate du réseau local) -----
// Remplit le champ anglais ou allemand d'après le texte français (sinon l'autre traduction) ; l'auteur relit, corrige et
// enregistre. « Annuler » remet le texte d'avant.
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-translate]');
  if (!btn) return;
  const form = btn.closest('form');
  const name = btn.dataset.translate, to = btn.dataset.to;
  const field = form.elements[`${name}_${to}`];
  const status = btn.parentElement.querySelector('[data-translate-status]');
  const sources = [['fr', form.elements[name]], ...['en', 'de'].filter(l => l !== to).map(l => [l, form.elements[`${name}_${l}`]])];
  const [source, input] = sources.find(([, el]) => el && el.value.trim()) || [];
  if (!input) { status.textContent = 'Rien à traduire : remplissez d’abord le texte français.'; return; }
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  status.textContent = 'Traduction en cours…';
  try {
    const { text } = await postJson('/admin/traduction', { text: input.value, source, target: to });
    const before = field.value;
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    status.innerHTML = `Proposition ${source === 'fr' ? 'traduite du français' : `traduite de ${source === 'en' ? 'l’anglais' : 'l’allemand'}`} : relisez-la avant d’enregistrer. <button class="linkbtn" type="button" data-translate-undo>Annuler</button>`;
    status.querySelector('[data-translate-undo]').addEventListener('click', () => {
      field.value = before;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = 'Proposition retirée.';
      field.focus();
    }, { once: true });
    field.focus();
  } catch (err) {
    status.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
});

// ----- cartes à imprimer : le premier numéro suit le photographe choisi -----
const cardsAuthor = $('[data-cards-author]');
if (cardsAuthor) cardsAuthor.addEventListener('change', () => { $('[data-cards-from]').value = cardsAuthor.selectedOptions[0].dataset.next; });

// ----- lien privé : sélectionné d'un clic, prêt à copier -----
document.addEventListener('focusin', e => { if (e.target.matches('[data-select-all]')) e.target.select(); });

// Accord : Instagram suppose le site (cocher Instagram coche le site, décocher le site décoche Instagram).
// Le serveur refuse de toute façon un accord Instagram sans le site.
document.addEventListener('change', e => {
  const t = e.target;
  if (!t.form || (t.name !== 'scope_instagram' && t.name !== 'scope_site')) return;
  const other = t.form.elements[t.name === 'scope_instagram' ? 'scope_site' : 'scope_instagram'];
  if (!other) return;
  if (t.name === 'scope_instagram' && t.checked) other.checked = true;
  if (t.name === 'scope_site' && !t.checked) other.checked = false;
});
