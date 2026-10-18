import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './console-env.js';

// Console de la Vigie, phase D3c : les formulaires des réglages (MV-06), des interrupteurs de la vue d'ensemble (MV-01) et de
// la santé (MV-07). Chaque formulaire est extrait du HTML rendu puis posté tel quel : ses champs doivent correspondre aux
// routes d'action (vigie/console/actions.js). Un refus revient près de son champ, la saisie reprise et échappée.

const PIEGE = '<img src=x onerror=alert(1)>';
const NOTIFS = { signal: { url: 'http://127.0.0.1:9', number: '+33612345678', group: 'group.SECRETGROUPID123' }, mail: { url: 'smtp://127.0.0.1:9', from: 'vigie@exemple.org', to: ['alice@exemple.org', 'bob@exemple.org'] } };

function env(t, extra = {}) {
  const v = setup(t, { extra: { notifications: NOTIFS, ...extra } });
  // Les espaces insécables (heures, « : ») lus comme des espaces : les phrases se comparent telles qu'on les lit.
  const get = async (cookie, url) => { const r = await v.app.inject({ url, headers: v.h(), cookies: { '__Host-vigie': cookie } }); return { statusCode: r.statusCode, headers: r.headers, body: plat(r.body) }; };
  const send = (cookie, form, body) => v.app.inject({ method: 'POST', url: form.action, headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
    cookies: { '__Host-vigie': cookie }, payload: new URLSearchParams(body).toString() });
  const message = cookie => { const m = v.sessionOf(cookie).message; return m ? JSON.parse(m) : null; };
  // Un compte d'un rôle donné (plafond et attribution).
  async function compte(sub, role) {
    v.ceilings[sub] = role;
    v.c.rights.observe(sub, role);
    if (role !== 'viewer') v.c.rights.assign({ par: 'sub-seb', parRole: 'admin', sub, role });
    return (await v.login({ sub, nom: sub, roles: [`vigie.${role}`] })).cookie;
  }
  return { ...v, get, send, message, compte };
}

const plat = s => s.replace(/[\u00a0\u202f]/g, ' ');
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([a-z_][\w-]*)(?:="([^"]*)")?/gi)].slice(1).map(([, k, val]) => [k.toLowerCase(), val === undefined ? '' : decode(val)]));

// Les formulaires POST d'une page : action, champs (cachés, texte, nombre, listes avec l'option choisie), boutons d'envoi.
function formulaires(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(([, tete, corps]) => {
    const a = attrs(`<form ${tete}>`);
    const champs = {};
    for (const [tag] of corps.matchAll(/<input\b[^>]*>/g)) { const x = attrs(tag); if (x.name) champs[x.name] = x.value ?? ''; }
    for (const [, tag, opts] of corps.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
      const x = attrs(`<select ${tag}>`);
      const o = [...opts.matchAll(/<option\b[^>]*>/g)].map(([t]) => attrs(t));
      champs[x.name] = (o.find(y => 'selected' in y) || o[0] || {}).value ?? '';
    }
    const boutons = [...corps.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, b, txt]) => ({ ...attrs(`<button ${b}>`), texte: decode(txt.replace(/<[^>]+>/g, '')).trim() }));
    return { action: a.action, method: (a.method || 'get').toLowerCase(), classe: a.class || '', champs, boutons, html: corps };
  }).filter(f => f.method === 'post');
}
const trouve = (html, action, formulaire) => {
  const f = formulaires(html).find(x => x.action === action && (!formulaire || x.champs.formulaire === formulaire));
  assert.ok(f, `formulaire ${action} ${formulaire || ''} absent`);
  return f;
};
// Le corps envoyé par un clic sur un bouton : les champs du formulaire, saisis, et le nom et la valeur du bouton.
const corps = (f, saisie = {}, bouton = null) => ({ ...f.champs, ...saisie, ...(bouton && bouton.name ? { [bouton.name]: bouton.value } : {}) });

