import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import sharp from 'sharp';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createSessionStore } from '../server/sessions.js';

// Mineurs, suite de la PR #187 (décisions du propriétaire du 20 octobre 2026) :
//   1. l'app de terrain (v1 et v2) demande l'âge aussi pour un simple envoi de la photo (ou dès qu'une adresse est notée)
//      et propose « moins de 15 ans » : l'adresse d'un parent remplace celle de l'enfant, jamais gardée (email_parent,
//      sans empreinte) ; la phrase des deux parents sous le nom du parent ;
//   2. /bonjour : « moins de 15 ans » aussi pour une publication seule, sans la photo (l'adresse d'un parent) ;
//   3. la photo offerte et le récapitulatif envoyés à un parent s'adressent au parent, pas à l'enfant (fr, en, de).
// Rien de personnel dans un événement de la Vigie ; mêmes lectures sensibles en v1 et en v2.
const VIGIE = { VIGIE_URL: 'http://vigie:4100', VIGIE_INGEST_KEY: 'cle-de-signature-vigie-0123456789abcdef', VIGIE_DECISIONS_PUBKEY: VIGIE_KEYS.pub64 };
const DATA_KEY = 'cle-des-donnees-personnelles-0123456789abcdef';
const nb = s => s.replace(/[  ]/g, ' ');
const isV2 = html => html.includes('/static/admin/v2/app-v2.css');

function fakeTransport() {
  const sent = [];
  return { sent, sendMail: async msg => { sent.push(msg); return { messageId: 'x' }; } };
}

async function site(t) {
  const events = [];
  const transport = fakeTransport();
  const c = await setup(t, { seeded: true, env: { ...VIGIE, DATA_KEY }, mailTransport: transport,
    vigieOptions: { send: async body => { events.push(...JSON.parse(body).lot); }, timers: false, pollDecisions: false } });
  c.app.publicVersion.save('v2');
  const flush = async () => { c.app.securite.runTasks(); c.app.securite.retryNow(); await c.app.securite.flush(); return events; };
  const store = createSessionStore(c.db);
  const jul = c.db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  // Un compte administrateur (l'app au nom de Julien), en v1 ou en v2 (choix par compte).
  const account = async (sub, version) => {
    c.app.accounts.ensure({ sub, name: sub, roles: ['admin'] });
    const token = store.create({ sub, name: sub, roles: [] });
    const csrf = c.db.prepare('SELECT csrf FROM sessions WHERE id = ?').pluck().get(crypto.createHash('sha256').update(token).digest('hex'));
    const cookies = { session: token };
    const get = async url => { const r = await c.app.inject({ url, cookies, headers: { accept: 'text/html' } }); r.body = nb(r.body); return r; };
    const post = async (url, payload = {}) => c.app.inject({ method: 'POST', url, cookies, headers: { accept: 'text/html' }, payload: { ...payload, _csrf: csrf } });
    // Envoi de l'app (multipart, comme le téléphone).
    const send = async fields => {
      const boundary = `----t${crypto.randomBytes(6).toString('hex')}`;
      const parts = Object.entries({ _csrf: csrf, author_id: String(jul), ...fields }).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      const r = await c.app.inject({ method: 'POST', url: '/admin/rencontre', cookies, payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, accept: 'text/html' } });
      r.body = nb(r.body);
      return r;
    };
    await post('/admin/version', { version, back: '/admin' });
    await get('/admin/aide');
    return { get, post, send };
  };
  const last = () => c.app.encounters.get(c.db.prepare('SELECT MAX(id) FROM encounters').pluck().get());
  const count = () => c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get();
  // Tout ce que la base garde (lignes en clair et déchiffrées, historique, exports) : pour vérifier qu'une adresse n'y est pas.
  const everything = () => {
    const ids = c.db.prepare('SELECT id FROM encounters').pluck().all();
    return JSON.stringify([c.db.prepare('SELECT * FROM encounters').all(), c.db.prepare('SELECT * FROM encounter_events').all(),
      ids.map(id => [c.app.encounters.get(id), c.app.encounters.events(id), c.app.encounters.exportData(id)?.data])]);
  };
  return { ...c, flush, events, transport, account, jul, last, count, everything };
}
const signature = async () => `data:image/png;base64,${(await sharp({ create: { width: 600, height: 180, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()).toString('base64')}`;

