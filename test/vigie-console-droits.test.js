import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './console-env.js';

// Console de la Vigie, phase D3c : l'écran Droits (MV-08, /droits). Un Administrateur voit chaque personne (plafond,
// attribution, droit effectif, amorce), le formulaire d'attribution (jamais pour soi ni pour l'amorce : la raison à la
// place), le journal des droits, les connexions refusées, les sessions ouvertes ; les autres rôles voient « Vos droits »
// (leurs deux clés), jamais la liste. Les formulaires sont extraits du HTML rendu puis postés comme un navigateur.

const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function env(t, opts) {
  const v = setup(t, opts);
  // Chaque session garde l'identité Cloudflare Access de son ouverture (sinon : refusée, « access_autre »).
  const emails = new Map();
  const login = async (o = {}) => { const r = await v.login(o); emails.set(r.cookie, o.email); return r; };
  const h = cookie => v.h({ email: emails.get(cookie) });
  const get = (cookie, url = '/droits') => v.app.inject({ url, headers: h(cookie), cookies: { '__Host-vigie': cookie } });
  const post = (cookie, url, champs) => v.app.inject({ method: 'POST', url, headers: { ...h(cookie), 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
    cookies: { '__Host-vigie': cookie }, payload: new URLSearchParams(champs).toString() });
  const message = cookie => { const m = v.sessionOf(cookie).message; return m ? JSON.parse(m) : null; };
  return { ...v, login, get, post, message };
}

// Les formulaires POST d'une page, avec leurs champs (cachés, cases, listes : l'option choisie).
function formulaires(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(([, attrs, corps]) => {
    const action = decode(/action="([^"]*)"/.exec(attrs)?.[1] || '');
    const champs = {};
    for (const [, a] of corps.matchAll(/<input\b([^>]*)>/g)) {
      const name = /name="([^"]*)"/.exec(a)?.[1];
      if (!name) continue;
      if (/type="checkbox"/.test(a) && !/\schecked\b/.test(a)) continue;
      champs[name] = decode(/value="([^"]*)"/.exec(a)?.[1] ?? '');
    }
    const options = {};
    for (const [, a, opts] of corps.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const name = /name="([^"]*)"/.exec(a)[1];
      const liste = [...opts.matchAll(/<option value="([^"]*)"([^>]*)>/g)].map(([, val, rest]) => ({ v: val, selected: /\sselected\b/.test(rest) }));
      options[name] = liste.map(o => o.v);
      champs[name] = (liste.find(o => o.selected) || liste[0])?.v;
    }
    return { action, attrs, corps, champs, options, danger: /class="btn danger"/.test(corps), confirme: /name="confirme"[^>]*required/.test(corps) };
  });
}
const ligne = (html, id) => { const i = html.indexOf(`<tr id="${id}">`); assert.ok(i >= 0, `ligne ${id} absente`); return html.slice(i, html.indexOf('</tr>', i)); };

function sansEnLigne(html) {
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'attribut style');
  assert.doesNotMatch(html, /<style\b/i, 'feuille en ligne');
  for (const b of html.match(/<[a-z][^>]*>/gi) || []) assert.doesNotMatch(b, /\son[a-z]+\s*=/i, `gestionnaire en ligne : ${b}`);
  for (const s of html.match(/<script\b[^>]*>/gi) || []) assert.match(s, /\ssrc="\/static\/[a-z-]+\.js(\?v=[^"]*)?"/, `script sans src local : ${s}`);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]+<\/script>/i, 'script en ligne');
}

// Trois personnes, comme MV-08 : Sébastien et Julien (amorce), Camille (plafond Lecteur, pas encore attribuée).
async function trois(t, opts = {}) {
  const v = env(t, { adminSubs: ['sub-seb', 'sub-julien'], ...opts });
  Object.assign(v.ceilings, { 'sub-julien': 'admin', 'sub-camille': 'viewer' });
  const julien = await v.login({ sub: 'sub-julien', nom: 'Julien', email: 'julien@exemple.org' });
  const camille = await v.login({ sub: 'sub-camille', nom: 'Camille', roles: ['vigie.viewer'], email: 'camille@exemple.org' });
  const seb = await v.login();
  return { v, seb: seb.cookie, julien: julien.cookie, camille: camille.cookie };
}

