import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { setup } from './console-env.js';
import { setTrust } from '../vigie/reglages.js';
import { parseTarget } from '../vigie/decisions.js';
import { netOf, sansContacts } from '../vigie/util.js';
import { truncateIp } from '../server/ip.js';
import { cleReseau, formesReseau, reseau, reseauDe } from '../server/securite/adresses-ip.js';
import { adresseDetail, masquer, reseauVue } from '../vigie/console/format.js';
import { canoniserReseaux } from '../vigie/reseaux.js';

// Audit de la phase D3 (docs/revue-vigie-phase-d3-2026-10-18.md, « Lecteur : adresses complètes visibles ») : un Lecteur ne
// voit jamais une adresse complète, sur aucune page de la console (D3-C1 à D3-C5) ; un Administrateur la voit toujours.

// ---------------------------------------------------------------------------------------------------------------------
// Calculs

test('réseau d’une adresse : un seul calcul (site, Vigie, console), IPv6 abrégée comprise (D3-C4, D3-D5)', () => {
  for (const [ip, net] of [['2a01::bad:5', '2a01::'], ['2606:4700::1a', '2606:4700::'], ['2001:db8:4:1c::5e', '2001:db8:4::'], ['2001:DB8:0:0::7', '2001:db8::'],
    ['::1', '::'], ['::ffff:192.0.2.7', '192.0.2.0'], ['198.51.100.23', '198.51.100.0'], ['64:ff9b::192.0.2.1', '64:ff9b::'], ['fe80::1%eth0', 'fe80::']]) {
    assert.equal(truncateIp(ip), net, `site : ${ip}`);
    assert.equal(netOf(ip), net, `Vigie : ${ip}`);
    assert.equal(reseau(ip), net, ip);
  }
  assert.equal(truncateIp('pas une adresse'), '');
  assert.equal(netOf('pas une adresse'), null);
  // Anciennes clés fausses relues sous leur forme canonique, jamais l'hôte.
  for (const [cle, net] of [['2a01::bad::', '2a01::'], ['2a01::bad:5::', '2a01::'], ['2606:4700:::', '2606:4700::'], ['2606:4700:0::', '2606:4700::'], ['::1::', '::'], ['198.51.100.0', '198.51.100.0']]) {
    assert.equal(cleReseau(cle), net, cle);
  }
  assert.deepEqual(formesReseau('2606:4700::'), { exactes: ['2606:4700::', '2606:4700:0::', '2606:4700:::'], debut: null });
  assert.equal(formesReseau('2a01::').debut, '2a01::');
  assert.equal(reseauDe('198.51.100.7', 8), '198.0.0.0');
  assert.equal(reseauDe('2001:db8:4:1c::5e', 32), '2001:db8::');
});

test('adresses d’un texte : masquer, une seule fonction, selon le rôle (D3-C1, D3-C2)', () => {
  const cas = [
    ['198.51.100.7/24', '198.51.100.0/24'], ['bloquer 198.51.100.7/8 vite', 'bloquer 198.0.0.0/8 vite'], ['198.51.100.9/0', '0.0.0.0/0'], ['198.51.100.7/16', '198.51.0.0/16'],
    ['attaquant 192.0.2.63', 'attaquant 192.0.2.0/24'], ['999.198.51.100.8', 'masquée'], ['confiance:198.51.100.44', 'confiance:198.51.100.0/24'],
    ['confiance:2001:db8:4:1c::5e', 'confiance:2001:db8:4::/48'], ['2a01::bad:5', '2a01::/48'], ['2a01::bad::', '2a01::/48'], ['2606:4700:::', '2606:4700::/48'],
    ['2001:db8:4:1c::5e/32', '2001:db8::/32'], ['2001:db8:4:1c::5e/64', '2001:db8:4::/48'], ['(::ffff:192.0.2.7)', '(192.0.2.0/24)'], ['[2001:db8::7]:443', '[2001:db8::/48]:443'],
    ['à 14:02:33, MAC aa:bb:cc:dd:ee:ff', 'à 14:02:33, MAC aa:bb:cc:dd:ee:ff'],
  ];
  for (const [brut, vu] of cas) {
    assert.equal(masquer(brut, 'viewer'), vu, brut);
    assert.equal(masquer(brut, undefined), vu, `rôle inconnu : ${brut}`);
    assert.equal(masquer(brut, 'admin'), brut);
    assert.equal(masquer(brut, 'handler'), brut);
  }
  assert.deepEqual(adresseDetail('198.51.100.7/24', 'viewer'), { texte: '198.51.100.0/24', tronquee: true, v6: false });
  assert.deepEqual(adresseDetail('203.0.113.0/24', 'viewer'), { texte: '203.0.113.0/24', tronquee: false, v6: false });
  assert.equal(adresseDetail('198.51.100.7/24', 'analyst').texte, '198.51.100.7/24');
  assert.equal(reseauVue('2a01::bad::'), '2a01::/48');
  assert.equal(reseauVue('2606:4700:::'), '2606:4700::/48');
  // Erreur d'un canal : ni adresse e-mail, ni numéro, ni groupe Signal (D3-C5).
  assert.equal(sansContacts('550 5.1.1 <seb.prive@exemple.org>: rejected, +33 6 12 34 56 78, group.QWxsbw=='), '550 5.1.1 <•••@•••>: rejected, •••, group.•••');
});

