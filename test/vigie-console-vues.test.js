import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { overview, compteurs } from '../vigie/console/vue-ensemble.js';
import { adresseVue, adresseDetail, dateHeure, heure, ilYa, quand, gravite, role } from '../vigie/console/format.js';

// Console de la Vigie, phase D3a : gabarits (pages hors session, vue d'ensemble, fragment, écran à venir), vue d'ensemble
// lue dans une base de la Vigie en mémoire, aides de présentation. La CSP de la console interdit tout style et tout script en
// ligne : aucun gabarit n'en produit ; tout est échappé ; un Lecteur ne voit que des adresses tronquées.

const VIEWS = fileURLToPath(new URL('../vigie/console/views/', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../vigie/console/public/', import.meta.url));
const eta = new Eta({ views: VIEWS, autoEscape: true });
const PIEGE = '<img src=x onerror=alert(1)>';
const FINE = ' ';
const NBSP = ' ';

// Contrôles communs à toute page : ni style ni gestionnaire en ligne, pas de script sans src, aucune ressource externe.
function verifierPage(html, { externesPermis = [] } = {}) {
  const balises = html.match(/<[a-zA-Z][^>]*>/g) || [];
  for (const b of balises) {
    assert.doesNotMatch(b, /\sstyle\s*=/i, `attribut style : ${b}`);
    assert.doesNotMatch(b, /\son[a-z]+\s*=/i, `gestionnaire en ligne : ${b}`);
    for (const [, attr, v] of b.matchAll(/\s(src|href|action|srcset|poster|data)\s*=\s*"([^"]*)"/gi)) {
      if (/^(https?:)?\/\//i.test(v)) assert.ok(externesPermis.includes(v), `ressource externe (${attr}) : ${v}`);
      assert.doesNotMatch(v, /^\s*javascript:/i, `lien javascript: ${v}`);
    }
  }
  for (const s of html.match(/<script\b[^>]*>/gi) || []) assert.match(s, /\ssrc="\/static\/[a-z-]+\.js(\?v=[^"]*)?"/, `script sans src local : ${s}`);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<]+<\/script>/i, 'script en ligne');
  assert.doesNotMatch(html, /<style\b/i, 'feuille en ligne');
  assert.ok(!html.includes(PIEGE), 'valeur piégée rendue telle quelle');
  assert.doesNotMatch(html, /<img\b/i, 'image injectée');
}

// ---------- Une Vigie de test, en mémoire, à 14 h 20 (heure de Paris) le sam. 17 oct. 2026 ----------
const T0 = Date.parse('2026-10-17T12:20:00Z');
const min = 60e3;

function vigie(t) {
  const db = openVigieDb(':memory:');
  t.after(() => db.close());
  const clock = { t: T0 - 3 * 3600e3 };
  const now = () => clock.t;
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const store = createStore({ db, logKey: 'cle-de-chaine-vigie-console-0123456789', now });
  const decisions = createDecisions({ store, privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  const alerte = a => Number(db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, statut, premiere, derniere, compteur, score, sources, reponse, traite_par, traite_a)
    VALUES (@regle, @cas, @entite_kind, @entite_key, @gravite, @mode, @statut, @premiere, @derniere, @compteur, @score, @sources, @reponse, @traite_par, @traite_a)`)
    .run({ cas: null, statut: 'ouverte', compteur: 1, score: null, sources: '["site"]', reponse: null, traite_par: null, traite_a: null, ...a }).lastInsertRowid);
  return { db, store, decisions, switches, engine, clock, now, alerte };
}

// Le décor de MV-01, en plus court : deux critiques sans intervenant, une haute en observation sur une adresse, une haute prise
// en charge, la surveillance réduite (blocages arrêtés), deux décisions, la santé avec un écart (contrôle des rôles).
function decor(t) {
  const v = vigie(t);
  const { alerte, decisions, switches, store, clock } = v;
  // 11 h 26 : cookie rejoué, prise en charge ; la réponse automatique (fermeture des sessions).
  clock.t = T0 - 174 * min;
  const a407 = alerte({ regle: 'sigma.cookie_rejoue', cas: 'DS1', entite_kind: 'compte', entite_key: 'zitadel-318204977', gravite: 'haut', mode: 'bloquer', statut: 'en_cours',
    premiere: clock.t, derniere: clock.t, traite_par: 'Sébastien', traite_a: clock.t + 10 * min });
  decisions.create({ kind: 'revoquer_compte', cible: 'zitadel-318204977', duree: '48h', par: 'Vigie · règle sigma.cookie_rejoue', auto: true, motif: `alerte #${a407}` });
  // 13 h 41 → 14 h 12 : score d'une adresse, en observation.
  const a409 = alerte({ regle: 'entite.score', cas: 'quorum', entite_kind: 'ip', entite_key: '198.51.100.23', gravite: 'haut', mode: 'observer',
    premiere: T0 - 39 * min, derniere: T0 - 8 * min, compteur: 37, score: 15.24, sources: '["bordure","site"]' });
  // 14 h 02 : rôle donné hors de l'application ; compte piégé (la clé d'une entité vient d'un événement : jamais interprétée).
  clock.t = T0 - 18 * min;
  const a412 = alerte({ regle: 'sigma.role_hors_application', cas: 'DS8', entite_kind: 'compte', entite_key: PIEGE, gravite: 'critique', mode: 'bloquer', premiere: clock.t, derniere: clock.t });
  decisions.create({ kind: 'geler', cible: 'zitadel-329906113', duree: '24h', par: 'Vigie · règle sigma.role_hors_application', auto: true, motif: `alerte #${a412}` });
  // 14 h 05 : contrôle des rôles, écart.
  const a413 = alerte({ regle: 'sigma.controle_roles', cas: 'DS8', entite_kind: 'site', entite_key: 'comptes', gravite: 'critique', mode: 'alerter', premiere: T0 - 15 * min, derniere: T0 - 15 * min, sources: '["vigie"]' });
  // Une alerte d'une règle inconnue au titre piégé.
  const a399 = alerte({ regle: `sigma.${PIEGE}`, entite_kind: 'ip', entite_key: '2001:db8:4:1c::5e', gravite: 'moyen', mode: 'observer', premiere: T0 - 300 * min, derniere: T0 - 200 * min, compteur: 3 });
  // 14 h 10 : blocages automatiques arrêtés 1 h par Julien ; la surveillance réduite ouvre son alerte.
  clock.t = T0 - 10 * min;
  switches.set('blocages', 'arret', { duree: '1h', par: 'Julien', motif: 'essai de la bordure' });
  const a414 = alerte({ regle: 'sigma.surveillance_reduite', cas: 'DS24', entite_kind: 'vigie', entite_key: 'blocages automatiques', gravite: 'moyen', mode: 'alerter', premiere: clock.t, derniere: clock.t, sources: '["vigie"]' });
  // Une décision à la main, d'une adresse.
  decisions.create({ kind: 'bloquer', cible: '203.0.113.7', portee: 'admin', duree: '24h', par: 'Sébastien', motif: 'scanner depuis mardi' });
  // Santé : battement du site à 14 h 19, Zitadel lu à 14 h 19, chaîne vérifiée à 03 h 10, contrôle des rôles réussi avant.
  clock.t = T0 - 1 * min;
  store.add([{ id: crypto.randomUUID(), recu_a: clock.t, survenu_a: clock.t, type: 'sys_heartbeat', severity: 'info', composant: 'site · système', canal: 'ingestion signée', confiance: 'rapporté', detail: { attente: 0 } }]);
  store.setting.set('zitadel_derniere_lecture', clock.t);
  store.setting.set('chaine_verifiee', { at: Date.parse('2026-10-17T01:10:00Z'), ok: true, lignes: 12 });
  store.setting.set('controle_roles_admins', { administrateurs: [], instantane_a: T0 - 16 * min });
  store.setting.set('controle_roles_vu', { fichier: 'x.db', at: T0 - 15 * min });
  store.setting.set('moteur_curseur', v.db.prepare('SELECT MAX(seq) FROM events').pluck().get());
  clock.t = T0;
  return { ...v, ids: { a407, a409, a412, a413, a399, a414 } };
}

const commun = (moi, extra = {}) => ({ titre: 'Vue d’ensemble', v: 'abc123', page: 'vue', moi, csrf: 'jeton-csrf', ...extra });

// ---------- Pages hors session ----------

test('pages hors session : chaque cas, sans style ni script en ligne, échappées, sans ressource externe', () => {
  const cas = {
    refusee: { qui: `camille@example.org${PIEGE}` },
    mfa: {},
    reauth: { action: `Geler le compte ${PIEGE} pendant 7 jours`, retour: '/alertes/412', csrf: 'jeton"<csrf>' },
    autre: { retour: '/alertes/412' },
    expiree: { raison: 'inactivite' },
    interdit: { raison: 'droit', requis: 'Intervenant' },
    zitadel: {},
  };
  for (const [nom, extra] of Object.entries(cas)) {
    const html = eta.render('acces', { cas: nom, titre: 'Titre', v: '1', ...extra });
    verifierPage(html);
    assert.match(html, /^<!doctype html>\n<html lang="fr">/, nom);
    assert.match(html, /<h1 class="hors-titre"/, nom);
    assert.doesNotMatch(html, /class="side"|class="tabbar"/, `${nom} : ni barre latérale ni onglets`);
    assert.ok((html.match(/class="btn"/g) || []).length <= 1, `${nom} : un bouton plein au plus`);
    assert.match(html, /<p class="hors-marque">/, `${nom} : la marque`);
  }
  const refus = eta.render('acces', { cas: 'refusee', qui: `camille@example.org${PIEGE}` });
  assert.ok(refus.includes('camille@example.org&lt;img src=x onerror=alert(1)&gt;'), 'compte échappé');
  assert.match(refus, /<a class="btn ghost" href="\/auth\/login">Se reconnecter<\/a>/, 'Se reconnecter en contour');
  assert.doesNotMatch(refus, /class="btn"/, 'aucun bouton plein sur « Connexion refusée »');
  assert.ok(refus.includes(`Cette tentative est notée par la Vigie. Ouvrez la Vigie depuis votre favori${FINE}; elle ne demande jamais`), 'pied, espace fine');

  const reauth = eta.render('acces', { cas: 'reauth', action: `Geler ${PIEGE}`, retour: '/alertes/412', csrf: 'jeton"<csrf>' });
  assert.match(reauth, /<form class="hors-actions" method="post" action="\/reauth"><input type="hidden" name="_csrf" value="jeton&quot;&lt;csrf&gt;"><input type="hidden" name="retour" value="\/alertes\/412"><button class="btn" type="submit">Confirmer avec Zitadel<\/button><a class="btn ghost" href="\/alertes\/412">Annuler<\/a><\/form>/);
  assert.ok(reauth.includes('<p class="action-rappel">Geler &lt;img src=x onerror=alert(1)&gt;</p>'));
  // Un retour qui n'est pas un chemin local devient « / » (jamais une redirection vers un autre site).
  for (const r of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)']) {
    const h = eta.render('acces', { cas: 'reauth', action: 'x', retour: r, csrf: 'c' });
    assert.match(h, /name="retour" value="\/"/, r);
    assert.match(h, /<a class="btn ghost" href="\/">Annuler<\/a>/, r);
  }
  const autre = eta.render('acces', { cas: 'autre', retour: '//evil.example' });
  assert.match(autre, /<a class="btn" href="\/">Revenir à la page<\/a>/);

  const inactif = eta.render('acces', { cas: 'expiree', raison: 'inactivite' });
  const duree = eta.render('acces', { cas: 'expiree', raison: 'duree' });
  assert.match(inactif, /15 minutes sans activité/);
  assert.match(duree, /une heure au plus/);
  assert.match(inactif, /href="\/auth\/login">Se reconnecter/);

  const droit = eta.render('acces', { cas: 'interdit', raison: 'droit', requis: `Intervenant${PIEGE}` });
  assert.ok(droit.includes('<b>Intervenant&lt;img src=x onerror=alert(1)&gt;</b>'));
  assert.match(droit, /<a class="btn" href="\/">Revenir à la vue d’ensemble<\/a>/);

  // Sans Cloudflare Access : la page la plus nue, sans marque, sans lien, sans nom.
  const nu = eta.render('acces', { cas: 'interdit', raison: 'access', titre: 'Accès refusé', v: '1' });
  verifierPage(nu);
  assert.doesNotMatch(nu, /<a\b|<form\b|hors-marque|Vigie<\/span>|Zitadel/);
  assert.match(nu, /<title>Accès refusé<\/title>/);
  assert.match(nu, /class="hors-carte nue"/);
  // Un cas inconnu ne dit rien de plus.
  assert.doesNotMatch(eta.render('acces', { cas: 'n’importe quoi' }), /<a\b|hors-marque/);

  const zko = eta.render('acces', { cas: 'zitadel' });
  assert.match(zko, /<a class="btn" href="\/auth\/login">Réessayer<\/a>/);
});

// ---------- Vue d'ensemble ----------

test('vue d’ensemble : données de la base, ordre des alertes, santé, décisions, compteurs partagés avec la barre', t => {
  const v = decor(t);
  const changes = v.db.prepare('SELECT total_changes()').pluck();
  const avant = { n: changes.get(), events: v.db.prepare('SELECT COUNT(*) FROM events').pluck().get() };
  const vue = overview({ db: v.db, engine: v.engine, switches: v.switches, now: v.now, role: 'admin' });
  const c = compteurs({ db: v.db, engine: v.engine, switches: v.switches, now: v.now });
  assert.equal(changes.get(), avant.n, 'lecture seule : aucune écriture');
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM events').pluck().get(), avant.events);

  const { a407, a409, a412, a413, a399, a414 } = v.ids;
  // Gravité, puis ouverte avant prise en charge, puis la plus récente : #413, #412, #409, #407, puis les moyennes.
  assert.deepEqual(vue.alertes.lignes.map(a => a.id), [a413, a412, a409, a407, a414, a399]);
  assert.equal(vue.alertes.total, 6);
  const { bandeau, ...nombres } = c;
  assert.deepEqual(nombres, vue.compteurs, 'la barre latérale et la vue d’ensemble ne divergent pas');
  assert.deepEqual(nombres, { alertes: 6, sante: 1, decisions: 3 });
  assert.match(bandeau.texte, /^2 alertes critiques sans intervenant/);
  assert.equal(bandeau.id, a413);

  assert.equal(vue.phrase, '2 alertes critiques et 2 hautes à traiter.');
  const [f1, f2] = vue.faits;
  assert.equal(f1.grav.classe, 'critique');
  assert.equal(f1.morceaux.map(m => m.t).join(''), `#${a413} et #${a412}, ouvertes à 14${NBSP}h${NBSP}05 et 14${NBSP}h${NBSP}02, sans intervenant.`);
  assert.equal(f2.etat.k, 'attention');
  assert.equal(f2.morceaux.map(m => m.t).join(''), `Blocages automatiques arrêtés jusqu’à 15${NBSP}h${NBSP}10 (#${a414})${FINE}: aucune règle ne bloque, ne ferme ni ne gèle d’elle-même.`);
  assert.equal(vue.principale.href, `/alertes/${a413}`);
  assert.equal(vue.principale.texte, `Ouvrir l’alerte critique #${a413}`);

  const l = Object.fromEntries(vue.alertes.lignes.map(a => [a.id, a]));
  assert.equal(l[a412].titre, 'Rôle donné, retiré ou compte changé hors de l’application', 'apostrophe typographique');
  assert.equal(l[a412].statut.sec, `réponse faite${FINE}: compte gelé 24${NBSP}h`);
  assert.equal(l[a407].statut.mot, 'Prise en charge');
  assert.equal(l[a407].statut.sec, `par Sébastien · réponse faite${FINE}: sessions du compte fermées`);
  assert.equal(l[a409].occ.n, '37');
  assert.equal(l[a409].occ.sec, `de 13${NBSP}h${NBSP}41 à 14${NBSP}h${NBSP}12`);
  assert.equal(l[a409].statut.sec, 'score 15,2');
  assert.equal(l[a409].entite.texte, '198.51.100.23');
  assert.equal(l[a409].entite.tronquee, false);
  assert.deepEqual(l[a409].sources.map(s => s.mot), ['bordure Cloudflare', 'site']);
  assert.equal(l[a413].mode.sec, 'message à l’ouverture');
  assert.equal(l[a409].mode.mot, 'Observer');
  assert.equal(l[a413].cas, 'cas DS8');
  assert.equal(l[a409].cas, 'score');

  const blocages = vue.interrupteurs.find(s => s.nom === 'blocages');
  assert.equal(blocages.marche, false);
  assert.equal(blocages.etat.mot, `Arrêt jusqu’à 15${NBSP}h${NBSP}10`);
  assert.equal(blocages.morceaux.map(m => m.t).join(''), `Aucune règle n’agit d’elle-même. Arrêté par Julien à 14${NBSP}h${NBSP}10 pour 1${NBSP}h${FINE}: «${FINE}essai de la bordure${FINE}»${FINE}; alerte #${a414} envoyée.`);

  assert.equal(vue.decisions.total, 3);
  const bloc = vue.decisions.lignes.find(d => d.type === 'Bloquer une adresse');
  assert.equal(bloc.cible.texte, '203.0.113.7');
  assert.equal(bloc.sec.map(m => m.t).join(''), `L’admin et la connexion · jusqu’au dim.${NBSP}18${NBSP}oct., 14${NBSP}h${NBSP}10 · par Sébastien${FINE}: «${FINE}scanner depuis mardi${FINE}»`);

  const sante = vue.sante.lignes.map(x => [x.k, x.morceaux.map(m => m.t).join('')]);
  assert.deepEqual(sante, [
    ['ok', `Site${FINE}: battement à 14${NBSP}h${NBSP}19, 0 en attente`],
    ['ok', `Zitadel lu à 14${NBSP}h${NBSP}19`],
    ['ok', `Chaîne intacte, vérifiée à 03${NBSP}h${NBSP}10`],
    ['att-s', `Contrôle des rôles${FINE}: sauvegarde contrôlée à 14${NBSP}h${NBSP}05${FINE}: écart (#${a413})`],
    ['ok', `Analyse${FINE}: aucun retard`],
  ]);
  assert.equal(vue.septJours.length, 3);
  assert.equal(vue.septJours[1].valeur, '1', 'une adresse bloquée sur 7 jours');
});

test('vue d’ensemble rendue : page en session, barre latérale, échappement, adresse tronquée pour un Lecteur', t => {
  const v = decor(t);
  const args = { db: v.db, engine: v.engine, switches: v.switches, now: v.now };
  const vueAdmin = overview({ ...args, role: 'admin' });
  const admin = eta.render('vue-ensemble', commun({ nom: `Sébastien${PIEGE}`, role: 'admin', sub: 'zitadel-1' }, { compteurs: vueAdmin.compteurs, vue: vueAdmin, fragment: false }));
  verifierPage(admin);
  assert.match(admin, /^<!doctype html>\n<html lang="fr">/);
  assert.match(admin, /<body class="admin vigie">/);
  assert.match(admin, /<link rel="stylesheet" href="\/static\/vigie\.css\?v=abc123">/);
  assert.match(admin, /<script src="\/static\/theme\.js\?v=abc123"><\/script>/);
  assert.match(admin, /<script src="\/static\/console\.js\?v=abc123" defer><\/script>/);
  assert.match(admin, /<main class="main" id="contenu" tabindex="-1" data-rafraichir="60">/);
  assert.match(admin, /<a href="\/" aria-current="page">/);
  assert.equal((admin.match(/aria-current="page"/g) || []).length, 2, 'barre latérale et barre d’onglets');
  assert.ok(admin.includes('<span class="me-nom">Sébastien&lt;img src=x onerror=alert(1)&gt;</span><small>Administrateur</small>'));
  assert.ok(admin.includes('<form method="post" action="/auth/logout"><input type="hidden" name="_csrf" value="jeton-csrf">'));
  assert.match(admin, /Alertes<span class="nav-badge"><span aria-hidden="true">6<\/span><span class="sr-only">, 6 ouvertes<\/span><\/span><\/a>/);
  assert.match(admin, /Santé<span class="nav-badge attention"><span aria-hidden="true">▲ 1<\/span><span class="sr-only">, 1 écart<\/span><\/span><\/a>/);
  assert.match(admin, /Décisions<span class="nav-badge neutre"><span aria-hidden="true">3<\/span><span class="sr-only">, 3 en cours<\/span><\/span><\/a>/);
  for (const href of ['/', '/alertes', '/flux', '/evenements', '/entites', '/sante', '/decisions', '/reglages', '/droits']) assert.ok(admin.includes(`<a href="${href}"`), href);
  assert.ok(admin.indexOf('href="/alertes"') < admin.indexOf('href="/flux"') && admin.indexOf('href="/flux"') < admin.indexOf('href="/evenements"'), 'Flux après Alertes');
  assert.ok(admin.includes('&lt;img src=x onerror=alert(1)&gt;'), 'clé d’entité et titre piégés, échappés');
  assert.match(admin, /<span class="ip">198\.51\.100\.23<\/span>/, 'un Administrateur voit l’adresse complète');
  assert.match(admin, /<a class="btn" href="\/alertes\/\d+">Ouvrir l’alerte critique #\d+<\/a>/);
  assert.equal((admin.match(/class="btn"/g) || []).length, 1, 'un seul bouton plein');
  assert.doesNotMatch(admin, /Lecture seule/);
  assert.doesNotMatch(admin, /Sébastien<\/span><small>|Julien<\/span><small>/, 'aucun nom de maquette codé en dur');

  // Lecteur : adresses tronquées, « (tronquée) », aucune adresse complète nulle part dans la page.
  const vueLecteur = overview({ ...args, role: 'viewer' });
  const lecteur = eta.render('vue-ensemble', commun({ nom: '', sub: 'zitadel-3205…', role: 'viewer' }, { compteurs: compteurs(args), vue: vueLecteur, fragment: false }));
  verifierPage(lecteur);
  assert.match(lecteur, /<span class="ip">198\.51\.100\.0\/24<\/span><span class="tronq">\(tronquée\)<\/span>/);
  assert.match(lecteur, /<span class="ip v6">2001:db8:4::\/48<\/span><span class="tronq">\(tronquée\)<\/span>/);
  assert.match(lecteur, /<span class="ip">203\.0\.113\.0\/24<\/span> <span class="tronq">\(tronquée\)<\/span>/, 'cible d’une décision tronquée');
  for (const complete of ['198.51.100.23', '2001:db8:4:1c::5e', '203.0.113.7']) assert.ok(!lecteur.includes(complete), `adresse complète montrée à un Lecteur : ${complete}`);
  assert.match(lecteur, /<b>Lecture seule : vous voyez, vous n’agissez pas\.<\/b>/);
  assert.equal((lecteur.match(/<p class="lecture">Lecture seule\.<\/p>/g) || []).length, 3);
  assert.ok(lecteur.includes('<span class="me-nom">zitadel-3205…</span><small>Lecteur</small>'), 'sans nom : le sub tronqué');
  assert.match(lecteur, /<span class="av" aria-hidden="true">Z<\/span>/);
});

test('fragment de rafraîchissement : le contenu seul, sans page autour', t => {
  const v = decor(t);
  const vue = overview({ db: v.db, engine: v.engine, switches: v.switches, now: v.now, role: 'handler' });
  const html = eta.render('vue-ensemble', commun({ nom: 'Julien', role: 'handler' }, { compteurs: vue.compteurs, vue, fragment: true }));
  verifierPage(html);
  assert.match(html, /^<header class="ep">/);
  assert.doesNotMatch(html, /<html|<head>|<body|<aside|class="tabbar"|<script|<link|id="contenu"/);
  assert.match(html, /<h2 class="phrase" id="t-etat">2 alertes critiques et 2 hautes à traiter\.<\/h2>/);
  assert.match(html, /<table class="liste-a vg-alertes">/);
});

test('vue d’ensemble sans alerte : une phrase, pas de tableau vide ; dernière alerte close', t => {
  const v = vigie(t);
  v.clock.t = T0;
  v.alerte({ regle: 'entite.score', cas: 'quorum', entite_kind: 'ip', entite_key: '192.0.2.77', gravite: 'moyen', mode: 'observer', statut: 'close', premiere: T0 - 2 * 3600e3,
    derniere: T0 - 3600e3, traite_par: 'Julien', traite_a: T0 - 1800e3 });
  v.db.prepare("UPDATE alerts SET classement = 'faux_positif', note = 'box redémarrée'").run();
  const vue = overview({ db: v.db, engine: v.engine, switches: v.switches, now: v.now, role: 'analyst' });
  assert.equal(vue.phrase, `Rien à traiter${FINE}: aucune alerte ouverte.`);
  assert.equal(vue.principale, null);
  assert.deepEqual(vue.faits.map(f => f.etat.mot), ['Marche', 'Close']);
  assert.match(vue.faits[1].morceaux.map(m => m.t).join(''), /^Dernière alerte : #1, classée Faux positif par Julien à 13 h 50 \(« box redémarrée »\)\.$/);
  const html = eta.render('vue-ensemble', commun({ nom: 'Camille', role: 'analyst' }, { compteurs: vue.compteurs, vue, fragment: true }));
  verifierPage(html);
  assert.doesNotMatch(html, /<table|Alertes ouvertes/);
  assert.match(html, /<a class="lien-a" href="\/alertes\?statut=toutes">Toutes les alertes, closes comprises<\/a>/);
  assert.match(html, /<p class="aussi">Aucune décision en cours · santé : \d|<p class="aussi">Aucune décision en cours · santé : tout répond\.<\/p>|<p class="aussi">Aucune décision en cours · <a href="\/sante">/);
  assert.match(html, /<p class="vg-compte">Aucune décision en cours\.<\/p>/);
});

test('écran à venir : page en session sobre, lien actif', () => {
  const html = eta.render('a-venir', { titre: 'Alertes', v: '1', page: 'alertes', moi: { nom: 'Julien', role: 'analyst' }, compteurs: { alertes: 0, sante: 0, decisions: 0 }, csrf: 'c' });
  verifierPage(html);
  assert.match(html, /<title>Alertes · Vigie · Nicephos<\/title>/);
  assert.match(html, /<h1>Alertes<\/h1>/);
  assert.match(html, /Cet écran arrive bientôt\./);
  assert.match(html, /<a href="\/alertes" aria-current="page">/);
  assert.doesNotMatch(html, /data-rafraichir/, 'pas de rafraîchissement hors de la vue d’ensemble');
  assert.doesNotMatch(html, /nav-badge/, 'compteurs à zéro : pas de pastille');
  assert.match(html, /<small>Analyste<\/small>/);
});

// ---------- Feuilles, polices et scripts publics ----------

test('fichiers publics : rien des maquettes, polices locales, scripts sans eval ni innerHTML', () => {
  const css = ['admin.css', 'tokens.css', 'admin-plus.css', 'vigie.css'].map(f => fs.readFileSync(PUBLIC + f, 'utf8')).join('\n');
  assert.doesNotMatch(css, /\.mq-|ecran-a|sans-annotations|annotations\.css/);
  const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map(m => m[1].replace(/['"]/g, ''));
  assert.ok(urls.length >= 6);
  for (const u of urls) {
    assert.match(u, /^\/static\/fonts\/[a-z0-9-]+\.woff2$/, u);
    assert.ok(fs.existsSync(PUBLIC + u.slice(8)), `police absente : ${u}`);
  }
  assert.doesNotMatch(css, /@import|https?:/);
  for (const f of ['console.js', 'theme.js']) {
    const js = fs.readFileSync(PUBLIC + f, 'utf8');
    assert.doesNotMatch(js, /\beval\b|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write/, f);
  }
  const js = fs.readFileSync(PUBLIC + 'console.js', 'utf8');
  assert.match(js, /'x-vigie-rafraichir': '1'/);
  assert.match(js, /credentials: 'same-origin'/);
  assert.match(js, /redirect: 'manual'/);
});

// ---------- Aides de présentation ----------

test('format : heure de Paris (été et hiver), dates abrégées, il y a, rôles, gravités', () => {
  assert.equal(dateHeure(Date.parse('2026-10-16T16:25:00Z')), `ven.${NBSP}16${NBSP}oct., 18${NBSP}h${NBSP}25`);
  assert.equal(heure(Date.parse('2026-10-17T09:26:00Z')), `11${NBSP}h${NBSP}26`);
  assert.equal(dateHeure(Date.parse('2026-10-25T12:00:00Z')), `dim.${NBSP}25${NBSP}oct., 13${NBSP}h${NBSP}00`, 'heure d’hiver après le 25 oct., 3 h');
  assert.equal(dateHeure(Date.parse('2026-03-29T00:30:00Z')), `dim.${NBSP}29${NBSP}mars, 01${NBSP}h${NBSP}30`);
  assert.equal(dateHeure(Date.parse('2026-03-29T01:30:00Z')), `dim.${NBSP}29${NBSP}mars, 03${NBSP}h${NBSP}30`, 'heure d’été');
  assert.equal(dateHeure(Date.parse('2026-08-15T10:00:00Z')), `sam.${NBSP}15${NBSP}août, 12${NBSP}h${NBSP}00`);
  assert.equal(dateHeure(Date.parse('2026-12-31T23:30:00Z')), `ven.${NBSP}1${NBSP}janv., 00${NBSP}h${NBSP}30`, 'le jour de Paris, pas celui du serveur');
  assert.equal(quand(T0 - 15 * min, T0), `14${NBSP}h${NBSP}05`);
  assert.equal(quand(T0 - 864e5, T0), `ven.${NBSP}16${NBSP}oct., 14${NBSP}h${NBSP}20`);
  assert.equal(ilYa(T0 - 3 * min, T0), `il y a 3${NBSP}min`);
  assert.equal(ilYa(T0 - 30e3, T0), 'à l’instant');
  assert.equal(ilYa(T0 - 3 * 864e5, T0), `il y a 3${NBSP}jours`);
  assert.equal(role('handler'), 'Intervenant');
  assert.equal(role('viewer'), 'Lecteur');
  assert.equal(role('analyst'), 'Analyste');
  assert.equal(role('admin'), 'Administrateur');
  assert.deepEqual([gravite('critique').mot, gravite('haut').mot, gravite('moyen').mot, gravite('bas').mot], ['Critique', 'Haute', 'Moyenne', 'Basse']);
});

test('format : adresse vue par un Lecteur (/24, /48), complète pour les autres rôles', () => {
  assert.equal(adresseVue('198.51.100.23', 'viewer'), '198.51.100.0/24');
  assert.equal(adresseVue('2001:db8:4:1c::5e', 'viewer'), '2001:db8:4::/48');
  assert.equal(adresseVue('2001:db8::5', 'viewer'), '2001:db8::/48');
  assert.equal(adresseVue('::ffff:192.0.2.1', 'viewer'), '192.0.2.0/24');
  assert.equal(adresseVue('203.0.113.0/24', 'viewer'), '203.0.113.0/24');
  assert.equal(adresseVue('198.51.100.23/32', 'viewer'), '198.51.100.0/24');
  assert.equal(adresseVue('pas une adresse', 'viewer'), 'masquée');
  assert.deepEqual(adresseDetail('198.51.100.23', 'viewer'), { texte: '198.51.100.0/24', tronquee: true, v6: false });
  for (const r of ['handler', 'analyst', 'admin']) assert.equal(adresseVue('198.51.100.23', r), '198.51.100.23');
  assert.equal(adresseVue('198.51.100.23', undefined), '198.51.100.0/24', 'rôle inconnu : traité en Lecteur');
});
