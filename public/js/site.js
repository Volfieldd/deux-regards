// Amélioration progressive : le site fonctionne sans ce script (liens et pages serveur).
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-js-only]').forEach(el => { el.hidden = false; });

  // ----- sélecteur de langue : se referme au clic ailleurs et avec Échap -----
  const picks = document.querySelectorAll('[data-lang-pick]');
  document.addEventListener('click', e => picks.forEach(d => { if (d.open && !d.contains(e.target)) d.open = false; }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    picks.forEach(d => { if (d.open) { d.open = false; d.querySelector('summary').focus(); e.stopImmediatePropagation(); } });
  }, true);

  // ----- dissuasion : pas de clic droit ni de glisser sur les images -----
  document.addEventListener('contextmenu', e => { if (e.target.closest('img, picture')) e.preventDefault(); });
  document.addEventListener('dragstart', e => { if (e.target.closest('img, picture')) e.preventDefault(); });

  // Glissé horizontal franc à un doigt (pas un pincement, pas un défilement vertical).
  function onSwipe(el, handler, { ignore } = {}) {
    let start = null;
    el.addEventListener('touchstart', e => {
      start = e.touches.length === 1 && !(ignore && e.target.closest(ignore)) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    el.addEventListener('touchmove', e => { if (e.touches.length > 1) start = null; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (!start || (window.visualViewport && visualViewport.scale > 1.01)) { start = null; return; }
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) handler(dx < 0 ? 1 : -1);
    });
  }

  function stagger(root) {
    root.querySelectorAll('.tile').forEach((t, i) => { t.style.animationDelay = `${Math.min(i, 12) * 50}ms`; });
  }

  // ----- ouverture : fondu automatique, vignettes, swipe -----
  const hero = document.querySelector('[data-hero]');
  if (hero) {
    const items = hero.querySelectorAll('.hero-item');
    const caps = hero.querySelectorAll('.cap');
    const thumbs = hero.querySelectorAll('.strip button[data-h]');
    const bar = hero.querySelector('.bar');
    const pause = hero.querySelector('[data-pause]');
    const pauseLabel = pause ? pause.textContent : '';
    // Défilement automatique, avec un bouton pour l'arrêter (WCAG 2.2.2) ; jamais si l'animation est réduite.
    // Suspendu tant que le pointeur ou le focus clavier est dans l'ouverture (le lien « Voir la photo » ne disparaît pas sous le focus).
    let cur = 0, timer = null, paused = reduce, hold = false;
    const show = i => {
      cur = (i + items.length) % items.length;
      const sync = el => el.classList.toggle('on', Number(el.dataset.h) === cur);
      items.forEach(sync); caps.forEach(sync);
      thumbs.forEach(b => b.setAttribute('aria-current', String(Number(b.dataset.h) === cur)));
      clearTimeout(timer);
      if (bar) bar.classList.remove('run');
      if (!bar || paused || hold) return;
      void bar.offsetWidth; bar.classList.add('run');
      timer = setTimeout(() => show(cur + 1), 6000);
    };
    const setHold = v => { if (hold !== v) { hold = v; show(cur); } };
    if (items.length > 1) {
      if (pause && !reduce) {
        pause.hidden = false;
        pause.addEventListener('click', () => {
          paused = !paused;
          pause.textContent = paused ? pause.dataset.play : pauseLabel;
          show(cur);
        });
      }
      hero.querySelector('.strip').addEventListener('click', e => { const b = e.target.closest('button[data-h]'); if (b) show(Number(b.dataset.h)); });
      hero.addEventListener('mouseenter', () => setHold(true));
      hero.addEventListener('mouseleave', () => setHold(hero.contains(document.activeElement)));
      hero.addEventListener('focusin', () => setHold(true));
      hero.addEventListener('focusout', e => { if (!hero.contains(e.relatedTarget)) setHold(hero.matches(':hover')); });
      onSwipe(hero, step => show(cur + step), { ignore: '.strip' });
      document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else show(cur); });
      show(0);
    }
  }

  // ----- séries : aperçu au survol -----
  function peek(slug) {
    document.querySelectorAll('.peek figure').forEach(f => f.classList.toggle('on', f.dataset.peek === slug));
  }
  document.addEventListener('mouseover', e => { const a = e.target.closest('a[data-peek]'); if (a) peek(a.dataset.peek); });
  document.addEventListener('mouseout', e => {
    const nav = e.target.closest('.series nav');
    if (!nav || nav.contains(e.relatedTarget)) return;
    const cur = nav.querySelector('a[aria-current]') || nav.querySelector('a[data-peek]');
    if (cur) peek(cur.dataset.peek);
  });

  // ----- filtres sans rechargement : on remplace les blocs concernés par ceux de la page cible -----
  const SWAP = ['regards', 'series', 'galerie', 'grid'];
  const here = () => location.pathname + location.search;
  let shown = here();            // URL dont le contenu est affiché
  let seq = 0;                   // seule la dernière requête lancée est appliquée
  let inflight = null;

  async function swapTo(url, { push, scroll, focusHref }) {
    const grid = document.getElementById('grid');
    if (!grid) { location.href = url; return; }
    const id = ++seq;
    inflight?.abort();
    inflight = new AbortController();
    grid.classList.add('swapping');
    try {
      const res = await fetch(url, { headers: { accept: 'text/html' }, signal: inflight.signal });
      if (!res.ok) throw new Error(res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      if (id !== seq) return;
      for (const sid of SWAP) {
        const next = doc.getElementById(sid), now = document.getElementById(sid);
        if (next && now) now.replaceWith(document.importNode(next, true));
      }
      document.title = doc.title;
      stagger(document.getElementById('grid'));
      if (push) history.pushState({ swap: true }, '', url);
      shown = here();
      // Annonce du résultat et focus conservé sur le lien activé (WCAG 2.4.3, 4.1.3).
      const head = document.querySelector('#galerie h3');
      const count = document.querySelector('#galerie > span.mono');
      const announce = document.querySelector('[data-announce]');
      if (announce && head) announce.textContent = `${head.textContent.trim()} : ${count ? count.textContent.trim().split(' · ')[0] : ''}`;
      const target = focusHref && [...document.querySelectorAll('a[data-filter]')].find(a => a.getAttribute('href') === focusHref);
      if (scroll) document.getElementById('galerie').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      (target || (focusHref ? head : null))?.focus({ preventScroll: true });
    } catch (err) {
      if (err.name !== 'AbortError') location.href = url;
    } finally {
      if (id === seq) document.getElementById('grid')?.classList.remove('swapping');
    }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-filter]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const url = new URL(a.href, location.href);
    const scroll = a.hasAttribute('data-scroll') || url.hash === '#galerie';
    url.hash = '';
    swapTo(url.href, { push: true, scroll, focusHref: a.getAttribute('href') });
  });
  if (document.getElementById('grid')) {
    // Retour/avance : on recharge les blocs dès que l'URL affichée diffère du contenu (y compris
    // depuis une entrée d'ancre comme #series, qui n'a pas d'état).
    addEventListener('popstate', () => { if (here() !== shown) swapTo(here(), { push: false, scroll: false }); });
    stagger(document);
  }

  // ----- retour à la galerie, à l'endroit quitté -----
  // Mémoire de l'onglet : galerie d'où l'on a ouvert une photo (chemin + requête), dernière photo vue,
  // et « armed » tant que l'entrée d'historique précédente est bien cette galerie.
  const RETOUR = 'retour-galerie';
  const readRetour = () => {
    try { const r = JSON.parse(sessionStorage.getItem(RETOUR) || 'null'); return r && Date.now() - r.t < 3 * 3600e3 ? r : null; } catch { return null; }
  };
  const writeRetour = r => { try { sessionStorage.setItem(RETOUR, JSON.stringify({ ...r, t: Date.now() })); } catch { /* stockage refusé : liens simples */ } };
  const keyOf = u => u.pathname + u.search;
  const viewer = document.querySelector('[data-viewer]');
  if (!viewer) {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="/photo/"], a[href^="/en/photo/"], a[href^="/de/photo/"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      writeRetour({ gallery: keyOf(location), slug: null, armed: false });
    });
  }
  if (document.getElementById('grid')) {
    // De retour sur la galerie (bouton Retour, Fermer, Échap) : la dernière photo vue doit être à l'écran.
    addEventListener('pageshow', () => requestAnimationFrame(() => {
      const r = readRetour();
      if (!r || r.gallery !== keyOf(location) || !r.slug) return;
      writeRetour({ ...r, slug: null, armed: false });
      const tile = [...document.querySelectorAll('#grid a.tile')].find(a => decodeURIComponent(new URL(a.href).pathname).endsWith(`/photo/${r.slug}`));
      if (!tile) return;
      const b = tile.getBoundingClientRect();
      if (b.top < 0 || b.bottom > innerHeight) tile.scrollIntoView({ block: 'center' });
    }));
  }

  // ----- page photo : clavier, swipe, retour -----
  if (viewer) {
    // Arrivée depuis la galerie notée, ou photo voisine ouverte depuis une photo qui l'était déjà.
    const slug = decodeURIComponent(location.pathname.split('/').pop());
    const r = readRetour();
    if (r) {
      let ref = null;
      try { ref = document.referrer ? new URL(document.referrer) : null; } catch { ref = null; }
      const refKey = ref && ref.origin === location.origin ? keyOf(ref) : null;
      const armed = refKey === r.gallery || (r.armed && Boolean(refKey) && /^(\/(en|de))?\/photo\//.test(refKey));
      writeRetour({ ...r, slug, armed });
    }
    // Légende longue : trois lignes, puis « Lire la suite » ; dépliée, c'est la page qui défile (plus d'ascenseur intérieur).
    const legend = viewer.querySelector('.legend');
    let toggle = null;
    if (legend) {
      legend.classList.add('clamp');
      if (legend.scrollHeight > legend.clientHeight + 2) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'more-legend';
        toggle.setAttribute('aria-controls', legend.id);
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = viewer.dataset.more;
        legend.after(toggle);
        toggle.addEventListener('click', () => {
          const open = legend.classList.toggle('open');
          toggle.setAttribute('aria-expanded', String(open));
          toggle.textContent = open ? viewer.dataset.less : viewer.dataset.more;
          if (!open) viewer.scrollIntoView({ block: 'start' });
        });
      } else {
        legend.classList.remove('clamp');
      }
    }
    // Premier écran : l'image prend la place laissée par l'en-tête et le texte replié (45 % de l'écran au moins).
    const vimg = viewer.querySelector('.vimg');
    const fit = () => {
      if (legend?.classList.contains('open')) return;              // dépliée : l'image garde sa hauteur
      const used = viewer.querySelector('.vh').offsetHeight + viewer.querySelector('.vf').offsetHeight;
      vimg.style.setProperty('--vimg-h', `${Math.max(Math.round(innerHeight * 0.45), innerHeight - used)}px`);
    };
    fit();
    addEventListener('resize', fit);

    // Photo précédente / suivante : remplace l'entrée d'historique, un seul Retour ramène à la galerie.
    const go = key => { const url = viewer.dataset[key]; if (url) location.replace(url); };
    // Fermer, Échap : vrai retour arrière si l'on vient de cette galerie (le navigateur rend la position).
    const close = () => {
      const target = new URL(viewer.dataset.back, location.href);
      const now = readRetour();
      if (now?.armed && now.gallery === keyOf(target) && history.length > 1) history.back();
      else location.href = viewer.dataset.back;
    };
    viewer.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const a = e.target.closest('a.back, .nav a[rel]');
      if (!a) return;
      e.preventDefault();
      if (a.matches('a.back')) close(); else go(a.rel === 'prev' ? 'prev' : 'next');
    });
    const several = viewer.dataset.prev !== viewer.dataset.next || viewer.querySelector('.nav');
    document.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Escape') close();
      else if (several && e.key === 'ArrowLeft') go('prev');
      else if (several && e.key === 'ArrowRight') go('next');
    });
    if (several) onSwipe(viewer.querySelector('.vimg'), step => go(step > 0 ? 'next' : 'prev'));
  }

  // ----- carte : zoom (boutons, pincement, Ctrl + molette), déplacement, vignettes regroupées -----
  // Sans ce script : carte fixe, chaque vignette mène à son lieu dans la liste. Le zoom change le viewBox ; les
  // vignettes gardent leur taille à l'écran, et celles qui se chevauchent n'en font qu'une (nombre cumulé), qu'un
  // clic agrandit.
  const carte = document.querySelector('[data-carte]');
  if (carte) {
    const vue = carte.querySelector('[data-carte-vue]');
    const svg = carte.querySelector('[data-carte-svg]');
    const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
    const pins = [...svg.querySelectorAll('[data-pin]')].map(el => ({
      el, x: Number(el.dataset.x), y: Number(el.dataset.y), n: Number(el.dataset.n), name: el.dataset.name,
      label: el.getAttribute('aria-label'), href: el.getAttribute('href'),
      inner: el.querySelector('[data-pin-in]'), count: el.querySelector('[data-pin-count]'),
    })).sort((a, b) => b.n - a.n);
    const btn = k => carte.querySelector(`[data-carte-zoom="${k}"]`);
    const ZMAX = 40;
    // Fond détaillé (1:50m) chargé au premier zoom seulement : la vue du monde reste légère.
    let fine = false;
    const uses = svg.querySelectorAll('use[data-fine]');
    const useFine = () => { fine = true; uses.forEach(u => u.setAttribute('href', u.dataset.fine)); };
    // Au-delà du zoom × 8 : tuiles 1:10m (petites îles…) de la zone visible, lues une fois puis gardées.
    const detail = svg.querySelector('[data-detail]');
    const version = new URL(svg.dataset.tiles, location.href).search;
    const tileBase = new URL('./', new URL(svg.dataset.tiles, location.href)).pathname;
    let tileIndex = null;
    const tiles = new Map();                                   // « i-j » → promesse (tuile insérée)
    const done = new Set();
    const loadTile = t => {
      if (!tiles.has(t)) {
        tiles.set(t, fetch(`${tileBase}${t}.svg${version}`).then(r => (r.ok ? r.text() : '')).then(text => {
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          doc.querySelectorAll('path').forEach(p => g.appendChild(document.importNode(p, true)));
          detail.appendChild(g);
        }).catch(() => {}).finally(() => done.add(t)));
      }
      return tiles.get(t);
    };
    let wanted = 0;
    function updateTiles() {
      const deep = view.w <= W / 8 + 0.01;
      const show = on => { detail.setAttribute('display', on ? 'inline' : 'none'); uses.forEach(u => u.setAttribute('display', on ? 'none' : 'inline')); };
      if (!deep) { show(false); return; }
      if (!tileIndex) {
        tileIndex = fetch(svg.dataset.tiles).then(r => r.json()).then(j => ({ ...j, set: new Set(j.tiles) })).catch(() => null);
      }
      const ticket = ++wanted;
      tileIndex.then(ix => {
        if (!ix || ticket !== wanted) return;
        const h = (view.w * H) / W, need = [];
        for (let i = Math.floor(view.x / ix.w); i <= Math.floor((view.x + view.w) / ix.w); i++) {
          for (let j = Math.floor(view.y / ix.h); j <= Math.floor((view.y + h) / ix.h); j++) if (ix.set.has(`${i}-${j}`)) need.push(`${i}-${j}`);
        }
        if (need.some(t => !done.has(t))) show(false);
        // Le fond 1:50m reste affiché tant que toute la zone visible n'est pas arrivée (pas de trou pendant le chargement).
        Promise.all(need.map(loadTile)).then(() => { if (ticket === wanted && view.w <= W / 8 + 0.01) show(true); });
      });
    }
    let view = { x: 0, y: 0, w: W };

    const clamp = v => {
      const w = Math.min(W, Math.max(W / ZMAX, v.w));
      const h = (w * H) / W;
      return { w, x: Math.min(W - w, Math.max(0, v.x)), y: Math.min(H - h, Math.max(0, v.y)) };
    };
    function render() {
      const h = (view.w * H) / W;
      svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${h}`);
      const px = svg.clientWidth || W;
      const unit = view.w / px;                                // unités de carte par pixel
      const s = ((px < 520 ? 13 : 16) * unit) / 15;            // rayon de la vignette : 13 ou 16 px
      const near = 30 * s * 0.9;                               // deux vignettes qui se chevauchent
      const taken = new Set();
      for (const p of pins) {
        if (taken.has(p)) continue;
        const group = pins.filter(q => !taken.has(q) && Math.hypot(q.x - p.x, q.y - p.y) < near);
        group.forEach(q => taken.add(q));
        group.forEach(q => { if (q !== p) q.el.setAttribute('display', 'none'); });
        const n = group.reduce((t, q) => t + q.n, 0);
        p.el.removeAttribute('display');
        p.el.dataset.n = n;
        p.count.textContent = n;
        p.group = group.length > 1 ? group : null;
        const others = group.length - 1;
        p.el.setAttribute('aria-label', p.group
          ? (others > 1 ? carte.dataset.clusterMany : carte.dataset.clusterOne).replace('{name}', p.name).replace('{others}', others).replace('{n}', n)
          : p.label);
        p.inner.setAttribute('transform', `scale(${s})`);
      }
      const zoomed = view.w < W - 0.5;
      if (zoomed && !fine) useFine();
      updateTiles();
      vue.classList.toggle('zoomed', zoomed);
      btn('out').disabled = !zoomed;
      btn('reset').disabled = !zoomed;
      btn('in').disabled = view.w <= W / ZMAX + 0.01;
    }
    // Zoom de facteur f autour d'un point de la carte (en unités de carte).
    function zoomAt(f, ux, uy) {
      const w = Math.min(W, Math.max(W / ZMAX, view.w / f));
      const k = w / view.w;
      view = clamp({ w, x: ux - (ux - view.x) * k, y: uy - (uy - view.y) * k });
      render();
    }
    const toMap = (cx, cy) => {
      const r = svg.getBoundingClientRect();
      return [view.x + ((cx - r.left) * view.w) / r.width, view.y + ((cy - r.top) * view.w) / r.width];
    };
    const centre = () => [view.x + view.w / 2, view.y + (view.w * H) / W / 2];

    carte.addEventListener('click', e => {
      const b = e.target.closest('[data-carte-zoom]');
      if (!b) return;
      if (b.dataset.carteZoom === 'reset') { view = { x: 0, y: 0, w: W }; render(); }
      else zoomAt(b.dataset.carteZoom === 'in' ? 2 : 0.5, ...centre());
    });

    // Vignette regroupée : agrandit jusqu'à séparer les lieux ; sinon, le lieu dans la liste.
    let moved = false;
    svg.addEventListener('click', e => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      const el = e.target.closest('[data-pin]');
      const p = el && pins.find(q => q.el === el);
      if (!p?.group) return;
      e.preventDefault();
      const xs = p.group.map(q => q.x), ys = p.group.map(q => q.y);
      const spanW = Math.max(Math.max(...xs) - Math.min(...xs), ((Math.max(...ys) - Math.min(...ys)) * W) / H);
      // Assez près pour séparer les deux lieux les plus proches, sans perdre les autres du groupe.
      const d = Math.min(...p.group.flatMap((a, i) => p.group.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y))));
      const px = svg.clientWidth || W;
      const sep = (d * px) / ((px < 520 ? 13 : 16) * 2 + 8);
      const w = Math.max(W / ZMAX, spanW * 1.3, Math.min(view.w / 2, sep));
      view = clamp({ w, x: (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 - (w * H) / W / 2 });
      render();
    }, true);

    // Ctrl + molette (et pincement du pavé tactile) : zoom ; la molette seule fait défiler la page.
    vue.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.01), ...toMap(e.clientX, e.clientY));
    }, { passive: false });

    // Glisser (carte agrandie) et pincement à deux doigts.
    const pts = new Map();
    let last = null;
    const gesture = () => {
      const [a, b] = [...pts.values()];
      return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) } : { x: a.x, y: a.y, d: 0 };
    };
    vue.addEventListener('pointerdown', e => {
      if (e.button !== 0 || pts.size >= 2) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = gesture();
      moved = false;
    });
    vue.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture();
      if (pts.size === 1 && view.w >= W - 0.5) { last = g; return; } // monde entier : rien à déplacer
      if (!moved && Math.hypot(g.x - last.x, g.y - last.y) < 4 && Math.abs(g.d - last.d) < 4) return;
      if (!moved) { moved = true; vue.classList.add('dragging'); try { vue.setPointerCapture(e.pointerId); } catch { /* déjà relâché */ } }
      const r = svg.getBoundingClientRect();
      const k = view.w / r.width;
      view = clamp({ ...view, x: view.x - (g.x - last.x) * k, y: view.y - (g.y - last.y) * k });
      if (pts.size === 2 && last.d > 0 && g.d > 0) zoomAt(g.d / last.d, ...toMap(g.x, g.y));
      else render();
      last = g;
    });
    const up = e => {
      if (!pts.delete(e.pointerId)) return;
      vue.classList.remove('dragging');
      last = pts.size ? gesture() : null;
      // Le clic qui suit un glissé ne doit pas ouvrir une vignette.
      if (moved && e.type === 'pointercancel') moved = false;
    };
    vue.addEventListener('pointerup', up);
    vue.addEventListener('pointercancel', up);
    addEventListener('resize', render);
    render();
  }
})();

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

// J'aime (page photo) : sans rechargement ; le navigateur retient ce qu'il a aimé (aucun cookie, aucun compte),
// et le serveur ignore un second « j'aime » de la même adresse.
document.querySelectorAll('[data-like]').forEach(form => {
  const btn = form.querySelector('button');
  const n = form.querySelector('[data-like-n]');
  const key = `aime:${form.dataset.slug}`;
  let liked = false;
  try { liked = localStorage.getItem(key) === '1'; } catch { liked = false; }
  const show = () => { btn.setAttribute('aria-pressed', String(liked)); btn.setAttribute('aria-label', liked ? form.dataset.unlikeLabel : form.dataset.likeLabel); };
  show();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const undo = liked;
    liked = !liked; show();
    try {
      const res = await fetch(form.action, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: undo ? 'retirer=1' : '' });
      if (!res.ok) throw new Error(String(res.status));
      const r = await res.json();
      n.textContent = r.label;
      try { if (liked) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { /* stockage indisponible */ }
    } catch { liked = undo; show(); }
  });
});