// ---------- 1. l'app de terrain ----------

test('app (v1 et v2) : l’âge est demandé aussi pour recevoir la photo ou dès qu’une adresse est notée ; un refus anonyme, non', async t => {
  const c = await site(t);
  for (const version of ['v1', 'v2']) {
    const a = await c.account(`terrain-${version}`, version);
    const before = c.count();
    // « Recevoir la photo » sans âge : refusé, la question est marquée (phrase de la photo, dans la langue de la personne).
    let r = await a.send({ decision: '', wants_photo: 'on', email: 'personne@exemple.fr', lang: 'de' });
    assert.equal(r.statusCode, 422, `${version} : photo sans âge`);
    assert.equal(isV2(r.body), version === 'v2', `${version} : le compte voit sa version`);
    assert.ok(r.body.includes('Bitte beantworten Sie diese Frage: Wie alt sind Sie? Unter 15 wird das Foto an ein Elternteil geschickt.'), `${version} : phrase de l’âge pour la photo`);
    if (version === 'v1') assert.ok(r.body.includes('Indiquez l’âge de la personne : avant 15 ans, la photo est envoyée à un parent.'), 'v1 : message en tête');
    if (version === 'v1') {
      assert.match(r.body, /<fieldset class="app-age" data-group="adult" aria-describedby="err-adult-photo">/);
      assert.match(r.body, /<p class="app-err" id="err-adult-photo" data-err-for="adult" data-quand="photo">/);
      assert.match(r.body, /<p class="app-err" id="err-adult" data-err-for="adult" data-quand="accord" hidden>/);
    } else {
      assert.match(r.body, /<fieldset class="age groupe-err" id="age" data-group="adult" aria-describedby="age-e">/);
    }
    assert.equal([...r.body.matchAll(/name="adult" value="(oui|non|moins15)"[^>]* aria-invalid="true">/g)].length, 3, `${version} : trois réponses marquées`);
    // Une adresse seule (le récapitulatif y part) : de même.
    r = await a.send({ decision: 'refus', email: 'personne@exemple.fr', lang: 'fr' });
    assert.equal(r.statusCode, 422, `${version} : adresse sans âge`);
    assert.equal(c.count(), before);
    // Un refus sans adresse reste anonyme, sans âge.
    r = await a.send({ decision: 'refus', lang: 'fr' });
    assert.equal(r.statusCode, 303, `${version} : refus anonyme`);
    // Avec l'âge, la photo part à la personne (15 à 17 ans : sa propre adresse, comme 18 ans ou plus).
    r = await a.send({ decision: '', wants_photo: 'on', email: `ado-${version}@exemple.fr`, adult: 'non', lang: 'fr' });
    assert.equal(r.statusCode, 303);
    const e = c.last();
    assert.deepEqual([e.email, e.email_parent, Boolean(e.email_hash), e.adult, e.wants_photo], [`ado-${version}@exemple.fr`, 0, true, 0, 1]);
  }
});

