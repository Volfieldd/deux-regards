/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Textes de l'écran, dans la langue de l'admin du photographe (<html lang>) ; le français est la clé.
const I18N = {
  'Position : indisponible sur cet appareil (indiquez le lieu).': { en: 'Location: not available on this device (enter the place).', de: 'Standort: auf diesem Gerät nicht verfügbar (Ort angeben).' },
  'Position : recherche… ': { en: 'Location: searching… ', de: 'Standort: wird gesucht… ' },
  'Position prise (à 100 m près ; la ville sera déduite). ': { en: 'Location found (to within 100 m; the town will be worked out). ', de: 'Standort ermittelt (auf 100 m genau; der Ort wird abgeleitet). ' },
  'Position refusée ou introuvable : indiquez le lieu. ': { en: 'Location refused or not found: enter the place. ', de: 'Standort verweigert oder nicht gefunden: Ort angeben. ' },
  'Position prise. ': { en: 'Location found. ', de: 'Standort ermittelt. ' },
  'Enregistrement…': { en: 'Saving…', de: 'Wird gespeichert…' },
  'Adresse e-mail invalide.': { en: 'Invalid email address.', de: 'Ungültige E-Mail-Adresse.' },
  'Cochez au moins un usage accepté.': { en: 'Tick at least one accepted use.', de: 'Kreuzen Sie mindestens eine akzeptierte Nutzung an.' },
  'Le nom de la personne est nécessaire avec son accord.': { en: 'The person’s name is needed with their consent.', de: 'Mit der Einwilligung ist der Name der Person nötig.' },
  'Indiquez si la personne est majeure.': { en: 'Say whether the person is an adult.', de: 'Geben Sie an, ob die Person volljährig ist.' },
  'Personne mineure : le nom du parent qui signe est nécessaire.': { en: 'Minor: the name of the signing parent is needed.', de: 'Minderjährige Person: Der Name des unterschreibenden Elternteils ist nötig.' },
  'La signature manque.': { en: 'The signature is missing.', de: 'Die Unterschrift fehlt.' },
  'Rien à enregistrer : un accord, un refus, ou au moins une adresse pour envoyer la photo.': { en: 'Nothing to save: a consent, a refusal, or at least an address to send the photo.', de: 'Nichts zu speichern: eine Einwilligung, eine Ablehnung oder mindestens eine Adresse zum Senden des Fotos.' },
};
const tr = s => I18N[s]?.[document.documentElement.lang] ?? s;
// Rencontre sur le téléphone : position (arrondie à ~100 m), aperçu de la photo, langue de la personne,
// signature au doigt. Le formulaire part en une fois (multipart) ; rien n'est gardé sur le téléphone.
(function () {
  const form = document.querySelector('[data-app]');
  if (!form) return;
  const $ = s => form.querySelector(s);

  // ----- position -----
  const pos = $('[data-pos]');
  const retry = $('[data-pos-retry]');
  function locate() {
    if (!navigator.geolocation) { pos.firstChild.textContent = tr('Position : indisponible sur cet appareil (indiquez le lieu).'); return; }
    pos.firstChild.textContent = tr('Position : recherche… ');
    retry.hidden = true;
    navigator.geolocation.getCurrentPosition(p => {
      $('[data-lat]').value = p.coords.latitude.toFixed(3);
      $('[data-lon]').value = p.coords.longitude.toFixed(3);
      pos.firstChild.textContent = tr('Position prise (à 100 m près ; la ville sera déduite). ');
      pos.classList.add('ok');
    }, () => {
      pos.firstChild.textContent = tr('Position refusée ou introuvable : indiquez le lieu. ');
      retry.hidden = false;
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 });
  }
  retry.addEventListener('click', locate);
  if (!$('[data-lat]').value) locate(); else { pos.firstChild.textContent = tr('Position prise. '); pos.classList.add('ok'); }

  // ----- photographe : prochaine référence et nom dans le consentement -----
  const author = $('[data-author]');
  author.addEventListener('change', () => {
    const o = author.selectedOptions[0];
    document.querySelector('[data-next]').textContent = o.dataset.next;
    form.querySelectorAll('[data-author-name]').forEach(s => { s.textContent = o.textContent; });
  });

  // ----- photo de repère -----
  const file = $('[data-portrait]');
  const preview = $('[data-portrait-preview]');
  file.addEventListener('change', () => {
    if (!file.files[0]) { preview.hidden = true; return; }
    preview.src = URL.createObjectURL(file.files[0]);
    preview.hidden = false;
  });

  // ----- langue de la personne -----
  form.querySelectorAll('[data-lang-pick]').forEach(r => r.addEventListener('change', () => { form.dataset.lang = r.value; }));

  // ----- signature au doigt -----
  const canvas = $('[data-sign]');
  const ctx = canvas.getContext('2d');
  let drawn = false;
  let last = null;
  function size() {
    const r = canvas.getBoundingClientRect();
    const k = window.devicePixelRatio || 1;
    // Image gardée telle quelle (une URL « data: » serait refusée par la politique de sécurité du site).
    const keep = drawn && canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = Math.round(r.width * k);
    canvas.height = Math.round(r.height * k);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1d1c1a';
    if (keep) ctx.putImageData(keep, 0, 0);
  }
  size();
  addEventListener('resize', size);
  const point = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); last = point(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fill(); drawn = true; });
  canvas.addEventListener('pointermove', e => {
    if (!last) return;
    const p = point(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const end = () => { last = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  $('[data-sign-clear]').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; $('[data-sign-value]').value = ''; });

  // ----- vérification avant l'envoi -----
  // Les règles du serveur (qui reste seul juge), vérifiées ici d'abord : après un refus du serveur, la photo de la
  // personne et la signature seraient à refaire (elles ne sont pas gardées entre deux envois).
  const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,30}$/;
  function problems() {
    const f = form.elements;
    const out = [];
    const email = f.email.value.trim();
    if (email && !EMAIL.test(email)) out.push([f.email, 'Adresse e-mail invalide.']);
    if (f.decision.value === 'accord') {
      if (!['scope_site', 'scope_instagram', 'scope_print'].some(n => f[n].checked)) out.push([f.scope_site, 'Cochez au moins un usage accepté.']);
      if (!f.name.value.trim()) out.push([f.name, 'Le nom de la personne est nécessaire avec son accord.']);
      if (!f.adult.value) out.push([f.adult[0], 'Indiquez si la personne est majeure.']);
      else if (f.adult.value === 'non' && !f.guardian.value.trim()) out.push([f.guardian, 'Personne mineure : le nom du parent qui signe est nécessaire.']);
      if (!drawn) out.push([canvas, 'La signature manque.']);
    } else if (!f.decision.value && !email && !f.wants_photo.checked) out.push([f.decision[0], 'Rien à enregistrer : un accord, un refus, ou au moins une adresse pour envoyer la photo.']);
    return out;
  }
  function report(list) {
    let box = form.querySelector('[data-app-check]');
    form.querySelectorAll('[aria-invalid]').forEach(el => el.removeAttribute('aria-invalid'));
    // Groupes de boutons radio (âge, décision) : la phrase sous la légende, dans la langue de la personne.
    form.querySelectorAll('[data-err-for]').forEach(p => { p.hidden = true; p.closest('fieldset')?.removeAttribute('aria-describedby'); });
    if (!list.length) { box?.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'app-errors';
      box.setAttribute('role', 'alert');
      box.dataset.appCheck = '';
      form.querySelector('.app-step').before(box);
    }
    const ul = document.createElement('ul');
    for (const [el, msg] of list) {
      const li = document.createElement('li');
      li.textContent = tr(msg);
      ul.append(li);
      if (el === canvas) continue;
      if (el.type !== 'radio') { el.setAttribute('aria-invalid', 'true'); continue; }
      form.querySelectorAll(`input[type="radio"][name="${el.name}"]`).forEach(r => r.setAttribute('aria-invalid', 'true'));
      const say = form.querySelector(`[data-err-for="${el.name}"]`);
      if (say) { say.hidden = false; say.closest('fieldset')?.setAttribute('aria-describedby', say.id); }
    }
    box.replaceChildren(ul);
    const first = list[0][0];
    if (first === canvas) canvas.scrollIntoView({ block: 'center' }); else first.focus();
  }

  // ----- envoi : signature jointe, pas de double envoi -----
  form.addEventListener('submit', e => {
    const list = problems();
    report(list);
    if (list.length) { e.preventDefault(); return; }
    if (drawn) $('[data-sign-value]').value = canvas.toDataURL('image/png');
    const save = $('[data-save]');
    save.disabled = true;
    save.textContent = tr('Enregistrement…');
  });
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