// Aucune règle de style ni script en ligne, aucun gestionnaire d'événement (CSP sans « unsafe-inline »).
function propre(html) {
  // Les balises seules, valeurs d'attributs vidées (une saisie échappée « onerror=… » dans une valeur n'est pas un attribut).
  const balises = [...html.matchAll(/<[a-z][^>]*>/gi)].map(([b]) => b.replace(/="[^"]*"/g, '=""')).join('\n');
  assert.doesNotMatch(balises, /\sstyle=/i, 'attribut style');
  assert.doesNotMatch(balises, /\son[a-z]+=/i, 'gestionnaire on…=');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'script en ligne');
  assert.doesNotMatch(html, /<style/i, 'style en ligne');
}

test('réglages : formulaires pour l’Analyste et l’Administrateur, lecture seule pour l’Intervenant et le Lecteur', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  const ana = await v.compte('sub-ana', 'analyst');
  const inter = await v.compte('sub-julien', 'handler');
  const lect = await v.compte('sub-camille', 'viewer');
  for (const c of [cookie, ana]) {
    const r = await v.get(c, '/reglages');
    assert.equal(r.statusCode, 200);
    propre(r.body);
    const fs = formulaires(r.body);
    for (const n of ['detection', 'alertes', 'blocages']) trouve(r.body, `/interrupteurs/${n}`, `inter-${n}`);
    trouve(r.body, '/reglages/seuils', 'seuils');
    trouve(r.body, '/reglages/canaux/signal/essai');
    trouve(r.body, '/reglages/canaux/email/essai');
    trouve(r.body, '/reglages/regles/sigma.cookie_rejoue');
    // « Surveillance réduite » garde son mode : pas de formulaire, une phrase.
    assert.ok(!fs.some(f => f.action === '/reglages/regles/sigma.surveillance_reduite'));
    assert.match(r.body, /ne peut pas être changé/);
    // Toutes les règles du moteur ont leur formulaire, sauf celle-là.
    assert.equal(fs.filter(f => f.action.startsWith('/reglages/regles/')).length, v.engine.rules().length - 1);
    // Chaque formulaire porte le jeton de la session, la page où revenir (chemin local) et son nom.
    for (const f of fs.filter(x => x.action !== '/auth/logout')) {
      assert.equal(f.champs._csrf, v.sessionOf(c).csrf);
      assert.match(f.champs.retour, /^\/reglages/);
      assert.ok(f.champs.formulaire);
    }
  }
  // Adresses de confiance : à l'Administrateur seul (annexe § 5.4) ; l'Analyste voit la liste, sans formulaire.
  v.store.setting.set('adresses_confiance', [{ ip: '192.0.2.140', jusqua: v.clock.t + 3600e3, par: 'console · Sébastien', motif: 'box de Camille' }]);
  const adm = (await v.get(cookie, '/reglages')).body;
  trouve(adm, '/reglages/confiance/ajouter', 'confiance-ajouter');
  trouve(adm, '/reglages/confiance/retirer', 'confiance-retirer:192.0.2.140');
  assert.doesNotMatch(adm, /Réservé aux Administrateurs/);
  const pa = (await v.get(ana, '/reglages')).body;
  assert.ok(!formulaires(pa).some(f => f.action.startsWith('/reglages/confiance/')));
  assert.match(pa, /<span class="ip">192\.0\.2\.140<\/span> · box de Camille/);
  assert.match(pa, /<p class="vg-sans">Réservé aux Administrateurs\.<\/p>/);
  for (const c of [inter, lect]) {
    const r = await v.get(c, '/reglages');
    assert.equal(r.statusCode, 200);
    propre(r.body);
    assert.deepEqual(formulaires(r.body).map(f => f.action), ['/auth/logout'], 'aucun formulaire d’action');
    assert.match(r.body, /vous voyez les réglages, vous ne les changez pas/);
    assert.match(r.body, /Lecture seule\./);
    // L'état reste lisible : modes, seuils.
    assert.match(r.body, /<span class="vg-mode-lu">Alerter<\/span>/);
    assert.match(r.body, /<dt>Adresse<\/dt><dd>7 points/);
  }
  assert.match((await v.get(inter, '/reglages')).body, /Vos actions forcées sont sur <a href="\/decisions">Décisions<\/a>/);
});

