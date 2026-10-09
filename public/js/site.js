// Amélioration progressive : le site fonctionne sans ce script (liens et pages serveur).
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ----- dissuasion : pas de clic droit ni de glisser sur les images -----
  document.addEventListener('contextmenu', e => { if (e.target.closest('img, picture')) e.preventDefault(); });
  document.addEventListener('dragstart', e => { if (e.target.closest('img, picture')) e.preventDefault(); });

  function stagger(root) {
    root.querySelectorAll('.tile').forEach((t, i) => { t.style.animationDelay = `${Math.min(i, 12) * 50}ms`; });
  }

  // ----- ouverture : fondu automatique, vignettes, swipe -----
  const hero = document.querySelector('[data-hero]');
  if (hero) {
    const items = hero.querySelectorAll('.hero-item');
    const caps = hero.querySelectorAll('.cap');
    const thumbs = hero.querySelectorAll('.strip button');
    const bar = hero.querySelector('.bar');
    let cur = 0, timer = null;
    const show = i => {
      cur = (i + items.length) % items.length;
      const sync = el => el.classList.toggle('on', Number(el.dataset.h) === cur);
      items.forEach(sync); caps.forEach(sync);
      thumbs.forEach(b => b.setAttribute('aria-current', String(Number(b.dataset.h) === cur)));
      if (!bar || reduce) return;
      bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run');
      clearTimeout(timer); timer = setTimeout(() => show(cur + 1), 6000);
    };
    if (items.length > 1) {
      hero.querySelector('.strip').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(Number(b.dataset.h)); });
      let x = null;
      hero.addEventListener('touchstart', e => { x = e.touches[0].clientX; }, { passive: true });
      hero.addEventListener('touchend', e => { if (x === null) return; const dx = e.changedTouches[0].clientX - x; x = null; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); });
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
  async function swapTo(url, { push, scroll }) {
    const grid = document.getElementById('grid');
    if (!grid) { location.href = url; return; }
    grid.classList.add('swapping');
    try {
      const res = await fetch(url, { headers: { accept: 'text/html' } });
      if (!res.ok) throw new Error(res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      for (const id of SWAP) {
        const next = doc.getElementById(id), now = document.getElementById(id);
        if (next && now) now.replaceWith(document.importNode(next, true));
      }
      document.title = doc.title;
      stagger(document.getElementById('grid'));
      if (push) history.pushState({ swap: true }, '', url);
      if (scroll) document.getElementById('galerie').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    } catch {
      location.href = url;
    }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-filter]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const url = new URL(a.href, location.href);
    const scroll = a.hasAttribute('data-scroll') || url.hash === '#galerie';
    url.hash = '';
    swapTo(url.href, { push: true, scroll });
  });
  if (document.getElementById('grid')) {
    history.replaceState({ swap: true }, '');
    addEventListener('popstate', e => { if (e.state?.swap) swapTo(location.href, { push: false, scroll: false }); });
    stagger(document);
  }

  // ----- page photo : clavier et swipe -----
  const viewer = document.querySelector('[data-viewer]');
  if (viewer) {
    const go = key => { const url = viewer.dataset[key]; if (url) location.href = url; };
    document.addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') go('prev');
      else if (e.key === 'ArrowRight') go('next');
      else if (e.key === 'Escape') go('back');
    });
    let x = null;
    viewer.addEventListener('touchstart', e => { x = e.touches[0].clientX; }, { passive: true });
    viewer.addEventListener('touchend', e => { if (x === null) return; const dx = e.changedTouches[0].clientX - x; x = null; if (Math.abs(dx) > 50) go(dx < 0 ? 'next' : 'prev'); });
  }
})();
