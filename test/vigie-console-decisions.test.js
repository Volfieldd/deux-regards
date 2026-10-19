import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './console-env.js';

// Console de la Vigie, phase D3c : les formulaires des décisions (MV-05), de la fiche d'une alerte (MV-02) et de la fiche
// d'une entité (MV-04). Chaque formulaire est lu dans la page rendue puis envoyé tel quel (ses champs, son jeton, le bouton
// choisi) : un formulaire dont les noms ne correspondent pas aux routes de vigie/console/actions.js échoue ici. Un refus
// revient près de son champ, la saisie reprise et échappée ; un Lecteur ne voit aucun formulaire.

const PIEGE = '<img src=x onerror=alert(1)>';
const PIEGE_ECHAPPE = '&lt;img src=x onerror=alert(1)&gt;';

const decode = s => String(s)
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
// Attributs d'une balise, lus un à un (une valeur entre guillemets peut contenir des espaces et « = »).
function attrs(s) {
  const a = {};
  for (const m of String(s).matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) a[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return a;
}

// Les formulaires d'une page : action, méthode, champs (input, textarea, bouton ; un bouton hors du formulaire qui le
// désigne par form="…" compte aussi).
function formulaires(html) {
  const out = [];
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const f = attrs(m[1]);
    const champs = [];
    const corps = m[2].replace(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi, (x, a, contenu) => { champs.push({ tag: 'textarea', ...attrs(a), value: decode(contenu) }); return ''; });
    for (const c of corps.matchAll(/<(input|button)\b([^>]*)>/gi)) champs.push({ tag: c[1].toLowerCase(), ...attrs(c[2]) });
    if (f.id) for (const b of html.matchAll(/<button\b([^>]*)>/gi)) { const a = attrs(b[1]); if (a.form === f.id) champs.push({ tag: 'button', ...a }); }
    out.push({ action: f.action, method: (f.method || 'get').toLowerCase(), attrs: f, champs, html: m[0] });
  }
  return out;
}
const formDe = (html, action, pred = () => true) => {
  const f = formulaires(html).find(x => x.method === 'post' && x.action === action && pred(x));
  assert.ok(f, `formulaire ${action} absent`);
  return f;
};
const champ = (f, name) => f.champs.find(c => c.name === name && c.tag !== 'button');

// Ce qu'un navigateur enverrait : champs cachés et textes (valeur affichée, ou celle qu'on tape), radios et cases cochés,
// le bouton choisi. Un nom que le formulaire n'a pas fait échouer l'essai.
function corps(f, { tape = {}, radios = {}, cases = [], bouton = null } = {}) {
  const p = new URLSearchParams();
  for (const [k] of Object.entries({ ...tape, ...radios })) assert.ok(f.champs.some(c => c.name === k), `champ ${k} absent du formulaire ${f.action}`);
  for (const c of f.champs) {
    if (!c.name || c.disabled !== undefined) continue;
    if (c.tag === 'button') continue;
    const type = (c.type || 'text').toLowerCase();
    if (type === 'radio') { if (radios[c.name] === c.value || (radios[c.name] === undefined && c.checked !== undefined)) p.append(c.name, c.value); continue; }
    if (type === 'checkbox') { if (cases.includes(c.name) || c.checked !== undefined) p.append(c.name, c.value ?? 'on'); continue; }
    p.append(c.name, Object.hasOwn(tape, c.name) ? tape[c.name] : c.value ?? '');
  }
  const boutons = f.champs.filter(c => c.tag === 'button' && (c.type || 'submit') === 'submit');
  const b = bouton ? boutons.find(x => x.value === bouton) : boutons[0];
  assert.ok(b, `bouton ${bouton} absent du formulaire ${f.action}`);
  if (b.name) p.append(b.name, b.value ?? '');
  // Champs requis : un navigateur ne l'enverrait pas vides.
  return p;
}