test('réglages : chaque formulaire extrait de la page réussit (interrupteur, seuils, confiance, mode, essai)', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  let page = (await v.get(cookie, '/reglages')).body;

  // Arrêter la détection : motif, un bouton par durée (la durée proposée, pleine, en dernier).
  let f = trouve(page, '/interrupteurs/detection', 'inter-detection');
  assert.deepEqual(f.boutons.map(b => b.value), ['1h', '24h', '', '4h']);
  let r = await v.send(cookie, f, corps(f, { motif: 'essai de la bordure' }, f.boutons[0]));
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, '/reglages#inter-detection');
  assert.equal(v.switches.isOn('detection'), false);
  assert.equal(v.store.setting.get('interrupteurs').detection.jusqua - v.clock.t, 3600e3);
  page = (await v.get(cookie, '/reglages')).body;
  assert.match(page, /Interrupteur « detection » arrêté\./);
  assert.match(page, /Il se rallume seul à \d\d\sh\s\d\d\./);
  assert.match(page, /détection arrêtée jusqu’à/);
  // Remettre en marche, depuis la carte des réglages.
  f = trouve(page, '/interrupteurs/detection', 'inter-detection-marche');
  r = await v.send(cookie, f, corps(f));
  assert.equal(r.statusCode, 303);
  assert.equal(v.switches.isOn('detection'), true);
  // L'autre durée, écrite, l'emporte sur le bouton.
  page = (await v.get(cookie, '/reglages')).body;
  f = trouve(page, '/interrupteurs/alertes', 'inter-alertes');
  await v.send(cookie, f, corps(f, { motif: 'maintenance Signal', duree_libre: '30min' }, f.boutons.find(b => b.value === '')));
  assert.equal(v.store.setting.get('interrupteurs').alertes.jusqua - v.clock.t, 30 * 60e3);

  // Seuils : les cinq classes, un seul changé.
  page = (await v.get(cookie, '/reglages')).body;
  f = trouve(page, '/reglages/seuils', 'seuils');
  assert.deepEqual(Object.keys(f.champs).filter(k => !['_csrf', 'retour', 'formulaire'].includes(k)).sort(), ['appareil', 'compte', 'ip', 'motif', 'reseau', 'session']);
  assert.equal(f.champs.ip, '7');
  r = await v.send(cookie, f, corps(f, { ip: '9', motif: 'trop de bruit' }));
  assert.equal(v.engine.thresholds().ip, 9);
  assert.equal(v.message(cookie).texte, 'Seuils : ip 9.');

  // Adresse de confiance : ajouter (1 jour), puis la retirer depuis sa ligne.
  page = (await v.get(cookie, '/reglages')).body;
  f = trouve(page, '/reglages/confiance/ajouter', 'confiance-ajouter');
  assert.deepEqual(f.boutons.map(b => b.value), ['1j', '7j']);
  await v.send(cookie, f, corps(f, { ip: '192.0.2.140', motif: 'box de Camille' }, f.boutons[0]));
  assert.equal(v.store.setting.get('adresses_confiance')[0].jusqua - v.clock.t, 864e5);
  page = (await v.get(cookie, '/reglages')).body;
  assert.match(page, /<span class="ip">192\.0\.2\.140<\/span> · box de Camille/);
  f = trouve(page, '/reglages/confiance/retirer', 'confiance-retirer:192.0.2.140');
  assert.equal(f.champs.ip, '192.0.2.140');
  await v.send(cookie, f, corps(f));
  assert.deepEqual(v.store.setting.get('adresses_confiance'), []);
  // Une adresse échue n'est plus montrée.
  v.store.setting.set('adresses_confiance', [{ ip: '192.0.2.9', jusqua: v.clock.t - 1, motif: 'vieux' }]);
  assert.doesNotMatch((await v.get(cookie, '/reglages')).body, /192\.0\.2\.9/);

  // Mode d'une règle : descendre (motif), puis arrêter pour une durée.
  page = (await v.get(cookie, '/reglages')).body;
  f = trouve(page, '/reglages/regles/sigma.cookie_rejoue');
  assert.equal(f.champs.mode, v.engine.modeOf('sigma.cookie_rejoue'));
  assert.equal(f.champs.duree, '24h');
  assert.equal(f.champs.retour, '/reglages#r-sigma-cookie_rejoue');
  await v.send(cookie, f, corps(f, { mode: 'observer', motif: 'calibrage' }));
  assert.equal(v.engine.modeOf('sigma.cookie_rejoue'), 'observer');
  page = (await v.get(cookie, '/reglages')).body;
  f = trouve(page, '/reglages/regles/sigma.cookie_rejoue');
  await v.send(cookie, f, corps(f, { mode: 'arret', motif: 'faux positifs', duree: '4h' }));
  assert.equal(v.engine.modeOf('sigma.cookie_rejoue'), 'arret');
  page = (await v.get(cookie, '/reglages')).body;
  assert.match(page, /En Arrêt jusqu’à \d\d\sh\s\d\d, par Sébastien \(sub-seb\) : « faux positifs » ; puis Observer\./);
  // Une règle à points n'a qu'Arrêt et Observer ; son retour rouvre le tableau replié au téléphone.
  const pts = trouve(page, '/reglages/regles/sigma.piege');
  assert.deepEqual([...pts.html.matchAll(/<option value="(\w+)"/g)].map(m => m[1]).filter(x => !['1h', '4h', '24h', '7j'].includes(x)), ['arret', 'observer']);
  assert.equal(pts.champs.retour, '/reglages#regles-points');

  // Essai d'un canal : la passerelle ne répond pas, le refus revient sous le canal.
  f = trouve(page, '/reglages/canaux/signal/essai');
  r = await v.send(cookie, f, corps(f));
  assert.equal(r.headers.location, '/reglages#canal-signal');
  assert.equal(v.message(cookie).k, 'erreur');
  page = (await v.get(cookie, '/reglages')).body;
  const carte = page.slice(page.indexOf('id="canal-signal"'), page.indexOf('id="canal-email"'));
  assert.match(carte, /<p class="err">[\s\S]*essai signal en échec/);
});

