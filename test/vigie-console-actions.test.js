import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './console-env.js';

// Console de la Vigie, phase D3c : les actions. Chaque geste passe par le droit de l'action, le plafond relu chez
// Zitadel, la ré-authentification quand il le faut, les fonctions de la Vigie (mêmes garde-fous que la ligne de
// commande), laisse un message pour la page suivante et redirige (303) : recharger ne refait jamais le geste.

function env(t, opts) {
  const v = setup(t, opts);
  const post = async (cookie, url, body = {}) => {
    const s = v.sessionOf(cookie);
    const r = await v.app.inject({ method: 'POST', url, headers: { ...v.h(), 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin' },
      cookies: { '__Host-vigie': cookie }, payload: new URLSearchParams({ _csrf: s.csrf, ...body }).toString() });
    return r;
  };
  const message = cookie => { const m = v.sessionOf(cookie).message; return m ? JSON.parse(m) : null; };
  const get = (cookie, url) => v.app.inject({ url, headers: v.h(), cookies: { '__Host-vigie': cookie } });
  const alerte = (statut = 'ouverte') => Number(v.db.prepare("INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere) VALUES ('sigma.cookie_rejoue', 'DS2', 'compte', 'zitadel-1', 'haut', 'alerter', ?, ?, ?)").run(statut, v.clock.t, v.clock.t).lastInsertRowid);
  return { ...v, post, message, get, alerte };
}

test('alertes : prendre en charge, classer, noter ; Lecteur refusé ; message montré une fois ; jamais une alerte close reprise', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  const id = v.alerte();
  const r = await v.post(cookie, `/alertes/${id}/prendre`);
  assert.equal(r.statusCode, 303);
  assert.equal(r.headers.location, `/alertes/${id}`);
  assert.equal(v.db.prepare('SELECT statut, traite_par FROM alerts WHERE id = ?').get(id).statut, 'en_cours');
  assert.equal(v.db.prepare('SELECT traite_par FROM alerts WHERE id = ?').pluck().get(id), 'console · Sébastien');
  assert.deepEqual(v.message(cookie), { k: 'ok', texte: `Alerte #${id} prise en charge.`, action: 'alertes' });
  // Le message est montré par la page suivante, puis effacé.
  const page = await v.get(cookie, `/alertes/${id}`);
  assert.match(page.body, /Alerte #\d+ prise en charge\./);
  assert.equal(v.message(cookie), null);
  assert.doesNotMatch((await v.get(cookie, `/alertes/${id}`)).body, /prise en charge\.<\/span>/);

  await v.post(cookie, `/alertes/${id}/note`, { note: 'Vu avec Julien : <b>essai</b>' });
  const note = v.events('vigie_alerte').at(-1);
  assert.deepEqual(note.detail, { action: 'note', id, note: 'Vu avec Julien : <b>essai</b>' });
  await v.post(cookie, `/alertes/${id}/classer`, { classement: 'mauvais' });
  assert.equal(v.message(cookie).k, 'erreur');
  assert.equal(v.message(cookie).champ, 'classement');
  await v.post(cookie, `/alertes/${id}/classer`, { classement: 'faux_positif', note: 'adresse du bureau' });
  assert.deepEqual(v.db.prepare('SELECT statut, classement, note FROM alerts WHERE id = ?').get(id), { statut: 'close', classement: 'faux_positif', note: 'adresse du bureau' });
  await v.post(cookie, `/alertes/${id}/prendre`);
  assert.match(v.message(cookie).texte, /close/);
  assert.equal(v.db.prepare('SELECT statut FROM alerts WHERE id = ?').pluck().get(id), 'close');
  // Lectrice : refusé, rien de changé.
  const lect = await v.login({ sub: 'sub-camille', roles: ['vigie.viewer'] });
  const id2 = v.alerte();
  assert.equal((await v.post(lect.cookie, `/alertes/${id2}/prendre`)).statusCode, 403);
  assert.equal(v.db.prepare('SELECT statut FROM alerts WHERE id = ?').pluck().get(id2), 'ouverte');
});

test('décisions : motif obligatoire, sa propre adresse seulement confirmée, verrouillage qui admet d’office qui le décide, levée motivée', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  await v.post(cookie, '/decisions', { type: 'bloquer', cible: '203.0.113.9' });
  assert.equal(v.message(cookie).champ, 'motif');
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM decisions').pluck().get(), 0);
  const r = await v.post(cookie, '/decisions', { type: 'bloquer', cible: '203.0.113.9', portee: 'admin', duree: '2h', motif: 'balayage', alerte: '12', retour: '/entites/ip/203.0.113.9' });
  assert.equal(r.headers.location, '/entites/ip/203.0.113.9');
  const d = v.db.prepare('SELECT * FROM decisions ORDER BY id DESC').get();
  assert.deepEqual({ kind: d.kind, cible: d.cible, portee: d.portee, motif: d.motif, par: d.par, duree: d.fin - d.cree_a },
    { kind: 'bloquer', cible: '203.0.113.9/32', portee: 'admin', motif: 'alerte #12 · balayage', par: 'console · Sébastien', duree: 2 * 3600e3 });
  const ev = v.events('vigie_decision').at(-1);
  assert.equal(ev.composant, 'vigie · console');
  // Sa propre adresse (celle que donne Cloudflare) : refusé sans la case.
  await v.post(cookie, '/decisions', { type: 'bloquer', cible: '198.51.100.0/24', motif: 'essai' });
  assert.equal(v.message(cookie).champ, 'confirme');
  await v.post(cookie, '/decisions', { type: 'bloquer', cible: '198.51.100.0/24', motif: 'essai', confirme: 'oui' });
  assert.equal(v.message(cookie).k, 'ok');
  // Verrouillage : le compte et l'adresse de qui verrouille sont admis d'office.
  await v.post(cookie, '/decisions', { type: 'verrouiller', comptes: 'sub-julien', motif: 'compte admin apparu hors de l’application' });
  const lock = v.db.prepare("SELECT * FROM decisions WHERE kind = 'verrouiller'").get();
  assert.deepEqual(JSON.parse(lock.details), { comptes: ['sub-seb', 'sub-julien'], adresses: ['198.51.100.7/32'] });
  assert.equal(lock.fin - lock.cree_a, 12 * 3600e3);
  // Durée mal écrite : refusée, champ signalé, valeurs rendues au formulaire.
  await v.post(cookie, '/decisions', { type: 'geler', cible: 'zitadel-9', motif: 'x', duree_libre: 'demain' });
  const m = v.message(cookie);
  assert.equal(m.champ, 'duree_libre');
  assert.equal(m.valeurs.cible, 'zitadel-9');
  assert.equal(m.valeurs._csrf, undefined);
  // Levée, avec son motif.
  await v.post(cookie, `/decisions/${d.id}/lever`, { motif: 'adresse du bureau' });
  assert.ok(v.db.prepare('SELECT leve_a FROM decisions WHERE id = ?').pluck().get(d.id));
  assert.equal(v.events('vigie_decision').at(-1).detail.motif, 'adresse du bureau');
  await v.post(cookie, `/decisions/${d.id}/lever`, { motif: 'encore' });
  assert.match(v.message(cookie).texte, /déjà levée/);
  // Plus de 5 minutes après la connexion : ré-authentification demandée, rien n'est fait.
  v.clock.t += 6 * 60e3;
  const avant = v.db.prepare('SELECT COUNT(*) FROM decisions').pluck().get();
  const re = await v.post(cookie, '/decisions', { type: 'geler', cible: 'zitadel-9', motif: 'x', retour: '/entites/compte/zitadel-9' });
  assert.equal(re.statusCode, 401);
  assert.match(re.body, /action="\/reauth"/);
  assert.match(re.body, /value="\/entites\/compte\/zitadel-9"/);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM decisions').pluck().get(), avant);
});

