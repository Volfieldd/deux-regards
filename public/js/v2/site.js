// Site public v2 : amélioration progressive. Tout marche sans ce script (liens, formulaires POST, <details>, pages
// Partager et Signaler) ; il ajoute le clavier, le glissé, le plein écran, J'aime et Partager sans rechargement ; sur
// l'accueil, la galerie et les séries : le diaporama de l'ouverture (à l'arrêt par défaut), la hauteur de la barre de
// filtres et le retour à la photo quittée.
// Repris de js/site.js (v1) pour ce qui ne change pas (J'aime, Partager, retour à la galerie, tuiles de la carte), sans la
// dissuasion du clic droit (UX-F-34 : une photo s'enregistre, se partage, se zoome comme ailleurs).
document.documentElement.classList.add('js');
(function () {
  document.querySelectorAll('[data-js-only]').forEach(el => { el.hidden = false; });

  // ----- langue et menu (<details>) : se referment au clic ailleurs et avec Échap, le focus revient au bouton -----
  const pops = document.querySelectorAll('[data-lang-pick], [data-menu]');
  document.addEventListener('click', e => pops.forEach(d => { if (d.open && !d.contains(e.target)) d.open = false; }));
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    pops.forEach(d => { if (d.open) { d.open = false; d.querySelector('summary').focus(); e.stopImmediatePropagation(); } });
  }, true);
  // Un seul ouvert à la fois : la langue ne s'ouvre pas sous le menu.
  pops.forEach(d => d.addEventListener('toggle', () => { if (d.open) pops.forEach(o => { if (o !== d) o.open = false; }); }));

  // Glissé horizontal franc à un doigt (pas un pincement, pas un défilement vertical, pas sur une page agrandie).
  function onSwipe(el, handler) {
    let start = null;
    el.addEventListener('touchstart', e => { start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
    el.addEventListener('touchmove', e => { if (e.touches.length > 1) start = null; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (!start || (window.visualViewport && visualViewport.scale > 1.01)) { start = null; return; }
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) handler(dx < 0 ? 1 : -1);
    });
  }

  // ----- retour à la galerie, à l'endroit quitté (même mémoire d'onglet que la v1) -----
  const RETOUR = 'retour-galerie';
  const readRetour = () => {
    try { const r = JSON.parse(sessionStorage.getItem(RETOUR) || 'null'); return r && Date.now() - r.t < 3 * 3600e3 ? r : null; } catch { return null; }
  };
  const writeRetour = r => { try { sessionStorage.setItem(RETOUR, JSON.stringify({ ...r, t: Date.now() })); } catch { /* stockage refusé : liens simples */ } };
  const keyOf = u => u.pathname + u.search;

  const viewer = document.querySelector('[data-viewer]');
  // ----- accueil, galerie, série : la photo ouverte est notée, pour y revenir à l'endroit quitté -----
  if (!viewer) {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="/photo/"], a[href^="/en/photo/"], a[href^="/de/photo/"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      writeRetour({ gallery: keyOf(location), slug: null, armed: false });
    });
    // De retour sur la galerie (Retour, « ← Galerie », Échap) : la dernière photo vue doit être à l'écran.
    addEventListener('pageshow', () => requestAnimationFrame(() => {
      const r = readRetour();
      if (!r || r.gallery !== keyOf(location) || !r.slug) return;
      writeRetour({ ...r, slug: null, armed: false });
      const tile = [...document.querySelectorAll('.rangees a.vignette')].find(a => decodeURIComponent(new URL(a.href).pathname).endsWith(`/photo/${r.slug}`));
      if (!tile) return;
      const b = tile.getBoundingClientRect();
      if (b.top < 0 || b.bottom > innerHeight) tile.scrollIntoView({ block: 'center' });
    }));
    return;
  }

  const slug = decodeURIComponent(location.pathname.split('/').pop());
  const r = readRetour();
  if (r) {
    let ref = null;
    try { ref = document.referrer ? new URL(document.referrer) : null; } catch { ref = null; }
    const refKey = ref && ref.origin === location.origin ? keyOf(ref) : null;
    const armed = refKey === r.gallery || (r.armed && Boolean(refKey) && /^(\/(en|de))?\/photo\//.test(refKey));
    writeRetour({ ...r, slug, armed });
  }

  // ----- plein écran : un <dialog> modal (la photo seule sur le noir), et l'API Fullscreen si le navigateur la permet -----
  const PLEIN = 'plein-ecran';
  const plein = document.querySelector('[data-plein]');
  const cadre = viewer.querySelector('[data-cadre]');
  const openPlein = ({ fullscreen = true } = {}) => {
    if (!plein || typeof plein.showModal !== 'function') return;
    const box = plein.querySelector('[data-plein-photo]');
    if (!box.firstChild) {
      // La même photo, à la taille de l'écran entier.
      const pic = cadre.querySelector('picture').cloneNode(true);
      pic.querySelectorAll('source, img').forEach(el => el.setAttribute('sizes', '100vw'));
      const img = pic.querySelector('img');
      img.removeAttribute('fetchpriority');
      img.alt = '';
      box.append(pic);
    }
    plein.showModal();
    try { sessionStorage.setItem(PLEIN, '1'); } catch { /* sans mémoire : le plein écran ne suit pas la photo suivante */ }
    if (fullscreen && plein.requestFullscreen && !document.fullscreenElement) plein.requestFullscreen().catch(() => {});
  };
  const closePlein = () => {
    try { sessionStorage.removeItem(PLEIN); } catch { /* rien */ }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (plein?.open) plein.close();
  };
  if (plein) {
    document.querySelector('[data-plein-ouvrir]')?.addEventListener('click', () => openPlein());
    plein.querySelector('[data-plein-fermer]').addEventListener('click', closePlein);
    // Échap (geste natif du dialogue) : on quitte aussi le plein écran du navigateur, et la mémoire.
    plein.addEventListener('close', () => {
      try { sessionStorage.removeItem(PLEIN); } catch { /* rien */ }
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      document.querySelector('[data-plein-ouvrir]')?.focus();
    });
    // Sortie du plein écran du navigateur (Échap chez lui) : le dialogue reste ouvert, on peut encore le quitter.
    // Ouvert depuis la photo précédente : la photo suivante s'ouvre aussi en plein écran (dialogue seul : le navigateur
    // n'accorde le plein écran qu'après un geste).
    let wanted = false;
    try { wanted = sessionStorage.getItem(PLEIN) === '1'; } catch { wanted = false; }
    if (wanted) openPlein({ fullscreen: false });
  }

  // Photo précédente / suivante : remplace l'entrée d'historique, un seul Retour ramène à la galerie.
  const go = key => { const url = viewer.dataset[key]; if (url) location.replace(url); };
  // Retour, Échap : vrai retour arrière si l'on vient de cette galerie (le navigateur rend la position).
  const close = () => {
    const target = new URL(viewer.dataset.back, location.href);
    const now = readRetour();
    if (now?.armed && now.gallery === keyOf(target) && history.length > 1) history.back();
    else location.href = viewer.dataset.back;
  };
  const plain = e => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
  document.querySelector('[data-retour]')?.addEventListener('click', e => { if (plain(e)) { e.preventDefault(); close(); } });
  document.addEventListener('click', e => {
    const a = e.target.closest('.vis-nav a[rel], [data-plein-nav]');
    if (!a || !plain(e)) return;
    e.preventDefault();
    if (!a.matches('[data-plein-nav]')) { try { sessionStorage.removeItem(PLEIN); } catch { /* rien */ } }
    go(a.rel === 'prev' ? 'prev' : 'next');
  });
  const several = viewer.dataset.prev !== viewer.dataset.next || Boolean(viewer.querySelector('.vis-nav'));
  document.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const inPlein = plein?.open;
    // Un autre dialogue ouvert (Partager) : ses touches à lui.
    if (!inPlein && document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && !inPlein) close();
    else if (several && e.key === 'ArrowLeft') go('prev');
    else if (several && e.key === 'ArrowRight') go('next');
  });
  if (several) {
    onSwipe(cadre, step => { try { sessionStorage.removeItem(PLEIN); } catch { /* rien */ } go(step > 0 ? 'next' : 'prev'); });
    if (plein) onSwipe(plein, step => go(step > 0 ? 'next' : 'prev'));
  }
  // Photo suivante : son image est chargée d'avance une fois la page affichée (même taille, même format que sur sa page).
  // Pas la page elle-même : servie ensuite sans requête, sa vue ne serait jamais comptée.
  const nextImage = document.querySelector('template[data-next-image]');
  const warm = () => setTimeout(() => {
    const box = document.createElement('div');
    box.hidden = true;
    box.append(document.importNode(nextImage.content, true));
    document.body.append(box);
  }, 300);
  if (nextImage) { if (document.readyState === 'complete') warm(); else addEventListener('load', warm, { once: true }); }
})();

