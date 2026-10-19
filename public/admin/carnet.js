/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Éditeur d'un billet des Carnets (maquette MQ-20 ; étude B28 à B40), par amélioration progressive : sans ce script, le
// formulaire classique marche (« Enregistrer et voir l'aperçu », photos à cocher). Avec lui :
//   - barre de mise en forme en vrais boutons, raccourcis avec une touche de modification (Ctrl/Cmd + B, I, K, S) ;
//   - enregistrement automatique dans le brouillon (2 s après la dernière frappe, au moins toutes les 30 s), jamais dans le
//     billet en ligne ; copie sur l'appareil seulement si l'envoi échoue, effacée dès que le serveur a enregistré (B31, B32) ;
//   - aperçu à côté, rendu par le serveur (une demande toutes les 1,5 s au plus, B28) ; Écrire / Aperçu au téléphone ;
//   - compteurs de signes, de mots et de minutes de lecture (B40) ;
//   - sélecteur de photos en <dialog> : recherche, une photo donne une figure, plusieurs une paire ou une galerie (B30).
// Les messages d'état passent par role="status" (B35). Les textes viennent de la page (attributs data-t-*), dans la langue
// de l'admin.
(function () {
  const root = document.querySelector('[data-editeur]');
  const form = document.getElementById('billet');
  const CSRF = document.body.dataset.csrf;
  const post = async (url, body) => {
    const res = await fetch(url, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, accept: 'application/json' }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch { /* vide */ }
    if (!res.ok) throw Object.assign(new Error(data.error || String(res.status)), { status: res.status });
    return data;
  };

  // « Reprendre la suggestion » (texte de remplacement proposé, à relire) : recopiée dans le champ, jamais enregistrée seule.
  document.querySelectorAll('[data-reprendre]').forEach(b => b.addEventListener('click', () => {
    const field = document.getElementById(b.dataset.cible);
    if (!field) return;
    field.value = b.dataset.reprendre;
    field.removeAttribute('aria-invalid');
    field.focus();
  }));
  if (!root || !form) return;

  const id = root.dataset.id;
  const lang = root.dataset.langue;
  const T = root.dataset;
  const area = document.getElementById('texte');
  const status = document.querySelector('[data-enreg]');
  const words = document.querySelector('[data-mots]');
  const box = document.querySelector('[data-apercu]');
  const key = `carnet-${id}-${lang}`;
  const fields = () => Object.fromEntries([...form.querySelectorAll('[data-champ]'), ...document.querySelectorAll('[form="billet"][name="mention"], [form="billet"][name="reply"]')]
    .map(el => [el.dataset.champ || el.name, el.value]));
  const say = (text, ok = true) => { if (!status) return; status.classList.toggle('enreg--ok', ok); status.classList.toggle('enreg--attente', !ok); status.lastChild.textContent = text; };

  // ----- compteurs -----
  const counters = [['titre', 'title'], ['chapo', 'dek']].map(([c, f]) => [document.querySelector(`[data-compte="${c}"]`), form.querySelector(`[data-champ="${f}"]`)]);
  const count = () => counters.forEach(([out, el]) => { if (!out || !el) return; out.textContent = `${el.value.length} / ${out.dataset.max}`; out.classList.toggle('trop', el.value.length > Number(out.dataset.max)); });

  // ----- enregistrement automatique -----
  let timer = null, lastSave = 0, pending = false, sending = false;
  async function save() {
    clearTimeout(timer);
    if (sending) { pending = true; return; }
    sending = true; pending = false;
    say(T.tSaving, false);
    try {
      const r = await post(`/admin/carnet/${id}/brouillon`, { langue: lang, ...fields() });
      lastSave = Date.now();
      localStorage.removeItem(key);
      say(T.tSaved.replace('{time}', r.time));
    } catch (err) {
      // Réseau coupé, session expirée : une copie sur cet appareil, jusqu'au prochain envoi réussi.
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data: fields() })); } catch { /* stockage plein */ }
      say(err.status === 401 || err.status === 0 ? T.tSession : T.tFailed, false);
    } finally {
      sending = false;
      if (pending) schedule();
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(save, Date.now() - lastSave > 30000 && lastSave ? 0 : 2000); };
  // Copie laissée par un envoi raté : proposée à la réouverture, jamais appliquée seule.
  try {
    const kept = JSON.parse(localStorage.getItem(key) || 'null');
    if (kept && kept.data && T.tKept && window.confirm(T.tKept)) {
      for (const [k, v] of Object.entries(kept.data)) { const el = form.querySelector(`[data-champ="${k}"]`) || document.querySelector(`[form="billet"][name="${k}"]`); if (el && !el.readOnly) el.value = v; }
      schedule();
    } else if (kept) localStorage.removeItem(key);
  } catch { /* copie illisible : ignorée */ }

  // ----- aperçu -----
  let pTimer = null, pLast = 0;
  async function preview() {
    pLast = Date.now();
    try {
      const r = await post(`/admin/carnet/${id}/apercu`, { langue: lang, body: area.value });
      if (box) box.innerHTML = r.html;          // HTML rendu par le serveur (server/carnet-markdown.js), le même que le site
      if (words) words.textContent = `${T[r.words > 1 ? 'tWords' : 'tWord'].replace('{n}', r.words)}\u00a0· ${T.tMinutes.replace('{n}', r.minutes)}`;
    } catch { /* l'aperçu reprendra à la frappe suivante */ }
  }
  const schedulePreview = () => { clearTimeout(pTimer); pTimer = setTimeout(preview, Math.max(0, 1500 - (Date.now() - pLast))); };

  form.addEventListener('input', e => { if (e.target.dataset?.champ) { count(); if (!e.target.readOnly) schedule(); if (e.target === area) schedulePreview(); } });
  document.querySelectorAll('[form="billet"][name="mention"], [form="billet"][name="reply"]').forEach(el => el.addEventListener('input', schedule));
  // Envoi du formulaire : la copie de l'appareil n'a plus lieu d'être ; plus d'enregistrement automatique en route.
  form.addEventListener('submit', () => { clearTimeout(timer); localStorage.removeItem(key); });

  // ----- barre de mise en forme -----
  // L'insertion passe par execCommand('insertText') quand il existe : l'annulation du navigateur (Ctrl+Z) la défait.
  function replace(start, end, text, selStart = null, selEnd = null) {
    area.focus();
    area.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) area.setRangeText(text, start, end, 'end');
    if (selStart != null) area.setSelectionRange(start + selStart, start + (selEnd ?? selStart));
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const wrap = (before, after = before, placeholder = '') => {
    const { selectionStart: a, selectionEnd: b, value } = area;
    const inner = value.slice(a, b) || placeholder;
    replace(a, b, `${before}${inner}${after}`, before.length, before.length + inner.length);
  };
  const linePrefix = prefix => {
    const { selectionStart: a, selectionEnd: b, value } = area;
    const start = value.lastIndexOf('\n', a - 1) + 1;
    const end = value.indexOf('\n', b); const stop = end === -1 ? value.length : end;
    const block = value.slice(start, stop).split('\n').map(l => (l.startsWith(prefix) ? l : `${prefix}${l}`)).join('\n');
    replace(start, stop, block, block.length);
  };
  // Une ligne seule, entourée de lignes vides (une photo, une galerie).
  const ownLines = text => {
    const { selectionStart: a, selectionEnd: b, value } = area;
    const before = value.slice(0, a), after = value.slice(b);
    const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const tail = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    replace(a, b, `${lead}${text}${tail}`, lead.length + text.length);
  };
  const TOOLS = {
    titre: () => linePrefix('## '), gras: () => wrap('**', '**', T.tBold || 'texte'), italique: () => wrap('*', '*', T.tItalic || 'texte'),
    lien: () => { const { selectionStart: a, selectionEnd: b, value } = area; const inner = value.slice(a, b) || T.tLinkText || 'texte'; replace(a, b, `[${inner}](https://)`, inner.length + 3, inner.length + 11); },
    citation: () => linePrefix('> '), liste: () => linePrefix('- '),
    photo: () => pick('photo'), galerie: () => pick('galerie'), interne: () => pick('interne'),
  };
  document.querySelectorAll('[data-outil]').forEach(b => b.addEventListener('click', () => TOOLS[b.dataset.outil]?.()));
  area.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const act = { b: 'gras', i: 'italique', k: 'lien' }[k];
    if (act) { e.preventDefault(); e.stopPropagation(); TOOLS[act](); }
    else if (k === 's') { e.preventDefault(); e.stopPropagation(); save(); }
  });

  // ----- sélecteur de photos -----
  const dlg = document.querySelector('[data-choix-photos]');
  let catalog = null, mode = 'photo', caret = [0, 0];
  async function pick(m) {
    if (!dlg?.showModal) return;
    mode = m; caret = [area.selectionStart, area.selectionEnd];
    const title = dlg.querySelector('[data-choix-titre]');
    title.textContent = title.dataset[m] || title.textContent;
    if (!catalog) { try { const r = await fetch(`/admin/carnet/${id}/photos.json`, { headers: { accept: 'application/json' } }); catalog = r.ok ? await r.json() : []; } catch { catalog = []; } }
    const q = dlg.querySelector('[data-choix-q]');
    q.value = '';
    list('');
    dlg.showModal();
    q.focus();
  }
  const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function list(q) {
    const ul = dlg.querySelector('[data-choix-liste]');
    const type = mode === 'galerie' ? 'checkbox' : 'radio';
    const words = fold(q).split(/\s+/).filter(Boolean);
    const shown = catalog.filter(p => words.every(w => fold(`${p.title} ${p.place || ''} ${p.slug}`).includes(w))).slice(0, 120);
    ul.replaceChildren(...shown.map(p => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const input = Object.assign(document.createElement('input'), { type, name: 'choix', value: p.slug });
      const img = Object.assign(document.createElement('img'), { src: p.thumb, alt: '', loading: 'lazy', width: 120, height: 80 });
      const span = document.createElement('span');
      span.textContent = p.published ? p.title : `${p.title} · ${T.tDraft || ''}`;
      label.append(input, img, span);
      li.append(label);
      return li;
    }));
  }
  if (dlg) {
    dlg.querySelector('[data-choix-q]').addEventListener('input', e => list(e.target.value));
    dlg.addEventListener('close', () => {
      const chosen = [...dlg.querySelectorAll('input[name="choix"]:checked')].map(i => i.value);
      area.focus();
      area.setSelectionRange(caret[0], caret[1]);
      if (dlg.returnValue === 'ok' && chosen.length) {
        if (mode === 'interne') {
          const p = catalog.find(x => x.slug === chosen[0]);
          const { selectionStart: a, selectionEnd: b, value } = area;
          const inner = value.slice(a, b) || p?.title || chosen[0];
          replace(a, b, `[${inner}](photo:${chosen[0]})`, 1, 1 + inner.length);
        } else ownLines(chosen.map(s => `photo:${s}`).join('\n'));
      }
      // Le focus revient au point d'insertion (B30), que l'on ait inséré ou annulé.
    });
  }

  // ----- Écrire / Aperçu (téléphone) -----
  document.querySelectorAll('[data-vue-lien]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    root.dataset.vue = a.dataset.vueLien;
    document.querySelectorAll('[data-vue-lien]').forEach(x => (x === a ? x.setAttribute('aria-current', 'page') : x.removeAttribute('aria-current')));
    if (a.dataset.vueLien === 'apercu') { preview(); document.getElementById('apercu')?.focus(); } else area.focus();
  }));

  // ----- publication : le libellé suit le choix (MQ-20, repère 11) -----
  const pub = document.querySelector('[data-publier]');
  if (pub) {
    const btn = pub.querySelector('[data-publier-bouton]');
    const sync = () => { const v = pub.querySelector('input[name="quand"]:checked')?.value; btn.textContent = v === 'programmer' ? btn.dataset.programmer : btn.dataset.maintenant; };
    pub.addEventListener('change', sync);
    pub.querySelector('#quand')?.addEventListener('input', () => { const r = pub.querySelector('input[value="programmer"]'); if (r && !r.checked) { r.checked = true; sync(); } });
    sync();
  }
  count();
})();