test('réglages : un refus revient près de son champ, la saisie reprise et échappée ; une seule fois', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  let page = (await v.get(cookie, '/reglages')).body;

  // Interrupteur : durée illisible ; le motif piégé revient échappé, la carte dépliée.
  let f = trouve(page, '/interrupteurs/blocages', 'inter-blocages');
  await v.send(cookie, f, corps(f, { motif: PIEGE, duree_libre: '2 semaines' }, f.boutons.at(-1)));
  assert.equal(v.message(cookie).champ, 'duree_libre');
  page = (await v.get(cookie, '/reglages')).body;
  propre(page);
  assert.doesNotMatch(page, /<img src=x/);
  assert.match(page, /value="&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(page, /<details class="plier" open><summary>[\s\S]*?Arrêter…<span class="sr-only"> les blocages automatiques/);
  assert.match(page, /<input id="duree-blocages" name="duree_libre"[^>]*aria-describedby="duree-blocages-aide duree-blocages-err" value="2 semaines" aria-invalid="true">/);
  assert.match(page, /<p class="err" id="duree-blocages-err">[\s\S]*?durée attendue/);
  assert.equal(v.switches.isOn('blocages'), true);
  // Le message ne revient pas au rechargement.
  page = (await v.get(cookie, '/reglages')).body;
  assert.doesNotMatch(page, /aria-invalid/);
  assert.doesNotMatch(page, /Non fait/);

  // Interrupteur : sans motif (le champ est requis dans la page ; le serveur refuse aussi).
  f = trouve(page, '/interrupteurs/detection', 'inter-detection');
  await v.send(cookie, f, corps(f, { motif: '' }, f.boutons[0]));
  page = (await v.get(cookie, '/reglages')).body;
  assert.match(page, /<input id="motif-detection" name="motif"[^>]* aria-invalid="true" aria-describedby="motif-detection-err">/);
  assert.match(page, /<p class="err" id="motif-detection-err">/);

  // Seuils : 0 refusé près du champ « compte », les autres saisies et le motif repris.
  f = trouve(page, '/reglages/seuils', 'seuils');
  await v.send(cookie, f, corps(f, { ip: '20', compte: '0', motif: PIEGE }));
  page = (await v.get(cookie, '/reglages')).body;
  propre(page);
  assert.match(page, /<input id="s-compte" name="compte"[^>]*value="0" aria-describedby="s-compte-aide s-compte-err" aria-invalid="true">/);
  assert.match(page, /<p class="err" id="s-compte-err">/);
  assert.match(page, /<input id="s-ip" name="ip"[^>]*value="20"/);
  assert.match(page, /id="s-motif"[^>]*value="&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.equal(v.engine.thresholds().ip, 7);

  // Adresse de confiance : un réseau refusé près du champ de l'adresse, le dépliant ouvert.
  f = trouve(page, '/reglages/confiance/ajouter', 'confiance-ajouter');
  await v.send(cookie, f, corps(f, { ip: '192.0.2.0/24', motif: 'box de la relectrice' }, f.boutons[1]));
  page = (await v.get(cookie, '/reglages')).body;
  assert.match(page, /<details class="plier vg-sur" open>/);
  assert.match(page, /<input class="vg-mono" id="conf-ip"[^>]*aria-describedby="conf-ip-aide conf-ip-err" value="192\.0\.2\.0\/24" aria-invalid="true">/);
  assert.match(page, /id="conf-motif"[^>]*value="box de la relectrice"/);

  // Mode d'une règle : descente sans motif ; le choix est repris (Enregistrer reste visible), le motif marqué.
  f = trouve(page, '/reglages/regles/sigma.cookie_rejoue');
  await v.send(cookie, f, corps(f, { mode: 'observer' }));
  assert.match(v.message(cookie).texte, /motif obligatoire/);
  page = (await v.get(cookie, '/reglages')).body;
  const ligne = page.slice(page.indexOf('<tr id="r-sigma-cookie_rejoue">'));
  const form = ligne.slice(0, ligne.indexOf('</form>'));
  assert.match(form, /class="vg-mode fige-change"/);
  assert.match(form, /<option value="observer" selected>/);
  assert.match(form, /<details class="plier enr" open>/);
  assert.match(form, /name="motif"[^>]* aria-invalid="true" aria-describedby="mm\d+-err"/);
  assert.match(form, /<p class="err" id="mm\d+-err">/);

  // Pages en erreur : toujours sans style ni script en ligne.
  propre(page);
});

test('réglages : recherche, gravité et mode en GET ; valeurs inconnues ignorées ; canaux sans numéro, adresse ni groupe', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  let page = (await v.get(cookie, '/reglages?q=ds15#regles')).body;
  const ids = p => [...p.matchAll(/<tr id="r-([^"]+)">/g)].map(m => m[1]);
  assert.ok(ids(page).length >= 1);
  for (const id of ids(page)) assert.match(page.slice(page.indexOf(`<tr id="r-${id}">`)).split('</tr>')[0], /DS15/i);
  assert.match(page, /value="ds15"/);
  // Le retour d'un formulaire garde les filtres.
  assert.match(trouve(page, `/reglages/regles/detecteur.exploration_lente`).champs.retour, /^\/reglages\?q=ds15#/);
  page = (await v.get(cookie, '/reglages?gravite=critique')).body;
  assert.match(page, /<option value="critique" selected>Critique<\/option>/);
  assert.ok(ids(page).length >= 1 && ids(page).length < v.engine.rules().length);
  assert.doesNotMatch(page, /grav--haute/);
  page = (await v.get(cookie, '/reglages?mode=bloquer')).body;
  assert.equal(ids(page).length, v.engine.rules().filter(r => r.mode === 'bloquer').length);
  // Inconnues : ignorées, toute la liste.
  page = (await v.get(cookie, `/reglages?gravite=${encodeURIComponent(PIEGE)}&mode=tout&q=${encodeURIComponent(PIEGE)}`)).body;
  propre(page);
  assert.doesNotMatch(page, /<img src=x/);
  assert.match(page, /value="&lt;img src=x onerror=alert\(1\)&gt;"/);
  assert.match(page, /Aucune de ces règles ne correspond aux filtres\./);

  // Canaux : réglés, un indice court ; jamais le numéro, une adresse e-mail ni l'identifiant du groupe.
  page = (await v.get(cookie, '/reglages')).body;
  for (const secret of ['+33612345678', '33612345678', 'SECRETGROUPID', 'alice@exemple.org', 'bob@exemple.org', 'vigie@exemple.org', '127.0.0.1:9']) assert.ok(!page.includes(secret), secret);
  assert.match(page, /numéro finissant par …78/);
  assert.match(page, /2 adresses/);
  assert.equal((page.match(/<span class="etat etat--abouti">[\s\S]*?Réglé<\/span>/g) || []).length, 2);
  // Un Lecteur ne voit pas l'indice ; sans canal réglé : « Non réglé », pas de bouton d'essai.
  const lect = await v.compte('sub-camille', 'viewer');
  assert.doesNotMatch((await v.get(lect, '/reglages')).body, /finissant par/);
  const w = setup(t);
  const c2 = (await w.login()).cookie;
  const p2 = (await w.app.inject({ url: '/reglages', headers: w.h(), cookies: { '__Host-vigie': c2 } })).body;
  assert.equal((p2.match(/Non réglé<\/span>/g) || []).length, 2);
  assert.ok(!formulaires(p2).some(f => f.action.includes('/essai')));
});

test('réglages : geste qui réduit la surveillance après 5 minutes : identité redemandée, retour vers la carte', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  assert.match((await v.get(cookie, '/reglages')).body, /Identité confirmée à \d\d\sh\s\d\d, valable jusqu’à \d\d\sh\s\d\d/);
  v.clock.t += 6 * 60e3;
  const page = (await v.get(cookie, '/reglages')).body;
  assert.match(page, /redemandée au prochain geste sensible/);
  assert.match(page, /Zitadel vous redemandera votre identité/);
  const f = trouve(page, '/interrupteurs/detection', 'inter-detection');
  const r = await v.send(cookie, f, corps(f, { motif: 'essai' }, f.boutons[0]));
  assert.equal(r.statusCode, 401);
  assert.match(r.body, /value="\/reglages#inter-detection"/);
  assert.equal(v.switches.isOn('detection'), true);
});