test('blocage d’un réseau : le réseau est gardé, jamais l’adresse écrite avec lui (D3-C1)', () => {
  assert.equal(parseTarget('198.51.100.7/24').cible, '198.51.100.0/24');
  assert.equal(parseTarget('198.51.100.7/24').address, '198.51.100.0');
  assert.equal(parseTarget('198.51.100.7').cible, '198.51.100.7/32');
  assert.equal(parseTarget('2001:DB8:4:1c::5e/48').cible, '2001:db8:4::/48');
  assert.equal(parseTarget('2001:db8:4:1c::5e').cible, '2001:db8:4:1c::5e/128');
  assert.equal(parseTarget('203.0.113.0/24').size, 256);
});

// ---------------------------------------------------------------------------------------------------------------------
// Pages de la console

// Ce qu'un Lecteur ne doit lire nulle part (adresses entières, hôte d'un réseau, contacts d'un canal).
const SECRETS = ['198.51.100.77', '198.51.100.155', '203.0.113.201', '198.18.44.55', '2001:db8:cafe', '2001:db8:aaaa', '192.0.2.61', '192.0.2.62', '192.0.2.63',
  '192.0.2.64', '192.0.2.55', '192.0.2.57', '198.51.100.44', '198.51.100.45', '2001:db8:4:1c', '2a01::bad', 'bad:5', '198.51.100.8', '198.51.100.9/', '198.51.100.23',
  '203.0.113.21', 'seb.prive@exemple.org', '+33 6 12 34 56 78', '2606:4700::1a', '2606:4700:::'];