test('app (v1 et v2) : « moins de 15 ans » : l’adresse d’un parent remplace celle de l’enfant, jamais gardée ; récapitulatif au parent', async t => {
  const c = await site(t);
  for (const [version, lang] of [['v1', 'fr'], ['v2', 'en'], ['v2', 'de']]) {
    const a = await c.account(`moins15-${version}-${lang}`, version);
    const child = `enfant-${version}-${lang}@exemple.fr`, parent = `parent-${version}-${lang}@exemple.fr`;
    const before = c.count();
    // Moins de 15 ans sans l'adresse d'un parent : refusé (celle de l'enfant ne compte pas), rien d'enregistré.
    let r = await a.send({ decision: '', wants_photo: 'on', email: child, adult: 'moins15', lang });
    assert.equal(r.statusCode, 422, `${version} ${lang} : sans adresse de parent`);
    assert.ok(r.body.includes('Moins de 15 ans : l’e-mail d’un parent est nécessaire') || r.body.includes('Under 15: a parent’s email is needed') || r.body.includes('Unter 15: Die E-Mail eines Elternteils ist nötig'));
    assert.match(r.body, /name="adult" value="moins15"[^>]* checked/, 'la réponse reste cochée');
    r = await a.send({ decision: '', wants_photo: 'on', adult: 'moins15', guardian_email: 'pas-une-adresse', lang });
    assert.equal(r.statusCode, 422);
    assert.equal(c.count(), before);
    // Publication avant 15 ans : le nom du parent est exigé (règle des 18 ans), et sa signature.
    r = await a.send({ decision: 'accord', scope_site: 'on', name: 'Léa Petit', adult: 'moins15', guardian_email: parent, email: child, signature: await signature(), lang });
    assert.equal(r.statusCode, 422, 'nom du parent exigé');
    assert.ok(r.body.includes('le nom du parent qui signe est nécessaire') || r.body.includes('name of the signing parent') || r.body.includes('unterschreibenden Elternteils'));
    // Complet : la rencontre porte l'adresse du parent, marquée, sans empreinte ; celle de l'enfant n'est nulle part.
    const sentBefore = c.transport.sent.length;
    r = await a.send({ decision: 'accord', scope_site: 'on', name: 'Léa Petit', adult: 'moins15', guardian: 'Anne Petit', guardian_email: parent, email: child, wants_photo: 'on', signature: await signature(), lang });
    assert.equal(r.statusCode, 303, `${version} ${lang} : enregistré`);
    const e = c.last();
    assert.deepEqual([e.email, e.email_parent, e.email_hash, e.adult, e.guardian, e.wants_photo], [parent, 1, null, 0, 'Anne Petit', 1]);
    assert.match(c.db.prepare('SELECT email FROM encounters WHERE id = ?').pluck().get(e.id), /^enc1:/, 'adresse du parent chiffrée');
    assert.ok(!c.everything().includes(child), 'adresse de l’enfant jamais gardée (fiche, historique, export)');
    assert.equal(c.app.encounters.exportData(e.id).data.email_du_parent, true);
    assert.equal(c.app.encounters.events(e.id).find(ev => ev.kind === 'app').detail.email_parent, true);
    // Le récapitulatif part au parent et s'adresse à lui (jamais « Bonjour Léa »).
    const mail = c.transport.sent.slice(sentBefore);
    assert.equal(mail.length, 1);
    assert.equal(mail[0].to, parent);
    const HELLO = { fr: /^Bonjour,\n\nMerci pour notre rencontre avec Léa Petit le .+\. Avant 15 ans, c’est à vous que nous écrivons\./, en: /^Hello,\n\nThank you for our meeting with Léa Petit on .+\. Under 15, we write to you\./, de: /^Hallo,\n\ndanke für unsere Begegnung mit Léa Petit am .+\. Unter 15 schreiben wir Ihnen\./ };
    assert.match(mail[0].text, HELLO[lang], `${lang} : formule d’appel au parent`);
    assert.doesNotMatch(mail[0].text, /^(Bonjour|Hello|Hallo) Léa/);
    // L'écran « Merci » : envoyé au parent.
    const merci = await a.get(`/admin/rencontre/${e.id}/merci`);
    assert.ok(merci.body.includes(parent));
    // La fiche le dit : « E-mail du parent ».
    assert.ok((await a.get(`/admin/rencontres/${e.id}`)).body.includes('<dt>E-mail du parent</dt>'), `${version} : fiche`);
  }
  // Moins de 15 ans, un refus sans adresse : rien d'autre à donner.
  const a = await c.account('refus15', 'v2');
  assert.equal((await a.send({ decision: 'refus', adult: 'moins15', lang: 'fr' })).statusCode, 303);
  assert.deepEqual([c.last().adult, c.last().email, c.last().email_parent], [0, '', 0]);
});