// J'aime : sans rechargement ; le navigateur retient ce qu'il a aimé (aucun cookie, aucun compte), et le serveur ignore
// un second « j'aime » de la même adresse. L'état passe par aria-pressed (cœur plein) ; le compteur paraît dès 1, et le
// nouveau total est annoncé (data-like-live).
document.querySelectorAll('[data-like]').forEach(form => {
  const btn = form.querySelector('button');
  const n = form.querySelector('[data-like-n]');
  const live = form.querySelector('[data-like-live]');
  const key = `aime:${form.dataset.slug}`;
  let liked = false;
  let uncounted = false;
  try { liked = localStorage.getItem(key) === '1'; } catch { liked = false; }
  const show = () => btn.setAttribute('aria-pressed', String(liked));
  show();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const undo = liked;
    liked = !liked; show();
    if (undo && uncounted) { uncounted = false; return; }
    try {
      const res = await fetch(form.action, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: undo ? 'retirer=1' : '' });
      if (!res.ok) throw new Error(String(res.status));
      const r = await res.json();
      n.textContent = r.likes > 0 ? String(r.likes) : '';
      if (live) live.textContent = r.label;
      if (!undo && r.counted === false) { uncounted = true; return; }
      try { if (liked) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch { /* stockage indisponible */ }
    } catch { liked = undo; show(); }
  });
});

