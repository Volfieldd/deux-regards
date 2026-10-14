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
    if (!navigator.geolocation) { pos.firstChild.textContent = 'Position : indisponible sur cet appareil (indiquez le lieu).'; return; }
    pos.firstChild.textContent = 'Position : recherche… ';
    retry.hidden = true;
    navigator.geolocation.getCurrentPosition(p => {
      $('[data-lat]').value = p.coords.latitude.toFixed(3);
      $('[data-lon]').value = p.coords.longitude.toFixed(3);
      pos.firstChild.textContent = 'Position prise (à 100 m près ; la ville sera déduite). ';
      pos.classList.add('ok');
    }, () => {
      pos.firstChild.textContent = 'Position refusée ou introuvable : indiquez le lieu. ';
      retry.hidden = false;
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 });
  }
  retry.addEventListener('click', locate);
  if (!$('[data-lat]').value) locate(); else { pos.firstChild.textContent = 'Position prise. '; pos.classList.add('ok'); }

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

  // ----- envoi : signature jointe, pas de double envoi -----
  form.addEventListener('submit', () => {
    if (drawn) $('[data-sign-value]').value = canvas.toDataURL('image/png');
    const save = $('[data-save]');
    save.disabled = true;
    save.textContent = 'Enregistrement…';
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