test('app (v1 et v2) : la réponse « moins de 15 ans », l’e-mail d’un parent et la phrase des deux parents, en trois langues', async t => {
  const c = await site(t);
  const PHRASE = { fr: 'avec l’accord des deux parents (ou du parent qui exerce seul l’autorité parentale)', en: 'with the consent of both parents (or of the parent who alone exercises parental authority)', de: 'mit Zustimmung beider Eltern erfolgt (oder des Elternteils, der das Sorgerecht allein ausübt)' };
  const UNDER = { fr: 'J’ai moins de 15 ans : la photo est envoyée à un parent', en: 'I am under 15: the photo is sent to a parent', de: 'Ich bin unter 15: Das Foto wird an ein Elternteil geschickt' };
  for (const version of ['v1', 'v2']) {
    const page = (await (await c.account(`page-${version}`, version)).get('/admin/rencontre')).body;
    assert.equal(isV2(page), version === 'v2', `${version} : le compte voit sa version`);
    assert.match(page, /<input type="radio" name="adult" value="moins15"/);
    assert.match(page, /<input type="email"[^>]* name="guardian_email" value="" maxlength="200" autocomplete="off" inputmode="email"/);
    for (const l of ['fr', 'en', 'de']) {
      assert.ok(page.includes(PHRASE[l]), `${version} ${l} : phrase des deux parents`);
      assert.ok(page.includes(UNDER[l]), `${version} ${l} : moins de 15 ans`);
    }
    assert.doesNotMatch(page, /style="/);
  }
  // v2 : l'âge vient avant l'adresse ; l'e-mail du parent et la phrase sous « E-mail » ne se montrent qu'avec « moins de
  // 15 ans », sans script (toujours visibles sans :has).
  const v2 = (await (await c.account('ordre', 'v2')).get('/admin/rencontre')).body;
  assert.ok(v2.indexOf('id="age"') < v2.indexOf('id="email"') && v2.indexOf('id="parent-email"') < v2.indexOf('id="email"'));
  assert.match(v2, /<div class="revele-15">/);
  assert.match(v2, /<p class="hint si-15" id="email-aide">/);
  const css = fs.readFileSync(new URL('../public/admin/v2/app-v2.css', import.meta.url), 'utf8');
  assert.match(css, /@supports selector\(:has\(\*\)\) \{\n {2}\.app-form:not\(:has\(input\[data-moins15\]:checked\)\) :is\(\.revele-15, \.si-15\) \{ display: none; \}\n\}/);
  // Les deux scripts suivent les mêmes règles que le serveur (avant l'envoi).
  for (const f of ['../public/admin/app.js', '../public/admin/v2/app-v2.js']) {
    const js = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(js, /const under15 = f\.adult\.value === 'moins15';/, f);
    assert.match(js, /f\.adult\.value !== 'oui' && !f\.guardian\.value\.trim\(\)/, f);
  }
});

// ---------- 2. /bonjour : une publication seule avant 15 ans ----------

test('/bonjour : « moins de 15 ans » pour une publication seule (sans la photo) : nom et adresse d’un parent, jamais celle de l’enfant', async t => {
  const c = await site(t);
  let n = 0;
  const hello = payload => c.app.inject({ method: 'POST', url: '/bonjour', payload, remoteAddress: `198.51.100.${++n}` });
  // Proposé dès qu'un accord est coché (sans script) : la règle CSS, et l'identifiant de « J'accepte ».
  const page = nb((await c.app.inject('/bonjour')).body);
  assert.match(page, /<input id="bj-accord" type="radio" name="decision" value="accord"/);
  assert.match(page, /<label class="choix si-usage"><input id="bj-age-15" type="radio" name="adult" value="moins15"/);
  assert.ok(page.includes('J’ai moins de 15 ans : un parent remplit ce formulaire avec moi et reçoit les réponses'));
  // Sans le nom du parent : refusé (règle des 18 ans) ; sans son adresse : refusé (celle de l'enfant ne compte pas).
  let r = await hello({ ref: 'J-0600', decision: 'accord', scope_site: 'on', name: 'Zoé', email: 'zoe@exemple.fr', adult: 'moins15', guardian_email: 'mere@exemple.fr' });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /id="err-guardian"/);
  r = await hello({ ref: 'J-0600', decision: 'accord', scope_site: 'on', name: 'Zoé', email: 'zoe@exemple.fr', adult: 'moins15', guardian: 'Marie Mère' });
  assert.equal(r.statusCode, 422);
  assert.match(nb(r.body), /id="err-guardian_email"[^]*c’est à lui que nous écrivons/);
  assert.equal(c.count(), 0);
  // Complet : l'accord s'applique (âge 0, parent), l'adresse est celle du parent.
  r = await hello({ ref: 'J-0600', decision: 'accord', scope_site: 'on', name: 'Zoé', email: 'zoe@exemple.fr', adult: 'moins15', guardian: 'Marie Mère', guardian_email: 'mere@exemple.fr' });
  assert.equal(r.statusCode, 303);
  const e = c.last();
  assert.deepEqual([e.email, e.email_parent, e.email_hash, e.adult, e.guardian, e.wants_photo, Boolean(e.consent?.site)], ['mere@exemple.fr', 1, null, 0, 'Marie Mère', 0, true]);
  assert.ok(!c.everything().includes('zoe@exemple.fr'), 'adresse de l’enfant jamais gardée');
  // Le récapitulatif : moins de 15 ans, avec l'accord du parent, à qui nous écrivons.
  const k = [].concat(r.headers['set-cookie']).find(h => h.startsWith('bonjour_recap=')).split(';')[0].split('=')[1];
  const merci = nb((await c.app.inject({ url: r.headers.location, cookies: { bonjour_recap: k } })).body);
  assert.match(merci, /<dt>Âge<\/dt><dd>moins de 15 ans, avec l’accord de votre parent, à qui nous écrivons<\/dd>/);
  // La fiche (historique) : « moins de 15 ans, adresse d'un parent ».
  assert.ok(c.app.encounters.events(e.id).at(-1).detail.email_parent);
});

