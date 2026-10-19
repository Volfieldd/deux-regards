/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Site public v2 : amélioration progressive. Tout marche sans ce script (liens, formulaires POST, <details>, pages
// Partager et Signaler) ; il ajoute le clavier, le glissé, le plein écran, J'aime et Partager sans rechargement ; sur
// l'accueil, la galerie et les séries : le diaporama de l'ouverture (à l'arrêt par défaut), la hauteur de la barre de
// filtres et le retour à la photo quittée ; sur la carte du monde : zoom, déplacement, vignettes réunies, noms des villes.
// Repris de js/site.js (v1) pour ce qui ne change pas (J'aime, Partager, retour à la galerie, tuiles de la carte), sans la
// dissuasion du clic droit (UX-F-34 : une photo s'enregistre, se partage, se zoome comme ailleurs).
document.documentElement.classList.add('js');
(function () {
  document.querySelectorAll('[data-js-only]').forEach(el => { el.hidden = false; });

  // ----- galerie privée (MQ-16) : « Afficher » le mot de passe, une vraie bascule (aria-pressed) ; sans script, absente -----
  document.querySelectorAll('[data-montrer]').forEach(b => {
    const input = document.getElementById(b.getAttribute('aria-controls'));
    if (!input) return;
    b.addEventListener('click', () => {
      const on = input.type === 'password';
      input.type = on ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(on));
      input.focus();
    });
  });

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
      // Un billet des Carnets : la photo dans le texte d'abord (ordre du document), avant sa vignette de la planche.
      const tile = [...document.querySelectorAll('.billet-ouv-photo a, .billet a[href*="/photo/"], .rangees a.vignette')].find(a => decodeURIComponent(new URL(a.href).pathname).endsWith(`/photo/${r.slug}`));
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

// Mini-carte de la visionneuse et carte d'un voyage : cadrage serré → tuiles détaillées (1:10m) de la zone, lues une fois.
// Sans ce script, le fond 1:50m reste.
document.querySelectorAll('[data-zoom-map], [data-trip-map]').forEach(fig => {
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
  // Les photos suivantes : dans l'ouverture (v3, une par appareil), sinon dans la page (v2).
  const tps = ouv.querySelectorAll('template[data-ouv-diapo]');
  (tps.length ? tps : document.querySelectorAll('template[data-ouv-diapo]')).forEach(tp => { slides[Number(tp.dataset.ouvDiapo)] = tp; });
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
    // v3 : la position écrite à l'écran (« 2 / 6 »), lue par les boutons.
    const pos = ouv.querySelector('[data-ouv-pos]');
    if (pos) pos.textContent = `${cur + 1} / ${points.length}`;
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

// Carte du monde (/carte, views/v2/carte.eta). Sans ce script : la carte cadrée par le serveur sur les lieux, chaque vignette
// mène à son lieu dans la liste. Avec lui : zoom (boutons, + et −, pincement, Ctrl + molette), déplacement (glisser, quatre
// boutons, flèches du clavier), « Monde ». Le fond change de viewBox ; les vignettes, en pixels par-dessus, suivent leur
// place en pourcentage et gardent leur taille ; celles qui se chevauchent n'en font qu'une (nombre cumulé, un clic l'agrandit) ;
// une vignette sortie du cadre est retirée (ni vue, ni atteinte au clavier : WCAG 2.4.11) ; le nom d'une ville s'écrit à côté
// de sa vignette quand il a la place (UX-F-25). Repris de js/site.js (v1) pour le zoom, le glisser et les tuiles.
document.querySelectorAll('[data-carte]').forEach(carte => {
  const vue = carte.querySelector('[data-carte-vue]');
  const svg = carte.querySelector('[data-carte-svg]');
  const W = Number(carte.dataset.w), H = Number(carte.dataset.h);
  const [x0, y0, w0] = svg.getAttribute('viewBox').split(' ').map(Number);
  let view = { x: x0, y: y0, w: w0 };
  const R = 16;                                              // rayon d'une vignette, en pixels (views/v2/carte.eta)
  const pins = [...carte.querySelectorAll('[data-pin]')].map(el => ({
    el, x: Number(el.dataset.x), y: Number(el.dataset.y), n: Number(el.dataset.n), name: el.dataset.name,
    label: el.getAttribute('aria-label'), pos: el.querySelector('[data-pin-pos]'), badge: el.querySelector('[data-pin-badge]'),
    count: el.querySelector('[data-pin-count]'), nom: el.querySelector('[data-pin-nom]'),
  })).sort((a, b) => b.n - a.n);
  // Largeur de chaque nom, mesurée une fois (13 px).
  pins.forEach(p => { p.nom.removeAttribute('display'); p.tw = p.nom.getComputedTextLength() || p.name.length * 7.5; p.nom.setAttribute('display', 'none'); });
  const btn = k => carte.querySelector(`[data-carte-zoom="${k}"]`);
  const ZMAX = 40;
  // Fond : le 1:110m pour une vue large, le 1:50m (230 ko) dès que la vue se resserre ; au-delà du zoom × 8, les tuiles
  // 1:10m de la zone visible, lues une fois puis gardées.
  const uses = svg.querySelectorAll('use[data-fine]');
  const setFond = fine => uses.forEach(u => { const h = fine ? u.dataset.fine : u.dataset.gros; if (u.getAttribute('href') !== h) u.setAttribute('href', h); });
  const detail = svg.querySelector('[data-detail]');
  const version = new URL(svg.dataset.tiles, location.href).search;
  const tileBase = new URL('./', new URL(svg.dataset.tiles, location.href)).pathname;
  let tileIndex = null, wanted = 0;
  const tiles = new Map(), done = new Set();
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
  function updateTiles() {
    const deep = view.w <= W / 8 + 0.01;
    const show = on => { detail.setAttribute('display', on ? 'inline' : 'none'); uses.forEach(u => u.setAttribute('display', on ? 'none' : 'inline')); };
    if (!deep) { show(false); return; }
    tileIndex ||= fetch(svg.dataset.tiles).then(r => r.json()).then(j => ({ ...j, set: new Set(j.tiles) })).catch(() => null);
    const ticket = ++wanted;
    tileIndex.then(ix => {
      if (!ix || ticket !== wanted) return;
      const h = (view.w * H) / W, need = [];
      for (let i = Math.floor(view.x / ix.w); i <= Math.floor((view.x + view.w) / ix.w); i++) {
        for (let j = Math.floor(view.y / ix.h); j <= Math.floor((view.y + h) / ix.h); j++) if (ix.set.has(`${i}-${j}`)) need.push(`${i}-${j}`);
      }
      if (need.some(t => !done.has(t))) show(false);
      Promise.all(need.map(loadTile)).then(() => { if (ticket === wanted && view.w <= W / 8 + 0.01) show(true); });
    });
  }
  const clamp = v => {
    const w = Math.min(W, Math.max(W / ZMAX, v.w)), h = (w * H) / W;
    return { w, x: Math.min(W - w, Math.max(0, v.x)), y: Math.min(H - h, Math.max(0, v.y)) };
  };
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  function render() {
    const h = (view.w * H) / W;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${h}`);
    setFond(view.w < W / 2.5);
    const px = vue.clientWidth || W, py = vue.clientHeight || H;
    const k = px / view.w;                                     // pixels par unité de carte
    const taken = new Set(), shown = [];
    const before = document.activeElement;
    for (const p of pins) {
      if (taken.has(p)) continue;
      const group = pins.filter(q => !taken.has(q) && Math.hypot(q.x - p.x, q.y - p.y) * k < 2 * R * 0.9);
      group.forEach(q => { taken.add(q); if (q !== p) q.el.setAttribute('display', 'none'); });
      p.sx = (p.x - view.x) * k; p.sy = (p.y - view.y) * k;
      p.inside = p.sx >= 0 && p.sx <= px && p.sy >= 0 && p.sy <= py;          // le centre dans le cadre
      if (!p.inside) { p.el.setAttribute('display', 'none'); continue; }
      const n = group.reduce((t, q) => t + q.n, 0), others = group.length - 1;
      p.el.removeAttribute('display');
      p.pos.setAttribute('x', `${((p.sx / px) * 100).toFixed(3)}%`);
      p.pos.setAttribute('y', `${((p.sy / py) * 100).toFixed(3)}%`);
      p.count.textContent = n;
      if (n > 1) p.badge.removeAttribute('display'); else p.badge.setAttribute('display', 'none');
      p.group = others ? group : null;
      p.el.setAttribute('aria-label', others
        ? (others > 1 ? carte.dataset.clusterMany : carte.dataset.clusterOne).replace('{name}', p.name).replace('{others}', others).replace('{n}', n)
        : p.label);
      shown.push(p);
    }
    // Noms des villes : à droite de la vignette, sinon à gauche, s'ils ne touchent ni une autre vignette, ni un autre nom,
    // ni le bord du cadre. Une vignette qui en réunit plusieurs ne porte pas de nom (son nom lu dit lesquelles).
    const boxes = shown.map(p => ({ x: p.sx - R, y: p.sy - R, w: 2 * R + 12, h: 2 * R + 12 }));
    for (const p of shown) {
      p.nom.setAttribute('display', 'none');
      if (p.group) continue;
      for (const side of [1, -1]) {
        const b = { x: side > 0 ? p.sx + R + 4 : p.sx - R - 4 - p.tw, y: p.sy - 9, w: p.tw, h: 18 };
        if (b.x < 4 || b.x + b.w > px - 4 || b.y < 2 || b.y + b.h > py - 2) continue;
        if (boxes.some((o, i) => shown[i] !== p && hit(o, b))) continue;
        p.nom.setAttribute('x', side > 0 ? R + 6 : -R - 6);
        p.nom.setAttribute('text-anchor', side > 0 ? 'start' : 'end');
        p.nom.removeAttribute('display');
        boxes.push(b);
        break;
      }
    }
    const zoomed = view.w < W - 0.5;
    updateTiles();
    vue.classList.toggle('zoomed', zoomed);
    btn('out').disabled = !zoomed;
    btn('reset').disabled = !zoomed;
    btn('in').disabled = view.w <= W / ZMAX + 0.01;
    // Le focus était sur une vignette sortie du cadre (ou réunie à une autre) : il revient au cadre de la carte.
    if (before?.matches?.('[data-pin]') && before.getAttribute('display') === 'none') carte.querySelector('[data-carte-pan]')?.focus();
    // Une commande désactivée par son propre effet (« Monde », zoom au plus loin) ne garde pas le focus : il passe à l'autre zoom.
    if (before?.matches?.('[data-carte-zoom]') && before.disabled) (btn('in').disabled ? btn('out') : btn('in')).focus();
  }
  function zoomAt(f, ux, uy) {
    const w = Math.min(W, Math.max(W / ZMAX, view.w / f)), r = w / view.w;
    view = clamp({ w, x: ux - (ux - view.x) * r, y: uy - (uy - view.y) * r });
    render();
  }
  const toMap = (cx, cy) => { const r = vue.getBoundingClientRect(); return [view.x + ((cx - r.left) * view.w) / r.width, view.y + ((cy - r.top) * view.w) / r.width]; };
  const centre = () => [view.x + view.w / 2, view.y + (view.w * H) / W / 2];
  const pan = (dx, dy) => { view = clamp({ ...view, x: view.x + dx * view.w * 0.25, y: view.y + dy * ((view.w * H) / W) * 0.25 }); render(); };
  const DIR = { w: [-1, 0], e: [1, 0], n: [0, -1], s: [0, 1] };
  carte.addEventListener('click', e => {
    const z = e.target.closest('[data-carte-zoom]'), m = e.target.closest('[data-carte-pan]');
    if (m) pan(...DIR[m.dataset.cartePan]);
    if (!z) return;
    if (z.dataset.carteZoom === 'reset') { view = { x: 0, y: 0, w: W }; render(); } else zoomAt(z.dataset.carteZoom === 'in' ? 2 : 0.5, ...centre());
  });
  // Clavier, le focus sur une vignette ou une commande de la carte : flèches pour se déplacer, + et − pour zoomer.
  const KEYS = { ArrowLeft: 'w', ArrowRight: 'e', ArrowUp: 'n', ArrowDown: 's' };
  carte.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (KEYS[e.key]) { e.preventDefault(); pan(...DIR[KEYS[e.key]]); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(2, ...centre()); }
    else if (e.key === '-' || e.key === '−') { e.preventDefault(); zoomAt(0.5, ...centre()); }
  });
  // Vignette réunie : agrandit jusqu'à séparer les lieux ; sinon, le lieu dans la liste.
  let moved = false;
  vue.addEventListener('click', e => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
    const el = e.target.closest('[data-pin]'), p = el && pins.find(q => q.el === el);
    if (!p?.group) return;
    e.preventDefault();
    const xs = p.group.map(q => q.x), ys = p.group.map(q => q.y);
    const spanW = Math.max(Math.max(...xs) - Math.min(...xs), ((Math.max(...ys) - Math.min(...ys)) * W) / H);
    const d = Math.min(...p.group.flatMap((a, i) => p.group.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y))));
    const px = vue.clientWidth || W;
    const w = Math.max(W / ZMAX, spanW * 1.3, Math.min(view.w / 2, (d * px) / (R * 2 + 8)));
    view = clamp({ w, x: (Math.min(...xs) + Math.max(...xs)) / 2 - w / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 - (w * H) / W / 2 });
    render();
  }, true);
  vue.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.01), ...toMap(e.clientX, e.clientY)); }, { passive: false });
  // Glisser (carte agrandie) et pincement à deux doigts.
  const pts = new Map();
  let last = null;
  const gesture = () => { const [a, b] = [...pts.values()]; return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) } : { x: a.x, y: a.y, d: 0 }; };
  vue.addEventListener('pointerdown', e => { if (e.button !== 0 || pts.size >= 2) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = gesture(); moved = false; });
  vue.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture();
    if (pts.size === 1 && view.w >= W - 0.5) { last = g; return; }     // monde entier : rien à déplacer
    if (!moved && Math.hypot(g.x - last.x, g.y - last.y) < 4 && Math.abs(g.d - last.d) < 4) return;
    if (!moved) { moved = true; vue.classList.add('dragging'); try { vue.setPointerCapture(e.pointerId); } catch { /* déjà relâché */ } }
    const k = view.w / vue.getBoundingClientRect().width;
    view = clamp({ ...view, x: view.x - (g.x - last.x) * k, y: view.y - (g.y - last.y) * k });
    if (pts.size === 2 && last.d > 0 && g.d > 0) zoomAt(g.d / last.d, ...toMap(g.x, g.y)); else render();
    last = g;
  });
  const up = e => { if (!pts.delete(e.pointerId)) return; vue.classList.remove('dragging'); last = pts.size ? gesture() : null; if (moved && e.type === 'pointercancel') moved = false; };
  vue.addEventListener('pointerup', up);
  vue.addEventListener('pointercancel', up);
  addEventListener('resize', render);
  render();
});
