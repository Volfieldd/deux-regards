/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Admin v2, vague 4 « suivi et aide » : Circuit de publication, Aide, Nouveautés. Amélioration progressive : sans ce
// script, le circuit s'enregistre par son bouton (la route de la v1), l'aide se lit par son sommaire, les mois des
// Nouveautés s'ouvrent à la main. Avec lui, un interrupteur du circuit s'enregistre au geste avec « Défaire » 10 s (MQ-00
// § 5 et 6, MQ-09) ; l'aide cherche dans ses passages et surligne le mot (UX-A-22) ; une ancre vers une version repliée
// ouvre son mois. Le serveur reste seul juge (droit circuit.regler, jeton, journal « circuit réglé », Vigie).
// Chargé après admin-v2.js, dont il reprend les outils ($, $$, T, Th, esc, post, toast, temoin).

// ----- Circuit : un interrupteur basculé envoie le formulaire entier (POST /admin/circuit/:id, réponse JSON) -----
$$('form[data-circuit]').forEach(form => {
  const nom = form.dataset.nom;
  const boxes = $$('input[role="switch"]', form);
  let chain = Promise.resolve();
  const queue = fn => (chain = chain.then(fn, fn));
  const etat = () => Object.fromEntries(boxes.map(b => [b.name, b.checked]));
  const poser = st => boxes.forEach(b => { b.checked = Boolean(st[b.name]); });
  const corps = st => Object.fromEntries(Object.entries(st).filter(([, on]) => on).map(([k]) => [k, '1']));
  const libelle = b => $(`#${b.getAttribute('aria-labelledby')}`)?.textContent.trim() || b.name;
  let saved = etat();
  form.addEventListener('submit', e => { if (!e.submitter || !e.submitter.closest('.sans-script')) e.preventDefault(); });
  const envoyer = (st, box, undoing = false) => queue(async () => {
    const before = saved;
    try {
      const r = await post(form.action, corps(st));
      saved = r.circuit ? { publier: r.circuit.publier, modifier: r.circuit.modifier, instagram: r.circuit.instagram } : st;
      poser(saved);
      temoin.ok(box);
      const msg = Th(undoing ? '« {nom} » rétabli : {reglage} · {valeur}' : '« {nom} » : {reglage} · {valeur}', { nom, reglage: libelle(box), valeur: box.checked ? T('Oui') : T('Non') });
      if (undoing) { toast.show(msg); box.focus(); return; }
      toast.show(msg, { undo: async () => { poser(before); await envoyer(before, box, true); } });
    } catch (err) {
      poser(saved);
      toast.show(esc(err.message), { error: true, retry: err.kind === 'reseau' || err.kind === 'session' ? () => { poser(st); return envoyer(st, box, undoing); } : null });
    }
  });
  boxes.forEach(b => b.addEventListener('change', () => envoyer(etat(), b)));
});

// ----- Aide : recherche dans les passages (titre de rubrique › sous-titre, extrait au mot surligné, lien direct) -----
(function () {
  const form = $('[data-aide-cherche]');
  if (!form) return;
  const input = $('input[type="search"]', form);
  const list = $('[data-aide-resultats]', form);
  const status = $('[data-aide-statut]', form);
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Passages : un par sous-titre de chaque rubrique (le texte qui suit le titre jusqu'au suivant).
  const passages = [];
  $$('[data-help-section]').forEach(sec => {
    const titre = $('h2', sec)?.textContent.trim() || '';
    let cur = { id: sec.id, titre, sous: '', nodes: [] };
    passages.push(cur);
    [...sec.children].forEach(el => {
      if (el.matches('h2, .aide-haut')) return;
      if (el.matches('h3[id]')) { cur = { id: el.id, titre, sous: el.textContent.trim(), nodes: [el] }; passages.push(cur); return; }
      cur.nodes.push(el);
    });
  });
  passages.forEach(p => { p.text = p.nodes.map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim(); p.n = norm(p.text); });
  // Le mot surligné dans la page (CSS Custom Highlight ; sans lui, rien n'est surligné et rien ne casse).
  const surligner = q => {
    if (!window.CSS?.highlights || typeof Highlight === 'undefined') return;
    CSS.highlights.delete('aide');
    if (!q) return;
    const ranges = [];
    $$('[data-help-section]').forEach(sec => {
      const walk = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const s = norm(n.nodeValue);
        if (s.length !== n.nodeValue.length) continue;          // (une lettre décomposée décalerait les positions)
        for (let i = s.indexOf(q); i !== -1 && ranges.length < 500; i = s.indexOf(q, i + q.length)) { const r = new Range(); r.setStart(n, i); r.setEnd(n, i + q.length); ranges.push(r); }
      }
    });
    CSS.highlights.set('aide', new Highlight(...ranges));
  };
  const extrait = (p, q) => {
    const i = p.n.indexOf(q);
    const a = Math.max(0, i - 70), b = Math.min(p.text.length, i + q.length + 90);
    return (a ? '…' : '') + esc(p.text.slice(a, i)) + '<mark>' + esc(p.text.slice(i, i + q.length)) + '</mark>' + esc(p.text.slice(i + q.length, b)) + (b < p.text.length ? '…' : '');
  };
  let timer = null;
  const chercher = () => {
    const raw = input.value.trim();
    const q = norm(raw);
    surligner(q.length >= 2 ? q : '');
    if (q.length < 2) { list.hidden = true; list.replaceChildren(); status.textContent = raw ? T('Tapez au moins deux lettres.') : ''; return; }
    const found = passages.filter(p => p.n.includes(q));
    list.innerHTML = found.slice(0, 30).map(p => `<li><a href="#${esc(p.id)}"><span class="aide-r-t">${esc(p.titre)}${p.sous ? ` › ${esc(p.sous)}` : ''}</span><span class="aide-r-x">${extrait(p, q)}</span></a></li>`).join('');
    list.hidden = !found.length;
    status.textContent = found.length ? T(found.length > 1 ? '{n} passages contiennent « {q} ».' : '{n} passage contient « {q} ».', { n: found.length, q: raw }) + (found.length > 30 ? ` ${T('Les 30 premiers sont listés.')}` : '')
      : T('Aucun passage ne contient « {q} ». Essayez un autre mot, ou parcourez le sommaire.', { q: raw });
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(chercher, 150); });
  // Entrée : la liste à jour, et le focus sur le premier passage trouvé.
  input.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); clearTimeout(timer); chercher(); $('a', list)?.focus(); });
  // Un résultat suivi : le focus va au titre visé (les titres ne sont pas focalisables d'eux-mêmes).
  list.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);               // (a.hash est encodé : « é » y devient %C3%A9)
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    history.replaceState(null, '', a.hash);
    const h = el.matches('section') ? $('h2', el) : el;
    h.setAttribute('tabindex', '-1');
    h.scrollIntoView({ block: 'start' });
    h.focus({ preventScroll: true });
  });
})();

// ----- Nouveautés : une ancre vers une version d'un mois replié ouvre ce mois -----
(function () {
  const months = $$('details[data-nv-mois]');
  if (!months.length) return;
  const ouvrir = () => {
    if (!location.hash) return;
    let el = null;
    try { el = document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch { return; }
    const d = el?.closest('details[data-nv-mois]');
    if (d && !d.open) { d.open = true; el.scrollIntoView({ block: 'start' }); }
  };
  ouvrir();
  window.addEventListener('hashchange', ouvrir);
})();
