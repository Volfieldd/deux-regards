import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Audit des cookies, C11 : exécuter les blocs réels, sans DOM de substitution général ni dépendance navigateur.
// Les parcours Playwright vérifient ensuite l'initialisation de l'ensemble des scripts dans une vraie page.
const source = file => fs.readFileSync(new URL(`../public/admin/${file}`, import.meta.url), 'utf8');
const between = (file, start, end) => {
  const text = source(file), from = text.indexOf(start), to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `bloc trouvé dans ${file}`);
  return text.slice(from, to);
};
const refused = () => { throw Object.assign(new Error('Stockage refusé'), { name: 'SecurityError' }); };

function notification(storage, { getter = false } = {}) {
  const timers = [], writes = [], buttons = [];
  let html = '', calls = 0, reloads = 0;
  const box = {
    contains: () => false, addEventListener() {}, matches: () => false,
    classList: { toggle() {} }, replaceChildren: () => { html = ''; },
    appendChild: button => buttons.push(button),
    set innerHTML(text) { html = text; },
  };
  const document = { activeElement: null, contains: () => true, createElement: () => ({ addEventListener(name, fn) { this[name] = fn; } }) };
  const context = {
    document, window: {}, location: { reload: () => { reloads++; } },
    $: () => box, esc: text => text, tr: text => text,
    postJson: async (url, body) => { calls++; writes.push({ url, body }); return { text: 'Action annulée' }; },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }, clearTimeout() {},
  };
  Object.defineProperty(context, 'sessionStorage', { get: getter ? refused : () => storage });
  const block = between('admin.js', 'const toast = (() => {', '// ----- textes réservés');
  vm.runInNewContext(`${block}\nglobalThis.notification = toast;`, context);
  return { toast: context.notification, timers, buttons, writes,
    text: () => html, calls: () => calls, reloads: () => reloads,
    show: () => timers.find(t => t.delay === 50)?.fn() };
}

test('toast : un refus de lecture ou de suppression ne bloque pas les messages de la page', () => {
  for (const opts of [{ getter: true }, { storage: { getItem: refused } }, { storage: { getItem: () => 'message', removeItem: refused } }]) {
    const c = notification(opts.storage, opts);
    c.toast.show('Action enregistrée');
    c.show();
    assert.equal(c.text(), '<span>Action enregistrée</span>');
  }
});

test('toast : un refus d’écriture n’interrompt pas la suite d’une action', () => {
  const c = notification({ getItem: () => null, setItem: refused });
  assert.doesNotThrow(() => c.toast.keep('Action enregistrée', { action: 'annuler' }));
  c.toast.show('Message suivant');
  c.show();
  assert.equal(c.text(), '<span>Message suivant</span>');
});

test('toast : la reprise, l’annulation et la mémorisation fonctionnent quand le stockage est disponible', async () => {
  const values = new Map([['toast', JSON.stringify({ text: 'Action enregistrée', undo: { action: 'annuler', ids: '1' }, at: Date.now() })]]);
  const storage = { getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value) };
  const c = notification(storage);
  assert.equal(values.has('toast'), false, 'message consommé avant affichage');
  c.show();
  assert.equal(c.text(), '<span>Action enregistrée</span>');
  assert.equal(c.buttons.length, 1, 'annulation encore disponible');
  await c.buttons[0].click();
  assert.equal(c.calls(), 1);
  assert.equal(c.writes[0].url, '/admin/photos/actions');
  assert.equal(c.writes[0].body.action, 'annuler');
  assert.equal(c.reloads(), 1);
  assert.equal(JSON.parse(values.get('toast')).text, 'Action annulée');
});

function density(file, storage, { getter = false } = {}) {
  const handlers = new Map(), attributes = new Map(), style = new Map();
  let value = '190';
  const input = { get value() { return value; }, set value(v) { value = String(v); }, addEventListener: (type, fn) => handlers.set(type, fn) };
  const image = { getAttribute: key => attributes.get(key), setAttribute: (key, v) => attributes.set(key, v) };
  const contact = { style: { setProperty: (key, v) => style.set(key, v), removeProperty: key => style.delete(key) },
    querySelectorAll: () => [{ className: 'tile ar-150', querySelectorAll: () => [image] }] };
  const context = { $: () => input, contact, matchMedia: () => ({ matches: true, addEventListener() {} }) };
  Object.defineProperty(context, 'localStorage', { get: getter ? refused : () => storage });
  const block = between(file, '  // Taille des vignettes', '  // ---------- sélection');
  vm.runInNewContext(block, context);
  return { value: () => value, height: () => style.get('--rowh'), sizes: () => attributes.get('sizes'),
    change(v) { input.value = v; handlers.get('input')(); } };
}

for (const file of ['admin.js', 'v2/photos-v2.js']) {
  test(`${file} : le curseur et les images restent utilisables quand l’accès au stockage est refusé`, () => {
    const c = density(file, null, { getter: true });
    assert.equal(c.height(), '190px');
    const before = c.sizes();
    assert.doesNotThrow(() => c.change('320'));
    assert.equal(c.height(), '320px');
    assert.notEqual(c.sizes(), before, 'les tailles des images suivent le curseur');
  });

  test(`${file} : une écriture refusée ne bloque pas l’application de la taille`, () => {
    const c = density(file, { getItem: () => '250', setItem: refused });
    assert.equal(c.height(), '250px');
    assert.doesNotThrow(() => c.change('320'));
    assert.equal(c.height(), '320px');
  });

  test(`${file} : la taille mémorisée est reprise puis actualisée quand le stockage est disponible`, () => {
    const values = new Map([['planche-taille', '250']]);
    const c = density(file, { getItem: key => values.get(key), setItem: (key, v) => values.set(key, v) });
    assert.equal(c.value(), '250');
    assert.equal(c.height(), '250px');
    c.change('320');
    assert.equal(values.get('planche-taille'), '320');
    assert.equal(c.height(), '320px');
  });
}
