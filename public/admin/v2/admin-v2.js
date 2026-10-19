// Admin v2 (maquettes MQ-07 à MQ-10 de l'audit d'ergonomie du 16 oct. 2026) : amélioration progressive. Tout marche sans
// ce script (formulaires POST et jeton, liens, :target, :has()) ; avec lui, ce qui se défait s'enregistre au geste et le
// message d'action propose « Défaire » (MQ-00 § 5 et 6), un champ refusé se dit sous lui et dans le témoin de l'en-tête,
// et rien ne se perd en quittant la page (MQ-09). Le serveur reste seul juge (droits, jeton, validations).
document.documentElement.classList.add('js');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const CSRF = document.body.dataset.csrf;
const GRANTS = new Set((document.body.dataset.can || '').split(' ').filter(Boolean));
const can = perm => GRANTS.has(perm);
const LANG = ['en', 'de'].includes(document.documentElement.lang) ? document.documentElement.lang : 'fr';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ----- textes : traduits par le serveur (views/admin/v2/_textes.eta), la clé est le texte français -----
// Un écran peut ajouter ses propres textes (#v2-textes-page, la fiche d'une photo, la photothèque) : réunis ici.
const DATA = (() => {
  const read = sel => { try { return JSON.parse($(sel)?.textContent || '{}'); } catch { return {}; } };
  const all = read('#v2-textes'), page = read('#v2-textes-page');
  return { ...all, ...page, t: { ...(all.t || {}), ...(page.t || {}) } };
})();
function T(key, params) {
  let s = DATA.t?.[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? String(params[k]) : m));
  return s;
}
// Le même texte en HTML, chaque valeur en gras (un nom de champ, de photo, d'assistant), le reste échappé.
const Th = (key, params) => esc(T(key)).replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? `<b>${esc(params[k])}</b>` : m));
// Heure de Paris : « 22 h 40 » en français, « 22:40 » sinon (comme le serveur).
const hour = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return LANG === 'fr' ? `${Number(p.hour)} h ${p.minute}` : `${p.hour}:${p.minute}`;
};
const ICONS = {
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  alerte: '<path d="M12 3.8L2.8 20h18.4z"/><path d="M12 10v4.6M12 17.4v.2"/>',
};
const icon = (k, s = 14) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[k]}</svg>`;

// ----- échanges avec le serveur : JSON, jeton dans l'en-tête ; l'erreur dit si c'est le réseau ou la session -----
class Refus extends Error {
  constructor(message, { status = 0, data = {}, kind = 'http' } = {}) { super(message); this.status = status; this.data = data; this.kind = kind; }
}
async function post(url, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', redirect: 'manual', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, accept: 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Refus(T('Réseau coupé : rien n’est enregistré. Réessayez quand le réseau revient.'), { kind: 'reseau' });
  }
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide ou HTML */ }
  // Session expirée : une redirection vers la connexion (réponse opaque, status 0), ou un refus du jeton (403).
  if (res.type === 'opaqueredirect' || res.status === 0 || res.status === 401 || (res.status === 403 && /CSRF/i.test(data.error || ''))) {
    throw new Refus(T('Session expirée : reconnectez-vous dans un nouvel onglet, puis réessayez ici.'), { status: res.status, kind: 'session' });
  }
  if (!res.ok) {
    const first = data.errors && Object.values(data.errors)[0];
    throw new Refus(data.error || first || T('Erreur {status}', { status: res.status }), { status: res.status, data });
  }
  return data;
}

// ----- liste déroulante qui agit (comme la v1) : au pointeur dès le choix ; au clavier, les flèches ne déclenchent rien
// (WCAG 3.2.2), Entrée ou la sortie de la liste appliquent -----
function onPick(select, act) {
  let pointer = false;
  let start = select.value;
  const fire = () => { start = select.value; act(); };
  select.addEventListener('focus', () => { start = select.value; });
  select.addEventListener('pointerdown', () => { pointer = true; });
  select.addEventListener('keydown', e => { pointer = false; if (e.key === 'Enter' && select.value !== start) { e.preventDefault(); fire(); } });
  select.addEventListener('change', () => { if (pointer && select.value !== start) fire(); });
  select.addEventListener('blur', () => { pointer = false; if (select.value !== start) fire(); });
}

// ----- message d'action (MQ-00 § 6) : « Objet verbe. · Défaire », 10 s, en pause au survol et au focus ; une erreur reste
// jusqu'à « Réessayer » ou « Fermer » (role="alert"). Le focus qui était dans le message revient où il était. -----
const toast = (() => {
  const box = $('[data-toast]');
  let timer = null, left = 0, started = 0, before = null, onEnd = null;
  const restore = () => { if (box?.contains(document.activeElement)) (before && document.contains(before) ? before : $('#contenu'))?.focus({ preventScroll: true }); };
  const hide = () => { clearTimeout(timer); restore(); box?.replaceChildren(); box?.classList.remove('error', 'pause'); onEnd?.(); onEnd = null; };
  const arm = () => { clearTimeout(timer); started = Date.now(); timer = setTimeout(hide, left); box.classList.remove('pause'); };
  const pause = () => { if (!timer) return; clearTimeout(timer); timer = null; left = Math.max(800, left - (Date.now() - started)); box.classList.add('pause'); };
  if (box) {
    box.addEventListener('mouseenter', pause);
    box.addEventListener('focusin', pause);
    box.addEventListener('mouseleave', () => { if (box.firstChild && !box.contains(document.activeElement) && !box.classList.contains('error')) arm(); });
    box.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget) && box.firstChild && !box.matches(':hover') && !box.classList.contains('error')) arm(); });
  }
  // html : le message déjà échappé (un nom en gras). undo / retry : fonctions async.
  function show(html, { undo = null, retry = null, error = false, focus = false, ended = null } = {}) {
    if (!box) return;
    clearTimeout(timer); timer = null;
    if (!box.contains(document.activeElement)) before = document.activeElement;
    restore();
    onEnd?.(); onEnd = ended;
    box.replaceChildren();
    box.classList.toggle('error', error);
    box.classList.remove('pause');
    // Une erreur s'annonce tout de suite (role="alert" sur son contenu), un message ordinaire poliment (la région du layout).
    const inner = document.createElement('div');
    inner.className = 'toast-in';
    if (error) inner.setAttribute('role', 'alert');
    inner.innerHTML = `<p>${html}</p>`;
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (err) { show(esc(T('Défaire impossible : {msg}', { msg: err.message })), { error: true }); } });
      inner.append(b);
      return b;
    };
    let first = null;
    if (undo) first = add(T('Défaire'), undo);
    if (retry) first = add(T('Réessayer'), async () => { hide(); await retry(); });
    if (error && !retry) first = add(T('Fermer'), async () => hide());
    if (undo && !error) { const bar = document.createElement('span'); bar.className = 'toast-temps'; bar.setAttribute('aria-hidden', 'true'); inner.append(bar); }
    // Le contenu est écrit au tour suivant : vidée puis remplie, la région live est annoncée.
    setTimeout(() => {
      box.append(inner);
      if (focus && first) first.focus();
      if (!error) { left = undo ? 10000 : 6000; if (box.matches(':hover') || box.contains(document.activeElement)) { box.classList.add('pause'); } else arm(); }
    }, 30);
  }
  return { show, hide };
})();

// ----- témoin d'enregistrement (MQ-00 § 5) : dans la méta de l'en-tête, « Enregistré à 22 h 40 », ou « 1 champ non
// enregistré : date », un lien vers le champ refusé -----
const temoin = (() => {
  const box = $('[data-temoin]');
  const pending = new Map();            // champ → libellé
  let saved = null;
  function render() {
    if (!box) return;
    if (pending.size) {
      const [first] = pending.keys();
      const labels = [...pending.values()].join(', ');
      box.innerHTML = `<a class="enreg enreg--attente" href="#${esc(first.id)}">${icon('alerte')}${esc(T(pending.size > 1 ? '{n} champs non enregistrés : {champs}' : '{n} champ non enregistré : {champs}', { n: pending.size, champs: labels }))}</a>`;
    } else if (saved) {
      box.innerHTML = `<span class="enreg enreg--ok">${icon('coche')}${esc(T('Enregistré à {h}', { h: saved }))}</span>`;
    }
  }
  box?.addEventListener('click', e => { const a = e.target.closest('a[href^="#"]'); if (!a) return; const f = document.getElementById(a.hash.slice(1)); if (f) { e.preventDefault(); f.focus(); } });
  return {
    ok(field) { pending.delete(field); saved = hour(); render(); },
    ko(field, label) { pending.set(field, label); render(); },
    // Le champ n'attend plus rien (suggestion retirée) : il quitte le témoin sans « Enregistré à… ».
    drop(field) { pending.delete(field); if (!pending.size && box) box.replaceChildren(); render(); },
    pending: () => [...pending.values()],
    any: () => pending.size > 0,
  };
})();

// ----- champ en erreur : le message sous le champ (p.err[data-err-for]), relié par aria-describedby -----
function fieldError(field, message) {
  const id = `err-${field.id || field.name}`;
  let p = document.getElementById(id);
  if (!message) {
    field.removeAttribute('aria-invalid');
    if (p) p.hidden = true;
    const by = (field.getAttribute('aria-describedby') || '').split(' ').filter(x => x && x !== id).join(' ');
    if (by) field.setAttribute('aria-describedby', by); else field.removeAttribute('aria-describedby');
    field.closest('tr')?.nextElementSibling?.matches('.err-ligne[data-auto]') && field.closest('tr').nextElementSibling.remove();
    return;
  }
  field.setAttribute('aria-invalid', 'true');
  if (!p) {
    p = document.createElement('p');
    p.className = 'err';
    p.id = id;
    // Dans un tableau (le lot), l'erreur prend toute la largeur, sous la ligne de la photo (MQ-08, repère 10).
    const row = field.closest('tr');
    if (row && row.closest('table.lot')) {
      const tr = document.createElement('tr');
      tr.className = 'err-ligne';
      tr.dataset.auto = '';
      const td = document.createElement('td');
      td.colSpan = row.children.length;
      td.append(p);
      tr.append(td);
      row.after(tr);
    } else (field.closest('.champ-a, .cell, label') || field).after(p);
  }
  p.hidden = false;
  p.innerHTML = `${icon('alerte')}<span>${esc(message)}</span>`;
  const by = new Set((field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
  by.add(id);
  field.setAttribute('aria-describedby', [...by].join(' '));
}

// ----- enregistrement au champ quitté (MQ-00 § 5, MQ-08, MQ-09) -----
// <form data-autosave data-url="…">, ou une ligne <tr data-url="…"> ; chaque champ [data-champ="clé"] avec data-label (son
// nom dans le témoin et le message). Réponse du serveur : { photo } (champs tels qu'enregistrés) ou { errors } (422).
function autosave(scope) {
  $$('[data-champ]', scope).forEach(field => {
    const holder = field.closest('[data-url]');
    if (!holder) return;
    const key = field.dataset.champ;
    const label = () => field.dataset.label || key;
    const valueOf = () => (field.type === 'checkbox' ? (field.checked ? 'on' : '') : field.value);
    const setValue = v => { if (field.type === 'checkbox') field.checked = v === 'on'; else field.value = v; };
    field.dataset.saved = valueOf();
    async function save(value, previous, { undoing = false } = {}) {
      const state = holder.querySelector('[data-etat-ligne]');
      if (state) state.innerHTML = `<span class="enreg">${icon('horloge')}${esc(T('Enregistrement…'))}</span>`;
      try {
        const r = await post(holder.dataset.url, { [key]: value });
        field.dataset.saved = value;
        fieldError(field, '');
        temoin.ok(field);
        if (state) state.innerHTML = `<span class="enreg enreg--ok">${icon('coche')}${esc(T('Enregistré à {h}', { h: hour() }))}</span>`;
        holder.dispatchEvent(new CustomEvent('enregistre', { detail: { key, value, photo: r.photo } }));
        const what = holder.dataset.objet ? T('« {champ} » de « {photo} »', { champ: label(), photo: holder.dataset.objet }) : label();
        if (undoing) { toast.show(Th('« {champ} » rétabli.', { champ: what })); field.focus(); return; }
        toast.show(Th('« {champ} » enregistré.', { champ: what }), previous === undefined ? {} : {
          undo: async () => { setValue(previous); await save(previous, undefined, { undoing: true }); },
        });
      } catch (err) {
        const msg = err.data?.errors?.[key] || err.message;
        fieldError(field, T('Erreur : {msg}', { msg }));
        temoin.ko(field, label());
        if (state) state.innerHTML = `<span class="enreg enreg--attente">${icon('alerte')}${esc(T('{n} champ non enregistré : {champs}', { n: 1, champs: label() }))}</span>`;
        if (err.kind === 'reseau' || err.kind === 'session') toast.show(esc(err.message), { error: true, retry: () => save(value, previous) });
      }
    }
    // Revenu à la valeur enregistrée après un refus : plus rien à enregistrer, l'erreur et le témoin s'effacent.
    const commit = () => { const prev = field.dataset.saved; const now = valueOf(); if (now !== prev) save(now, prev); else if (field.getAttribute('aria-invalid') === 'true') { fieldError(field, ''); temoin.ok(field); } };
    // Une suggestion acceptée (fiche d'une photo) ne s'enregistre que par ce bouton : field._commit().
    field._commit = commit;
    if (field.matches('select')) onPick(field, commit);
    else if (field.type === 'checkbox' || field.type === 'radio') field.addEventListener('change', commit);
    else {
      field.addEventListener('change', commit);
      // Entrée : le champ s'enregistre (comme le quitter), le formulaire ne part pas.
      if (field.matches('input')) field.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
    }
  });
  // Avec le script, le formulaire ne part plus en entier : chaque champ s'enregistre seul.
  // Un bouton qui envoie tout le formulaire exprès (« Publier la photo » d'un dialogue de la fiche : [data-envoi]) passe.
  if (scope.matches('form[data-autosave]')) scope.addEventListener('submit', e => { if (!e.submitter || e.submitter.matches('.sans-script button, .sans-script')) e.preventDefault(); });
}
$$('[data-autosave], [data-v2-lot]').forEach(autosave);

// ----- rien ne se perd en quittant (MQ-09, état 8) : un champ refusé, ou un formulaire modifié qui n'a pas été envoyé,
// retient la page. Un lien de l'admin ouvre le dialogue (Annuler d'abord, avec le focus) ; le reste, l'alerte du navigateur. -----
const dirtyForms = () => $$('form[data-garde]').filter(f => f.dataset.modifie === '1');
const unsaved = () => [...temoin.pending(), ...dirtyForms().flatMap(f => (f.dataset.champsModifies || '').split('\n').filter(Boolean))];
let leaving = false;
addEventListener('beforeunload', e => { if (!leaving && unsaved().length) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('submit', () => { leaving = true; setTimeout(() => { leaving = false; }, 1000); }, true);
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || a.hash && a.pathname === location.pathname) return;
  const list = unsaved();
  if (!list.length) return;
  const d = $('[data-quitter]');
  if (!d) return;
  e.preventDefault();
  $('[data-quitter-champs]', d).textContent = T('Ce qui n’est pas enregistré sera perdu : {champs}. Le reste l’est déjà.', { champs: list.join(', ') });
  const go = $('[data-quitter-ok]', d);
  go.onclick = () => { leaving = true; d.close(); location.href = a.href; };
  d.showModal();
  $('[data-quitter-annuler]', d)?.focus();
});

// ----- formulaire à bouton (mentions légales) : ce qui est modifié et pas encore en ligne se dit dans le pied -----
$$('form[data-garde]').forEach(form => {
  const out = $('[data-modifs]', form);
  const label = el => el.dataset.label || (el.id && form.querySelector(`label[for="${el.id}"]`)?.firstChild?.textContent.trim())
    || (el.type === 'radio' && el.closest('fieldset')?.querySelector('legend')?.textContent.trim()) || el.closest('label')?.textContent.trim() || el.name;
  const initial = el => (el.matches('select') ? ([...el.options].find(o => o.defaultSelected) || el.options[0])?.value ?? '' : el.defaultValue);
  const changed = () => $$('input, textarea, select', form).filter(el => el.name && !['hidden', 'submit', 'button', 'file'].includes(el.type) && ((el.type === 'checkbox' || el.type === 'radio') ? el.checked !== el.defaultChecked : el.value !== initial(el)));
  const update = () => {
    const list = [...new Set(changed().map(label))];
    form.dataset.modifie = list.length ? '1' : '0';
    form.dataset.champsModifies = list.join('\n');
    if (out) { out.hidden = !list.length; out.textContent = list.length ? `${out.dataset.texte} ${list.join(', ')}` : ''; }
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('reset', () => setTimeout(update, 0));
  update();
});

// ----- dialogues : un dialogue rendu ouvert par le serveur (sans script, il s'affiche dans la page) devient modal ; un
// bouton [data-ouvre="id"] ouvre le sien ; Échap et « Annuler » ferment, le focus revient au déclencheur -----
$$('dialog[open][data-modal]').forEach(d => { d.close(); d.showModal(); ($('[autofocus]', d) || $('[data-annuler]', d))?.focus(); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ouvre]');
  if (b) {
    const d = document.getElementById(b.dataset.ouvre);
    if (d?.showModal) { e.preventDefault(); d.dataset.retour = b.id || ''; d.showModal(); ($('[data-annuler]', d) || $('button', d))?.focus(); d.addEventListener('close', () => b.focus(), { once: true }); }
  }
  const x = e.target.closest('dialog [data-annuler]');
  if (x && x.type !== 'submit') { e.preventDefault(); x.closest('dialog').close(); }
});

// ----- menu du téléphone : sans script, « Menu » est un lien vers #admin-nav (:target) ; ici, un vrai bouton ; menu ouvert,
// la page et la barre d'onglets sont inertes (le clavier reste dans le panneau, MQ-07 repère 22) -----
(function () {
  const side = $('[data-side]');
  const link = $('[data-menu]');
  if (!side || !link) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = link.className;
  btn.dataset.menu = '';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', side.id);
  btn.append(...link.childNodes);
  link.replaceWith(btn);
  const rest = () => [$('.shell > .main'), ...$$('body > :not(.shell, .skip, script, [data-cmdk], [data-toast])')].filter(Boolean);
  let entering;
  const set = open => {
    const was = side.classList.contains('open');
    side.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    for (const el of rest()) el.inert = open;
    clearTimeout(entering);
    if (open) entering = setTimeout(() => { if (side.classList.contains('open')) ($('a[aria-current]', side) || $('a', side))?.focus(); }, 50);
    else if (was) btn.focus();
  };
  btn.addEventListener('click', e => { e.stopPropagation(); set(!side.classList.contains('open')); });
  $('[data-menu-close]', side)?.addEventListener('click', e => { e.preventDefault(); set(false); });
  document.addEventListener('click', e => { if (side.classList.contains('open') && !side.contains(e.target)) set(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && side.classList.contains('open')) set(false); });
  matchMedia('(min-width: 721px)').addEventListener('change', e => { if (e.matches && side.classList.contains('open')) set(false); });
  // Ouvert sans script par l'adresse (#admin-nav), puis le script arrive : même état.
  if (location.hash === '#admin-nav' && matchMedia('(max-width: 720px)').matches) { history.replaceState(null, '', location.pathname + location.search); set(true); }
})();

// ----- mode clair / sombre : appliqué tout de suite, gardé par le serveur (cookie) -----
(function () {
  const form = $('[data-theme-form]');
  if (!form) return;
  const btn = $('[data-theme-toggle]', form);
  const effective = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const label = () => { btn.value = effective() === 'light' ? 'dark' : 'light'; };
  label();
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const next = effective() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    $('meta[name=color-scheme]')?.setAttribute('content', next);
    label();
    try { await post('/admin/theme', { theme: next }); } catch { /* le choix reste appliqué pour cette page */ }
  });
})();

// ----- menus « ⋯ » et liste des langues : un seul ouvert, fermés par Échap ou un clic ailleurs -----
(function () {
  const open = () => $$('details.menu[open], details.lang-pick[open]');
  document.addEventListener('click', e => open().forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') open().forEach(d => { d.open = false; $('summary', d)?.focus(); }); });
})();

// ----- « Nouveautés » (une fois par version) et « Traitement : n photos » (pied du menu) -----
(function () {
  const d = $('[data-release-pop]');
  if (d?.showModal) { d.close(); d.showModal(); }
  const box = $('[data-activity]');
  if (!box || box.hidden) return;
  const timer = setInterval(async () => {
    try {
      const res = await fetch('/admin/photos/traitement', { headers: { accept: 'application/json' }, redirect: 'manual' });
      if (!res.ok) return clearInterval(timer);
      const { active } = await res.json();
      box.hidden = !active;
      $('[data-activity-text]', box).textContent = T(active > 1 ? 'Traitement : {n} photos' : 'Traitement : {n} photo', { n: active });
      if (!active) clearInterval(timer);
    } catch { /* réseau : prochain tour */ }
  }, 2000);
})();

// ----- palette Ctrl K (MQ-07, états 16 et 17) : pages et réglages par leurs synonymes (« impressum »), photos, séries ;
// le nombre de résultats est annoncé ; aucun résultat : une issue vers l'aide -----
(function () {
  const dlg = $('[data-cmdk]');
  if (!dlg) return;
  const input = $('[data-cmdk-input]', dlg);
  const list = $('[data-cmdk-list]', dlg);
  const status = $('[data-cmdk-status]', dlg);
  const opener = $('[data-cmdk-open]');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let index = null, items = [], active = 0;
  const go = href => () => { location.href = href; };
  const PAGES = (DATA.pages || []).map(p => ({ ...p, hay: norm(`${p.label} ${p.also || ''}`) }));
  function actions() {
    const a = [];
    if (can('photos.importer')) a.push({ label: `<b>${esc(T('Importer des photos'))}</b>`, run: go('/admin/photos?importer#import'), hay: norm(T('Importer des photos')) });
    a.push({ label: esc(T('Basculer en mode clair / sombre')), run: () => $('[data-theme-form]')?.requestSubmit(), hay: norm(T('Basculer en mode clair / sombre')) });
    a.push({ label: esc(T('Voir le site public')), run: () => window.open('/', '_blank', 'noopener'), hay: norm(T('Voir le site public')) });
    a.push({ label: esc(T('Revenir à l’admin v1')), run: () => $('.ver-choix')?.requestSubmit(), hay: norm(`${T('Revenir à l’admin v1')} v1`) });
    return a;
  }
  async function load() {
    if (index) return index;
    try { index = await (await fetch('/admin/recherche.json', { headers: { accept: 'application/json' } })).json(); } catch { index = { photos: [], series: [] }; }
    return index;
  }
  function build(q) {
    const nq = norm(q).trim();
    const words = nq.split(/\s+/).filter(Boolean);
    const hit = hay => words.every(w => hay.includes(w));
    const groups = [];
    const pages = PAGES.filter(p => !nq || hit(p.hay)).map(p => ({ label: `<span><b>${esc(p.label)}</b>${nq && p.also && !norm(p.label).includes(words[0]) ? `<small>${esc(p.also)}</small>` : ''}</span>`, run: go(p.href) }));
    if (pages.length) groups.push([T('Aller à'), pages]);
    const acts = actions().filter(a => !nq || hit(a.hay));
    if (acts.length) groups.push([T('Actions'), acts]);
    if (index && nq) {
      const photos = index.photos.filter(p => hit(norm(`${p.title} ${p.category} ${p.place}`))).slice(0, 8).map(p => ({ label: `${p.thumb ? `<img src="${esc(p.thumb)}" alt="" width="42" height="28">` : ''}<span><b>${esc(p.title)}</b><small>${esc(p.category)}${p.place ? ` · ${esc(p.place)}` : ''} · ${esc(p.status === 'draft' ? T('brouillon') : T('publiée'))}</small></span>`, run: go(`/admin/photos/${p.id}`) }));
      const series = index.series.filter(s => hit(norm(s.name))).map(s => ({ label: `<span><b>${esc(s.name)}</b><small>${esc(T(s.count > 1 ? '{n} photos' : '{n} photo', { n: s.count }))}</small></span>`, run: go(`/admin/photos?serie=${encodeURIComponent(s.slug)}`) }));
      if (photos.length) groups.push([T('Photos'), photos]);
      if (series.length) groups.push([T('Séries'), series]);
    }
    items = groups.flatMap(([, g]) => g);
    active = Math.min(active, Math.max(items.length - 1, 0));
    let k = 0;
    if (!items.length) {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      status.innerHTML = `<b>${esc(T('Aucun résultat pour « {q} ».', { q: q.trim() }))}</b> <a class="btn ghost" href="/admin/aide?q=${encodeURIComponent(q.trim())}">${esc(T('Chercher « {q} » dans l’aide', { q: q.trim() }))}</a>`;
      return;
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    status.textContent = nq ? (items.length > 1 ? T('{n} résultats', { n: items.length }) : T('1 résultat')) : '';
    list.innerHTML = groups.map(([name, g], gi) => `<li role="presentation"><span class="sec" id="cmdk-g${gi}">${esc(name)}</span><ul role="group" aria-labelledby="cmdk-g${gi}">${g.map(it => { const i = k++; return `<li role="option" id="cmdk-${i}" data-i="${i}" aria-selected="${i === active}">${it.label}</li>`; }).join('')}</ul></li>`).join('');
    input.setAttribute('aria-activedescendant', `cmdk-${active}`);
  }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    $$('[role=option]', list).forEach(o => o.setAttribute('aria-selected', String(Number(o.dataset.i) === active)));
    $(`#cmdk-${active}`)?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `cmdk-${active}`);
  }
  function run(i) { const it = items[i]; if (!it) return; dlg.close(); it.run(); }
  async function open() { active = 0; input.value = ''; build(''); dlg.showModal(); input.focus(); await load(); build(input.value); }
  opener?.addEventListener('click', open);
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dlg.open) dlg.close(); else open(); } });
  input.addEventListener('input', () => { active = 0; build(input.value); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); } else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  });
  list.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o) run(Number(o.dataset.i)); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();