test('Administrateur : chaque personne, ses deux clés et son droit effectif ; formulaire pour Camille seule ; soi et amorce avec la raison', async t => {
  const { v, seb } = await trois(t);
  const r = await v.get(seb);
  assert.equal(r.statusCode, 200);
  const html = r.body;
  sansEnLigne(html);
  assert.match(html, /<h1>Droits<\/h1>/);
  assert.match(html, /3 personnes, 2 Administrateurs/);
  assert.match(html, /<a href="\/droits" aria-current="page">/);
  // Sébastien : vous, amorce, aucune commande.
  const s = ligne(html, 'p-sub-seb');
  assert.match(s, /Sébastien \(vous\)/);
  assert.match(s, /Amorce : Administrateur tant que vous êtes dans <span class="donnee">VIGIE_ADMIN_SUBS<\/span>/);
  assert.doesNotMatch(s, /<form/);
  // Julien : amorce, aucune commande (« Rendre Julien Analyste » n'est pas proposé).
  const j = ligne(html, 'p-sub-julien');
  assert.match(j, /Amorce : Administrateur tant que ce compte est dans/);
  assert.doesNotMatch(j, /<form/);
  // Camille : plafond Lecteur, pas encore attribuée, Lecteur ; « Attribuer » (bouton plein) et les rôles au-dessus du plafond dits.
  const c = ligne(html, 'p-sub-camille');
  assert.match(c, /data-label="Plafond \(Zitadel\)">Lecteur<span class="sec">vigie\.viewer<\/span>/);
  assert.match(c, /pas encore attribuée/);
  assert.match(c, /class="eff" data-label="Droit effectif">Lecteur</);
  assert.match(c, /<option value="handler" class="au-dessus">Intervenant \(au-dessus de son plafond\)<\/option>/);
  assert.match(c, /<label class="sr-only" for="a-p-sub-camille">Attribution de Camille<\/label><select id="a-p-sub-camille"/);
  assert.match(c, /class="btn enr" type="submit">Attribuer/);
  assert.doesNotMatch(c, /<details/, 'rien à retirer à une Lectrice sans attribution');
  // Le formulaire de Camille est le seul de la page (hors « Se déconnecter »).
  const f = formulaires(html).filter(x => x.action.startsWith('/droits/'));
  assert.deepEqual(f.map(x => x.action), ['/droits/sub-camille']);
  assert.equal(f[0].champs._csrf, v.sessionOf(seb).csrf);
  assert.equal(f[0].champs.retour, '/droits#p-sub-camille');
  // Arrivée sans attribution signalée en tête, lien vers sa ligne.
  assert.match(html, /class="signal vg-arrivee"[\s\S]*?Camille : première venue[\s\S]*?href="#p-sub-camille"/);
  // Ce que permet chaque rôle (tiré de ACTIONS), garde-fous, phrase de l'amorce.
  assert.match(html, /<dt>Administrateur<span class="donnee">vigie\.admin<\/span><\/dt><dd>et les droits de la Vigie/);
  assert.match(html, /retirez son plafond <span class="donnee">vigie\.\*<\/span> dans Zitadel : il perd l’accès dans les 5 minutes, et ne peut plus agir dès la requête suivante/);
  // Identité confirmée à la connexion : dite dans l'en-tête, 5 minutes.
  assert.match(html, /Identité confirmée à 12 h 00, valable jusqu’à 12 h 05/);
});