// Partager. Sur téléphone : le menu de partage du téléphone. Sur ordinateur, ou sans ce menu : la fenêtre « Partager »
// (réseaux, lien à copier, QR). Sans ce script, le lien mène à une page qui contient les mêmes liens (views/v2/share.eta) ;
// avec lui, cette page a les mêmes gestes que la fenêtre. Chaque partage est compté, sans rien savoir du visiteur.
// box : la fenêtre ou la page ; done : ce qui suit un partage par le menu du téléphone (fermer la fenêtre).
const wireShare = (box, { shareTitle: title, shareUrl: url, shareCount: countUrl }, done = () => {}) => {
  const count = via => {
    const body = new URLSearchParams({ via });
    try { if (navigator.sendBeacon && navigator.sendBeacon(countUrl, body)) return; } catch { /* repli ci-dessous */ }
    fetch(countUrl, { method: 'POST', body, keepalive: true }).catch(() => {});
  };
  const native = async () => {
    try { await navigator.share({ title, url }); count('telephone'); return true; } catch (err) { return err && err.name === 'AbortError'; }
  };
  const canNative = typeof navigator.share === 'function';
  const more = box.querySelector('[data-share-more-item]');
  if (more) more.hidden = !canNative;
  box.querySelector('[data-share-nets]')?.addEventListener('click', async e => {
    const a = e.target.closest('[data-via]');
    if (a) { count(a.dataset.via); return; }
    if (e.target.closest('[data-share-more]') && await native()) done();
  });
  const copy = box.querySelector('[data-share-copy]');
  const field = box.querySelector('[data-share-url]');
  const label = copy?.textContent;
  let timer = null;
  copy?.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { field.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
    if (!ok) { field.focus(); field.select(); return; }
    copy.textContent = copy.dataset.copied;
    copy.classList.add('done');
    count('copie');
    clearTimeout(timer);
    timer = setTimeout(() => { copy.textContent = label; copy.classList.remove('done'); }, 2500);
  });
  field?.addEventListener('focus', () => field.select());
  return { native, canNative };
};
document.querySelectorAll('[data-share]').forEach(btn => {
  const dialog = document.querySelector('[data-share-dialog]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const { native, canNative } = wireShare(dialog, btn.dataset, () => dialog.close());
  const phone = matchMedia('(pointer: coarse)').matches;
  btn.addEventListener('click', async e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (canNative && phone && await native()) return;
    dialog.querySelectorAll('img[data-src]').forEach(img => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
    dialog.showModal();
  });
  dialog.querySelector('[data-share-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
});
document.querySelectorAll('[data-share-page]').forEach(page => wireShare(page, page.dataset));

// Mini-carte : cadrage serré → tuiles détaillées (1:10m) de la zone, lues une fois. Sans ce script, le fond 1:50m reste.
document.querySelectorAll('[data-zoom-map]').forEach(fig => {
  const svg = fig.querySelector('[data-carte-fond]');
  if (!svg) return;
  const [x, y, w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
  if (w > 1000 / 8) return;
  const detail = svg.querySelector('[data-detail]');
  const base = svg.querySelector('[data-base]');
  const index = new URL(svg.dataset.tiles, location.href);
  const dir = new URL('./', index).pathname;
  fetch(index).then(r => r.json()).then(ix => {
    const set = new Set(ix.tiles), need = [];
    for (let i = Math.floor(x / ix.w); i <= Math.floor((x + w) / ix.w); i++) {
      for (let j = Math.floor(y / ix.h); j <= Math.floor((y + h) / ix.h); j++) if (set.has(`${i}-${j}`)) need.push(`${i}-${j}`);
    }
    if (!need.length) return null;
    return Promise.all(need.map(t => fetch(`${dir}${t}.svg${index.search}`).then(r => (r.ok ? r.text() : '')))).then(texts => {
      for (const text of texts) {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        doc.querySelectorAll('path').forEach(p => detail.appendChild(document.importNode(p, true)));
      }
      detail.setAttribute('display', 'inline');
      base.setAttribute('display', 'none');
    });
  }).catch(() => {});
});

// Barre de filtres de la galerie, collante dès 768 px : la page réserve sa hauteur réelle au défilement (scroll-padding-top,
// css/v2/public.css § 17), pour qu'un élément atteint au clavier ne passe jamais dessous. Sans ce script : 106 px.
document.querySelectorAll('[data-filtres]').forEach(barre => {
  const set = () => document.documentElement.style.setProperty('--filtres-h', `${Math.ceil(barre.getBoundingClientRect().height)}px`);
  set();
  addEventListener('resize', set);
});

// Diaporama de l'ouverture (MQ-01) : À L'ARRÊT par défaut, rien ne bouge sans geste. Un point choisit une photo (annoncée
// poliment) ; « Lire » le lance, « Pause » l'arrête ; il attend sous la souris, s'arrête quand le focus entre ailleurs
// que sur son bouton, et ne tourne pas en mouvement réduit. Les photos suivantes viennent de leur <template> au premier
// besoin : seule la première est chargée avec la page.
document.querySelectorAll('[data-ouverture]').forEach(ouv => {
  const cadre = ouv.querySelector('[data-ouv-cadre]');
  const cartel = ouv.querySelector('[data-ouv-cartel]');
  const points = [...ouv.querySelectorAll('[data-ouv-point]')];
  const lire = ouv.querySelector('[data-ouv-lire]');
  if (points.length < 2 || !cadre || !cartel) return;
  const slides = [{ image: [...cadre.childNodes], cartel: [...cartel.childNodes] }];
  document.querySelectorAll('template[data-ouv-diapo]').forEach(tp => { slides[Number(tp.dataset.ouvDiapo)] = tp; });
  const get = i => {
    if (slides[i] instanceof HTMLTemplateElement) {
      const c = document.importNode(slides[i].content, true);
      slides[i] = { image: [...c.querySelector('[data-image]').childNodes], cartel: [...c.querySelector('[data-cartel]').childNodes] };
    }
    return slides[i];
  };
  let cur = 0, timer = null, held = false;
  const show = (i, announce) => {
    cur = (i + points.length) % points.length;
    const s = get(cur);
    cartel.setAttribute('aria-live', announce ? 'polite' : 'off');
    cadre.replaceChildren(...s.image);
    cartel.replaceChildren(...s.cartel);
    points.forEach((b, k) => b.setAttribute('aria-pressed', String(k === cur)));
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const label = () => {
    if (!lire) return;
    lire.querySelector('.ouv-lire').hidden = timer !== null;
    lire.querySelector('.ouv-pause').hidden = timer === null;
  };
  const stop = () => { clearInterval(timer); timer = null; label(); };
  const play = () => {
    if (reduce.matches) return;
    clearInterval(timer);
    timer = setInterval(() => { if (!held && !document.hidden) show(cur + 1, false); }, 6000);
    label();
  };
  points.forEach((b, k) => b.addEventListener('click', () => { stop(); show(k, true); }));
  lire?.addEventListener('click', () => (timer === null ? play() : stop()));
  ouv.addEventListener('mouseenter', () => { held = true; });
  ouv.addEventListener('mouseleave', () => { held = false; });
  ouv.addEventListener('focusin', e => { if (e.target !== lire && timer !== null) stop(); });
  reduce.addEventListener?.('change', () => { if (reduce.matches) stop(); });
});
