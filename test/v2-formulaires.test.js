import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { setup, VIGIE_KEYS } from './helpers.js';

// Site public v2 : pages à formulaire (/bonjour, Signaler, Partager sans script, photo offerte ; maquettes MQ-05 et
// MQ-00). Les gabarits v2 envoient exactement ce qu'envoie la v1 (mêmes champs, même méthode, même action, même champ
// piège) ; le serveur ne change pas : chaque accroche de la Vigie (champ piège, provenance, limite de débit, jeton faux)
// est vérifiée en v1 ET en v2, avec un envoi construit à partir des champs que la page affiche.
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: KEY, VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const VERSIONS = ['v1', 'v2'];
const SLUG = 'brume-sur-la-loire';

// Vigie simulée : vérifie la signature de chaque lot et garde les événements reçus (comme test/vigie-emission.test.js).
function fakeVigie() {
  const v = { events: [] };
  v.send = async (body, headers) => {
    const expected = crypto.createHmac('sha256', KEY).update(`${headers['x-vigie-ts']}.${headers['x-vigie-nonce']}.${body}`).digest('hex');
    assert.equal(headers['x-vigie-sig'], expected, 'signature du lot');
    v.events.push(...JSON.parse(body).lot);
  };
  v.of = type => v.events.filter(e => e.type === type);
  return v;
}
// Un site (avec ou sans Vigie) dans la version demandée.
// vigie : true (Vigie simulée), 'off' (sans Vigie, même sous npm run test:vigie), sinon le réglage de la suite.
async function site(t, version, { vigie = false } = {}) {
  const fake = fakeVigie();
  const c = vigie === true ? await setup(t, { seeded: true, env: VIGIE, vigieOptions: { send: fake.send, timers: false, pollDecisions: false } })
    : await setup(t, { seeded: true, ...(vigie === 'off' ? { env: { VIGIE_URL: '' } } : {}) });
  c.app.publicVersion.save(version);
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return fake; };
  return { ...c, vigie: fake, flush };
}

// Le formulaire d'une page (par son action) : méthode, attributs, et ses champs (balise, type, nom ; la valeur des
// radios et des champs cachés, qui font partie de ce qui est envoyé).
const attrs = s => Object.fromEntries([...s.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(m => [m[1], m[2] ?? '']));
function formOf(body, action) {
  const m = body.match(new RegExp(`<form([^>]*\\saction="${action.replace(/[/?.]/g, '\\$&')}"[^>]*)>([\\s\\S]*?)</form>`));
  assert.ok(m, `formulaire ${action}`);
  const a = attrs(m[1]);
  const fields = [...m[2].matchAll(/<(input|textarea|select)\b([^>]*)>/g)].map(([, tag, at]) => {
    const x = attrs(at);
    const type = tag === 'input' ? x.type || 'text' : tag;
    return { tag, type, name: x.name, value: x.value ?? '', checked: 'checked' in x, attrs: x };
  }).filter(f => f.name);
  const sig = [...new Set(fields.map(f => `${f.type}:${f.name}${f.type === 'radio' || f.type === 'hidden' ? `=${f.value}` : ''}`))].sort();
  return { method: a.method, action: a.action, novalidate: 'novalidate' in a, fields, sig, html: m[2] };
}
// L'envoi que ferait un navigateur depuis ce formulaire : chaque champ, avec la valeur donnée (ou celle de la page).
function payloadOf(form, values = {}) {
  const out = new URLSearchParams();
  for (const f of form.fields) {
    if (f.type === 'radio') { if (f.name in values ? values[f.name] === f.value : f.checked) out.append(f.name, f.value); continue; }
    if (f.type === 'checkbox') { if (values[f.name] ?? f.checked) out.append(f.name, 'on'); continue; }
    out.append(f.name, values[f.name] ?? f.value);
  }
  for (const [k, v] of Object.entries(values)) if (!form.fields.some(f => f.name === k)) assert.fail(`champ absent de la page : ${k}`);
  return out.toString();
}
const post = (app, url, payload, { ip = '198.51.100.1', origin } = {}) => app.inject({ method: 'POST', url, payload, remoteAddress: ip,
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) } });
// Espace fine insécable (lexique § 2) lue comme une espace, pour écrire les motifs.
const nb = s => s.replace(/[\u202f\u00a0]/g, ' ');
const TRAP = /<div class="(?:hello-trap|piege)" aria-hidden="true"><label>Website <input name="website" tabindex="-1" autocomplete="off"><\/label><\/div>/;
const rules = (file, sel) => fs.readFileSync(new URL(`../public/css/${file}`, import.meta.url), 'utf8').match(new RegExp(`^\\${sel} \\{([^}]*)\\}`, 'm'))?.[1].trim();