// ----- interrupteurs des Réglages (MQ-07, repères 4 et 6) : enregistrés au geste, « Défaire » pendant 10 s ; ce qui ne se
// défait pas (éteindre et effacer un modèle) passe d'abord par son dialogue (MQ-09, Annuler d'abord) -----
$$('form[data-inter]').forEach(form => {
  const box = $('input[role="switch"]', form);
  if (!box) return;
  const name = form.dataset.nom;
  const send = async on => {
    const body = Object.fromEntries(new FormData(form));
    delete body._csrf;
    body.action = on ? 'on' : 'off';
    return post(form.action, body);
  };
  const refresh = r => { if (r?.etat) { const el = $('[data-etat]', form.closest('.assist') || form); if (el) el.innerHTML = r.etat; } };
  box.addEventListener('change', async () => {
    const on = box.checked;
    const confirmId = !on && form.dataset.confirmerArret;
    if (confirmId) {
      const d = document.getElementById(confirmId);
      box.checked = true;                                 // rien ne change avant la réponse du dialogue
      const ok = await new Promise(resolve => {
        $('[data-confirmer-ok]', d).onclick = () => { d.close(); resolve(true); };
        d.addEventListener('close', () => resolve(false), { once: true });
        d.showModal();
        $('[data-annuler]', d)?.focus();
      });
      if (!ok) { box.focus(); return; }
      box.checked = false;
    }
    try {
      const r = await send(on);
      refresh(r);
      temoin.ok(box);
      const word = esc(on ? T('Allumé') : T('Éteint'));
      toast.show(`<b>${esc(name)}</b> · ${word}`, on || !confirmId ? { undo: async () => { box.checked = !on; refresh(await send(!on)); toast.show(`<b>${esc(name)}</b> · ${esc(!on ? T('Allumé') : T('Éteint'))}`); box.focus(); } } : {});
    } catch (err) {
      box.checked = !on;
      toast.show(esc(err.message), { error: true, retry: async () => { box.checked = on; box.dispatchEvent(new Event('change')); } });
    }
  });
  // Les autres champs du formulaire (modèle, heures) : enregistrés au geste quand l'assistant est allumé.
  $$('input:not([role="switch"]):not([type="hidden"]), select', form).forEach(f => f.addEventListener('change', async () => {
    if (!box.checked) return;
    try { refresh(await send(true)); temoin.ok(f); toast.show(Th('« {champ} » enregistré.', { champ: f.dataset.label || f.name })); } catch (err) { toast.show(esc(err.message), { error: true }); }
  }));
  form.addEventListener('submit', e => { if (!e.submitter || !e.submitter.closest('.sans-script')) e.preventDefault(); });
});

