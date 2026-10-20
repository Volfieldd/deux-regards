// Amélioration progressive : aucune lecture automatique, aucune bibliothèque, aucun appel réseau.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let calm = false;
  try { calm = localStorage.getItem('nicephos-calm') === '1'; } catch { /* stockage facultatif */ }
  const buttons = [...document.querySelectorAll('[data-room-calm]')];
  const apply = () => {
    root.classList.toggle('room-calm', calm || reduce.matches);
    buttons.forEach(b => { b.hidden = false; b.setAttribute('aria-pressed', String(calm || reduce.matches)); b.disabled = reduce.matches; });
  };
  apply(); reduce.addEventListener('change', apply);
  buttons.forEach(b => b.addEventListener('click', () => {
    calm = !calm;
    try { localStorage.setItem('nicephos-calm', calm ? '1' : '0'); } catch { /* préférence limitée à la page */ }
    apply();
  }));
  const opening = document.querySelector('[data-room-opening]');
  const stage = opening?.querySelector('[data-room-stage]');
  const controls = opening?.querySelector('[data-room-controls]');
  if (!stage || !controls) return;
  const first = stage.querySelector('figure');
  const slides = [first.cloneNode(true), ...[...stage.querySelectorAll('template')].map(t => t.content.firstElementChild.cloneNode(true))];
  let index = 0;
  const show = next => {
    index = (next + slides.length) % slides.length;
    const figure = slides[index].cloneNode(true);
    figure.querySelectorAll('img').forEach(img => { img.loading = 'eager'; img.removeAttribute('fetchpriority'); });
    stage.replaceChildren(figure);
    controls.querySelector('[data-room-count]').textContent = `${index + 1} / ${slides.length} · ${figure.querySelector('.cartel-t').textContent}`;
    controls.querySelectorAll('[data-room-select]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.roomSelect) === index)));
  };
  controls.querySelector('[data-room-prev]').addEventListener('click', () => show(index - 1));
  controls.querySelector('[data-room-next]').addEventListener('click', () => show(index + 1));
  controls.querySelectorAll('[data-room-select]').forEach(b => b.addEventListener('click', () => show(Number(b.dataset.roomSelect))));
  controls.hidden = false;
})();