test('interrupteurs, règles, seuils, adresses de confiance : réduire la surveillance demande un motif et prévient', async t => {
  const v = env(t);
  const { cookie } = await v.login();
  await v.post(cookie, '/interrupteurs/blocages', { etat: 'arret', duree: '2h' });
  assert.equal(v.message(cookie).champ, 'motif');
  await v.post(cookie, '/interrupteurs/blocages', { etat: 'arret', duree: '2h', motif: 'faux positifs en série' });
  assert.equal(v.switches.isOn('blocages'), false);
  const red = v.events('vigie_surveillance_reduite').at(-1);
  assert.equal(red.detail.objet, 'interrupteur:blocages');
  assert.equal(v.events('vigie_interrupteur').at(-1).composant, 'vigie · console');
  await v.post(cookie, '/interrupteurs/blocages', { etat: 'marche' });
  assert.equal(v.switches.isOn('blocages'), true);
  await v.post(cookie, '/interrupteurs/tout', { etat: 'arret', motif: 'x', duree: '1h' });
  assert.match(v.message(cookie).texte, /inconnu/);

  // Règle : descente sans motif refusée par le moteur, message montré tel quel.
  await v.post(cookie, '/reglages/regles/sigma.cookie_rejoue', { mode: 'observer' });
  assert.equal(v.message(cookie).k, 'erreur');
  assert.match(v.message(cookie).texte, /motif obligatoire/);
  await v.post(cookie, '/reglages/regles/sigma.cookie_rejoue', { mode: 'observer', motif: 'calibrage' });
  assert.equal(v.engine.modeOf('sigma.cookie_rejoue'), 'observer');
  await v.post(cookie, '/reglages/regles/sigma.surveillance_reduite', { mode: 'arret', duree: '1h', motif: 'x' });
  assert.match(v.message(cookie).texte, /reste en mode alerter/);
  await v.post(cookie, '/reglages/regles/sigma.inexistante', { mode: 'alerter' });
  assert.match(v.message(cookie).texte, /règle inconnue/);

  // Seuils.
  await v.post(cookie, '/reglages/seuils', { ip: '20' });
  assert.match(v.message(cookie).texte, /motif obligatoire/);
  await v.post(cookie, '/reglages/seuils', { ip: '20', compte: '0' });
  assert.equal(v.message(cookie).champ, 'compte');
  await v.post(cookie, '/reglages/seuils', { ip: '20', motif: 'trop de bruit' });
  assert.equal(v.engine.thresholds().ip, 20);

  // Adresses de confiance : durée et motif obligatoires, signalées.
  await v.post(cookie, '/reglages/confiance/ajouter', { ip: '192.0.2.10', motif: 'bureau' });
  assert.match(v.message(cookie).texte, /durée/);
  await v.post(cookie, '/reglages/confiance/ajouter', { ip: '192.0.2.10', duree: '30j', motif: 'bureau' });
  const conf = v.store.setting.get('adresses_confiance');
  assert.equal(conf[0].ip, '192.0.2.10');
  assert.equal(conf[0].jusqua - v.clock.t, 7 * 864e5, '7 jours au plus');
  assert.equal(v.events('vigie_surveillance_reduite').at(-1).detail.objet, 'confiance:192.0.2.10');
  await v.post(cookie, '/reglages/confiance/retirer', { ip: '192.0.2.10' });
  assert.deepEqual(v.store.setting.get('adresses_confiance'), []);

  // Intervenant : pas les réglages.
  v.c.rights.observe('sub-julien', 'handler');
  v.c.rights.assign({ par: 'sub-seb', parRole: 'admin', sub: 'sub-julien', role: 'handler' });
  v.ceilings['sub-julien'] = 'handler';
  const j = await v.login({ sub: 'sub-julien', roles: ['vigie.handler'] });
  const refus = await v.post(j.cookie, '/interrupteurs/alertes', { etat: 'arret', duree: '1h', motif: 'x' });
  assert.equal(refus.statusCode, 403);
  assert.match(refus.body, /Analyste/);
  assert.equal(v.switches.isOn('alertes'), true);
});