// ----- état d'un assistant pendant un téléchargement ou une analyse : relu toutes les 3 s, sans recharger la page -----
$$('[data-suivi]').forEach(el => {
  const url = el.dataset.suivi;
  const timer = setInterval(async () => {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'manual' });
      if (!res.ok) return clearInterval(timer);
      const s = await res.json();
      const bar = $('progress', el);
      const txt = $('[data-suivi-texte]', el);
      if (s.status === 'downloading' && s.download) { if (bar) { bar.max = s.download.total || 1; bar.value = s.download.got; } if (txt) txt.textContent = `${Math.round(s.download.got / 1e6)} / ${Math.round(s.download.total / 1e6)} Mo`; }
      else if (s.status === 'analysing') { if (bar) { bar.max = s.total || 1; bar.value = s.done; } if (txt) txt.textContent = `${s.done} / ${s.total}`; }
      else clearInterval(timer);
    } catch { /* réseau : prochain tour */ }
  }, 3000);
});

// ----- le lot (MQ-08) : barre « Pour les photos cochées », case d'en-tête, suggestions, vignettes en traitement -----
(function () {
  const bar = $('form[data-v2-bulk]');
  const lot = $('[data-v2-lot]');
  if (!bar || !lot) return;
  const boxes = () => $$('input.chk[name="ids"][form="bulk"]');
  const checked = () => boxes().filter(b => b.checked);
  const count = $('[data-bulk-count]', bar);
  const apply = $('[data-bulk-apply]', bar);
  const all = $('[data-tout]');
  function update() {
    const n = checked().length;
    count.textContent = n ? (n > 1 ? T('Pour les {n} photos cochées :', { n }) : T('Pour la photo cochée :')) : T('Aucune photo cochée : cochez-en une pour changer sa série, son lieu, sa ville ou sa date.');
    if (apply) { apply.textContent = n > 1 ? T('Appliquer aux {n} photos', { n }) : T('Appliquer à la photo'); apply.disabled = !n; }
    if (all) { all.checked = n > 0 && n === boxes().length; all.indeterminate = n > 0 && n < boxes().length; }
  }
  document.addEventListener('change', e => { if (e.target.matches('input.chk[name="ids"][form="bulk"]')) update(); });
  all?.addEventListener('change', () => { boxes().forEach(b => { b.checked = all.checked; }); update(); });
  update();
  // Au téléphone, la barre se replie derrière un bouton (les photos d'abord ; le .bulk-toggle de la v1).
  const toggle = $('[data-bulk-toggle]', bar);
  toggle?.addEventListener('click', () => { const open = bar.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); if (open) $('select, input:not([type=hidden])', $('.bulk-groups', bar))?.focus(); });

  // Ville de la carte des cochées : la liste suit la frappe (villes de la base, sans service extérieur) ; chaque ville est un
  // bouton qui remplit le champ (sans script, « Appliquer » envoie le texte, reconnu par le serveur).
  const city = $('[data-ville]', bar);
  const cityId = $('[data-ville-id]', bar);
  const pop = $('[data-ville-liste]', bar);
  let lastQ = '', seq = 0;
  city?.addEventListener('input', async () => {
    if (cityId) cityId.value = '';
    const q = city.value.trim();
    if (q.length < 2 || q === lastQ) { if (q.length < 2) pop.hidden = true; return; }
    lastQ = q;
    const mine = ++seq;
    try {
      const r = await (await fetch(`/admin/villes?q=${encodeURIComponent(q)}`, { headers: { accept: 'application/json' } })).json();
      if (mine !== seq) return;
      pop.innerHTML = r.villes.map(v => `<li><button type="button" data-id="${v.id}">${esc(v.label)}</button></li>`).join('');
      pop.hidden = !r.villes.length;
    } catch { pop.hidden = true; }
  });
  pop?.addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (!b) return; city.value = b.textContent; cityId.value = b.dataset.id; pop.hidden = true; city.focus(); });

  // « Appliquer » : rien ne change avant ce bouton (MQ-08, repère 6) ; ensuite, les lignes se mettent à jour sans recharger
  // et le message propose « Défaire ».
  bar.addEventListener('submit', async e => {
    if (e.submitter && e.submitter.value !== 'appliquer') return;
    e.preventDefault();
    const ids = checked().map(b => Number(b.value));
    if (!ids.length) return;
    const body = { ids, action: 'appliquer', category_id: bar.elements.category_id.value, new_category: bar.elements.new_category?.value || '', place: bar.elements.place.value, taken_on: bar.elements.taken_on.value, city_label: city?.value || '', city_id: cityId?.value || '' };
    apply.disabled = true;
    try {
      const r = await post('/admin/photos/actions', body);
      for (const p of r.photos || []) {
        const row = $(`tr[data-photo="${p.id}"]`);
        if (!row) continue;
        const set = (k, v) => { const f = $(`[data-champ="${k}"]`, row); if (f && v != null) { f.value = v; f.dataset.saved = v; fieldError(f, ''); } };
        set('category_id', String(p.category_id)); set('place', p.place); set('taken_on', p.taken_on);
        const lu = $('[data-lu]', row);
        if (lu && p.when) lu.textContent = lu.dataset.texte.replace('{date}', p.when);
        const state = $('[data-etat-ligne]', row);
        if (state) state.innerHTML = `<span class="enreg enreg--ok">${icon('coche')}${esc(T('Enregistré à {h}', { h: hour() }))}</span>`;
      }
      bar.reset();
      update();
      toast.show(esc(r.text), r.undo ? { undo: async () => { const u = await post('/admin/photos/actions', r.undo); toast.show(esc(u.text)); location.reload(); } } : {});
    } catch (err) {
      toast.show(esc(err.message), { error: true });
    } finally { apply.disabled = !checked().length; }
  });

  // « ✦ Suggestion : Rue, Accepter » : la série proposée remplace celle de la photo, et s'enregistre comme un choix.
  lot.addEventListener('click', e => {
    const b = e.target.closest('[data-accepter]');
    if (!b) return;
    const sel = $('[data-champ="category_id"]', b.closest('tr'));
    sel.value = b.dataset.accepter;
    sel.dispatchEvent(new Event('blur'));
    b.closest('.sugg-l')?.remove();
    sel.focus();
  });
  // Titre : le signal « titre provisoire » suit le titre enregistré.
  lot.addEventListener('enregistre', e => {
    const row = e.target.closest('tr');
    const p = e.detail.photo;
    if (!row || !p) return;
    const prov = $('[data-provisoire]', row);
    if (prov && e.detail.key === 'title') prov.hidden = !p.provisional;
    if (e.detail.key === 'title') row.dataset.objet = p.title;
    const lu = $('[data-lu]', row);
    if (lu && e.detail.key === 'taken_on') lu.textContent = p.read ? lu.dataset.texte.replace('{date}', p.read) : '';
  });
  // Vignettes des photos encore en traitement : remplacées dès qu'elles sont prêtes (20 minutes au plus).
  const waiting = () => $$('[data-traitement]', lot);
  if (waiting().length) {
    let tries = 0;
    const timer = setInterval(async () => {
      const list = waiting();
      if (!list.length || ++tries > 800) return clearInterval(timer);
      try {
        const res = await fetch(`/admin/photos/traitement?ids=${list.map(x => x.dataset.traitement).join(',')}`, { headers: { accept: 'application/json' }, redirect: 'manual' });
        if (!res.ok) return clearInterval(timer);
        for (const p of (await res.json()).photos) {
          const ph = $(`[data-traitement="${p.id}"]`, lot);
          if (ph && p.state === 'ready') ph.outerHTML = `<img src="${esc(p.thumb)}" alt="" width="96" height="64">`;
        }
      } catch { /* réseau : prochain tour */ }
    }, 1500);
  }
})();