test('attribuer puis retirer : formulaires extraits de la page, postés ; retour à la ligne ; retrait en danger, confirmé', async t => {
  const { v, seb, camille } = await trois(t);
  v.ceilings['sub-camille'] = 'analyst';
  v.c.rights.observe('sub-camille', 'analyst');       // plafond relu (à sa requête suivante, ici à la main)
  let f = formulaires((await v.get(seb)).body).find(x => x.action === '/droits/sub-camille');
  assert.ok(f.options.attribution.includes('analyst'));
  let r = await v.post(seb, f.action, { ...f.champs, attribution: 'analyst' });
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, '/droits#p-sub-camille');
  assert.equal(v.db.prepare("SELECT attribution FROM console_droits WHERE sub = 'sub-camille'").pluck().get(), 'analyst');
  assert.equal(v.message(seb).k, 'ok');
  // La page suivante : le retour en tête (role="status"), la ligne à jour, le journal.
  let html = (await v.get(seb)).body;
  assert.match(html, /role="status"[\s\S]*?Attribution changée/);
  const c = ligne(html, 'p-sub-camille');
  assert.match(c, /data-label="Attribution \(Vigie\)">Analyste<span class="sec">le /);
  assert.match(c, /class="eff" data-label="Droit effectif">Analyste</);
  assert.match(html, /Sébastien \(<span class="sub">sub-seb<\/span>\) change l’attribution de Camille \(<span class="sub">sub-camille<\/span>\) : aucune → Analyste\./);
  assert.ok(v.events('vigie_console_droits').length >= 1);
  // Retirer : replié, en danger, case de confirmation obligatoire ; les rôles au-dessous seulement.
  assert.match(c, /<details class="plier vg-retirer"><summary>Retirer un droit…/);
  f = formulaires(html).filter(x => x.action === '/droits/sub-camille');
  const retirer = f.find(x => x.champs.forme === 'retirer');
  assert.ok(retirer.danger && retirer.confirme);
  assert.deepEqual(retirer.options.attribution, ['viewer', 'handler']);
  assert.equal(retirer.champs.attribution, 'handler', 'un cran plus bas par défaut');
  assert.deepEqual(f.find(x => x.champs.forme === 'attribuer').options.attribution, ['analyst', 'admin']);
  r = await v.post(seb, retirer.action, { ...retirer.champs, attribution: 'viewer', confirme: 'oui' });
  assert.equal(r.statusCode, 303);
  assert.equal(v.db.prepare("SELECT attribution FROM console_droits WHERE sub = 'sub-camille'").pluck().get(), 'viewer');
  // Camille n'a plus que la lecture dès sa requête suivante.
  const vue = (await v.get(camille)).body;
  assert.match(vue, /<h1>Vos droits<\/h1>/);
  assert.match(vue, /Vous êtes Lecteur/);
});

test('refus : amorce, soi-même (ancien onglet) et rôle inconnu : la raison en tête et sur la ligne, la saisie reprise', async t => {
  const { v, seb } = await trois(t);
  const html = (await v.get(seb)).body;
  const csrf = v.sessionOf(seb).csrf;
  // « Rendre Julien Analyste », formulaire rejoué : refusé, Julien est dans l'amorce.
  await v.post(seb, '/droits/sub-julien', { _csrf: csrf, attribution: 'analyst', retour: '/droits#p-sub-julien', personne: 'sub-julien', forme: 'attribuer' });
  assert.equal(v.message(seb).k, 'erreur');
  let page = (await v.get(seb)).body;
  assert.match(page, /role="alert"[\s\S]*?Non fait.: compte de l’amorce \(VIGIE_ADMIN_SUBS\)/);
  const j = ligne(page, 'p-sub-julien');
  assert.match(j, /<p class="err" id="err-p-sub-julien">[\s\S]*?<b>Erreur :<\/b> compte de l’amorce/);
  assert.doesNotMatch(j, /<form/);
  // Son propre rôle : refusé, l'erreur sur sa ligne.
  await v.post(seb, '/droits/sub-seb', { _csrf: csrf, attribution: 'viewer', personne: 'sub-seb', forme: 'attribuer' });
  page = (await v.get(seb)).body;
  assert.match(ligne(page, 'p-sub-seb'), /<b>Erreur :<\/b> personne ne change son propre rôle/);
  assert.equal(v.c.rights.effective('sub-seb', 'admin'), 'admin');
  // Rôle inconnu (requête forgée) : le champ marqué en erreur sur la ligne de Camille, l'erreur liée au champ.
  const f = formulaires(html).find(x => x.action === '/droits/sub-camille');
  await v.post(seb, f.action, { ...f.champs, attribution: 'root' });
  assert.equal(v.message(seb).champ, 'attribution');
  page = (await v.get(seb)).body;
  const c = ligne(page, 'p-sub-camille');
  assert.match(c, /<select id="a-p-sub-camille" name="attribution" aria-invalid="true" aria-describedby="err-p-sub-camille">/);
  assert.match(c, /<p class="err" id="err-p-sub-camille">[\s\S]*?rôle inconnu/);
  // Le message n'est montré qu'une fois.
  assert.doesNotMatch((await v.get(seb)).body, /class="err"/);
  // Ré-authentification de plus de 5 minutes : la console la demande, rien ne change ; l'en-tête ne la dit plus.
  v.clock.t += 6 * 60e3;
  const re = await v.post(seb, f.action, { ...f.champs, attribution: 'handler' });
  assert.equal(re.statusCode, 401);
  assert.match(re.body, /action="\/reauth"/);
  assert.equal(v.db.prepare("SELECT attribution FROM console_droits WHERE sub = 'sub-camille'").pluck().get(), null);
  assert.doesNotMatch((await v.get(seb)).body, /Identité confirmée/);
});