test('/bonjour : une fiche notée « moins de 15 ans » ne devient jamais majeure par la page ; son adresse de parent n’est pas remplacée sans âge', async t => {
  const c = await site(t);
  let n = 0;
  const hello = payload => c.app.inject({ method: 'POST', url: '/bonjour', payload, remoteAddress: `198.51.100.${++n}` });
  // Saisie sur le téléphone : moins de 15 ans, photo au parent.
  const author = c.db.prepare("SELECT * FROM authors WHERE slug = 'julien'").get();
  const app = await c.app.encounters.saveApp({ decision: '', wants_photo: 'on', adult: 'moins15', guardian_email: 'parent@exemple.fr', lang: 'fr' }, { author });
  const card = `${app.ref}-${app.code}`;
  // Avec le code, « 18 ans ou plus » et un accord : rien n'est appliqué (gardé pour décision humaine).
  let r = await hello({ ref: card, decision: 'accord', adult: 'oui', scope_site: 'on', name: 'Ado', email: 'ado@exemple.fr' });
  assert.equal(r.statusCode, 303);
  let e = c.app.encounters.get(app.id);
  assert.deepEqual([e.adult, e.email, e.email_parent, e.consent], [0, 'parent@exemple.fr', 1, null]);
  assert.equal(c.app.encounters.events(app.id).at(-1).detail.age_contredit, true);
  // Avec le code, un message ou un refus sans âge et une autre adresse : l'adresse du parent reste, l'autre n'est gardée
  // nulle part (peut-être celle de l'enfant).
  r = await hello({ ref: card, decision: 'refus', message: 'Je ne veux pas', email: 'enfant@exemple.fr' });
  assert.equal(r.statusCode, 303);
  e = c.app.encounters.get(app.id);
  assert.deepEqual([e.email, e.email_parent, e.refused], ['parent@exemple.fr', 1, 1]);
  r = await hello({ ref: card, rights: 'acces', email: 'enfant@exemple.fr' });
  assert.equal(r.statusCode, 303);
  assert.equal(c.app.encounters.get(app.id).email, 'parent@exemple.fr');
  assert.ok(!c.everything().includes('enfant@exemple.fr'), 'adresse sans âge jamais gardée sur une fiche de moins de 15 ans');
  // Sans le code, la même adresse de parent : pas « non vérifiée » pour autant (comparée en clair, sans empreinte).
  r = await hello({ ref: app.ref, wants_photo: 'on', adult: 'moins15', guardian_email: 'parent@exemple.fr' });
  assert.equal(r.statusCode, 303);
  // Avec le code et « moins de 18 ans » (15 ans passés) : sa propre adresse, la marque du parent tombe.
  r = await hello({ ref: card, wants_photo: 'on', adult: 'non', email: 'ado15@exemple.fr' });
  e = c.app.encounters.get(app.id);
  assert.deepEqual([e.email, e.email_parent, e.adult], ['ado15@exemple.fr', 0, 0]);
});

test('empreintes : une adresse de parent n’en reçoit jamais (réindexation, fiche corrigée dans l’admin)', async t => {
  const c = await site(t);
  const author = c.db.prepare("SELECT * FROM authors WHERE slug = 'julien'").get();
  const app = await c.app.encounters.saveApp({ decision: '', wants_photo: 'on', adult: 'moins15', guardian_email: 'parent@exemple.fr', lang: 'fr' }, { author });
  const hash = () => c.db.prepare('SELECT email_hash FROM encounters WHERE id = ?').pluck().get(app.id);
  assert.equal(hash(), null);
  c.app.encounters.reindexEmails();
  assert.equal(hash(), null, 'réindexation');
  c.app.encounters.saveCard(app.id, { ref: app.ref, author_id: author.id, email: 'autre-parent@exemple.fr', met_on: c.app.encounters.get(app.id).met_on });
  assert.deepEqual([c.app.encounters.get(app.id).email, hash()], ['autre-parent@exemple.fr', null], 'fiche corrigée');
});