function fuites(body) {
  const b = body.replace(/&#x2F;|&#47;/g, '/').replace(/&#x3A;|&#58;/g, ':');
  return SECRETS.filter(s => b.includes(s) || b.includes(encodeURIComponent(s)) || b.toLowerCase().includes(encodeURIComponent(s).toLowerCase()))
    .map(s => { const i = b.indexOf(s); return `${s} … ${i >= 0 ? b.slice(Math.max(0, i - 80), i + 30).replace(/\s+/g, ' ') : '(encodée)'}`; });
}

function peupler(v) {
  const { db, store, engine, decisions, switches, clock } = v;
  const t = clock.t;
  const add = e => {
    const id = crypto.randomUUID();
    store.add([{ id, recu_a: clock.t, survenu_a: clock.t - 1000, canal: 'ingestion signée', confiance: 'rapporté', severity: 'haut', composant: 'site · public', ...e }]);
    return db.prepare('SELECT seq FROM events WHERE id = ?').pluck().get(id);
  };
  const seqs = [];
  // Événements : IPv6 abrégée avec l'ancienne clé fausse, adresses dans le détail et la route, suite de nombres piégée.
  seqs.push(add({ type: 'malicious_honeypot', ip: '2a01::bad:5', ip_net: '2a01::bad::', route: '/wp-login.php?from=192.0.2.55', detail: JSON.stringify({ raison: 'piège vu depuis 192.0.2.55' }) }));
  seqs.push(add({ type: 'authn_login_fail', ip: '198.51.100.23', ip_net: '198.51.100.0', detail: JSON.stringify({ note: 'voir 192.0.2.55', x: '999.198.51.100.8 et 198.51.100.9/0' }) }));
  seqs.push(add({ type: 'malicious_honeypot', ip: '2606:4700::1a', ip_net: '2606:4700:::' }));
  seqs.push(add({ type: 'malicious_honeypot', ip: '2606:4700::2b', ip_net: '2606:4700::' }));
  // Décisions : réseau écrit avec l'hôte (gardé en réseau), motif qui cite des adresses ; anciennes lignes écrites avec l'hôte.
  decisions.create({ kind: 'bloquer', cible: '198.51.100.77/24', portee: 'tout', duree: 864e5, motif: 'vu depuis 192.0.2.61 et 2a01::bad:5', par: 'console · Seb' });
  decisions.create({ kind: 'bloquer', cible: '198.18.44.55/16', portee: 'admin', duree: 864e5, motif: 'essai', par: 'console · Seb' });
  decisions.create({ kind: 'bloquer', cible: '2001:db8:aaaa:bbbb::1/32', portee: 'tout', duree: 864e5, motif: 'essai IPv6', par: 'console · Seb' });
  const ancienne = db.prepare("INSERT INTO decisions (kind, cible, portee, motif, par, cree_a, fin, auto) VALUES ('bloquer', ?, 'tout', ?, 'console · Seb', ?, ?, 0)");
  ancienne.run('203.0.113.201/24', 'ancien blocage de 192.0.2.61', t - 3 * 864e5, t - 2 * 864e5);
  ancienne.run('198.51.100.155/8', 'ancien', t - 3 * 864e5, t - 2 * 864e5);
  ancienne.run('2001:db8:cafe:1::77/32', 'ancien IPv6', t - 3 * 864e5, t - 2 * 864e5);
  // Adresses de confiance (alerte « surveillance réduite » dont la clé porte l'adresse), interrupteur et règle arrêtés.
  setTrust(store, { action: 'ajouter', ip: '198.51.100.44', duree: '24h', motif: 'box de M. Martin 198.51.100.45', par: 'console · Seb', now: () => clock.t });
  setTrust(store, { action: 'ajouter', ip: '2001:db8:4:1c::5e', duree: '24h', motif: 'm', par: 'console · Seb', now: () => clock.t });
  switches.set('blocages', 'arret', { duree: '1h', par: 'console · Seb', motif: 'faux positif sur 192.0.2.62' });
  store.setting.set('regles_modes', { ...store.setting.get('regles_modes', {}), 'detecteur.silence': { mode: 'arret', jusqua: t + 3600e3, par: 'console · Seb', motif: 'bruit de 192.0.2.64', avant: 'observer' } });
  // Alertes : classée avec une note, close, prise en charge ; historique avec notes.
  const alerte = (statut, cle) => Number(db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, sources)
    VALUES ('entite.score', 'quorum', 'ip', ?, 'haut', 'alerter', ?, ?, ?, 1, '["site","bordure"]')`).run(cle, statut, t, t).lastInsertRowid);
  const a1 = alerte('ouverte', '203.0.113.21');
  db.prepare('INSERT INTO alert_events (alert_id, seq) VALUES (?, ?)').run(a1, seqs[0]);
  engine.note(a1, 'note libre 192.0.2.57', 'console · Seb');
  engine.classify(a1, { classement: 'incident', note: 'attaquant 192.0.2.63', par: 'console · Seb' });
  const a2 = alerte('ouverte', '2a01::bad:5');
  db.prepare("INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, sources) VALUES ('detecteur.exploration_lente', 'DS15', 'reseau', '2a01::bad::', 'moyen', 'alerter', 'ouverte', ?, ?, 1, '[]')").run(t, t);
  // Erreur d'un canal de notification, écrite avant le masque (ancien événement).
  store.own('vigie_canal_echec', { emetteur: 'vigie/notifications.js', detail: { canal: 'email', erreur: "Can't send mail - 550 5.1.1 <seb.prive@exemple.org>: Recipient address rejected, +33 6 12 34 56 78" } });
  seqs.push(db.prepare("SELECT seq FROM events WHERE type = 'vigie_canal_echec'").pluck().get());
  return { seqs, alertes: db.prepare('SELECT id FROM alerts ORDER BY id').pluck().all(), a1, a2 };
}

test('Lecteur : aucune adresse complète, page par page ; l’Administrateur voit tout (D3-C1 à D3-C5)', async t => {
  const v = setup(t);
  v.ceilings['sub-lect'] = 'viewer';
  const adm = await v.login();
  const lect = await v.login({ sub: 'sub-lect', nom: 'Lou', roles: ['vigie.viewer'] });
  const get = (who, url) => v.app.inject({ url, headers: who.headers, cookies: { '__Host-vigie': who.cookie } });
  const { seqs, alertes, a1 } = peupler(v);
  // Le blocage d'un réseau écrit avec l'hôte est gardé en réseau.
  assert.deepEqual(v.db.prepare("SELECT cible FROM decisions WHERE motif LIKE 'vu depuis%' OR motif LIKE 'essai%' ORDER BY id").pluck().all(), ['198.51.100.0/24', '198.18.0.0/16', '2001:db8::/32']);

  const pages = ['/', '/alertes', '/alertes?statut=toutes', ...alertes.map(id => `/alertes/${id}`), '/evenements', '/evenements?periode=tout&type=tout',
    ...seqs.map(s => `/evenements/${s}`), '/entites', '/entites/reseau/2a01%3A%3A', '/entites/reseau/2606%3A4700%3A%3A', '/entites/reseau/198.51.100.0',
    '/decisions', '/decisions?toutes=1', '/reglages', '/sante', '/flux', '/flux?periode=30j', '/droits'];
  // La fiche d'une entité « vigie » dont la clé porte une adresse : son titre tronqué (l'adresse de la page, tapée par le
  // Lecteur lui-même, n'est pas relue).
  const fv = await get(lect, `/entites/vigie/${encodeURIComponent('confiance:198.51.100.44')}`);
  assert.equal(fv.statusCode, 200);
  assert.match(fv.body, /confiance:198\.51\.100\.0\/24/);
  assert.ok(!fv.body.replace(/\/entites\/vigie\/confiance%3A198\.51\.100\.44/g, '').includes('198.51.100.44'), 'fiche vigie : clé tronquée');
  for (const p of pages) {
    const r = await get(lect, p);
    assert.equal(r.statusCode, 200, `Lecteur ${p} : ${r.statusCode} ${r.headers.location || ''}`);
    assert.deepEqual(fuites(r.body), [], `Lecteur ${p}`);
  }
  // Une ancienne clé de réseau fausse dans l'adresse d'une page : la fiche du réseau canonique (tous les rôles).
  for (const who of [lect, adm]) {
    const r = await get(who, `/entites/reseau/${encodeURIComponent('2a01::bad::')}`);
    assert.equal(r.statusCode, 302);
    assert.equal(r.headers.location, `/entites/reseau/${encodeURIComponent('2a01::')}`);
  }
  // Une adresse entière dans l'adresse du journal : ramenée au réseau pour un Lecteur.
  const rj = await get(lect, `/evenements?periode=tout&adresse=${encodeURIComponent('2a01::bad:5')}`);
  assert.equal(rj.statusCode, 302);
  assert.match(rj.headers.location, /adresse=2a01%3A%3A%2F48/);

  // L'Administrateur lit les adresses entières.
  const voit = async (p, ...attendus) => { const b = (await get(adm, p)).body; for (const s of attendus) assert.ok(b.includes(s), `Administrateur ${p} : ${s}`); };
  await voit(`/alertes/${a1}`, '203.0.113.21', '192.0.2.63', '192.0.2.57');
  await voit('/', '192.0.2.62', '192.0.2.61', '198.51.100.0/24');
  await voit('/decisions?toutes=1', '203.0.113.201/24', '198.51.100.155/8', '2001:db8:cafe:1::77/32', '192.0.2.61');
  await voit('/reglages', '198.51.100.44', '198.51.100.45', '192.0.2.64', '192.0.2.62');
  await voit(`/evenements/${seqs[0]}`, '2a01::bad:5', '192.0.2.55');
  await voit(`/evenements/${seqs[1]}`, '198.51.100.23', '999.198.51.100.8', '198.51.100.9/0');
  await voit('/alertes', 'confiance:198.51.100.44', 'confiance:2001:db8:4:1c::5e');
  // Les contacts d'un canal ne sont lus par personne.
  for (const p of ['/sante', '/reglages', `/evenements/${seqs.at(-1)}`]) {
    const b = (await get(adm, p)).body;
    assert.ok(!b.includes('seb.prive@exemple.org') && !b.includes('+33 6 12 34 56 78'), `Administrateur ${p} : contacts du canal`);
  }
});

test('réseau IPv6 : le filtre et la fiche trouvent l’ancienne et la nouvelle écriture du journal (D3-C4)', async t => {
  const v = setup(t);
  const adm = await v.login();
  const get = url => v.app.inject({ url, headers: adm.headers, cookies: { '__Host-vigie': adm.cookie } });
  const add = e => {
    const id = crypto.randomUUID();
    v.store.add([{ id, recu_a: v.clock.t, survenu_a: v.clock.t, canal: 'ingestion signée', confiance: 'rapporté', severity: 'haut', composant: 'site · public', type: 'malicious_honeypot', ...e }]);
    return v.db.prepare('SELECT seq FROM events WHERE id = ?').pluck().get(id);
  };
  const ancienne = add({ ip: '2606:4700::1a', ip_net: '2606:4700:::' });
  const nouvelle = add({ ip: '2606:4700::2b', ip_net: '2606:4700::' });
  const debut = add({ ip: '2a01::bad:5', ip_net: '2a01::bad::' });
  const debut2 = add({ ip: '2a01::7', ip_net: '2a01::' });
  const autre = add({ ip: '2a01:0:1::7', ip_net: '2a01:0:1::' });
  const liens = body => [...body.matchAll(/href="\/evenements\/(\d+)"/g)].map(m => Number(m[1]));
  let l = liens((await get(`/evenements?periode=tout&type=tout&adresse=${encodeURIComponent('2606:4700::/48')}`)).body);
  assert.ok(l.includes(ancienne) && l.includes(nouvelle), `journal 2606:4700::/48 : ${l}`);
  l = liens((await get(`/evenements?periode=tout&type=tout&adresse=${encodeURIComponent('2a01::/48')}`)).body);
  assert.ok(l.includes(debut) && l.includes(debut2) && !l.includes(autre), `journal 2a01::/48 : ${l}`);
  l = liens((await get(`/entites/reseau/${encodeURIComponent('2606:4700::')}`)).body);
  assert.ok(l.includes(ancienne) && l.includes(nouvelle), `fiche 2606:4700:: : ${l}`);
  l = liens((await get(`/entites/reseau/${encodeURIComponent('2a01::')}`)).body);
  assert.ok(l.includes(debut) && l.includes(debut2) && !l.includes(autre), `fiche 2a01:: : ${l}`);
});

test('clés de réseau IPv6 réécrites une fois (entités, liens, alertes), jamais le journal chaîné (D3-C4)', t => {
  const v = setup(t);
  const { db, store, clock } = v;
  const t0 = clock.t;
  const ent = db.prepare('INSERT INTO entities (kind, key, score, at, contributions, signaux, premiere, derniere) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ent.run('reseau', '2606:4700:::', 4, t0, '{"site":4}', 2, t0 - 1000, t0);
  ent.run('reseau', '2606:4700::', 2, t0, '{"bordure":2}', 1, t0 - 5000, t0 - 10);
  ent.run('reseau', '2a01::bad::', 1, t0, '{"site":1}', 1, t0, t0);
  ent.run('reseau', '198.51.100.0', 1, t0, '{"site":1}', 1, t0, t0);
  const lien = db.prepare('INSERT INTO entity_links (a_kind, a_key, b_kind, b_key, derniere) VALUES (?, ?, ?, ?, ?)');
  lien.run('ip', '2a01::bad:5', 'reseau', '2a01::bad::', t0);
  lien.run('reseau', '2606:4700:::', 'compte', 'zit-1', t0 - 5);
  lien.run('reseau', '2606:4700::', 'compte', 'zit-1', t0);
  db.prepare("INSERT INTO alerts (regle, entite_kind, entite_key, gravite, mode, premiere, derniere) VALUES ('detecteur.exploration_lente', 'reseau', '2a01::bad::', 'moyen', 'alerter', ?, ?)").run(t0, t0);
  const id = crypto.randomUUID();
  store.add([{ id, recu_a: t0, survenu_a: t0, canal: 'ingestion signée', confiance: 'rapporté', severity: 'haut', composant: 'site · public', type: 'malicious_honeypot', ip: '2a01::bad:5', ip_net: '2a01::bad::' }]);

  const r = canoniserReseaux(store, { now: () => clock.t });
  assert.deepEqual(r, { entites: 1, fusions: 1, liens: 2, alertes: 1 });
  assert.equal(canoniserReseaux(store), null, 'une seule fois');
  const cles = db.prepare("SELECT key FROM entities WHERE kind = 'reseau' ORDER BY key").pluck().all();
  assert.deepEqual(cles, ['198.51.100.0', '2606:4700::', '2a01::']);
  const fusion = db.prepare("SELECT * FROM entities WHERE kind = 'reseau' AND key = '2606:4700::'").get();
  assert.equal(fusion.score, 6);
  assert.deepEqual(JSON.parse(fusion.contributions), { site: 4, bordure: 2 });
  assert.equal(fusion.signaux, 3);
  assert.equal(fusion.premiere, t0 - 5000);
  assert.equal(fusion.derniere, t0);
  assert.deepEqual(db.prepare('SELECT a_key, b_key, derniere FROM entity_links ORDER BY a_key').all(),
    [{ a_key: '2606:4700::', b_key: 'zit-1', derniere: t0 }, { a_key: '2a01::bad:5', b_key: '2a01::', derniere: t0 }]);
  assert.equal(db.prepare("SELECT entite_key FROM alerts WHERE entite_kind = 'reseau'").pluck().get(), '2a01::');
  // Le journal garde son écriture : la chaîne reste intacte.
  assert.equal(db.prepare('SELECT ip_net FROM events WHERE id = ?').pluck().get(id), '2a01::bad::');
  assert.equal(store.verify().ok, true);
});