test('vérifications et administration : chaîne, canal, bordure, référence des rôles, droits ; une panne n’est jamais montrée telle quelle', async t => {
  let calls = 0;
  const v = env(t, { extra: { verifyChain: async () => { calls += 1; if (calls > 1) throw new TypeError('x is undefined'); return { ok: true, lignes: 42, ruptures: [] }; } } });
  const { cookie } = await v.login();
  await v.post(cookie, '/sante/verifier');
  assert.equal(v.message(cookie).texte, 'Chaîne intacte (42 lignes).');
  await v.post(cookie, '/sante/verifier');
  assert.equal(v.message(cookie).texte, 'L’action n’a pas pu être faite (erreur de la Vigie, notée dans son journal).');
  await v.post(cookie, '/sante/bordure/copier');
  assert.match(v.message(cookie).texte, /non réglée/);
  await v.post(cookie, '/reglages/canaux/signal/essai');
  assert.equal(v.message(cookie).k, 'erreur');
  await v.post(cookie, '/sante/controle/accepter', { motif: 'nouvel administrateur' });
  assert.match(v.message(cookie).texte, /sauvegardes du site/);

  // Droits : arrivée de Camille, attribution par l'Administrateur ; pas son propre rôle.
  await v.login({ sub: 'sub-camille', roles: ['vigie.analyst'], email: 'camille@exemple.org' });
  await v.post(cookie, '/droits/sub-camille', { attribution: 'analyst' });
  assert.equal(v.message(cookie).k, 'ok');
  assert.equal(v.c.rights.effective('sub-camille', 'analyst'), 'analyst');
  assert.equal(v.events('vigie_console_droits').at(-1).detail.apres, 'analyst');
  await v.post(cookie, '/droits/sub-seb', { attribution: 'viewer' });
  assert.match(v.message(cookie).texte, /propre rôle/);
  await v.post(cookie, '/droits/sub-camille', { attribution: 'root' });
  assert.equal(v.message(cookie).champ, 'attribution');
  // Une Analyste ne gère pas les droits.
  v.ceilings['sub-camille'] = 'analyst';
  const c = await v.login({ sub: 'sub-camille', roles: ['vigie.analyst'] });
  assert.equal((await v.post(c.cookie, '/droits/sub-camille', { attribution: 'admin' })).statusCode, 403);
});