test('vue d’ensemble : « Arrêter… » vers la carte des réglages, « Remettre en marche maintenant » ; lecture seule sans le droit', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  let page = (await v.get(cookie, '/')).body;
  propre(page);
  assert.match(page, /<a class="btn ghost" href="\/reglages\?arreter=detection#inter-detection">Arrêter…<span class="sr-only"> la détection<\/span><\/a>/);
  // La carte ciblée s'ouvre sur les réglages.
  assert.match((await v.get(cookie, '/reglages?arreter=alertes')).body, /<li class="vg-inter" id="inter-alertes">[\s\S]*?<details class="plier" open>/);
  v.switches.set('blocages', 'arret', { duree: '1h', par: 'console · Julien', motif: 'essai de la bordure' });
  page = (await v.get(cookie, '/')).body;
  const f = trouve(page, '/interrupteurs/blocages', 've-inter-blocages');
  assert.equal(f.champs.etat, 'marche');
  assert.equal(f.champs.retour, '/');
  const r = await v.send(cookie, f, corps(f));
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, '/');
  assert.equal(v.switches.isOn('blocages'), true);
  assert.match((await v.get(cookie, '/')).body, /Interrupteur « blocages » remis en marche\./);
  // Le contenu rafraîchi porte le jeton de la session : le même formulaire, jamais sans jeton.
  v.switches.set('blocages', 'arret', { duree: '1h', par: 'console · Julien', motif: 'essai' });
  const frag = (await v.app.inject({ url: '/', headers: { ...v.h(), 'x-vigie-rafraichir': '1' }, cookies: { '__Host-vigie': cookie } })).body;
  const fr = formulaires(frag).filter(x => x.action.startsWith('/interrupteurs/'));
  assert.ok(fr.length);
  assert.ok(fr.every(x => x.champs._csrf === v.sessionOf(cookie).csrf));
  // Intervenant et Lecteur : lecture seule.
  for (const c of [await v.compte('sub-julien', 'handler'), await v.compte('sub-camille', 'viewer')]) {
    page = (await v.get(c, '/')).body;
    propre(page);
    assert.ok(!formulaires(page).some(x => x.action.startsWith('/interrupteurs/')));
    assert.doesNotMatch(page, /Arrêter…/);
    assert.equal((page.match(/<p class="lecture">Lecture seule\.<\/p>/g) || []).length, 3);
  }
});

