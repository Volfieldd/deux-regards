import { test } from 'node:test';
import assert from 'node:assert/strict';
import { environnement, PIEGE } from './console-dossiers.js';
import { fiche } from '../vigie/console/ecrans/dossiers.js';
import { groupesFrise, frise, graphe, matrice } from '../vigie/console/dossiers-dessins.js';
import { DESSIN_MAX } from '../vigie/console/ecrans/dossier-dessins.js';

const vue = (v, id, query = {}, role = 'admin') => fiche({ db: v.db, engine: v.engine, id, query, role });
const securite = html => {
  assert.ok(!html.includes(PIEGE));
  assert.doesNotMatch(html, /<(?:style|foreignObject)\b|<script(?![^>]*src="\/static\/)|<[^>]+\s(?:style|onload|onclick)=|(?:href|src)="javascript:/i);
  assert.doesNotMatch(html, /(?:NaN|Infinity)/);
};

test('dessins : regroupement fidèle, formes et gravités distinctes, deux boîtes stables et textes échappés', () => {
  const p = (id, t, forme = 'jalon', grav = 'haut') => ({ id, t, c: 3, forme, grav, lib: PIEGE, href: '#signaux' });
  const points = [p(1, 1), p(2, 2), p(3, 3, 'preuve'), p(4, 4, 'preuve', 'bas')];
  assert.deepEqual(groupesFrise(points, t => t).map(g => g.n), [2, 1, 1]);
  for (const largeur of [760, 1120]) {
    const v = { points, t0: 0, t1: 10, suite: [3], non: [1, 2], ticks: [{ t: 0, mot: PIEGE }] };
    const svg = frise(v, largeur);
    assert.equal(svg, frise(v, largeur)); assert.match(svg, new RegExp(`viewBox="0 0 ${largeur} 424"`));
    assert.match(svg, /role="group" aria-labelledby=.*aria-describedby=/); assert.match(svg, /&lt;img/); securite(svg);
    const g = graphe({ noeuds: [{ id: 'n1', col: 1, type: 'compte', texte: PIEGE, href: '#entites', force: 'fort' }], liens: [] }, largeur);
    securite(g); assert.match(g, /&lt;img/);
    securite(matrice([{ id: 'TA0001', nom_fr: PIEGE, items: [], sans: 0 }], largeur));
  }
});

test('dessins : détecteurs dans ATT&CK, ordre de première apparition, compte unique par technique et tactique sans technique', t => {
  const v = environnement(t), id = v.dossier();
  v.signal(id, { regle: 'detecteur.exploration_lente', phase: 1, survenu_a: v.clock.t - 2e3 });
  v.signal(id, { regle: 'detecteur.premiere_apparition', nature: 'indice', survenu_a: v.clock.t - 1e3 });
  v.signal(id, { regle: 'detecteur.heure_inhabituelle', nature: 'indice' });
  const x = vue(v, id).dessins;
  assert.equal(x.cartes.length, 15);
  const rep = x.cartes.find(c => c.cle === 'reconnaissance'), acces = x.cartes.find(c => c.cle === 'initial_access');
  assert.deepEqual(rep.items.map(z => [z.id, z.ordre, z.n]), [['T1595', 1, 1]]);
  assert.deepEqual(acces.items.map(z => [z.id, z.ordre, z.n]), [['T1078', 2, 2]]);
  assert.equal(x.blocs[8].items.length, 2, 'les indices restent hors de la suite des phases');
  const engine = { rules: () => [{ id: 'essai', tags: ['attack.defense_impairment', 'attack.persistence', 'attack.t1098'] }] };
  v.signal(id, { regle: 'essai', phase: 5 });
  const y = fiche({ db: v.db, engine, id }).dessins;
  assert.equal(y.cartes.find(c => c.cle === 'defense_impairment').sans, 1);
  assert.equal(y.cartes.find(c => c.cle === 'persistence').items[0].n, 1);
});

test('dessins : zoom historique et faits repliés, indépendants de la pagination ; tous les paramètres restent dans les liens', async t => {
  const v = environnement(t), id = v.dossier();
  const ancien = v.signal(id, { regle: 'detecteur.exploration_lente', phase: 1, survenu_a: v.clock.t - 2 * 864e5 });
  for (let i = 0; i < 43; i++) v.signal(id, { regle: 'detecteur.premiere_apparition', nature: 'indice', survenu_a: v.clock.t - i * 1000 });
  v.signal(id, { regle: 'fait.sensitive_read', nature: 'fait', phase: 6 });
  const court = vue(v, id), long = vue(v, id, { frise: '7j', faits: 'oui' });
  assert.equal(court.dessins.points, 43); assert.equal(court.dessins.horsFenetre, 1); assert.equal(court.dessins.faits, 1);
  assert.equal(long.dessins.points, 45); assert.equal(long.signaux.length, 40);
  assert.ok(long.dessins.blocs[0].items.some(p => p.id === ancien));
  assert.match(long.suivante, /frise=7j&faits=oui&avant=/);
  const suite = vue(v, id, { frise: '7j', faits: 'oui', avant: `${v.clock.t}-999999` });
  assert.equal(suite.dessins.frise.std, long.dessins.frise.std);
  const { cookie } = await v.login(), lien = long.dessins.blocs[0].items[0].href;
  const r = await v.get(cookie, lien); assert.equal(r.statusCode, 200); assert.match(r.body, new RegExp(`id="signal-${ancien}"`));
});

test('dessins : filtre technique sur frise et tableau, sans réduire la matrice ; paramètres hostiles ignorés', async t => {
  const v = environnement(t), id = v.dossier();
  for (let i = 0; i < 43; i++) v.signal(id, { regle: 'detecteur.premiere_apparition', nature: 'indice' });
  v.signal(id, { regle: 'detecteur.exploration_lente', phase: 1 });
  const x = vue(v, id, { technique: 'T1078', frise: '1h' });
  assert.equal(x.signaux.length, 40); assert.ok(x.signaux.every(s => s.regle === 'detecteur.premiere_apparition'));
  assert.equal(x.dessins.points, 43); assert.equal(x.dessins.cartes.find(c => c.cle === 'reconnaissance').items.length, 1);
  assert.match(x.suivante, /technique=T1078/);
  const { cookie } = await v.login();
  for (const params of ['technique=T1078%27%20OR%201=1--', 'technique[]=T1078&frise[]=7j&faits=javascript:']) {
    const r = await v.get(cookie, `/dossiers/${id}?${params}`); assert.equal(r.statusCode, 200); assert.match(r.body, /Paramètres ignorés/); securite(r.body);
  }
});

test('dessins : Lectrice masquée dans les six SVG, leurs titres et liens ; seuls les liens documentés sont tracés', async t => {
  const v = environnement(t), id = v.dossier();
  v.entite(id, 'compte', 'compte-a'); v.entite(id, 'ip', '198.51.100.23', { via: 'compte:compte-a', force: 'faible' });
  v.entite(id, 'ip', '2001:db8:1:2::9', { detache_a: v.clock.t });
  v.entite(id, 'objet', PIEGE, { role: 'cible' });
  v.signal(id, { sub: 'compte-a', ip: '198.51.100.23', objet: PIEGE });
  const x = vue(v, id, {}, 'viewer');
  assert.equal((x.dessins.graphe.std.match(/class="ds-e /g) || []).length, 1);
  assert.match(x.dessins.graphe.std, /ds-e faible/);
  assert.doesNotMatch(x.dessins.graphe.std, /2001:db8/);
  v.ceilings.camille = 'viewer'; const { cookie } = await v.login({ sub: 'camille', roles: ['vigie.viewer'] });
  const r = await v.get(cookie, `/dossiers/${id}`);
  assert.equal(r.statusCode, 200); securite(r.body);
  assert.doesNotMatch(decodeURIComponent(r.body), /198\.51\.100\.23|2001:db8:1:2::9/);
  assert.match(r.body, /198\.51\.100\.0\/24/); assert.equal((r.body.match(/class="ds-svg/g) || []).length, 6);
  assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.doesNotMatch(r.headers['content-security-policy'], /unsafe-inline/);
});

test('dessins : plafonds annoncés, aucune perte dans la pagination ni mutation par GET', async t => {
  const v = environnement(t), id = v.dossier();
  v.db.transaction(() => { for (let i = 0; i <= DESSIN_MAX; i++) v.signal(id, { regle: 'detecteur.premiere_apparition', nature: 'indice', survenu_a: v.clock.t - i }); })();
  for (let i = 0; i < 41; i++) v.entite(id, 'compte', 'c-' + i);
  const x = vue(v, id); assert.equal(x.dessins.coupe, true); assert.equal(x.dessins.total, DESSIN_MAX); assert.equal(x.dessins.grapheCoupe, true);
  const { cookie } = await v.login(), avant = v.db.prepare('SELECT COUNT(*) FROM events').pluck().get();
  const r = await v.get(cookie, `/dossiers/${id}`); assert.match(r.body, /2000 derniers signaux/); assert.match(r.body, /40 premiers nœuds/);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM dossier_signaux WHERE dossier_id=?').pluck().get(id), DESSIN_MAX + 1);
  assert.equal(v.db.prepare('SELECT COUNT(*) FROM events').pluck().get(), avant);
});

test('dessins : dossier vide et voisins par acteur seulement, jamais par cible', t => {
  const v = environnement(t), a = v.dossier(), b = v.dossier(), c = v.dossier();
  const vide = vue(v, a).dessins; assert.equal(vide.frise, null); assert.equal(vide.graphe, null); assert.equal(vide.cartes.length, 15);
  v.entite(a, 'compte', 'a'); v.entite(b, 'compte', 'a'); v.entite(a, 'objet', 'personne:1', { role: 'cible' }); v.entite(c, 'objet', 'personne:1', { role: 'cible' });
  assert.deepEqual(vue(v, a).dessins.voisins.map(d => d.id), [b]);
  assert.match(vue(v, a).dessins.graphe.std, new RegExp(`href="/dossiers/${b}"`));
});

test('dessins : objets regroupés par nature sans créer de lien absent, tableau conservé', t => {
  const v = environnement(t), id = v.dossier(); v.entite(id, 'compte', 'a');
  for (let i = 0; i < 34; i++) v.entite(id, 'objet', `personne:${i}`, { role: 'cible', via: 'compte:a' });
  v.entite(id, 'objet', 'galerie:2', { role: 'cible' });
  const x = vue(v, id); assert.equal(x.entitesVue.length, 36);
  assert.match(x.dessins.graphe.std, /34 objets · personne/);
  assert.equal((x.dessins.graphe.std.match(/class="ds-e /g) || []).length, 1);
  assert.equal(x.dessins.grapheCoupe, false);
});

test('dessins : une phase et ses marqueurs restent visibles ensemble, disponibilité hors de la progression', t => {
  const v = environnement(t), id = v.dossier();
  const double = v.signal(id, { phase: 5, marqueurs: '["dissimulation"]' });
  const dispo = v.signal(id, { phase: null, marqueurs: '["disponibilite"]', nature: 'jalon' });
  const x = vue(v, id).dessins;
  assert.ok(x.blocs.find(b => b.nom === 'Ancrage').items.some(p => p.id === double));
  assert.ok(x.blocs.find(b => b.nom === 'Dissimulation').items.some(p => p.id === double));
  assert.deepEqual(x.blocs.find(b => b.nom === 'Disponibilité').items.map(p => p.id), [dispo]);
  assert.equal(x.blocs.find(b => b.nom === 'Faits').items.length, 0);
  assert.match(x.frise.std, /viewBox="0 0 760 458"/);
  assert.equal(x.points, 3, 'trois repères pour deux signaux, sans inventer une phase');
});