// ---------- 3. la photo offerte et le récapitulatif adressés au parent ----------

test('photo offerte envoyée à un parent : l’e-mail et la page s’adressent au parent (fr, en, de) ; à la personne, comme avant', async t => {
  const c = await site(t);
  const author = c.db.prepare("SELECT * FROM authors WHERE slug = 'julien'").get();
  const photo = c.db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id LIMIT 1').pluck().get(author.id);
  const EXPECT = {
    fr: { subject: 'La photo de votre enfant · ', body: /^Bonjour,\n\nMerci encore pour ce moment\. Voici la photo de Léa Petit, rien que pour votre famille :\nhttp/, title: 'La photo de votre enfant', text: 'Voici la photo de votre enfant, rien que pour votre famille.' },
    en: { subject: 'Your child’s photo · ', body: /^Hello,\n\nThank you again for this moment\. Here is the photo of Léa Petit, just for your family:\nhttp/, title: 'Your child’s photo', text: 'Here is your child’s photo, just for your family.' },
    de: { subject: 'Das Foto Ihres Kindes · ', body: /^Hallo,\n\nnochmals danke für diesen Moment\. Hier ist das Foto von Léa Petit, nur für Ihre Familie:\nhttp/, title: 'Das Foto Ihres Kindes', text: 'Hier ist das Foto Ihres Kindes, nur für Ihre Familie.' },
  };
  const v1 = await c.account('offerte-v1', 'v1');
  const v2 = await c.account('offerte-v2', 'v2');
  const mailtoOf = html => { const m = /href="(mailto:[^"]+)"[^>]*>Envoyer/.exec(html); return m ? new URL(m[1].replace(/&amp;/g, '&')) : null; };
  for (const lang of ['fr', 'en', 'de']) {
    const app = await c.app.encounters.saveApp({ decision: '', wants_photo: 'on', name: 'Léa Petit', adult: 'moins15', guardian_email: `parent-${lang}@exemple.fr`, lang }, { author });
    c.app.encounters.link(app.id, [photo]);
    const token = c.app.encounters.createShare(app.id, photo);
    for (const a of [v1, v2]) {
      const fiche = (await a.get(`/admin/rencontres/${app.id}`)).body;
      const m = mailtoOf(fiche);
      assert.ok(m, `${lang} : lien d’envoi`);
      assert.equal(decodeURIComponent(m.pathname), `parent-${lang}@exemple.fr`);
      assert.ok(m.searchParams.get('subject').startsWith(EXPECT[lang].subject), `${lang} : objet`);
      assert.match(m.searchParams.get('body'), EXPECT[lang].body, `${lang} : le message s’adresse au parent`);
      assert.doesNotMatch(m.searchParams.get('body'), /^(Bonjour|Hello|Hallo) Léa/);
      // « Écrire » (en tête de la fiche) : l'objet du parent aussi.
      assert.ok(fiche.includes(`subject=${encodeURIComponent(EXPECT[lang].subject.split(' · ')[0])}`), `${lang} : objet de « Écrire »`);
    }
    // La page du lien : au parent, sans le nom de l'enfant ; en v1 comme en v2.
    for (const version of ['v1', 'v2']) {
      c.app.publicVersion.save(version);
      const page = nb((await c.app.inject(`/pour-vous/${token}`)).body);
      assert.ok(page.includes(`<title>${EXPECT[lang].title} · `), `${version} ${lang} : titre`);
      assert.ok(page.includes(EXPECT[lang].text), `${version} ${lang} : texte`);
      assert.ok(!page.includes('Léa'), `${version} ${lang} : jamais le nom de l’enfant sur la page`);
    }
    c.app.publicVersion.save('v2');
  }
  // À la personne elle-même (15 ans ou plus) : rien ne change.
  const own = await c.app.encounters.saveApp({ decision: '', wants_photo: 'on', name: 'Paul Grand', adult: 'oui', email: 'paul@exemple.fr', lang: 'fr' }, { author });
  c.app.encounters.link(own.id, [photo]);
  const token = c.app.encounters.createShare(own.id, photo);
  const m = mailtoOf((await v2.get(`/admin/rencontres/${own.id}`)).body);
  assert.ok(m.searchParams.get('subject').startsWith('Votre photo · '));
  assert.match(m.searchParams.get('body'), /^Bonjour Paul Grand,\n\nMerci encore pour ce moment\. Voici votre photo, rien que pour vous/);
  const page = nb((await c.app.inject(`/pour-vous/${token}`)).body);
  assert.ok(page.includes('<title>Votre photo · ') && page.includes('Voici votre photo, rien que pour vous.'));
});

