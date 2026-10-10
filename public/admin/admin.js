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
    const submit = form.querySelector('button[type=submit]');
    form.addEventListener('submit', () => {
      progress.textContent = 'Import en cours… les variantes sont générées, cela peut prendre un moment.';
      submit.disabled = true;
    });
    // Retour arrière (cache de navigation) : le formulaire redevient utilisable.
    addEventListener('pageshow', () => { submit.disabled = false; progress.textContent = ''; show(); });
  }

  // ----- réordonnancement des photos par glisser-déposer -----
  // Les boutons ↑ ↓ restent l'alternative clavier et sans JS.
  const list = document.querySelector('.plist[data-sortable]');
  if (list) {
    let dragged = null;
    const clear = () => list.querySelectorAll('.drop-before, .drop-after').forEach(li => li.classList.remove('drop-before', 'drop-after'));
    // Moitié basse de la ligne visée : on dépose après elle (indispensable pour atteindre la dernière place).
    const after = (li, e) => e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
    // Numéros et boutons ↑ ↓ suivent l'ordre affiché.
    const renumber = () => [...list.children].forEach((el, i, all) => {
      el.querySelector('.handle').textContent = `N°${String(i + 1).padStart(2, '0')}`;
      const [up, down] = el.querySelectorAll('.move button');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === all.length - 1;
    });
    list.querySelectorAll('li').forEach(li => {
      li.draggable = true;
      li.addEventListener('dragstart', e => { dragged = li; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragend', () => { li.classList.remove('dragging'); clear(); dragged = null; });
      li.addEventListener('dragover', e => {
        if (!dragged || dragged === li) return;
        e.preventDefault();
        clear();
        li.classList.add(after(li, e) ? 'drop-after' : 'drop-before');
      });
      li.addEventListener('drop', async e => {
        e.preventDefault();
        if (!dragged || dragged === li) return;
        const before = [...list.children];
        list.insertBefore(dragged, after(li, e) ? li.nextSibling : li);
        clear();
        const ids = [...list.children].map(el => Number(el.dataset.id));
        try {
          const res = await fetch('/admin/photos/order', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, accept: 'application/json' },
            body: JSON.stringify({ ids }),
          });
          if (!res.ok) throw new Error(res.status);
          renumber();
        } catch {
          before.forEach(el => list.appendChild(el));
          renumber();
          alert('L’ordre n’a pas pu être enregistré. Rechargez la page et réessayez.');
        }
      });
    });
  }
})();

// ----- progression de la mise à jour des images -----
// Le nombre se met à jour sans être relu à chaque fois ; seul le message final est annoncé.
(function () {
  const box = document.querySelector('[data-variants]');
  if (!box || !box.querySelector('[data-done]')) return;
  const done = box.querySelector('[data-done]');
  const total = box.querySelector('[data-total]');
  const final = box.querySelector('[data-final]');
  const finish = (text, error) => {
    clearInterval(timer);
    box.querySelector('[data-running]').hidden = true;
    box.classList.toggle('error', Boolean(error));
    final.textContent = text;
  };
  const timer = setInterval(async () => {
    try {
      const res = await fetch('/admin/images/etat', { headers: { accept: 'application/json' }, redirect: 'manual' });
      if (!res.ok) return finish('Suivi interrompu : session expirée ? Rechargez la page.', true);
      const s = await res.json();
      done.textContent = s.done;
      if (total) total.textContent = s.total;
      if (!s.running) {
        finish(s.errors.length
          ? `${s.errors.length} image(s) n’ont pas pu être recalculées : ${s.errors.map(e => e.title).join(', ')}.`
          : 'Images à jour.', s.errors.length);
      }
    } catch {
      finish('Suivi interrompu. Rechargez la page pour voir l’état des images.', true);
    }
  }, 1500);
})();
