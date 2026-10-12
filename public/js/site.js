// Amélioration progressive : le site fonctionne sans ce script (liens et pages serveur).
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-js-only]').forEach(el => { el.hidden = false; });

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
          pause.textContent = paused ? 'Lecture' : 'Pause';
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
      const count = document.querySelector('#galerie .mono');
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
      const a = e.target.closest('a[href^="/photo/"]');
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
      const tile = [...document.querySelectorAll('#grid a.tile')].find(a => decodeURIComponent(new URL(a.href).pathname) === `/photo/${r.slug}`);
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
      const armed = refKey === r.gallery || (r.armed && Boolean(refKey) && refKey.startsWith('/photo/'));
      writeRetour({ ...r, slug, armed });
    }
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
})();