test('mêmes champs, même méthode, même action, même champ piège en v1 et en v2 (Bonjour, Signaler)', async t => {
  const c = await site(t, 'v1');
  const pages = [['/bonjour', '/bonjour'], ['/bonjour/J', '/bonjour'], ['/de/bonjour', '/de/bonjour'], ['/en/bonjour/J-0142', '/en/bonjour'],
    [`/photo/${SLUG}/signaler`, `/photo/${SLUG}/signaler`], [`/de/photo/${SLUG}/signaler`, `/de/photo/${SLUG}/signaler`]];
  const seen = {};
  for (const version of VERSIONS) {
    c.app.publicVersion.save(version);
    for (const [url, action] of pages) {
      const res = await c.app.inject(url);
      assert.equal(res.statusCode, 200, `${version} ${url}`);
      if (version === 'v2') assert.match(res.body, /css\/v2\/formulaires\.css/, url);
      const f = formOf(res.body, action);
      assert.deepEqual([f.method, f.novalidate], ['post', true], `${version} ${url}`);
      assert.match(f.html, TRAP, `${version} ${url} : champ piège`);
      assert.equal(res.body.match(/name="website"/g).length, 1);
      (seen[url] ??= {})[version] = f.sig;
    }
    // Après un envoi refusé (erreurs, saisie gardée) : toujours les mêmes champs.
    const form = formOf((await c.app.inject('/bonjour')).body, '/bonjour');
    const res = await post(c.app, '/bonjour', payloadOf(form, { email: 'a,b', wants_photo: true, adult: 'oui' }), { ip: `198.51.100.${version === 'v1' ? 2 : 3}` });
    assert.equal(res.statusCode, 422);
    (seen['bonjour 422'] ??= {})[version] = formOf(res.body, '/bonjour').sig;
  }
  for (const [url, s] of Object.entries(seen)) assert.deepEqual(s.v2, s.v1, `${url} : champs envoyés`);
  // Les noms attendus, tels que les lit le serveur (server/encounters.js, server/feedback.js).
  // Âge et nom du parent (les champs de l'app de terrain), date en texte libre : les mêmes en v1 et en v2 (registre de la
  // Vigie, « Bonjour : mineurs et date libre »).
  assert.deepEqual(seen['/bonjour'].v2, ['checkbox:scope_instagram', 'checkbox:scope_name', 'checkbox:scope_print', 'checkbox:scope_site', 'checkbox:wants_photo',
    'email:email', 'email:guardian_email', 'radio:adult=moins15', 'radio:adult=non', 'radio:adult=oui', 'radio:decision=', 'radio:decision=accord', 'radio:decision=refus', 'radio:rights=', 'radio:rights=acces', 'radio:rights=effacement',
    'text:details', 'text:guardian', 'text:met_on', 'text:met_time', 'text:name', 'text:place', 'text:ref', 'text:website', 'textarea:message']);
  assert.ok(seen['/bonjour/J'].v2.includes('hidden:photographer=J'), 'QR d’un photographe : champ caché gardé');
  assert.deepEqual(seen[`/photo/${SLUG}/signaler`].v2, ['email:email', 'radio:kind=autre', 'radio:kind=inapproprie', 'radio:kind=texte', 'text:website', 'textarea:message']);
  // Le champ piège est caché de la même manière : hors de l'écran, 1 px, sans débordement.
  assert.equal(rules('v2/formulaires.css', '.piege'), rules('site.css', '.hello-trap'));
  assert.equal(rules('v2/formulaires.css', '.piege'), 'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;');
});