// ---------- Vigie et lectures sensibles ----------

test('Vigie : aucun âge, nom ni adresse dans un événement (app, page, photo offerte) ; mêmes lectures sensibles en v1 et en v2', async t => {
  const c = await site(t);
  const v1 = await c.account('vigie-v1', 'v1');
  const v2 = await c.account('vigie-v2', 'v2');
  assert.equal((await v1.send({ decision: '', wants_photo: 'on', adult: 'moins15', guardian_email: 'parent-vigie@exemple.fr', email: 'enfant-vigie@exemple.fr', name: 'Nina Secret', lang: 'fr' })).statusCode, 303);
  await v2.send({ decision: 'accord', scope_site: 'on', name: 'Tom Secret', adult: 'moins15', guardian: 'Gilles Tuteur', guardian_email: 'tuteur-vigie@exemple.fr', signature: await signature(), lang: 'en' });
  await v2.send({ decision: '', wants_photo: 'on', email: 'sans-age@exemple.fr', lang: 'fr' });            // refusé : âge
  await c.app.inject({ method: 'POST', url: '/bonjour', remoteAddress: '198.51.100.90', payload: { ref: 'J-0700', decision: 'accord', scope_site: 'on', name: 'Eva Secret', email: 'eva-enfant@exemple.fr', adult: 'moins15', guardian: 'Rose Mère', guardian_email: 'rose-vigie@exemple.fr' } });
  const e = c.last();
  const photo = c.db.prepare('SELECT id FROM photos ORDER BY id LIMIT 1').pluck().get();
  c.app.encounters.link(e.id, [photo]);
  const token = c.app.encounters.createShare(e.id, photo);
  await c.app.inject(`/pour-vous/${token}`);
  await c.app.inject('/pour-vous/jeton-faux-0123456789abcdefghijklmn');
  // Fiche ouverte en v1 et en v2 : les mêmes lectures sensibles (objet « rencontre »).
  const before = (await c.flush()).length;
  const a = await v1.get(`/admin/rencontres/${e.id}`);
  const mid = (await c.flush()).length;
  const b = await v2.get(`/admin/rencontres/${e.id}`);
  const all = await c.flush();
  const reads = list => list.filter(x => x.type === 'sensitive_read').map(x => ({ ...x.detail, octets_servis: 'mesuré sur la réponse' }));
  assert.equal(all.slice(before, mid).find(x => x.type === 'sensitive_read').detail.octets_servis, a.rawPayload.length);
  assert.equal(all.slice(mid).find(x => x.type === 'sensitive_read').detail.octets_servis, b.rawPayload.length);
  assert.deepEqual(reads(all.slice(before, mid)), reads(all.slice(mid)));
  assert.deepEqual(reads(all.slice(mid)).map(d => [d.cible, d.objet]), [['/admin/rencontres/:id', 'rencontre']]);
  const text = JSON.stringify(all);
  for (const v of ['parent-vigie@exemple.fr', 'enfant-vigie@exemple.fr', 'tuteur-vigie@exemple.fr', 'sans-age@exemple.fr', 'eva-enfant@exemple.fr', 'rose-vigie@exemple.fr',
    'Nina Secret', 'Tom Secret', 'Gilles Tuteur', 'Eva Secret', 'Rose Mère', 'moins15', 'moins de 15', 'under 15']) assert.ok(!text.includes(v), `« ${v} » dans un événement`);
  for (const ev of all) for (const k of Object.keys(ev.detail || {})) assert.ok(!['adult', 'age', 'guardian', 'email', 'guardian_email', 'email_parent'].includes(k), `champ ${k} dans ${ev.type}`);
});
