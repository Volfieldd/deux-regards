// App de terrain de la v2 (MQ-10) : amélioration progressive de l'écran « Nouvelle rencontre ». Sans ce script, le
// formulaire part tel quel (POST multipart) et la langue de la personne change par :has() ; avec lui : position, photo de
// repère réduite à 1 600 px, signature au doigt (gardée après un refus du serveur, « Effacer » puis « Défaire »),
// vérification avant l'envoi dans la langue de la personne, envoi suivi (progression), et rien de perdu si le réseau
// coupe ou si la session expire : l'écran garde tout jusqu'à « Réessayer ». Rien n'est écrit sur le téléphone.
document.documentElement.classList.add('js');
(function () {
  const form = document.querySelector('[data-app]');
  if (!form) return;
  const $ = s => form.querySelector(s);
  const $$ = s => [...form.querySelectorAll(s)];

  // ----- position (arrondie à ~100 m côté serveur) -----
  const pos = $('[data-pos]');
  const posText = $('[data-pos-texte]');
  const retry = $('[data-pos-retry]');
  const LANG = document.documentElement.lang;
  const MSG = {
    fr: { none: 'Position : indisponible sur cet appareil (indiquez le lieu).', seek: 'Position : recherche…', ok: 'Position prise (à 100 m près ; la ville sera déduite).', ko: 'Position refusée ou introuvable : indiquez le lieu.' },
    en: { none: 'Location: not available on this device (enter the place).', seek: 'Location: searching…', ok: 'Location found (to within 100 m; the town will be worked out).', ko: 'Location refused or not found: enter the place.' },
    de: { none: 'Standort: auf diesem Gerät nicht verfügbar (Ort angeben).', seek: 'Standort: wird gesucht…', ok: 'Standort ermittelt (auf 100 m genau; der Ort wird abgeleitet).', ko: 'Standort verweigert oder nicht gefunden: Ort angeben.' },
  }[LANG] || null;
  function locate() {
    if (!MSG) return;
    if (!navigator.geolocation) { posText.textContent = MSG.none; return; }
    posText.textContent = MSG.seek;
    retry.hidden = true;
    navigator.geolocation.getCurrentPosition(p => {
      $('[data-lat]').value = p.coords.latitude.toFixed(3);
      $('[data-lon]').value = p.coords.longitude.toFixed(3);
      posText.textContent = MSG.ok;
      pos.classList.add('ok');
    }, () => { posText.textContent = MSG.ko; retry.hidden = false; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 });
  }
  retry?.addEventListener('click', locate);
  if (!$('[data-lat]').value) locate(); else if (MSG) { posText.textContent = MSG.ok; pos.classList.add('ok'); }

  // ----- photographe : prochaine référence, nom dans l'accord, résumé de « Vous » -----
  const author = $('[data-author]');
  const resume = $('[data-vous-resume]');
  const updateResume = () => { if (resume) resume.textContent = [author.selectedOptions[0]?.textContent, form.elements.place.value.trim()].filter(Boolean).join(' · '); };
  author.addEventListener('change', () => {
    const o = author.selectedOptions[0];
    document.querySelector('[data-next]').textContent = o.dataset.next;
    $$('[data-author-name]').forEach(s => { s.textContent = o.textContent; });
    updateResume();
  });
  form.elements.place.addEventListener('input', updateResume);

  // ----- « Tendre le téléphone » : « Vous » se replie, la section de la personne prend le focus (MQ-10, repère 3) -----
  $('[data-tendre]')?.addEventListener('click', e => {
    e.preventDefault();
    $('[data-vous]').open = false;
    const h = document.getElementById('s-pers');
    h.scrollIntoView({ block: 'start' });
    h.focus({ preventScroll: true });
  });

  // ----- photo de repère : aperçu, puis réduite à 1 600 px avant l'envoi -----
  const file = $('[data-portrait]');
  const preview = $('[data-portrait-preview]');
  file.addEventListener('change', () => {
    if (!file.files[0]) { preview.hidden = true; return; }
    preview.src = URL.createObjectURL(file.files[0]);
    preview.hidden = false;
  });
  async function reduced() {
    const f = file.files[0];
    if (!f || typeof createImageBitmap !== 'function') return f || null;
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      if (k === 1 && f.size < 1.5e6) return f;
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise(r => c.toBlob(b => r(b || f), 'image/jpeg', 0.85));
    } catch { return f; }
  }

  // ----- langue de la personne : la case cochée (data-lang garde la règle des navigateurs sans :has()) -----
  $$('[data-lang-pick]').forEach(r => r.addEventListener('change', () => { form.dataset.lang = r.value; }));

  // ----- signature au doigt ; celle que le serveur a renvoyée est redessinée (blob:, la CSP refuse data:) -----
  const canvas = $('[data-sign]');
  const ctx = canvas.getContext('2d');
  const value = $('[data-sign-value]');
  const ok = $('[data-sig-ok]');
  let drawn = Boolean(value.value);
  let last = null;
  function size() {
    const r = canvas.getBoundingClientRect();
    const k = window.devicePixelRatio || 1;
    const keep = drawn && canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = Math.round(r.width * k);
    canvas.height = Math.round(r.height * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d1c1a'; ctx.fillStyle = '#1d1c1a';
    if (keep) ctx.putImageData(keep, 0, 0);
  }
  size();
  addEventListener('resize', size);
  async function paint(dataUrl) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) return;
    const bytes = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const img = new Image();
    img.onload = () => { const r = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, r.width, r.height); URL.revokeObjectURL(url); };
    img.src = url;
  }
  if (value.value) paint(value.value);
  const point = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ } last = point(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fill(); drawn = true; });
  canvas.addEventListener('pointermove', e => { if (!last) return; const p = point(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
  const end = () => { if (last) { value.value = canvas.toDataURL('image/png'); ok.hidden = false; } last = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  // « Effacer » se défait pendant 10 s (MQ-10, repère 17) : un geste malheureux ne fait pas re-signer une inconnue.
  const undoBox = $('[data-sig-defaire]');
  let undoTimer = null, saved = null;
  $('[data-sign-clear]').addEventListener('click', () => {
    if (!drawn) return;
    saved = value.value || canvas.toDataURL('image/png');
    ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; value.value = ''; ok.hidden = true;
    undoBox.hidden = false;
    undoBox.querySelector('button').focus();
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { undoBox.hidden = true; saved = null; }, 10000);
  });
  undoBox.querySelector('[data-sig-undo]').addEventListener('click', () => {
    if (!saved) return;
    value.value = saved; drawn = true; ok.hidden = false; paint(saved);
    undoBox.hidden = true; clearTimeout(undoTimer); saved = null;
    canvas.focus?.();
  });

  // ----- vérification avant l'envoi : les règles du serveur (seul juge), dans la langue de la personne -----
  const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,30}$/;
  const ERRS = {
    fr: { email: 'E-mail : l’adresse ne semble pas complète.', scopes: 'Usages : cochez au moins le site.', name: 'Prénom et nom : indiquez votre nom.', adult: 'Âge : dites si vous avez 18 ans ou plus.', guardian: 'Nom du parent : indiquez qui signe avec vous.', signature: 'Signature : signez avec le doigt.', what: 'Votre décision : choisissez une réponse, ou laissez votre e-mail.', titre1: '1 point à corriger', titre: '{n} points à corriger' },
    en: { email: 'Email: the address does not look complete.', scopes: 'Uses: tick at least the website.', name: 'Full name: please give your name.', adult: 'Age: tell us whether you are 18 or older.', guardian: 'Parent’s name: tell us who is signing with you.', signature: 'Signature: please sign with your finger.', what: 'Your decision: choose an answer, or leave your email.', titre1: '1 thing to fix', titre: '{n} things to fix' },
    de: { email: 'E-Mail: Die Adresse scheint unvollständig.', scopes: 'Nutzung: Kreuzen Sie mindestens die Website an.', name: 'Vor- und Nachname: Bitte geben Sie Ihren Namen an.', adult: 'Alter: Bitte geben Sie an, ob Sie 18 Jahre oder älter sind.', guardian: 'Name des Elternteils: Bitte angeben, wer mitunterschreibt.', signature: 'Unterschrift: Bitte mit dem Finger unterschreiben.', what: 'Ihre Entscheidung: Bitte wählen Sie eine Antwort oder geben Sie Ihre E-Mail an.', titre1: '1 Angabe fehlt', titre: '{n} Angaben fehlen' },
  };
  function problems() {
    const f = form.elements, out = [];
    const email = f.email.value.trim();
    if (email && !EMAIL.test(email)) out.push(['email', f.email]);
    if (f.decision.value === 'accord') {
      if (!['scope_site', 'scope_instagram', 'scope_print'].some(n => f[n].checked)) out.push(['scopes', f.scope_site]);
      if (!f.name.value.trim()) out.push(['name', f.name]);
      if (!f.adult.value) out.push(['adult', f.adult[0]]);
      else if (f.adult.value === 'non' && !f.guardian.value.trim()) out.push(['guardian', f.guardian]);
      if (!drawn) out.push(['signature', canvas]);
    } else if (!f.decision.value && !email && !f.wants_photo.checked) out.push(['what', f.decision[0]]);
    return out;
  }
  function report(list) {
    $$('[data-check]').forEach(el => el.remove());
    $$('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    $('[data-resume]')?.remove();
    if (!list.length) return;
    const box = document.createElement('section');
    box.className = 'resume'; box.tabIndex = -1; box.dataset.resume = ''; box.dataset.check = '';
    box.setAttribute('aria-labelledby', 'res-js');
    const all = l => ERRS[l] || ERRS.fr;
    const span = (l, text) => `<span data-l="${l}" lang="${l}">${text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span>`;
    const langs = ['fr', 'en', 'de'];
    box.innerHTML = `<h3 class="resume-t" id="res-js">${langs.map(l => span(l, list.length > 1 ? all(l).titre.replace('{n}', list.length) : all(l).titre1)).join('')}</h3><ul>${list.map(([k, el]) => `<li><a href="#${el === canvas ? 'signature' : el.id || el.closest('fieldset')?.id || ''}">${langs.map(l => span(l, all(l)[k])).join('')}</a></li>`).join('')}</ul>`;
    form.querySelector('.pers-corps').prepend(box);
    for (const [, el] of list) {
      if (el === canvas) continue;
      if (el.type === 'radio') $$(`input[name="${el.name}"]`).forEach(r => r.setAttribute('aria-invalid', 'true')); else el.setAttribute('aria-invalid', 'true');
    }
    box.focus();
  }
  // Un lien du résumé mène au champ (ou au premier bouton du groupe) et lui donne le focus.
  {
    form.addEventListener('click', e => {
      const a = e.target.closest('.resume a[href^="#"]');
      if (!a) return;
      const target = document.getElementById(a.hash.slice(1));
      if (!target) return;
      e.preventDefault();
      const field = target.matches('input, select, textarea') ? target : target.querySelector('input, select, textarea, canvas');
      (field || target).scrollIntoView({ block: 'center' });
      field?.focus?.();
    });
  }

  // ----- envoi suivi : progression ; réseau coupé ou session expirée, tout reste à l'écran jusqu'à « Réessayer » -----
  const save = $('[data-save]');
  const envoi = $('[data-envoi]');
  const reseau = $('[data-reseau]');
  const session = $('[data-session]');
  const show = which => { reseau.hidden = which !== 'reseau'; session.hidden = which !== 'session'; if (which) (which === 'reseau' ? reseau : session).querySelector('button, a')?.focus(); };
  const busy = on => { save.disabled = on; envoi.hidden = !on; };
  async function freshToken() {
    try {
      const res = await fetch('/admin/rencontre/accueil', { headers: { accept: 'text/html' }, redirect: 'manual', credentials: 'same-origin' });
      if (!res.ok) return false;
      const m = /name="_csrf" value="([^"]+)"/.exec(await res.text());
      if (m) form.elements._csrf.value = m[1];
      return Boolean(m);
    } catch { return false; }
  }
  async function send({ again = false } = {}) {
    if (again && !session.hidden) await freshToken();
    show(null);
    busy(true);
    const data = new FormData(form);
    const photo = await reduced();
    if (photo) data.set('portrait', photo, 'photo.jpg'); else data.delete('portrait');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', form.action);
    xhr.setRequestHeader('accept', 'text/html');
    const pct = $('[data-envoi-pct]');
    const bar = $('[data-envoi-barre]');
    xhr.upload.onprogress = e => { if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); bar.value = p; pct.textContent = `${p} %`; } };
    xhr.onerror = () => { busy(false); show('reseau'); };
    xhr.onload = () => {
      busy(false);
      const url = xhr.responseURL || '';
      if (/\/admin\/rencontre\/\d+\/merci/.test(url)) { location.assign(url); return; }
      if (/\/auth\//.test(url) || xhr.status === 401 || (xhr.status === 403 && /CSRF/i.test(xhr.responseText))) { show('session'); return; }
      // Refus du serveur (422) : l'envoi ordinaire lui laisse dire ce qui manque ; la signature revient avec la page.
      if (xhr.status === 422) { form.dataset.natif = '1'; HTMLFormElement.prototype.submit.call(form); return; }
      show('reseau');
    };
    xhr.send(data);
  }
  form.addEventListener('submit', e => {
    if (form.dataset.natif) return;
    e.preventDefault();
    const list = problems();
    report(list);
    if (list.length) return;
    if (drawn && !value.value) value.value = canvas.toDataURL('image/png');
    send();
  });
  $$('[data-reessayer]').forEach(b => b.addEventListener('click', () => send({ again: true })));
})();

// Accord : Instagram suppose le site (cocher Instagram coche le site, décocher le site décoche Instagram).
document.addEventListener('change', e => {
  const t = e.target;
  if (!t.form || (t.name !== 'scope_instagram' && t.name !== 'scope_site')) return;
  const other = t.form.elements[t.name === 'scope_instagram' ? 'scope_site' : 'scope_instagram'];
  if (!other) return;
  if (t.name === 'scope_instagram' && t.checked) other.checked = true;
  if (t.name === 'scope_site' && !t.checked) other.checked = false;
});
