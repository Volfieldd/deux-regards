import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { setup } from './helpers.js';
import { loadConfig } from '../server/config.js';

// Rencontre saisie sur le téléphone avec la personne : photo de repère, accord signé au doigt (ou refus), majorité,
// position arrondie, numéro suivant du photographe ; écran « Merci » avec QR ; récapitulatif par e-mail.
const TOKEN = 'jeton-de-test-0123456789';
const cookiesOf = res => Object.fromEntries(res.cookies.filter(c => c.value).map(c => [c.name, c.value]));

function fakeTransport({ fail = false } = {}) {
  const sent = [];
  return { sent, sendMail: async msg => { if (fail) throw Object.assign(new Error('auth'), { code: 'EAUTH' }); sent.push(msg); return { messageId: 'x' }; } };
}

async function ctxOf(t, opts = {}) {
  const ctx = await setup(t, { seeded: true, env: { LOCAL_AUTH_TOKEN: TOKEN }, ...opts });
  const res = await ctx.app.inject({ method: 'POST', url: '/auth/local', payload: { token: TOKEN, author: 'julien', next: '/admin' } });
  const cookies = cookiesOf(res);
  const csrf = ctx.db.prepare('SELECT csrf FROM sessions').pluck().get();
  const as = o => ctx.app.inject({ ...o, cookies: { ...cookies, ...o.cookies } });
  const send = async (fields, file = null) => {
    const boundary = '----t' + Math.random().toString(16).slice(2);
    const parts = Object.entries({ _csrf: csrf, ...fields }).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    if (file) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="portrait"; filename="IMG_1.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), file, Buffer.from('\r\n'));
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return as({ method: 'POST', url: '/admin/rencontre', payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  };
  return { ...ctx, as, send, csrf };
}
const signature = async () => `data:image/png;base64,${(await sharp({ create: { width: 600, height: 180, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer()).toString('base64')}`;
const photo = () => sharp({ create: { width: 1200, height: 900, channels: 3, background: '#887766' } }).jpeg().toBuffer();

test('écran de l’app : installable (manifeste), numéro suivant du photographe connecté, réservé aux admins', async t => {
  const c = await ctxOf(t);
  const page = await c.as({ url: '/admin/rencontre' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<link rel="manifest" href="\/rencontre\.webmanifest">/);
  assert.match(page.body, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(page.body, /<span class="mono" data-next>J-0001<\/span>/);
  assert.match(page.body, /J’autorise l’usage artistique et la publication des photos que <span data-author-name>Julien<\/span> a prises de moi aujourd’hui/);
  assert.match(page.body, /I agree to the artistic use and publication of the photos <span data-author-name>Julien<\/span> took of me today/);
  assert.doesNotMatch(page.body, /style="/);
  assert.equal(page.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=(self)');
  assert.match((await c.as({ url: '/admin/rencontres' })).headers['permissions-policy'], /geolocation=\(\)/);   // ailleurs : interdite
  const manifest = (await c.app.inject('/rencontre.webmanifest')).json();
  assert.deepEqual([manifest.start_url, manifest.display, manifest.short_name], ['/admin/rencontre', 'standalone', 'Rencontre']);
  assert.notEqual((await c.app.inject('/admin/rencontre')).statusCode, 200);
});

test('accord signé sur le téléphone : validations (signature, majorité, parent), puis rencontre complète et numérotée', async t => {
  const c = await ctxOf(t);
  const base = { decision: 'accord', scope_site: 'on', scope_instagram: 'on', name: 'Bob Martin', email: 'bob@example.com', lang: 'en', lat: '47.47312', lon: '-0.55157', place: '' };
  let r = await c.send({ ...base, adult: 'oui' });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /La signature manque/);
  r = await c.send({ ...base, adult: 'non', signature: await signature() });
  assert.match(r.body, /le nom du parent qui signe est nécessaire/);
  r = await c.send({ ...base, signature: await signature() });
  assert.match(r.body, /Indiquez si la personne est majeure/);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM encounters').pluck().get(), 0);
  r = await c.send({ ...base, adult: 'oui', signature: await signature() }, await photo());
  assert.equal(r.statusCode, 303);
  const e = c.db.prepare('SELECT * FROM encounters').get();
  assert.equal(r.headers.location, `/admin/rencontre/${e.id}/merci`);
  assert.deepEqual([e.ref, e.consent_source, e.verified, e.adult, e.lat, e.lon, e.place, e.lang, e.status], ['J-0001', 'signature', 1, 1, 47.473, -0.552, 'Angers, France', 'en', 'en_cours']);
  assert.deepEqual(JSON.parse(e.consent), { site: true, instagram: true, print: false, name: false });
  assert.ok(e.signature_png.length > 100 && e.portrait_jpeg.length > 100);
  assert.equal((await sharp(e.portrait_jpeg).metadata()).format, 'jpeg');
  // Le numéro est pris : la prochaine planche de cartes commence à J-0002.
  assert.match((await c.as({ url: '/admin/rencontres/cartes' })).body, /prochaine carte J-0002/);
  // Fiche : photo de repère, signature, position (admins seulement).
  const detail = (await c.as({ url: `/admin/rencontres/${e.id}` })).body;
  assert.match(detail, /Accord signé : site, Instagram/);
  assert.match(detail, /47\.473, -0\.552/);
  assert.match(detail, /Saisie avec la personne sur le téléphone : accord signé/);
  assert.equal((await c.as({ url: `/admin/rencontres/${e.id}/signature` })).headers['content-type'], 'image/png');
  assert.notEqual((await c.app.inject(`/admin/rencontres/${e.id}/portrait`)).statusCode, 200);
  // Écran « Merci », dans la langue de la personne, avec le QR de sa page ; sans serveur d'e-mail : bouton Mail.
  const merci = (await c.as({ url: `/admin/rencontre/${e.id}/merci` })).body;
  assert.match(merci, /<h1>Thank you!<\/h1>/);
  assert.match(merci, /<div class="app-qr"><svg /);
  assert.match(merci, new RegExp(`mailto:bob@example\\.com\\?subject=Your%20consent%20%C2%B7%20Test&amp;body=Hello%20Bob%20Martin`));
  assert.match(merci, new RegExp(`localhost%3A3000%2Fen%2Fbonjour%2FJ-0001-${c.app.encounters.codeOf('J-0001')}`));
});

test('refus sans signature ; mineur avec le parent ; rien à enregistrer refusé', async t => {
  const c = await ctxOf(t);
  let r = await c.send({ decision: 'refus', lang: 'de' });
  assert.equal(r.statusCode, 303);
  assert.deepEqual(Object.values(c.db.prepare('SELECT ref, refused, consent FROM encounters').get()), ['J-0001', 1, null]);
  r = await c.send({ decision: 'accord', scope_print: 'on', name: 'Léa', adult: 'non', guardian: 'Anne (mère)', signature: await signature() });
  assert.equal(r.statusCode, 303);
  assert.deepEqual(Object.values(c.db.prepare("SELECT adult, guardian FROM encounters WHERE ref = 'J-0002'").get()), [0, 'Anne (mère)']);
  r = await c.send({ decision: '' });
  assert.equal(r.statusCode, 422);
  assert.match(r.body, /Rien à enregistrer/);
});

test('récapitulatif envoyé par le serveur quand SMTP est configuré ; en cas d’échec, bouton pour renvoyer', async t => {
  const transport = fakeTransport();
  const c = await ctxOf(t, { mailTransport: transport });
  const r = await c.send({ decision: 'accord', scope_site: 'on', name: 'Ana', email: 'ana@exemplo.pt', lang: 'en', adult: 'oui', signature: await signature() });
  assert.equal(r.statusCode, 303);
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0].to, 'ana@exemplo.pt');
  assert.equal(transport.sent[0].subject, 'Your consent · Test');
  assert.match(transport.sent[0].text, /You agreed to their publication: on the website\./);
  assert.match(transport.sent[0].text, /http:\/\/localhost:3000\/en\/bonjour\/J-0001-[A-Z0-9]{3}/);
  const id = c.db.prepare('SELECT id FROM encounters').pluck().get();
  assert.ok(c.db.prepare('SELECT mailed_at FROM encounters').pluck().get());
  assert.match((await c.as({ url: `/admin/rencontre/${id}/merci` })).body, /Récapitulatif envoyé à ana@exemplo\.pt/);

  const failing = fakeTransport({ fail: true });
  const d = await ctxOf(t, { mailTransport: failing });
  await d.send({ decision: '', email: 'x@exemple.fr', lang: 'fr' });
  const id2 = d.db.prepare('SELECT id FROM encounters').pluck().get();
  const merci = (await d.as({ url: `/admin/rencontre/${id2}/merci` })).body;
  assert.match(merci, /Envoyer le récapitulatif à x@exemple\.fr/);
  const resend = await d.as({ method: 'POST', url: `/admin/rencontre/${id2}/envoyer`, payload: { _csrf: d.csrf }, headers: { accept: 'text/html' } });
  assert.equal(resend.headers.location, `/admin/rencontre/${id2}/merci?envoi=echec`);
  assert.throws(() => loadConfig({ SMTP_URL: 'smtps://a:b@smtp.exemple.fr:465' }), /MAIL_FROM est obligatoire/);
  assert.throws(() => loadConfig({ SMTP_URL: 'http://x', MAIL_FROM: 'a@b.fr' }), /SMTP_URL doit commencer/);
});