for (const version of VERSIONS) {
  test(`${version} · /bonjour : envoi accepté, champ piège, autre site, limite de débit, code de carte faux (Vigie)`, async t => {
    const c = await site(t, version, { vigie: true });
    const count = () => c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get();
    const form = formOf((await c.app.inject('/bonjour')).body, '/bonjour');
    const ok = { ref: 'J-0142', wants_photo: true, adult: 'oui', email: 'alice@exemple.fr' };
    // Envoi ordinaire, construit depuis les champs de la page : accepté et enregistré.
    let r = await post(c.app, '/bonjour', payloadOf(form, ok), { ip: '198.51.100.10' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/bonjour/merci?ref=J-0142']);
    assert.equal(count(), 1);
    // Champ piège rempli : « merci » sans rien enregistrer, et signalé.
    r = await post(c.app, '/bonjour', payloadOf(form, { ...ok, ref: 'J-0143', website: 'http://spam.example' }), { ip: '198.51.100.11' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/bonjour/merci']);
    assert.equal(count(), 1);
    // Depuis un autre site : refusé (même réponse), signalé.
    r = await post(c.app, '/bonjour', payloadOf(form, { ...ok, ref: 'J-0144' }), { ip: '198.51.100.12', origin: 'https://ailleurs.example' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, '/bonjour/merci']);
    assert.equal(count(), 1);
    // Code de carte faux : signalé comme jeton deviné.
    const good = c.app.encounters.codeOf('J-0150');
    r = await post(c.app, '/bonjour', payloadOf(form, { ...ok, ref: `J-0150-${good[0] === 'A' ? 'B' : 'A'}${good.slice(1)}` }), { ip: '198.51.100.13' });
    assert.equal(r.statusCode, 422);
    // Limite : 8 demandes par heure et par adresse ; la 9e est refusée (429), signalée, et la saisie gardée.
    for (let i = 0; i < 8; i++) assert.equal((await post(c.app, '/bonjour', payloadOf(form, { email: 'x' }), { ip: '198.51.100.14' })).statusCode, 422);
    r = await post(c.app, '/bonjour', payloadOf(form, { ...ok, message: 'Bonjour' }), { ip: '198.51.100.14' });
    assert.equal(r.statusCode, 429);
    assert.match(r.body, /Bonjour<\/textarea>/);
    if (version === 'v2') {
      assert.match(r.body, /<div class="msg" id="limite" role="status" tabindex="-1" autofocus>/);
      assert.match(nb(r.body), /<title>Envoi suspendu un moment · Je vous ai photographié · Test<\/title>/);
      assert.doesNotMatch(r.body, /class="resume"/);
    }
    assert.equal(count(), 1);
    const v = await c.flush();
    assert.deepEqual(v.of('malicious_honeypot').map(e => [e.detail.piege, e.detail.formulaire]), [['champ caché', 'bonjour']]);
    assert.deepEqual(v.of('input_validation_fail').map(e => [e.detail.formulaire, e.detail.origine]), [['bonjour', 'https://ailleurs.example']]);
    assert.deepEqual(v.of('excess_rate_limit_exceeded').map(e => e.detail.limite), ['bonjour']);
    assert.deepEqual(v.of('token_guess').map(e => e.detail.nature), ['code de carte']);
  });

  test(`${version} · Signaler : envoi accepté, champ piège, autre site, limite de débit (Vigie)`, async t => {
    const c = await site(t, version, { vigie: true });
    const count = () => c.db.prepare('SELECT COUNT(*) FROM photo_reports').pluck().get();
    const url = `/photo/${SLUG}/signaler`;
    const form = formOf((await c.app.inject(url)).body, url);
    const ok = { kind: 'texte', message: 'Le lieu est faux.' };
    let r = await post(c.app, url, payloadOf(form, ok), { ip: '198.51.100.20' });
    assert.deepEqual([r.statusCode, r.headers.location], [303, `${url}?envoye=1`]);
    assert.equal(count(), 1);
    r = await post(c.app, url, payloadOf(form, { ...ok, website: 'x' }), { ip: '198.51.100.21' });
    assert.deepEqual([r.statusCode, r.headers.location, count()], [303, `${url}?envoye=1`, 1]);
    r = await post(c.app, url, payloadOf(form, ok), { ip: '198.51.100.22', origin: 'https://ailleurs.example' });
    assert.deepEqual([r.statusCode, r.headers.location, count()], [303, `${url}?envoye=1`, 1]);
    for (let i = 0; i < 5; i++) assert.equal((await post(c.app, url, payloadOf(form, { kind: 'texte', message: '' }), { ip: '198.51.100.23' })).statusCode, 422);
    r = await post(c.app, url, payloadOf(form, ok), { ip: '198.51.100.23' });
    assert.equal(r.statusCode, 429);
    assert.match(r.body, /Le lieu est faux\.<\/textarea>/);
    if (version === 'v2') assert.match(r.body, /id="limite" role="status" tabindex="-1" autofocus/);
    assert.equal(count(), 1);
    const v = await c.flush();
    assert.deepEqual(v.of('malicious_honeypot').map(e => e.detail.formulaire), ['signalement']);
    assert.deepEqual(v.of('input_validation_fail').map(e => e.detail.formulaire), ['signalement']);
    assert.deepEqual(v.of('excess_rate_limit_exceeded').map(e => e.detail.limite), ['signalement']);
  });

  test(`${version} · photo offerte : jeton inconnu signalé, page privée inchangée ; Partager : compte refusé depuis un autre site`, async t => {
    const c = await site(t, version, { vigie: true });
    for (const url of ['/pour-vous/abcdefghijklmnopqrstuvwxyz012345', '/pour-vous/abcdefghijklmnopqrstuvwxyz012345/photo.jpg']) {
      const r = await c.app.inject({ url, remoteAddress: '198.51.100.30' });
      assert.equal(r.statusCode, 404, url);
    }
    // Lien valide puis expiré : mêmes en-têtes qu'en v1 (ni indexé, ni gardé, aucun Referer : le jeton ne sort jamais de
    // la page), 410 une fois expiré.
    const enc = c.db.prepare("INSERT INTO encounters (ref, author_id, lang, created_at, updated_at) VALUES ('J-0901', 1, 'de', 1, 1)").run().lastInsertRowid;
    const photo = c.db.prepare("SELECT id FROM photos WHERE slug = ?").pluck().get(SLUG);
    c.db.prepare('INSERT INTO encounter_shares (token, encounter_id, photo_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run('offerteOffertE0123456789abcdefgh', enc, photo, Date.now(), Date.now() + 864e5);
    let r = await c.app.inject('/pour-vous/offerteOffertE0123456789abcdefgh');
    assert.deepEqual([r.statusCode, r.headers['x-robots-tag'], r.headers['cache-control'], r.headers['referrer-policy']], [200, 'noindex', 'no-store', 'no-referrer']);
    assert.match(r.body, /<html lang="de"/);
    assert.match(r.body, /href="\/pour-vous\/offerteOffertE0123456789abcdefgh\/photo\.jpg" download/);
    // Le jeton ne sort pas de la page : ni sélecteur de langue, ni autre adresse qui le recopie.
    assert.equal(r.body.match(/offerteOffertE0123456789abcdefgh/g).length, 2);
    assert.doesNotMatch(r.body, /\/langue\//);
    c.db.prepare('UPDATE encounter_shares SET expires_at = 1').run();
    r = await c.app.inject('/pour-vous/offerteOffertE0123456789abcdefgh');
    assert.equal(r.statusCode, 410);
    assert.match(r.body, /href="\/de\/bonjour\/J-0901"/);
    // Partager : aucun formulaire ; le compte d'un partage (même route qu'avec la fenêtre) est refusé depuis un autre site.
    const page = (await c.app.inject(`/photo/${SLUG}/partager`)).body;
    assert.doesNotMatch(page, /<form(?![^>]*apercu-v2)/);
    if (version === 'v2') assert.match(page, new RegExp(`data-share-page data-share-url="[^"]+" data-share-title="[^"]+" data-share-count="/photo/${SLUG}/partage"`));
    r = await c.app.inject({ method: 'POST', url: `/photo/${SLUG}/partage`, payload: 'via=copie', remoteAddress: '198.51.100.31',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://ailleurs.example' } });
    assert.equal(r.statusCode, 429);
    assert.equal(c.db.prepare('SELECT COUNT(*) FROM photo_shares').pluck().get(), 0);
    const v = await c.flush();
    assert.ok(v.of('token_guess').some(e => e.detail.nature === 'lien de photo offerte'));
    assert.deepEqual(v.of('input_validation_fail').map(e => e.detail.formulaire), ['partage']);
  });

  test(`${version} · sans Vigie : mêmes réponses (piège, autre site, limite), rien n’est émis`, async t => {
    const c = await site(t, version, { vigie: 'off' });
    assert.equal(c.app.securite.enabled, false);
    const form = formOf((await c.app.inject('/bonjour')).body, '/bonjour');
    const ok = { ref: 'J-0142', wants_photo: true, adult: 'oui', email: 'alice@exemple.fr' };
    assert.equal((await post(c.app, '/bonjour', payloadOf(form, { ...ok, website: 'x' }))).headers.location, '/bonjour/merci');
    assert.equal((await post(c.app, '/bonjour', payloadOf(form, ok), { origin: 'https://ailleurs.example' })).headers.location, '/bonjour/merci');
    assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get(), 0);
    assert.equal((await c.app.inject('/pour-vous/abcdefghijklmnopqrstuvwxyz012345')).statusCode, 404);
    assert.doesNotMatch((await c.app.inject('/bonjour')).body, /tout-telecharger/);
  });
}

test('v2 · /bonjour : erreurs de la planche (résumé dès deux points, focus sur le champ pour un seul), saisie gardée, remerciement', async t => {
  const c = await site(t, 'v2');
  const form = formOf((await c.app.inject('/bonjour')).body, '/bonjour');
  // Deux points : le résumé en tête prend le focus ; un lien par point, vers son champ ; le titre de l'onglet le dit.
  let r = await post(c.app, '/bonjour', payloadOf(form, { email: 'claire@example,org', wants_photo: true, adult: 'oui', message: 'Nous étions deux.' }), { ip: '198.51.100.40' });
  let b = nb(r.body);
  assert.equal(r.statusCode, 422);
  assert.match(b, /<title>Erreur : 2 points à corriger · Je vous ai photographié · Test<\/title>/);
  assert.match(b, /<section class="resume" id="resume" tabindex="-1" autofocus aria-labelledby="resume-t"><h2 class="resume-t" id="resume-t">.*2 points à corriger<\/h2>/);
  assert.deepEqual([...b.match(/<section class="resume"[\s\S]*?<\/section>/)[0].matchAll(/href="#([\w-]+)"/g)].map(m => m[1]), ['bj-date', 'bj-email']);
  assert.equal(b.match(/autofocus/g).length, 1);
  assert.match(b, /<input id="bj-email" type="email" name="email" value="claire@example,org" maxlength="200" autocomplete="email" aria-describedby="err-email bj-email-aide" aria-invalid="true">/);
  assert.match(b, /<p class="champ-err" id="err-email">.*<b>Erreur :<\/b> adresse e-mail invalide : écrivez-la sous la forme nom@domaine\.fr\.<\/span><\/p>/);
  assert.match(b, /<details class="depliant" open>/, 'sans carte : le dépliant « quand et où » est ouvert sur son erreur');
  assert.match(b, />Nous étions deux\.<\/textarea>/);
  assert.match(b, /<input id="bj-photo" type="checkbox" name="wants_photo" checked>/);
  // Un seul point : pas de résumé, le champ prend le focus ; le titre nomme le champ.
  r = await post(c.app, '/de/bonjour', payloadOf(formOf((await c.app.inject('/de/bonjour')).body, '/de/bonjour'), { ref: 'J-0142', wants_photo: true, adult: 'oui' }), { ip: '198.51.100.41' });
  b = nb(r.body);
  assert.match(b, /<title>Fehler: Ihre E-Mail · Ich habe Sie fotografiert · Test<\/title>/);
  assert.doesNotMatch(b, /class="resume"/);
  assert.match(b, /<input id="bj-email"[^>]*aria-invalid="true" autofocus>/);
  assert.equal(b.match(/autofocus/g).length, 1);
  // Erreur d'un groupe : sous sa légende, le groupe décrit par elle, le premier choix prend le focus.
  r = await post(c.app, '/bonjour', payloadOf(form, { ref: 'J-0142', decision: 'accord', adult: 'oui', email: 'a@exemple.fr', name: 'Alice' }), { ip: '198.51.100.42' });
  assert.match(nb(r.body), /<fieldset class="groupe groupe--erreur" aria-describedby="bj-pub-aide err-scopes"><legend>Publication de la photo<\/legend>/);
  assert.match(r.body, /<input id="bj-scope-site" type="checkbox" name="scope_site" aria-invalid="true" autofocus>/);
  // Page vide : la règle d'obligation, « facultatif » écrit, aucun focus imposé ; la suite du parcours.
  b = nb((await c.app.inject('/bonjour')).body);
  assert.match(b, /<p class="form-oblig">Tous les champs sont obligatoires, sauf mention « facultatif ».<\/p>/);
  assert.match(b, /<label for="bj-heure">Vers quelle heure <span class="facultatif">\(facultatif\)<\/span><\/label>/);
  assert.match(b, /<h2 id="bj-ensuite-t">Ce qui se passe ensuite<\/h2>/);
  assert.doesNotMatch(b, /autofocus/);
  assert.doesNotMatch(b, /\sstyle=/);
  assert.doesNotMatch(b, /<script(?![^>]*\ssrc=)/);
  assert.equal(b.match(/name="(?:adult|guardian|guardian_email)"/g).length, 5, 'âge (trois réponses), nom et adresse du parent, rien d’autre de nouveau');
  // Carte reconnue (QR) : la référence et le photographe, sans rien dire du code.
  const code = c.app.encounters.codeOf('J-0142');
  assert.match(nb((await c.app.inject(`/bonjour/J-0142-${code}`)).body), /<p class="pf-carte"><span class="donnee">J-0142<\/span>&nbsp;· Carte de Julien : merci de l’avoir gardée\.<\/p>/);
  // Remerciement : le titre prend le focus ; la référence en donnée.
  b = (await c.app.inject('/bonjour/merci?ref=J-0142')).body;
  assert.match(b, /<h1 class="titre-page" id="merci-t" tabindex="-1" autofocus>Merci, c’est noté\.<\/h1>/);
  assert.match(b, /<div class="msg msg--ok" role="status">.*<b>Envoyé\.<\/b>/);
  assert.match(b, /<dd class="donnee">J-0142<\/dd>/);
  assert.doesNotMatch(b, /<form(?![^>]*apercu-v2)/);
});

test('v2 · Signaler, Partager, photo offerte : en-têtes, focus, sans style ni script en ligne', async t => {
  const c = await site(t, 'v2');
  const url = `/photo/${SLUG}/signaler`;
  let b = (await c.app.inject(url)).body;
  assert.match(b, /<a class="sh-retour" href="\/photo\/brume-sur-la-loire" data-retour>/, 'retour à la photo');
  assert.match(b, /<div class="photo-ref">\s*<picture>/);
  assert.match(b, /href="\/bonjour">Je vous ai photographié<\/a>/);
  assert.doesNotMatch(b, /autofocus/);
  const form = formOf(b, url);
  let r = await post(c.app, url, payloadOf(form, { email: 'faux' }), { ip: '198.51.100.50' });
  r.body = nb(r.body);
  assert.match(r.body, /<title>Erreur : 2 points à corriger · Signaler cette photo · Test<\/title>/);
  assert.deepEqual([...r.body.match(/<section class="resume"[\s\S]*?<\/section>/)[0].matchAll(/href="#([\w-]+)"/g)].map(m => m[1]), ['sg-kind-inapproprie', 'sg-email']);
  assert.match(r.body, /<fieldset class="bloc groupe groupe--erreur" aria-describedby="err-kind">/);
  r = await post(c.app, url, payloadOf(form, { kind: 'autre' }), { ip: '198.51.100.51' });
  assert.match(r.body, /<textarea id="sg-message" name="message" rows="4" maxlength="2000" aria-describedby="err-message sg-message-aide" aria-invalid="true" autofocus>/);
  b = (await c.app.inject(`${url}?envoye=1`)).body;
  assert.match(b, /<div class="msg msg--ok" role="status" tabindex="-1" autofocus>.*Merci, votre message est bien arrivé\./);
  assert.doesNotMatch(b, /<form(?![^>]*apercu-v2)/);
  // Partager sans la fenêtre : la fenêtre de la v2 en page, « Copier le lien » seulement avec le script.
  b = (await c.app.inject(`/en/photo/${SLUG}/partager`)).body;
  assert.match(b, /<h1 class="titre-page">Share<\/h1>/);
  assert.match(b, /<button type="button" class="share-copy-btn" data-share-copy data-copied="✓ Link copied" data-js-only hidden>/);
  assert.match(b, /data-share-count="\/en\/photo\/brume-sur-la-loire\/partage"/);
  // Photo offerte : la marque seule dans l'en-tête, la photo nommée, le téléchargement.
  const enc = c.db.prepare("INSERT INTO encounters (ref, author_id, lang, created_at, updated_at) VALUES ('J-0902', 1, 'fr', 1, 1)").run().lastInsertRowid;
  const photo = c.db.prepare("SELECT id FROM photos WHERE slug = ?").pluck().get(SLUG);
  c.db.prepare('INSERT INTO encounter_shares (token, encounter_id, photo_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run('offerteOffertF0123456789abcdefgh', enc, photo, Date.now(), Date.now() + 864e5);
  b = (await c.app.inject('/pour-vous/offerteOffertF0123456789abcdefgh')).body;
  assert.match(b, /<header class="sh sh--tunnel">\s*<div class="sh-bar">\s*<a class="sh-marque" href="\/" aria-label="Test, accueil">Test<\/a>\s*<\/div>\s*<\/header>/);
  assert.match(b, /<img src="\/pour-vous\/offerteOffertF0123456789abcdefgh\/apercu\.jpg" alt="Brume sur la Loire" width="\d+" height="\d+"/);
  for (const page of [b, (await c.app.inject(url)).body, (await c.app.inject(`/photo/${SLUG}/partager`)).body]) {
    assert.doesNotMatch(page, /\sstyle=/);
    assert.doesNotMatch(page, /<script(?![^>]*\ssrc=)/);
    assert.match(page, /css\/v2\/formulaires\.css/);
  }
  // Les autres pages v2 ne chargent pas la feuille des formulaires.
  assert.doesNotMatch((await c.app.inject('/')).body, /formulaires\.css/);
});

test('v2 avec la Vigie : lien piège seul et caché sur les pages à formulaire, robots.txt inchangé', async t => {
  const c = await site(t, 'v2', { vigie: true });
  c.db.prepare("INSERT INTO encounters (ref, author_id, lang, created_at, updated_at) VALUES ('J-0903', 1, 'fr', 1, 1)").run();
  for (const url of ['/bonjour', '/bonjour/merci', `/photo/${SLUG}/signaler`, `/photo/${SLUG}/partager`]) {
    const b = (await c.app.inject(url)).body;
    assert.equal(b.match(/tout-telecharger/g)?.length, 1, url);
    assert.match(b, /<a href="\/galerie\/tout-telecharger" rel="nofollow" hidden tabindex="-1" aria-hidden="true">archives<\/a>/, url);
  }
  assert.match((await c.app.inject('/robots.txt')).body, /Disallow: \/galerie\/tout-telecharger/);
});
