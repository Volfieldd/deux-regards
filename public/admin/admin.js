// Amélioration progressive de l'admin : tout fonctionne sans ce script (formulaires classiques).
(function () {
  const csrf = document.body.dataset.csrf;

  // ----- import : glisser-déposer sur la zone, progression -----
  const form = document.querySelector('[data-import]');
  if (form) {
    const drop = form.querySelector('[data-drop]');
    const input = form.querySelector('input[type=file]');
    const progress = form.querySelector('[data-progress]');
    const label = drop.querySelector('span');
    const initial = label.textContent;
    const show = () => { label.textContent = input.files.length ? `${input.files.length} fichier(s) prêt(s) à importer` : initial; };
    input.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      if (!e.dataTransfer.files.length) return;
      input.files = e.dataTransfer.files;
      show();
    });
    form.addEventListener('submit', () => {
      progress.textContent = 'Import en cours… les variantes sont générées, cela peut prendre un moment.';
      form.querySelector('button[type=submit]').disabled = true;
    });
  }

  // ----- réordonnancement des photos par glisser-déposer -----
  // Les boutons ↑ ↓ restent l'alternative clavier et sans JS.
  const list = document.querySelector('.plist[data-sortable]');
  if (list) {
    let dragged = null;
    const clear = () => list.querySelectorAll('.drop-before').forEach(li => li.classList.remove('drop-before'));
    list.querySelectorAll('li').forEach(li => {
      li.draggable = true;
      li.addEventListener('dragstart', e => { dragged = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragend', () => { li.classList.remove('dragging'); clear(); dragged = null; });
      li.addEventListener('dragover', e => {
        if (!dragged || dragged === li) return;
        e.preventDefault();
        clear();
        li.classList.add('drop-before');
      });
      li.addEventListener('drop', async e => {
        e.preventDefault();
        if (!dragged || dragged === li) return;
        const before = [...list.children];
        list.insertBefore(dragged, li);
        clear();
        const ids = [...list.children].map(el => Number(el.dataset.id));
        try {
          const res = await fetch('/admin/photos/order', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, accept: 'application/json' },
            body: JSON.stringify({ ids }),
          });
          if (!res.ok) throw new Error(res.status);
          // Les numéros suivent la position, comme sur le site.
          [...list.children].forEach((el, i) => { el.querySelector('.handle').textContent = `N°${String(i + 1).padStart(2, '0')}`; });
        } catch {
          before.forEach(el => list.appendChild(el));
          alert('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.');
        }
      });
    });
  }
})();

// ----- progression de la mise à jour des images -----
(function () {
  const box = document.querySelector('[data-variants]');
  if (!box || !box.querySelector('[data-done]')) return;
  const timer = setInterval(async () => {
    try {
      const s = await (await fetch('/admin/images/etat', { headers: { accept: 'application/json' } })).json();
      box.querySelector('[data-done]').textContent = s.done;
      if (!s.running) {
        clearInterval(timer);
        box.querySelector('p').textContent = s.errors.length
          ? `${s.errors.length} image(s) n’ont pas pu être recalculées.`
          : 'Images à jour.';
      }
    } catch { clearInterval(timer); }
  }, 1500);
})();