function env(t) {
  const v = setup(t);
  const envoyer = (cookie, f, opts) => v.app.inject({ method: 'POST', url: f.action, headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
    cookies: { '__Host-vigie': cookie }, payload: corps(f, opts).toString() });
  // Espaces insécables (« 14 h 00 », « Erreur : ») lues comme des espaces, pour écrire les essais simplement.
  const get = async (cookie, url) => {
    const r = await v.app.inject({ url, headers: v.h(), cookies: { '__Host-vigie': cookie } });
    return { statusCode: r.statusCode, headers: r.headers, body: r.body.replace(/&#8239;|&nbsp;|[\u00a0\u202f]/g, ' ') };
  };
  const message = cookie => { const m = v.sessionOf(cookie).message; return m ? JSON.parse(m) : null; };
  const alerte = (kind, key, statut = 'ouverte') => Number(v.db.prepare("INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere) VALUES ('sigma.cookie_rejoue', 'DS2', ?, ?, 'haut', 'alerter', ?, ?, ?)").run(kind, key, statut, v.clock.t, v.clock.t).lastInsertRowid);
  const derniere = () => v.db.prepare('SELECT * FROM decisions ORDER BY id DESC').get();
  async function lecteur() {
    v.ceilings['sub-camille'] = 'viewer';
    return (await v.login({ sub: 'sub-camille', nom: 'Camille', roles: ['vigie.viewer'] })).cookie;
  }
  async function intervenant() {
    v.c.rights.observe('sub-julien', 'handler');
    v.c.rights.assign({ par: 'sub-seb', parRole: 'admin', sub: 'sub-julien', role: 'handler' });
    v.ceilings['sub-julien'] = 'handler';
    return (await v.login({ sub: 'sub-julien', nom: 'Julien', roles: ['vigie.handler'] })).cookie;
  }
  return { ...v, envoyer, get, message, alerte, derniere, lecteur, intervenant };
}

// Pas de style ni de gestionnaire en ligne (attributs lus un à un : une valeur échappée qui contient « onerror= » n'est pas un
// attribut), pas de script ni de feuille en ligne, aucune image injectée.
function verifierPage(html) {
  for (const b of html.match(/<[a-zA-Z][^>]*>/g) || []) {
    for (const nom of Object.keys(attrs(b.replace(/^<[a-zA-Z0-9]+/, ' ').replace(/\/?>$/, '')))) {
      assert.notEqual(nom, 'style', `attribut style : ${b}`);
      assert.ok(!/^on/.test(nom), `gestionnaire en ligne : ${b}`);
    }
  }
  for (const s of html.match(/<script\b[^>]*>/gi) || []) assert.match(s, /\ssrc="\/static\/[a-z-]+\.js(\?v=[^"]*)?"/, `script sans src local : ${s}`);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]+<\/script>/i, 'script en ligne');
  assert.doesNotMatch(html, /<style\b/i, 'feuille en ligne');
  assert.ok(!html.includes(PIEGE), 'valeur piégée rendue telle quelle');
  assert.doesNotMatch(html, /<img\b/i, 'image injectée');
  // Chaque champ visible a son libellé (label for=… ou dans un label).
  for (const m of html.matchAll(/<(input|textarea)\b([^>]*)>/gi)) {
    const a = attrs(m[2]);
    if (['hidden', 'radio', 'checkbox'].includes((a.type || '').toLowerCase())) continue;
    assert.ok(a.id && html.includes(`for="${a.id}"`), `champ sans libellé : ${m[0]}`);
  }
}
const contenu = html => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

test('page Décisions : liste, formulaires selon le droit ; un Lecteur voit les adresses tronquées et aucun formulaire', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  v.decisions.create({ kind: 'bloquer', cible: '203.0.113.9', portee: 'admin', duree: '24h', motif: `scanner 203.0.113.9 ${PIEGE}`, par: 'console · Sébastien' });
  v.decisions.create({ kind: 'geler', cible: 'zitadel-329906113', duree: '24h', motif: 'alerte #412', par: 'Vigie · règle sigma.role_hors_application', auto: true });
  const vieille = v.decisions.create({ kind: 'revoquer_compte', cible: 'zitadel-1', duree: '1h', motif: 'essai', par: 'console · Julien' });
  v.clock.t += 2 * 3600e3;
  const ancienne = v.decisions.create({ kind: 'bloquer', cible: '192.0.2.0/24', portee: 'tout', duree: '24h', motif: 'balayage', par: 'console · Sébastien' });
  v.decisions.lift({ id: ancienne, par: 'console · Sébastien', motif: 'fini' });
  // (session ouverte il y a 2 h : la console la ferme ; on se reconnecte)
  const c2 = (await v.login()).cookie;
  void cookie;

  const r = await v.get(c2, '/decisions');
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  const h = contenu(r.body);
  assert.match(r.body, /<title>Décisions · Vigie · Nicephos<\/title>/);
  assert.match(h, /<h1>Décisions<\/h1>/);
  assert.match(h, /<span>2 en cours<\/span>/);
  // En cours : le blocage (adresse complète pour un Administrateur), le gel de la Vigie avec sa règle et son alerte.
  assert.match(h, /<span class="k">adresse<\/span><span class="ip">203\.0\.113\.9<\/span>/);
  assert.match(h, /L’admin et la connexion/);
  assert.match(h, /Sébastien \(vous\)/);
  assert.ok(h.includes(`scanner 203.0.113.9 ${PIEGE_ECHAPPE}`), 'motif échappé');
  assert.match(h, /la Vigie, d’elle-même<span class="sec">règle <a href="\/reglages#r-sigma-role_hors_application">Rôle donné, retiré ou compte changé hors de l’application<\/a> · <a href="\/alertes\/412">alerte #412<\/a>/);
  assert.match(h, /<a class="vg-lien" href="\/decisions\/2\/lever">Lever le gel…<span class="sr-only"> la décision #2<\/span><\/a>/);
  assert.match(h, /<a class="vg-lien" href="\/decisions\/1\/lever">Lever le blocage…/);
  // Levées et échues : la levée et l'échue, sans « Lever… ».
  const histoire = h.slice(h.indexOf('id="t-histoire"'));
  assert.match(histoire, new RegExp(`#${ancienne} · depuis`));
  assert.match(histoire, /levée 14 h 00<span class="sec">par Sébastien<\/span>/);
  assert.match(histoire, new RegExp(`#${vieille} · depuis`));
  assert.match(histoire, /échue/);
  assert.doesNotMatch(histoire, /\/lever"/);
  // Formulaires : nouvelle décision (bloquer par défaut, aucune portée cochée) et verrouiller ; les quatre types.
  const n = formDe(r.body, '/decisions', f => champ(f, 'formulaire')?.value === 'nouvelle');
  assert.equal(champ(n, 'type').value, 'bloquer');
  assert.ok(n.champs.filter(c => c.name === 'portee').every(c => c.checked === undefined && c.required !== undefined), 'aucune portée cochée, une requise');
  assert.deepEqual(n.champs.filter(c => c.tag === 'button').map(c => c.value), ['1h', '24h', '7j', '30j', 'libre']);
  assert.ok(champ(n, 'motif').required !== undefined);
  for (const k of ['bloquer', 'revoquer_compte', 'geler', 'revoquer_session']) assert.ok(h.includes(`href="/decisions?type=${k}#nouvelle"`), k);
  assert.match(h, /aria-current="true">Bloquer une adresse</);
  assert.match(h, /Votre adresse actuelle, <span class="ip">198\.51\.100\.7<\/span>, ou un réseau qui la contient/);
  assert.match(h, /<b>1 adresse<\/b> IPv4 l’est aujourd’hui, sur 16 777 216/, 'adresses IPv4 bloquées au total');
  const vr = formDe(r.body, '/decisions', f => champ(f, 'type')?.value === 'verrouiller');
  assert.ok(champ(vr, 'comptes') && champ(vr, 'adresses') && champ(vr, 'motif'));
  assert.match(contenu(r.body), /Vous, Sébastien · <span class="sub">sub-seb<\/span><\/span><span class="sec">ajouté d’office/);
  assert.match(contenu(r.body), /Votre adresse actuelle, <span class="ip">198\.51\.100\.7<\/span><\/span><span class="sec">ajoutée d’office/);
  assert.doesNotMatch(h, /lue par le site/i, 'la lecture par le site n’est pas encore suivie');

  // ?type= : le formulaire du type ; ?cible= pré-remplit (échappée).
  const g = await v.get(c2, `/decisions?type=geler&cible=${encodeURIComponent(PIEGE)}`);
  verifierPage(g.body);
  const fg = formDe(g.body, '/decisions', f => champ(f, 'formulaire')?.value === 'nouvelle');
  assert.equal(champ(fg, 'type').value, 'geler');
  assert.equal(champ(fg, 'cible').value, PIEGE);
  assert.equal(champ(fg, 'portee'), undefined);
  // Type inconnu : bloquer.
  assert.equal(champ(formDe((await v.get(c2, '/decisions?type=supprimer')).body, '/decisions', f => champ(f, 'formulaire')?.value === 'nouvelle'), 'type').value, 'bloquer');

  // Lecteur : la liste, adresses tronquées (jamais complètes, ni dans un lien ni dans le motif), aucun formulaire.
  const lc = await v.lecteur();
  const rl = await v.get(lc, '/decisions');
  assert.equal(rl.statusCode, 200);
  verifierPage(rl.body);
  const hl = contenu(rl.body);
  assert.ok(!hl.includes('203.0.113.9'), 'adresse complète montrée à un Lecteur');
  assert.match(hl, /<span class="ip">203\.0\.113\.0\/24<\/span><span class="tronq">\(tronquée\)<\/span>/);
  assert.match(hl, /scanner 203\.0\.113\.0\/24/);
  assert.match(hl, /Lecture seule/);
  assert.doesNotMatch(hl, /<form|<button|\/lever/i);
  assert.doesNotMatch(hl, /Nouvelle décision|Verrouiller l’admin…/);
  // La page de levée : refusée à un Lecteur.
  assert.equal((await v.get(lc, '/decisions/1/lever')).statusCode, 403);
});

test('nouvelle décision : le formulaire rendu, envoyé tel quel, décide ; un refus revient près du champ, saisie reprise et échappée', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  const page = async (url = '/decisions') => { const r = await v.get(cookie, url); verifierPage(r.body); return r.body; };
  const nouvelle = html => formDe(html, '/decisions', f => champ(f, 'formulaire')?.value === 'nouvelle');

  // Bloquer : envoyé depuis le formulaire, avec la portée et le bouton « Bloquer 7 jours ».
  let r = await v.envoyer(cookie, nouvelle(await page()), { tape: { cible: '203.0.113.0/24', motif: 'scanner de l’alerte #409' }, radios: { portee: 'admin' }, bouton: '7j' });
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, '/decisions');
  let d = v.derniere();
  assert.deepEqual({ kind: d.kind, cible: d.cible, portee: d.portee, motif: d.motif, duree: d.fin - d.cree_a }, { kind: 'bloquer', cible: '203.0.113.0/24', portee: 'admin', motif: 'scanner de l’alerte #409', duree: 7 * 864e5 });
  let h = await page();
  assert.match(h, /role="status"[^>]*>.*Décision #1 : 203\.0\.113\.0\/24 bloqué\./s);

  // Réseau trop large : refusé, l'erreur près de la cible (aria-invalid, aria-describedby), la saisie reprise, échappée.
  r = await v.envoyer(cookie, nouvelle(h), { tape: { cible: '198.51.100.0/2', motif: `scanner ${PIEGE}` }, radios: { portee: 'admin' }, bouton: '24h' });
  assert.equal(r.statusCode, 303);
  h = await page();
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM decisions').pluck().get(), 1);
  let f = nouvelle(h);
  assert.equal(champ(f, 'cible').value, '198.51.100.0/2');
  assert.equal(champ(f, 'cible')['aria-invalid'], 'true');
  assert.match(champ(f, 'cible')['aria-describedby'], /\bn-cible-err\b/);
  assert.match(h, /<p class="err" id="n-cible-err">.*réseau trop large ou invalide : \/2 \(IPv4 de \/8 à \/32\)/);
  assert.equal(champ(f, 'motif').value, `scanner ${PIEGE}`);
  assert.ok(h.includes(`value="scanner ${PIEGE_ECHAPPE}"`));
  assert.equal(f.champs.find(c => c.name === 'portee' && c.checked !== undefined)?.value, 'admin', 'portée reprise');
  assert.equal(champ(f, 'motif')['aria-invalid'], undefined, 'seul le champ fautif est marqué');
  // Le message n'est montré qu'une fois : la page suivante est propre.
  h = await page();
  assert.doesNotMatch(h, /aria-invalid/);

  // Motif manquant : erreur près du motif.
  r = await v.envoyer(cookie, nouvelle(h), { tape: { cible: '203.0.113.50', motif: '' }, radios: { portee: 'tout' }, bouton: '1h' });
  h = await page();
  f = nouvelle(h);
  assert.equal(champ(f, 'motif')['aria-invalid'], 'true');
  assert.match(h, /id="n-motif-err">.*motif obligatoire/);
  assert.equal(champ(f, 'cible').value, '203.0.113.50');

  // Autre durée mal écrite (« Bloquer pour l’autre durée ») : erreur près de l'autre durée ; puis juste : elle l'emporte.
  r = await v.envoyer(cookie, nouvelle(h), { tape: { cible: '203.0.113.50', motif: 'essai', duree_libre: '2 semaines' }, radios: { portee: 'tout' }, bouton: 'libre' });
  h = await page();
  f = nouvelle(h);
  assert.equal(champ(f, 'duree_libre')['aria-invalid'], 'true');
  assert.equal(champ(f, 'duree_libre').value, '2 semaines');
  assert.match(h, /id="n-libre-err">.*durée attendue/);
  r = await v.envoyer(cookie, f, { tape: { duree_libre: '3j' }, bouton: '1h' });
  d = v.derniere();
  assert.equal(d.fin - d.cree_a, 3 * 864e5);
  assert.equal(d.portee, 'tout');

  // Sa propre adresse (198.51.100.7, donnée par Cloudflare) : refusé sans la case ; la case apparaît, marquée ; cochée, c'est fait.
  h = await page();
  r = await v.envoyer(cookie, nouvelle(h), { tape: { cible: '198.51.100.0/24', motif: 'opérateur jamais vu' }, radios: { portee: 'admin' }, bouton: '24h' });
  h = await page();
  f = nouvelle(h);
  const caseC = f.champs.find(c => c.name === 'confirme');
  assert.ok(caseC, 'case de confirmation');
  assert.equal(caseC.type, 'checkbox');
  assert.equal(caseC.value, 'oui');
  assert.equal(caseC['aria-invalid'], 'true');
  assert.match(h, /Votre adresse actuelle, <span class="ip">198\.51\.100\.7<\/span>, est dans <span class="ip">198\.51\.100\.0\/24<\/span>/);
  assert.match(h, /id="n-confirme-err">.*c’est votre adresse actuelle/);
  r = await v.envoyer(cookie, f, { cases: ['confirme'], bouton: '24h' });
  d = v.derniere();
  assert.deepEqual({ cible: d.cible, portee: d.portee, motif: d.motif }, { cible: '198.51.100.0/24', portee: 'admin', motif: 'opérateur jamais vu' });

  // Geler (type choisi par ?type=) ; fermer une session (empreinte refusée, erreur près de la cible).
  r = await v.envoyer(cookie, nouvelle(await page('/decisions?type=geler')), { tape: { cible: 'zitadel-77', motif: 'compte suspect' }, bouton: '24h' });
  d = v.derniere();
  assert.deepEqual({ kind: d.kind, cible: d.cible, duree: d.fin - d.cree_a }, { kind: 'geler', cible: 'zitadel-77', duree: 864e5 });
  r = await v.envoyer(cookie, nouvelle(await page('/decisions?type=revoquer_session')), { tape: { cible: 'pas-une-empreinte', motif: 'x' }, bouton: '48h' });
  h = await page();
  f = nouvelle(h);
  assert.equal(champ(f, 'type').value, 'revoquer_session', 'le type refusé est repris');
  assert.match(h, /id="n-err">.*empreinte de session attendue/, 'erreur sans champ : en tête du formulaire');
  assert.match(f.attrs['aria-describedby'] || '', /n-err/);
  r = await v.envoyer(cookie, f, { tape: { cible: 'a1b2c3d4e5f6a7b8' }, bouton: '24h' });
  assert.equal(v.derniere().kind, 'revoquer_session');
  r = await v.envoyer(cookie, nouvelle(await page('/decisions?type=revoquer_compte')), { tape: { cible: 'zitadel-77', motif: 'sessions volées' }, bouton: '48h' });
  assert.equal(v.derniere().kind, 'revoquer_compte');

  // Verrouiller : le formulaire rendu ; le compte et l'adresse de qui verrouille sont ajoutés d'office par le serveur.
  h = await page();
  r = await v.envoyer(cookie, formDe(h, '/decisions', x => champ(x, 'type')?.value === 'verrouiller'), { tape: { comptes: 'sub-julien', motif: 'compte admin apparu' }, bouton: '1h' });
  d = v.derniere();
  assert.equal(d.kind, 'verrouiller');
  assert.deepEqual(JSON.parse(d.details), { comptes: ['sub-seb', 'sub-julien'], adresses: ['198.51.100.7/32'] });
  assert.equal(d.fin - d.cree_a, 3600e3);
  // Verrouiller avec une adresse refusée : l'erreur en tête du formulaire de verrouillage, saisie reprise ; rien dans « Nouvelle décision ».
  r = await v.envoyer(cookie, formDe(await page(), '/decisions', x => champ(x, 'type')?.value === 'verrouiller'), { tape: { adresses: `0.0.0.0/0 ${PIEGE}`, motif: 'urgence' }, bouton: '12h' });
  h = await page();
  const fv = formDe(h, '/decisions', x => champ(x, 'type')?.value === 'verrouiller');
  assert.equal(champ(fv, 'adresses').value, `0.0.0.0/0 ${PIEGE}`);
  assert.match(fv.html, /<p class="err" id="v-err">/);
  assert.doesNotMatch(nouvelle(h).html, /class="err"|aria-invalid/);
});

test('lever : la page de confirmation, puis le formulaire envoyé tel quel ; retour à la fiche d’où l’on vient', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  const id = v.decisions.create({ kind: 'geler', cible: 'zitadel-9', duree: '24h', motif: 'alerte #3', par: 'Vigie · règle sigma.role_hors_application', auto: true });
  const r = await v.get(cookie, `/decisions/${id}/lever`);
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  assert.match(r.body, /<h1>Lever le gel de ce compte \?<\/h1>/);
  assert.match(r.body, /Lever la décision #1 : Geler un compte · <span class="sub">zitadel-9<\/span>/);
  assert.match(r.body, /Identité confirmée à 12 h 00, valable jusqu’à 12 h 05/);
  const f = formDe(r.body, `/decisions/${id}/lever`);
  assert.equal(champ(f, 'retour').value, '/decisions');
  const p = await v.envoyer(cookie, f, { tape: { motif: 'compte vérifié' } });
  assert.equal(p.headers.location, '/decisions');
  assert.ok(v.db.prepare('SELECT leve_a FROM decisions WHERE id = ?').pluck().get(id));
  assert.equal(v.events('vigie_decision').at(-1).detail.motif, 'compte vérifié');
  assert.match((await v.get(cookie, '/decisions')).body, /Décision #1 levée\./);
  // Plus en cours : la page le dit, sans formulaire.
  const deja = await v.get(cookie, `/decisions/${id}/lever`);
  assert.match(deja.body, /n’est plus en cours/);
  assert.doesNotMatch(contenu(deja.body), /<form/);
  // Depuis une fiche : retour à la fiche (chemin local seulement) ; inconnue : 404 propre.
  const id2 = v.decisions.create({ kind: 'bloquer', cible: '203.0.113.4', portee: 'tout', duree: '1h', motif: 'x', par: 'console · Sébastien' });
  const r2 = await v.get(cookie, `/decisions/${id2}/lever?retour=${encodeURIComponent('/entites/ip/203.0.113.4')}`);
  assert.equal(champ(formDe(r2.body, `/decisions/${id2}/lever`), 'retour').value, '/entites/ip/203.0.113.4');
  assert.match(r2.body, /<a class="btn ghost" href="\/entites\/ip\/203\.0\.113\.4">Annuler<\/a>/);
  const r3 = await v.get(cookie, `/decisions/${id2}/lever?retour=${encodeURIComponent('//mechant.example/')}`);
  assert.equal(champ(formDe(r3.body, `/decisions/${id2}/lever`), 'retour').value, '/decisions');
  for (const u of ['/decisions/999/lever', '/decisions/abc/lever', '/decisions/0/lever']) assert.equal((await v.get(cookie, u)).statusCode, 404, u);
  // Plus de 5 minutes après la connexion : la page prévient ; l'envoi demande l'identité, rien n'est levé.
  v.clock.t += 6 * 60e3;
  const r4 = await v.get(cookie, `/decisions/${id2}/lever`);
  assert.match(r4.body, /class="vg-reauth"/);
  const re = await v.envoyer(cookie, formDe(r4.body, `/decisions/${id2}/lever`));
  assert.equal(re.statusCode, 401);
  assert.equal(v.db.prepare('SELECT leve_a FROM decisions WHERE id = ?').pluck().get(id2), null);
});

test('fiche d’une alerte : prendre en charge, classer, noter, décider avec alerte=<n°>, lever ; un Lecteur n’a aucun formulaire', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  const id = v.alerte('compte', 'zitadel-1');
  const fiche = async (c = cookie) => { const r = await v.get(c, `/alertes/${id}`); assert.equal(r.statusCode, 200); verifierPage(r.body); return r.body; };
  let h = await fiche();
  // Prendre en charge : le bouton plein désigne le formulaire caché.
  assert.match(h, /<button class="btn" type="submit" form="f-prendre">Prendre en charge<\/button>/);
  let r = await v.envoyer(cookie, formDe(h, `/alertes/${id}/prendre`));
  assert.equal(r.headers.location, `/alertes/${id}`);
  assert.equal(v.db.prepare('SELECT statut FROM alerts WHERE id = ?').pluck().get(id), 'en_cours');
  h = await fiche();
  assert.match(h, /Alerte #1 prise en charge\./);
  assert.doesNotMatch(h, /form="f-prendre"/, 'déjà prise en charge');

  // Note : vide refusée près du champ ; puis ajoutée.
  r = await v.envoyer(cookie, formDe(h, `/alertes/${id}/note`), { tape: { note: '' } });
  h = await fiche();
  assert.equal(champ(formDe(h, `/alertes/${id}/note`), 'note')['aria-invalid'], 'true');
  assert.match(h, /id="h-note-err">.*note vide/);
  r = await v.envoyer(cookie, formDe(h, `/alertes/${id}/note`), { tape: { note: `vu avec Julien ${PIEGE}` } });
  assert.deepEqual(v.events('vigie_alerte').at(-1).detail, { action: 'note', id, note: `vu avec Julien ${PIEGE}`, par_sub: 'sub-seb' });

  // Actions forcées sur le compte : geler depuis la fiche, alerte=<n°> ; la décision revient dans « Réponse » avec « Lever… ».
  h = await fiche();
  assert.match(h, /<h2 class="panel-t" id="t-agir">Actions forcées sur le compte<\/h2>/);
  const fg = formDe(h, '/decisions', f => champ(f, 'type')?.value === 'geler');
  assert.equal(champ(fg, 'alerte').value, String(id));
  assert.equal(champ(fg, 'retour').value, `/alertes/${id}`);
  assert.equal(champ(fg, 'cible').value, 'zitadel-1');
  // Compte vidé (formulaire trafiqué) : refusé, l'erreur près du champ de CE formulaire seulement. (Motif facultatif
  // depuis une fiche : l'alerte en tient lieu ; vérifié dans vigie-console-actions.test.js.)
  r = await v.envoyer(cookie, fg, { tape: { motif: 'enquête', cible: '' }, bouton: '7j' });
  assert.equal(r.headers.location, `/alertes/${id}`);
  h = await fiche();
  assert.match(formDe(h, '/decisions', f => champ(f, 'type')?.value === 'geler').html, /aria-invalid|class="err"/);
  assert.doesNotMatch(formDe(h, '/decisions', f => champ(f, 'type')?.value === 'revoquer_compte').html, /aria-invalid/);
  r = await v.envoyer(cookie, formDe(h, '/decisions', f => champ(f, 'type')?.value === 'geler'), { tape: { motif: 'enquête', cible: 'zitadel-1' }, bouton: '7j' });
  const d = v.derniere();
  assert.deepEqual({ kind: d.kind, cible: d.cible, motif: d.motif, duree: d.fin - d.cree_a }, { kind: 'geler', cible: 'zitadel-1', motif: `alerte #${id} · enquête`, duree: 7 * 864e5 });
  h = await fiche();
  assert.match(h, new RegExp(`<a class="vg-lien" href="/decisions/${d.id}/lever\\?retour=%2Falertes%2F${id}">Lever le gel…`));
  assert.match(h, /Geler plus longtemps/);
  assert.match(h, /Déjà en cours : décision #1/);
  // Fermer les sessions du compte, depuis la fiche.
  r = await v.envoyer(cookie, formDe(h, '/decisions', f => champ(f, 'type')?.value === 'revoquer_compte'), { tape: { motif: 'sessions volées' }, bouton: '48h' });
  assert.equal(v.derniere().kind, 'revoquer_compte');
  assert.doesNotMatch(formulaires(await fiche()).map(f => f.html).join(''), /value="revoquer_compte"/, 'déjà fait : plus de formulaire');

  // Classer : sans classement, refusé près du choix, la note reprise ; puis classée et close (plus de « Classer »).
  h = await fiche();
  r = await v.envoyer(cookie, formDe(h, `/alertes/${id}/classer`), { tape: { note: `box redémarrée ${PIEGE}` } });
  h = await fiche();
  let fc = formDe(h, `/alertes/${id}/classer`);
  assert.ok(fc.champs.filter(c => c.name === 'classement').every(c => c['aria-invalid'] === 'true'));
  assert.match(h, /id="c-classement-err">.*classement : incident, faux positif ou test/);
  assert.equal(champ(fc, 'note').value, `box redémarrée ${PIEGE}`);
  r = await v.envoyer(cookie, fc, { radios: { classement: 'faux_positif' } });
  assert.deepEqual(v.db.prepare('SELECT statut, classement, note FROM alerts WHERE id = ?').get(id), { statut: 'close', classement: 'faux_positif', note: `box redémarrée ${PIEGE}` });
  h = await fiche();
  assert.ok(!formulaires(h).some(f => f.action === `/alertes/${id}/classer` || f.action === '/decisions'), 'alerte close : ni classer ni action forcée');
  assert.ok(formulaires(h).some(f => f.action === `/alertes/${id}/note`), 'une note reste possible');

  // Alerte sur une adresse : bloquer, aucune portée cochée ; votre propre adresse : la case d'avance.
  const ip = v.alerte('ip', '198.51.100.7');
  h = (await v.get(cookie, `/alertes/${ip}`)).body;
  verifierPage(h);
  const fb = formDe(h, '/decisions', f => champ(f, 'type')?.value === 'bloquer');
  assert.ok(fb.champs.filter(c => c.name === 'portee').every(c => c.checked === undefined));
  assert.equal(fb.champs.find(c => c.name === 'confirme')?.type, 'checkbox');
  r = await v.envoyer(cookie, fb, { tape: { motif: 'essai' }, radios: { portee: 'auth' }, cases: ['confirme'], bouton: '1h' });
  assert.deepEqual({ cible: v.derniere().cible, portee: v.derniere().portee, motif: v.derniere().motif }, { cible: '198.51.100.7/32', portee: 'auth', motif: `alerte #${ip} · essai` });

  // Intervenant : les mêmes gestes. Lecteur : aucun formulaire, aucun bouton, aucun « Lever… ».
  const jc = await v.intervenant();
  const autre = v.alerte('compte', 'zitadel-2');
  const hj = (await v.get(jc, `/alertes/${autre}`)).body;
  assert.ok(formulaires(hj).some(f => f.action === `/alertes/${autre}/prendre`));
  assert.ok(formulaires(hj).some(f => f.action === '/decisions'));
  const lc = await v.lecteur();
  for (const n of [id, ip, autre]) {
    const hl = contenu((await v.get(lc, `/alertes/${n}`)).body);
    assert.doesNotMatch(hl, /<form|<button|\/lever/i, `#${n}`);
    assert.ok(!hl.includes('198.51.100.7'), `#${n} : adresse complète`);
  }
});

test('fiche d’une entité : actions forcées selon la classe, retour sur la fiche, « Lever… » ; un Lecteur n’en a aucune', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  v.alerte('ip', '203.0.113.23');
  v.alerte('compte', 'zitadel-5');
  v.alerte('reseau', '203.0.113.0');
  // Adresse : bloquer (portée requise), retour sur la fiche ; lien vers la page Décisions pour le réseau entier.
  let r = await v.get(cookie, '/entites/ip/203.0.113.23');
  assert.equal(r.statusCode, 200);
  verifierPage(r.body);
  let h = contenu(r.body);
  assert.match(h, /<h2 class="panel-t" id="t-agir">Actions forcées sur l’adresse<\/h2>/);
  assert.match(h, /<a class="btn ghost ep-secondaire" href="#agir">Bloquer…<\/a>/);
  assert.match(h, /href="\/decisions\?type=bloquer&amp;cible=203\.0\.113\.23#nouvelle"/);
  assert.doesNotMatch(h, /Rien ne se fait depuis cet écran/);
  const fb = formDe(r.body, '/decisions', f => champ(f, 'type')?.value === 'bloquer');
  assert.equal(champ(fb, 'retour').value, '/entites/ip/203.0.113.23');
  assert.equal(champ(fb, 'alerte'), undefined);
  assert.equal(fb.champs.find(c => c.name === 'confirme'), undefined, 'pas votre adresse : pas de case');
  // Sans portée (un navigateur l'exigerait) : le serveur prend « tout » ; on choisit ici « L'admin et la connexion ».
  let p = await v.envoyer(cookie, fb, { tape: { motif: 'scanner' }, radios: { portee: 'admin' }, bouton: '24h' });
  assert.equal(p.headers.location, '/entites/ip/203.0.113.23');
  const d = v.derniere();
  assert.deepEqual({ cible: d.cible, portee: d.portee, duree: d.fin - d.cree_a }, { cible: '203.0.113.23/32', portee: 'admin', duree: 864e5 });
  r = await v.get(cookie, '/entites/ip/203.0.113.23');
  h = contenu(r.body);
  assert.match(h, /Décision #1 : 203\.0\.113\.23\/32 bloqué\./);
  assert.match(h, /<a class="vg-lien" href="\/decisions\/1\/lever\?retour=%2Fentites%2Fip%2F203\.0\.113\.23">Lever le blocage…/);
  // Refus sur la fiche : réseau de motif vide → erreur près du motif de la fiche, saisie reprise.
  p = await v.envoyer(cookie, formDe(r.body, '/decisions', f => champ(f, 'type')?.value === 'bloquer'), { tape: { motif: '' }, radios: { portee: 'tout' }, bouton: '1h' });
  r = await v.get(cookie, '/entites/ip/203.0.113.23');
  const fe = formDe(r.body, '/decisions', f => champ(f, 'type')?.value === 'bloquer');
  assert.equal(champ(fe, 'motif')['aria-invalid'], 'true');
  assert.equal(fe.champs.find(c => c.name === 'portee' && c.checked !== undefined)?.value, 'tout');

  // Réseau (clé du site, sans suffixe) : bloquer le /24.
  r = await v.get(cookie, '/entites/reseau/203.0.113.0');
  assert.equal(r.statusCode, 200);
  assert.equal(champ(formDe(r.body, '/decisions', f => champ(f, 'type')?.value === 'bloquer'), 'cible').value, '203.0.113.0/24');
  // Compte : geler, fermer les sessions.
  r = await v.get(cookie, '/entites/compte/zitadel-5');
  verifierPage(r.body);
  assert.match(contenu(r.body), /href="#agir">Geler…<\/a>/);
  p = await v.envoyer(cookie, formDe(r.body, '/decisions', f => champ(f, 'type')?.value === 'geler'), { tape: { motif: 'compte volé' }, bouton: '30j' });
  assert.equal(p.headers.location, '/entites/compte/zitadel-5');
  assert.deepEqual({ kind: v.derniere().kind, cible: v.derniere().cible, duree: v.derniere().fin - v.derniere().cree_a }, { kind: 'geler', cible: 'zitadel-5', duree: 30 * 864e5 });
  p = await v.envoyer(cookie, formDe((await v.get(cookie, '/entites/compte/zitadel-5')).body, '/decisions', f => champ(f, 'type')?.value === 'revoquer_compte'), { tape: { motif: 'compte volé' }, bouton: '48h' });
  assert.equal(v.derniere().kind, 'revoquer_compte');

  // Lecteur : la fiche du réseau, sans aucun geste.
  const lc = await v.lecteur();
  const rl = await v.get(lc, '/entites/reseau/203.0.113.0');
  assert.equal(rl.statusCode, 200);
  verifierPage(rl.body);
  assert.doesNotMatch(contenu(rl.body), /<form[^>]*method="post"|<button|\/lever|Bloquer…/i);
  assert.ok(!contenu(rl.body).includes('203.0.113.23'));
});
