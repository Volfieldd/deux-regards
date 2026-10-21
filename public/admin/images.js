/*! © 2026 Sébastien Wojcicki. Tous droits réservés : reproduction, modification et fouille de données interdites sans autorisation. */
// Les deux admins utilisent le même aperçu, sans enregistrer ni recalculer les variantes du site.
// Sans script, les boutons gardent le formulaire POST et son image dans un nouvel onglet.
(() => {
  const form = document.getElementById('images-form');
  const image = document.querySelector('[data-images-preview]');
  const status = document.querySelector('[data-images-status]');
  if (!form || !image || !status) return;
  const caption = image.closest('figure').querySelector('[data-images-caption]');
  let sequence = 0, objectUrl = null;
  const fields = () => new URLSearchParams(new FormData(form)).toString();
  const dirty = () => { status.textContent = status.dataset.dirty; };
  form.addEventListener('input', dirty);
  form.addEventListener('change', dirty);
  form.addEventListener('reset', () => setTimeout(dirty, 0));
  form.addEventListener('submit', async e => {
    if (!e.submitter?.matches('[formaction="/admin/images/apercu"]')) return;
    e.preventDefault();
    const mine = ++sequence, body = fields();
    status.textContent = status.dataset.loading;
    image.setAttribute('aria-busy', 'true');
    let nextUrl = null;
    try {
      const r = await fetch('/admin/images/apercu', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'image/webp' }, body });
      if (!r.ok || !r.headers.get('content-type')?.startsWith('image/webp')) throw new Error();
      nextUrl = URL.createObjectURL(await r.blob());
      const next = new Image();
      next.src = nextUrl;
      await next.decode();
      if (mine !== sequence) return;
      if (body !== fields()) { dirty(); return; }
      image.src = nextUrl;
      image.width = next.naturalWidth;
      image.height = next.naturalHeight;
      image.alt = status.dataset.ready;
      caption.textContent = status.dataset.ready;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = nextUrl;
      nextUrl = null;
      status.textContent = status.dataset.ready;
    } catch {
      if (mine === sequence) status.textContent = status.dataset.error;
    } finally {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (mine === sequence) image.removeAttribute('aria-busy');
    }
  });
})();