test('santé : vérifier la chaîne et recopier la bordure (Analyste), accepter la référence (Administrateur) ; rien de mort', async t => {
  let pousse = 0;
  const v = env(t, { verifyChain: async () => ({ ok: true, lignes: 42, ruptures: [] }), edge: { push: async () => { pousse += 1; } }, siteBackupDir: '/nexiste/pas' });
  v.store.setting.set('bordure_kv', { version: 3, at: v.clock.t });
  const { cookie } = await v.login();
  let page = (await v.get(cookie, '/sante')).body;
  propre(page);
  let f = trouve(page, '/sante/verifier', 'sante-verifier');
  let r = await v.send(cookie, f, corps(f));
  assert.equal(r.headers.location, '/sante#chaine');
  assert.equal(v.message(cookie).texte, 'Chaîne intacte (42 lignes).');
  page = (await v.get(cookie, '/sante')).body;
  assert.match(page, /Chaîne intacte \(42 lignes\)\./);
  f = trouve(page, '/sante/bordure/copier', 'sante-bordure');
  await v.send(cookie, f, corps(f));
  assert.equal(pousse, 1);
  // Accepter : dépliant, motif obligatoire (refusé près du champ, le dépliant rouvert), puis accepté.
  page = (await v.get(cookie, '/sante')).body;
  f = trouve(page, '/sante/controle/accepter', 'sante-accepter');
  assert.match(page, /<details class="plier"><summary>[\s\S]*?Accepter comme référence…<\/summary>/);
  await v.send(cookie, f, corps(f, { motif: '' }));
  assert.match(v.message(cookie).texte, /motif obligatoire/);
  page = (await v.get(cookie, '/sante')).body;
  propre(page);
  assert.match(page, /<details class="plier" open>/);
  assert.match(page, /<input id="motif-acc" name="motif"[^>]* aria-invalid="true" aria-describedby="motif-acc-err">/);
  assert.match(page, /<p class="err" id="motif-acc-err">[\s\S]*?motif obligatoire/);
  f = trouve(page, '/sante/controle/accepter', 'sante-accepter');
  await v.send(cookie, f, corps(f, { motif: 'nouvel administrateur' }));
  // Sauvegardes absentes : la référence n'est pas remplacée (audit D3-B6), le formulaire a bien été reçu.
  assert.equal(v.message(cookie).k, 'erreur');
  assert.match(v.message(cookie).texte, /aucune sauvegarde du site lisible/);
  // Une alerte du contrôle des rôles ouverte : pas de formulaire, la raison à sa place.
  const id = Number(v.db.prepare("INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere) VALUES ('sigma.controle_roles', 'DS8', 'vigie', 'x', 'critique', 'alerter', 'ouverte', ?, ?)").run(v.clock.t, v.clock.t).lastInsertRowid);
  page = (await v.get(cookie, '/sante')).body;
  assert.ok(!formulaires(page).some(x => x.action === '/sante/controle/accepter'));
  assert.match(page, new RegExp(`impossible tant que l’alerte #${id} est ouverte`));

  // Analyste : vérifier et recopier, pas accepter. Intervenant et Lecteur : aucun bouton.
  const ana = await v.compte('sub-ana', 'analyst');
  page = (await v.get(ana, '/sante')).body;
  assert.deepEqual(formulaires(page).map(x => x.action).filter(a => a !== '/auth/logout'), ['/sante/verifier', '/sante/bordure/copier']);
  for (const c of [await v.compte('sub-julien', 'handler'), await v.compte('sub-camille', 'viewer')]) {
    page = (await v.get(c, '/sante')).body;
    propre(page);
    assert.deepEqual(formulaires(page).map(x => x.action), ['/auth/logout']);
  }
  // Sans vérification ni bordure branchées : pas de bouton.
  const w = setup(t);
  const c2 = (await w.login()).cookie;
  const p2 = (await w.app.inject({ url: '/sante', headers: w.h(), cookies: { '__Host-vigie': c2 } })).body;
  assert.deepEqual(formulaires(p2).map(x => x.action), ['/auth/logout']);
});