test('échappement : un nom piégé ne devient jamais du HTML (liste, journal, sessions, formulaire)', async t => {
  const v = env(t);
  const piege = '<img src=x onerror=alert(1)>';
  v.ceilings['sub-piege"><b>'] = 'viewer';
  await v.login({ sub: 'sub-piege"><b>', nom: piege, roles: ['vigie.viewer'], email: 'p@exemple.org' });
  const { cookie } = await v.login();
  const html = (await v.get(cookie)).body;
  sansEnLigne(html);
  assert.doesNotMatch(html, /<img/i);
  assert.doesNotMatch(html, /"><b>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const f = formulaires(html).find(x => x.action.startsWith('/droits/sub-piege'));
  assert.equal(f.action, `/droits/${encodeURIComponent('sub-piege"><b>')}`);
  assert.equal(f.champs.personne, 'sub-piege"><b>');
  assert.match(f.champs.retour, /^\/droits#p-sub-piege_+b_$/);
  // Posté tel quel : l'attribution est faite pour ce compte-là.
  const r = await v.post(cookie, f.action, { ...f.champs, attribution: 'viewer' });
  assert.equal(r.statusCode, 303);
  assert.equal(v.db.prepare('SELECT attribution FROM console_droits WHERE sub = ?').pluck().get('sub-piege"><b>'), 'viewer');
  // L'erreur d'une saisie piégée reste du texte.
  await v.post(cookie, f.action, { ...f.champs, attribution: '<script>alert(1)</script>' });
  const page = (await v.get(cookie)).body;
  sansEnLigne(page);
  assert.doesNotMatch(page, /<script>alert/);
});

test('Lecteur, Intervenant, Analyste : « Vos droits », leurs deux clés, ni liste, ni journal, ni formulaire', async t => {
  const { v, camille } = await trois(t);
  v.ceilings['sub-ana'] = 'analyst';
  await v.login({ sub: 'sub-ana', nom: 'Anaïs', roles: ['vigie.analyst'], email: 'ana@exemple.org' });
  v.c.rights.assign({ par: 'sub-seb', parRole: 'admin', sub: 'sub-ana', role: 'analyst' });
  const ana = (await v.login({ sub: 'sub-ana', nom: 'Anaïs', roles: ['vigie.analyst'], email: 'ana@exemple.org' })).cookie;
  for (const [cookie, role, attrib] of [[camille, 'Lecteur', 'aucune'], [ana, 'Analyste', 'Analyste']]) {
    const r = await v.get(cookie);
    assert.equal(r.statusCode, 200);
    sansEnLigne(r.body);
    assert.match(r.body, /<h1>Vos droits<\/h1>/);
    assert.match(r.body, new RegExp(`Vous êtes ${role}`));
    assert.match(r.body, new RegExp(`Attribution : ${attrib}`));
    assert.match(r.body, /un Administrateur de la Vigie \((Sébastien ou Julien|Julien ou Sébastien)\)/);
    assert.doesNotMatch(r.body, /<table|action="\/droits\/|Journal des droits|Sessions ouvertes|Connexions refusées/);
    assert.doesNotMatch(r.body, /sub-julien|sub-seb/);
    assert.match(r.body, /<dt>Lecteur<span class="donnee">vigie\.viewer<\/span><\/dt>/);
  }
  // Et la route d'action le refuse (403), rien ne change.
  const csrf = v.sessionOf(ana).csrf;
  assert.equal((await v.post(ana, '/droits/sub-camille', { _csrf: csrf, attribution: 'admin' })).statusCode, 403);
});

test('journal des droits, connexions refusées sur 7 jours (raison en clair), sessions ouvertes sans jeton', async t => {
  const { v, seb } = await trois(t);
  // Connexion refusée : aucun rôle vigie.* ; second facteur absent.
  await v.login({ sub: 'sub-inconnu', nom: 'Inconnu', roles: [], email: 'x@exemple.org' });
  await v.login({ sub: 'sub-camille', nom: 'Camille', amr: ['pwd'], roles: ['vigie.viewer'], email: 'camille@exemple.org' });
  // Un refus de plus de 7 jours ne compte plus.
  v.db.prepare("UPDATE events SET recu_a = recu_a - 8 * 86400000 WHERE seq = (SELECT MIN(seq) FROM events WHERE type = 'vigie_console_refus')").run();
  const html = (await v.get(seb)).body;
  const journal = html.slice(html.indexOf('id="t-journal"'), html.indexOf('id="t-refus"'));
  assert.match(journal, /Camille \(<span class="sub">sub-camille<\/span>\) entre pour la première fois : plafond Lecteur lu dans Zitadel, aucune attribution, donc Lecteur\./);
  assert.match(journal, /signalé aux Administrateurs \(Moyenne\)/);
  assert.match(journal, /Sébastien \(<span class="sub">sub-seb<\/span>\) se connecte en Administrateur\./);
  assert.match(journal, /<span class="ip">198\.51\.100\.7<\/span>/);
  const refus = html.slice(html.indexOf('id="t-refus"'), html.indexOf('id="t-garde"'));
  assert.match(refus, /1 connexion refusée sur 7 jours\./);
  assert.match(refus, /Refusée : sans second facteur · Camille/);
  assert.doesNotMatch(refus, /aucun rôle vigie/);
  // Sessions ouvertes : les trois, la sienne marquée ; jamais l'empreinte du jeton ni le jeton CSRF d'une autre.
  const sessions = html.slice(html.indexOf('id="t-sessions"'));
  assert.match(sessions, /3 sessions ouvertes\./);
  assert.match(sessions, /Sébastien \(<span class="sub">sub-seb<\/span>\) \(vous\) · Administrateur/);
  for (const s of v.db.prepare('SELECT id, csrf FROM console_sessions').all()) {
    assert.ok(!html.includes(s.id), 'empreinte du jeton');
    if (s.id !== v.sessionOf(seb).id) assert.ok(!html.includes(s.csrf), 'jeton CSRF d’une autre session');
  }
  // Une session expirée (15 min sans activité) n'est plus comptée.
  v.clock.t += 16 * 60e3;
  v.db.prepare("UPDATE console_sessions SET vu_a = ? WHERE sub = 'sub-seb'").run(v.clock.t);
  const plusTard = (await v.get(seb)).body;
  assert.match(plusTard.slice(plusTard.indexOf('id="t-sessions"')), /1 session ouverte\./);
});

test('VIGIE_ROLES=zitadel : une seule clé, aucun formulaire, la phrase qui le dit', async t => {
  const v = env(t, { roles: 'zitadel' });
  v.ceilings['sub-camille'] = 'handler';
  await v.login({ sub: 'sub-camille', nom: 'Camille', roles: ['vigie.handler'], email: 'camille@exemple.org' });
  const { cookie } = await v.login();
  const html = (await v.get(cookie)).body;
  sansEnLigne(html);
  assert.doesNotMatch(html, /action="\/droits\//);
  assert.doesNotMatch(html, /vg-arrivee/);
  assert.match(html, /Une seule clé \(<span class="donnee">VIGIE_ROLES=zitadel<\/span>\)/);
  const c = ligne(html, 'p-sub-camille');
  assert.match(c, /data-label="Attribution \(Vigie\)">suit le plafond/);
  assert.match(c, /class="eff" data-label="Droit effectif">Intervenant</);
  assert.match(c, /Réglé dans Zitadel/);
});
