// Installateur (deploy/installateur) : déroulé complet contre un faux Zitadel et un faux Cloudflare, relance sans rien
// recréer, essai sans écriture, et les règles de fusion qui protègent une installation existante.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { fauxServices } from './installateur-faux.js';
import { creerUI } from '../deploy/installateur/lib/ui.mjs';
import { creerClient } from '../deploy/installateur/lib/http.mjs';
import { lireEnv, fusionnerEnv, formater, etatDossier } from '../deploy/installateur/lib/fichiers.mjs';
import { clesVigie } from '../deploy/installateur/lib/cles.mjs';
import * as CF from '../deploy/installateur/lib/cloudflare.mjs';
import * as Z from '../deploy/installateur/lib/zitadel.mjs';
import { deroule, controleDonnees, controleSauvegardes, trouverPile, partageOuvert, clePubliqueDe, memeSupport } from '../deploy/installateur/installer.mjs';

const RACINE_DEPOT = path.resolve(import.meta.dirname, '..');
const UID = process.getuid(), GID = process.getgid();

function uiScriptee(reponses) {
  const entree = new PassThrough();
  let texte = '';
  const sortie = new Writable({ write(c, _e, fin) { texte += c; fin(); } });
  const ui = creerUI({ entree, sortie, couleurs: false });
  entree.end(`${reponses.join('\n')}\n`);
  return { ui, sortie: () => texte };
}

// Réponses d'une installation en mode Linux, Vigie et console comprises. `adminConnu` : le compte existe déjà.
function reponses({ adminConnu = false, appliquer = '' } = {}) {
  return [
    '', // prérequis : continuer
    '/opt/nicephos', '/srv/nicephos', '/srv/sauvegardes', String(UID), String(GID), '', // pile, dossiers, uid, gid, port
    '', 'o', // DATA_KEY (seulement à la première installation), Vigie
    'exemple.fr', '', // zone, adresse
    'https://test.zitadel.cloud', 'pat-installateur-123',
    'seb@exemple.fr', ...(adminConnu ? [] : ['Sébastien', 'W']), '',
    '', // second facteur
    '', '', 'cf-installateur-123', '', // durcissement, console, jeton, tunnel
    appliquer, 'n', // appliquer, démarrer
  ];
}

function arbo() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'installateur-'));
  return racine;
}

const ecritures = journal => journal.filter(r => r.method !== 'GET' && !/\/_search$/.test(r.chemin.split('?')[0]));
function fichiersSous(dossier) {
  const l = [];
  for (const e of fs.readdirSync(dossier, { withFileTypes: true, recursive: true })) if (e.isFile()) l.push(path.join(e.parentPath ?? e.path, e.name));
  return l;
}

test('installateur : installation complète (site, Vigie, console, durcissement), puis relance qui ne recrée rien', async () => {
  const racine = arbo();
  const services = fauxServices();
  const { ui, sortie } = uiScriptee(reponses());
  const suite = path.join(racine, 'suite');
  process.env.INSTALLEUR_SORTIE = suite;
  try {
    await deroule({ ui, mode: 'linux', racine, fetch: services.fetch });
  } finally { delete process.env.INSTALLEUR_SORTIE; ui.fermer(); }
  const texte = sortie();

  // Fichiers de la pile.
  const env = lireEnv(fs.readFileSync(path.join(racine, 'opt/nicephos/.env'), 'utf8'));
  const venv = lireEnv(fs.readFileSync(path.join(racine, 'opt/nicephos/vigie.env'), 'utf8'));
  const z = services.zitadel, c = services.cloudflare;
  const appSite = z.apps.find(a => a.name === 'Site Nicephos');
  assert.equal(env.PUBLIC_URL, 'https://www.exemple.fr');
  assert.equal(env.NICEPHOS_DIR, '/srv/nicephos');
  assert.equal(env.BACKUP_DIR, '/srv/sauvegardes');
  assert.equal(env.OIDC_ISSUER, 'https://test.zitadel.cloud');
  assert.equal(env.OIDC_CLIENT_ID, appSite.oidcConfig.clientId);
  assert.equal(env.OIDC_CLIENT_SECRET, appSite.secret);
  assert.equal(env.OIDC_PROJECT_ID, z.projets.find(p => p.name === 'Nicephos').id);
  assert.equal(env.OIDC_ORG_ID, 'org1');
  assert.equal(env.TUNNEL_TOKEN, `jeton-${c.tunnels[0].id}`);
  assert.equal(Buffer.from(env.COOKIE_SECRET, 'base64').length, 32);
  assert.equal(Buffer.from(env.DATA_KEY, 'base64').length, 32);
  assert.equal(env.COMPOSE_PROFILES, 'vigie');
  assert.equal(env.VIGIE_URL, 'http://vigie-reception:4100');
  assert.equal(env.VIGIE_INGEST_KEY, venv.VIGIE_INGEST_KEY);
  assert.equal(env.VIGIE_DECISIONS_PUBKEY, clePubliqueDe(venv.VIGIE_DECISIONS_PRIVATE_KEY));
  assert.equal(env.VIGIE_CONSOLE_URL, 'https://vigie.exemple.fr');
  assert.ok(!/<instance>/.test(fs.readFileSync(path.join(racine, 'opt/nicephos/.env'), 'utf8')), 'exemple du modèle remplacé');
  const seb = z.utilisateurs.find(u => u.userName === 'seb@exemple.fr');
  assert.equal(venv.VIGIE_ZITADEL_ISSUER, 'https://test.zitadel.cloud');
  assert.equal(venv.VIGIE_CONSOLE_CLIENT_ID, z.apps.find(a => a.name === 'Console Vigie').oidcConfig.clientId);
  assert.equal(venv.VIGIE_CONSOLE_PROJECT_ID, z.projets.find(p => p.name === 'Vigie').id);
  assert.equal(venv.VIGIE_ACCESS_TEAM, 'nicephos');
  assert.equal(venv.VIGIE_ACCESS_AUD, c.apps[0].aud);
  assert.equal(venv.VIGIE_ADMIN_SUBS, seb.id);
  assert.equal(fs.readFileSync(path.join(racine, 'opt/nicephos/docker-compose.yml'), 'utf8'), fs.readFileSync(path.join(RACINE_DEPOT, 'deploy/unraid/compose.yaml'), 'utf8'));
  const cle = JSON.parse(fs.readFileSync(path.join(racine, 'srv/nicephos/vigie-secrets/zitadel.json'), 'utf8'));
  assert.equal(cle.type, 'serviceaccount');
  assert.equal(cle.userId, z.utilisateurs.find(u => u.userName === 'vigie-lecture').id);
  assert.equal(fs.readFileSync(path.join(racine, 'srv/nicephos/vigie-secrets/console-secret'), 'utf8').trim(), z.apps.find(a => a.name === 'Console Vigie').secret);
  for (const f of ['.env', 'vigie.env']) assert.equal(fs.statSync(path.join(racine, 'opt/nicephos', f)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(racine, 'srv/nicephos/vigie-secrets')).mode & 0o777, 0o700);
  assert.match(fs.readFileSync(`${suite}-a-faire`, 'utf8'), /^Zitadel : supprimer le compte de service « installateur »/);
  assert.match(fs.readFileSync(suite, 'utf8'), /^PROJET=\/opt\/nicephos\nNOM=nicephos\nADRESSE=https:\/\/www\.exemple\.fr\nREDIRECTION=https:\/\/exemple\.fr\nDEMARRER=0\n$/);

  // Zitadel.
  const projet = z.projets.find(p => p.name === 'Nicephos');
  assert.ok(projet.projectRoleAssertion && projet.projectRoleCheck);
  assert.deepEqual(z.roles.filter(r => r.projet === projet.id).map(r => r.key), ['admin']);
  assert.deepEqual(appSite.oidcConfig.redirectUris, ['https://www.exemple.fr/auth/callback']);
  assert.equal(appSite.oidcConfig.authMethodType, 'OIDC_AUTH_METHOD_TYPE_BASIC');
  assert.equal(seb.human.email.email, 'seb@exemple.fr');
  assert.deepEqual(z.autorisations.filter(g => g.userId === seb.id).map(g => g.roleKeys).sort(), [['admin'], ['vigie.admin']]);
  assert.equal(z.politique.allowRegister, false);
  assert.equal(z.politique.forceMfa, true);
  assert.equal(z.politique.forceMfaLocalOnly, false);
  assert.equal(z.politique.allowUsernamePassword, true, 'les autres réglages de la politique sont repris');
  assert.deepEqual(z.membres, [{ userId: cle.userId, roles: ['IAM_OWNER_VIEWER'] }]);
  const consoleApp = z.apps.find(a => a.name === 'Console Vigie').oidcConfig;
  assert.ok(consoleApp.idTokenRoleAssertion && consoleApp.idTokenUserinfoAssertion);
  assert.deepEqual(z.apps.find(a => a.name === 'Cloudflare Access').oidcConfig.redirectUris, ['https://nicephos.cloudflareaccess.com/cdn-cgi/access/callback']);

  // Cloudflare.
  const t = c.tunnels[0];
  assert.deepEqual(c.configs[t.id].ingress, [
    { hostname: 'www.exemple.fr', service: 'http://nicephos:3000' },
    { hostname: 'vigie.exemple.fr', service: 'http://172.29.42.20:4200' },
    { service: 'http_status:404' },
  ]);
  const dns = Object.fromEntries(c.dns.filter(r => r.type !== 'CAA').map(r => [r.name, `${r.type} ${r.content} ${r.proxied}`]));
  assert.deepEqual(dns, {
    'www.exemple.fr': `CNAME ${t.id}.cfargotunnel.com true`, 'vigie.exemple.fr': `CNAME ${t.id}.cfargotunnel.com true`,
    'exemple.fr': 'A 192.0.2.1 true', '*.exemple.fr': 'A 192.0.2.1 true',
  });
  assert.deepEqual(c.dns.find(r => r.type === 'CAA').data, { flags: 0, tag: 'issue', value: 'pki.goog' });
  const redir = c.entrees.http_request_dynamic_redirect.rules[0];
  assert.equal(redir.expression, 'not (http.host in {"www.exemple.fr" "vigie.exemple.fr"})');
  assert.equal(redir.action_parameters.from_value.target_url.expression, 'concat("https://www.exemple.fr", http.request.uri.path)');
  assert.equal(redir.action_parameters.from_value.status_code, 301);
  assert.equal(redir.action_parameters.from_value.preserve_query_string, true);
  assert.deepEqual(c.entrees.http_request_firewall_custom.rules.map(r => r.ref), ['nicephos_vigie_bloquees', 'nicephos_outils', 'nicephos_scanners', 'nicephos_methodes', 'nicephos_admin_pays']);
  assert.ok(c.entrees.http_request_firewall_custom.rules.every(r => !('enPremier' in r)));
  assert.equal(c.entrees.http_ratelimit.rules[0].ratelimit.requests_per_period, 200);
  assert.equal(c.reglages.always_use_https, 'on');
  assert.equal(c.reglages.ssl, 'strict');
  assert.equal(c.reglages.ssl_automatic_mode, 'custom');
  assert.equal(c.reglages.min_tls_version, '1.2');
  assert.equal(c.reglages.email_obfuscation, 'off');
  assert.deepEqual(c.entetes.managed_response_headers.map(h => [h.id, h.enabled]), [['remove_x-powered-by_header', true], ['add_security_headers', false]]);
  assert.equal(c.entetes.managed_request_headers[0].enabled, true);
  assert.deepEqual(c.listes.map(l => [l.name, l.kind]), [['vigie_bloquees', 'ip']]);
  assert.equal(c.dnssec.status, 'pending');
  assert.deepEqual(c.fournisseurs.map(f => f.type).sort(), ['oidc', 'onetimepin']);
  const idp = c.fournisseurs.find(f => f.type === 'oidc');
  assert.equal(idp.config.client_id, z.apps.find(a => a.name === 'Cloudflare Access').oidcConfig.clientId);
  assert.equal(idp.config.certs_url, 'https://test.zitadel.cloud/oauth/v2/keys');
  assert.deepEqual(c.politiques[0].include, [{ email: { email: 'seb@exemple.fr' } }]);
  assert.deepEqual(c.apps[0].policies, [{ id: c.politiques[0].id, precedence: 1 }]);
  assert.deepEqual(c.apps[0].allowed_idps.sort(), c.fournisseurs.map(f => f.id).sort());

  // Jetons de l'installateur : écrits nulle part, jamais affichés ; secrets jamais affichés non plus.
  for (const f of fichiersSous(racine)) {
    const contenu = fs.readFileSync(f, 'utf8');
    assert.ok(!contenu.includes('pat-installateur-123') && !contenu.includes('cf-installateur-123'), f);
  }
  for (const secret of ['pat-installateur-123', 'cf-installateur-123', appSite.secret, env.COOKIE_SECRET, env.DATA_KEY, env.TUNNEL_TOKEN]) assert.ok(!texte.includes(secret), `affiché : ${secret}`);
  assert.match(texte, /Reste à faire à la main/);
  assert.match(texte, /DNSSEC : copier l’enregistrement DS/);
  assert.ok(services.journal.every(r => r.auth === (r.service === 'zitadel' && r.chemin.startsWith('/.well-known') ? r.auth : r.service === 'zitadel' ? 'Bearer pat-installateur-123' : 'Bearer cf-installateur-123')));

  // Relance : tout est retrouvé, rien n'est écrit chez Zitadel ni chez Cloudflare, les secrets du .env sont gardés.
  const avant = fs.readFileSync(path.join(racine, 'opt/nicephos/.env'), 'utf8');
  const avantVigie = fs.readFileSync(path.join(racine, 'opt/nicephos/vigie.env'), 'utf8');
  services.journal.length = 0;
  const r2 = uiScriptee(reponses({ adminConnu: true }).filter((_, i) => i !== 7)); // plus de question DATA_KEY
  await deroule({ ui: r2.ui, mode: 'linux', racine, fetch: services.fetch });
  r2.ui.fermer();
  assert.deepEqual(ecritures(services.journal), []);
  assert.equal(fs.readFileSync(path.join(racine, 'opt/nicephos/.env'), 'utf8'), avant);
  assert.equal(fs.readFileSync(path.join(racine, 'opt/nicephos/vigie.env'), 'utf8'), avantVigie);
  assert.match(r2.sortie(), /Installation existante trouvée/);
  assert.ok(fs.readdirSync(path.join(racine, 'opt/nicephos')).some(f => f.startsWith('.env.avant-installateur-')));
  assert.equal(c.tunnels.length, 1);
  assert.equal(z.apps.length, 3);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('installateur : --essai lit seulement, n’écrit rien, ni chez Zitadel et Cloudflare, ni sur la machine', async () => {
  const racine = arbo();
  const services = fauxServices();
  const { ui, sortie } = uiScriptee(reponses().slice(0, -2));
  await deroule({ ui, mode: 'linux', racine, fetch: services.fetch, essai: true });
  ui.fermer();
  assert.deepEqual(ecritures(services.journal), []);
  assert.deepEqual(fs.readdirSync(racine), []);
  assert.match(sortie(), /Essai terminé : rien n’a été changé/);
  assert.match(sortie(), /\+ tunnel « nicephos »/);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('installateur : mise à jour d’une pile existante, valeurs et autres adresses du tunnel gardées', async () => {
  const racine = arbo();
  fs.mkdirSync(path.join(racine, 'opt/nicephos'), { recursive: true });
  fs.mkdirSync(path.join(racine, 'srv/nicephos/data'), { recursive: true });
  // .env de production : secret client connu, clé de chiffrement et réglage maison à garder.
  fs.writeFileSync(path.join(racine, 'opt/nicephos/.env'), [
    'NICEPHOS_DIR=/srv/nicephos', 'BACKUP_DIR=/srv/sauvegardes', 'PUBLIC_URL=https://www.exemple.fr', 'COOKIE_SECRET=ancien-secret-de-cookie-0123456789abcdef',
    'DATA_KEY=ancienne-cle', 'OIDC_CLIENT_ID=client-existant', 'OIDC_CLIENT_SECRET=secret-existant', 'SITE_MEM_LIMIT=6g', 'COMPOSE_PROFILES=signal', '',
  ].join('\n'));
  const services = fauxServices({
    zitadel: { etat: {
      projets: [{ id: 'p1', name: 'Nicephos', projectRoleAssertion: false, projectRoleCheck: true, details: { resourceOwner: 'org1' } }],
      roles: [{ projet: 'p1', key: 'admin' }],
      apps: [{ projet: 'p1', id: 'a1', name: 'Site Nicephos', oidcConfig: { clientId: 'client-existant', redirectUris: ['https://www.exemple.fr/auth/callback', 'http://localhost:3000/auth/callback'], grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'OIDC_GRANT_TYPE_REFRESH_TOKEN'], responseTypes: ['OIDC_RESPONSE_TYPE_CODE'] } }],
      utilisateurs: [{ id: 'u1', userName: 'seb', human: { profile: { displayName: 'Seb' }, email: { email: 'seb@exemple.fr' } } }],
      autorisations: [{ id: 'g1', userId: 'u1', projectId: 'p1', roleKeys: ['admin'] }],
      politique: { allowRegister: false, forceMfa: true, forceMfaLocalOnly: false, allowUsernamePassword: true },
    } },
    cloudflare: { etat: {
      tunnels: [{ id: 'tunnel-0', name: 'nicephos', remote_config: true }],
      configs: { 'tunnel-0': { ingress: [{ hostname: 'kavita.autre.fr', service: 'http://10.0.0.2:5000' }, { service: 'http_status:404' }] } },
      connecteurs: { 'tunnel-0': [{ id: 'c1', version: '2026.10.0', origin_ip: '1.2.3.4' }, { id: 'c2', version: '2024.1.0', origin_ip: '1.2.3.4' }] },
      // Règle de redirection faite à la main d'après le README, restée en 302 (essai).
      entrees: { http_request_dynamic_redirect: { id: 'rs1', rules: [{ id: 'r1', action: 'redirect', expression: '(http.host ne "www.exemple.fr")', action_parameters: { from_value: { status_code: 302, target_url: { expression: 'concat("https://www.exemple.fr", http.request.uri.path)' }, preserve_query_string: true } } }] } },
      dns: [{ id: 'd0', type: 'MX', name: 'exemple.fr', content: 'mx.exemple.fr' }, { id: 'd1', type: 'A', name: 'exemple.fr', content: '1.2.3.4', proxied: false }],
    } },
  });
  const { ui, sortie } = uiScriptee([
    '', '/opt/nicephos', '', '', String(UID), String(GID), '', 'n', // pile, dossiers proposés, uid, gid, port, pas de Vigie
    '', '', 'https://test.zitadel.cloud', 'pat-installateur-123', 'seb@exemple.fr', '', '', // zone, adresse, Zitadel, admin connu, MFA
    'n', 'cf-installateur-123', '', '', 'n', // pas de durcissement, jeton, tunnel, appliquer, démarrer
  ]);
  await deroule({ ui, mode: 'linux', racine, fetch: services.fetch });
  ui.fermer();
  const texte = sortie();
  const env = lireEnv(fs.readFileSync(path.join(racine, 'opt/nicephos/.env'), 'utf8'));
  assert.equal(env.COOKIE_SECRET, 'ancien-secret-de-cookie-0123456789abcdef');
  assert.equal(env.DATA_KEY, 'ancienne-cle');
  assert.equal(env.OIDC_CLIENT_SECRET, 'secret-existant', 'secret connu : pas de nouveau secret');
  assert.equal(env.SITE_MEM_LIMIT, '6g');
  assert.equal(env.COMPOSE_PROFILES, 'signal');
  assert.equal(env.TUNNEL_TOKEN, 'jeton-tunnel-0');
  assert.ok(!ecritures(services.journal).some(r => /_generate_client_secret/.test(r.chemin)));
  const z = services.zitadel, c = services.cloudflare;
  assert.equal(z.projets[0].projectRoleAssertion, true, 'réglage du projet corrigé');
  assert.deepEqual(z.apps[0].oidcConfig.redirectUris, ['https://www.exemple.fr/auth/callback', 'http://localhost:3000/auth/callback']);
  assert.deepEqual(z.apps[0].oidcConfig.grantTypes, ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'OIDC_GRANT_TYPE_REFRESH_TOKEN']);
  assert.deepEqual(c.configs['tunnel-0'].ingress.map(r => r.hostname ?? r.service), ['www.exemple.fr', 'kavita.autre.fr', 'http_status:404']);
  assert.equal(c.entrees.http_request_dynamic_redirect.rules.length, 1, 'règle faite à la main mise à jour, pas doublée');
  assert.equal(c.entrees.http_request_dynamic_redirect.rules[0].ref, 'nicephos_vers_www');
  assert.equal(c.entrees.http_request_dynamic_redirect.rules[0].action_parameters.from_value.status_code, 301);
  assert.deepEqual(c.dns.filter(r => r.name === 'exemple.fr').map(r => r.type), ['MX', 'A'], 'enregistrement A existant gardé');
  assert.equal(c.dns.find(r => r.name === 'exemple.fr' && r.type === 'A').content, '1.2.3.4');
  assert.match(texte, /2 connecteurs actifs sur le tunnel/);
  fs.rmSync(racine, { recursive: true, force: true });
});

test('installateur : secret client inconnu → nouveau secret, imposé dans le .env', async () => {
  const services = fauxServices({ zitadel: { etat: {
    projets: [{ id: 'p1', name: 'Nicephos', projectRoleAssertion: true, projectRoleCheck: true }],
    apps: [{ projet: 'p1', id: 'a1', name: 'Site Nicephos', oidcConfig: { clientId: 'c1', redirectUris: ['https://www.exemple.fr/auth/callback'], postLogoutRedirectUris: ['https://www.exemple.fr/'], grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'] } }],
  } } });
  const api = Z.apiZitadel(creerClient({ service: 'Zitadel', base: 'https://test.zitadel.cloud', jeton: 'x', fetch: services.fetch }));
  const sortie = { projetId: 'p1' };
  const app = { nom: 'Site Nicephos', redirections: ['https://www.exemple.fr/auth/callback'], deconnexions: ['https://www.exemple.fr/'] };
  const plan = await Z.planApplication(api, { projet: sortie, sortie, app, secretConnu: () => null });
  assert.deepEqual(plan.map(e => e.etat), ['ok', 'modifier']);
  await plan[1].appliquer();
  assert.equal(sortie.clientSecret, services.zitadel.apps[0].secret);
  assert.equal(sortie.secretNouveau, true);
});

test('installateur : un enregistrement www existant n’est remplacé que sur accord', async () => {
  const services = fauxServices({ cloudflare: { etat: { dns: [{ id: 'd1', type: 'A', name: 'www.exemple.fr', content: '5.6.7.8', proxied: true }] } } });
  const api = CF.apiCloudflare(creerClient({ service: 'Cloudflare', base: 'https://api.cloudflare.com/client/v4', jeton: 'x', fetch: services.fetch }));
  const e = [{ nom: 'www.exemple.fr', type: 'CNAME', contenu: () => 't.cfargotunnel.com', attendu: c => c === 't.cfargotunnel.com', proxied: true }];
  const questions = [];
  const non = await CF.planDns(api, { zone: 'zone1', enregistrements: e, remplacer: async q => { questions.push(q); return false; } });
  assert.equal(non[0].etat, 'alerte');
  assert.match(questions[0], /A vers 5\.6\.7\.8/);
  const oui = await CF.planDns(api, { zone: 'zone1', enregistrements: e, remplacer: async () => true });
  assert.equal(oui[0].etat, 'modifier');
  await oui[0].appliquer();
  assert.deepEqual([services.cloudflare.dns[0].type, services.cloudflare.dns[0].content], ['CNAME', 't.cfargotunnel.com']);
});

test('installateur : fusion du .env (jamais une valeur perdue, modèle décommenté, valeurs sûres)', () => {
  const modele = '# Exemple\nPUBLIC_URL=https://www.nicephos.art\nCOOKIE_SECRET=\n# DATA_KEY=\nSITE_NAME="Nicephos"\n';
  const n = fusionnerEnv(modele, { PUBLIC_URL: 'https://www.exemple.fr', COOKIE_SECRET: 'abc', DATA_KEY: 'k+/=', AUTRE: 'x y' }, { forcer: ['PUBLIC_URL'] });
  assert.equal(n.texte, "# Exemple\nPUBLIC_URL=https://www.exemple.fr\nCOOKIE_SECRET=abc\nDATA_KEY=k+/=\nSITE_NAME=\"Nicephos\"\n\n# ---------- ajouté par l’installateur ----------\nAUTRE='x y'\n");
  assert.deepEqual(lireEnv(n.texte), { PUBLIC_URL: 'https://www.exemple.fr', COOKIE_SECRET: 'abc', DATA_KEY: 'k+/=', SITE_NAME: 'Nicephos', AUTRE: 'x y' });
  const g = fusionnerEnv('COOKIE_SECRET=ancien\n', { COOKIE_SECRET: 'nouveau' });
  assert.equal(g.texte, 'COOKIE_SECRET=ancien\n');
  assert.deepEqual(g.changements, [{ cle: 'COOKIE_SECRET', action: 'gardee' }]);
  // Clé active plus bas qu'un exemple commenté : c'est elle qui est mise à jour.
  const a = fusionnerEnv('# TUNNEL_TOKEN=\nTUNNEL_TOKEN=vieux\n', { TUNNEL_TOKEN: 'neuf' }, { forcer: ['TUNNEL_TOKEN'] });
  assert.equal(a.texte, '# TUNNEL_TOKEN=\nTUNNEL_TOKEN=neuf\n');
  assert.throws(() => formater('a\nb'), /plusieurs lignes/);
  assert.throws(() => formater("l'apostrophe"), /apostrophe/);
  assert.equal(formater('a$b'), "'a$b'");
});

test('installateur : chemins Unraid (pool direct, jamais /mnt/user), sauvegardes à part, partages ouverts', () => {
  const racine = arbo();
  fs.mkdirSync(path.join(racine, 'mnt/cache'), { recursive: true });
  const c = controleDonnees('unraid', racine);
  assert.equal(c('/mnt/cache/appdata/nicephos'), null);
  assert.match(c('/mnt/user/appdata/nicephos'), /jamais \/mnt\/user/);
  assert.match(c('/mnt/volumes/nicephos'), /introuvable/);
  assert.match(c('/mnt/cache'), /dans un pool/);
  assert.match(c('/mnt/cache/a b'), /sans espace/);
  const s = controleSauvegardes('/mnt/cache/appdata/nicephos');
  assert.equal(s('/mnt/user/backups/nicephos'), null);
  assert.match(s('/mnt/cache/appdata/nicephos/sauvegardes'), /ni dans le dossier/);
  assert.match(s('/mnt/cache/appdata'), /ni dans le dossier/);
  assert.equal(memeSupport('unraid', '/mnt/cache/a/n', '/mnt/cache/b/s'), true);
  assert.equal(memeSupport('unraid', '/mnt/cache/a/n', '/mnt/user/b/s'), false);
  fs.mkdirSync(path.join(racine, 'boot/config/shares'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'boot/config/shares/backups.cfg'), 'shareExport="e"\nshareSecurity="public"\nshareExportNFS="-"\n');
  fs.writeFileSync(path.join(racine, 'boot/config/shares/appdata.cfg'), 'shareExport="-"\nshareSecurity="public"\n');
  assert.deepEqual(partageOuvert('/mnt/user/backups/nicephos', racine), { partage: 'backups', smb: true, nfs: false });
  assert.equal(partageOuvert('/mnt/cache/appdata/nicephos', racine), null);
  assert.equal(partageOuvert('/boot', racine), null);
  fs.writeFileSync(path.join(racine, 'boot/config/shares/flash.cfg'), 'shareExport="e"\nshareSecurity="public"\n');
  assert.deepEqual(partageOuvert('/boot', racine), { partage: 'flash', smb: true, nfs: false });
  // Pile de Compose Manager retrouvée par son nom, même dans un dossier nommé autrement.
  fs.mkdirSync(path.join(racine, 'boot/config/plugins/compose.manager/projects/pile-photo'), { recursive: true });
  fs.writeFileSync(path.join(racine, 'boot/config/plugins/compose.manager/projects/pile-photo/name'), 'nicephos\n');
  fs.writeFileSync(path.join(racine, 'boot/config/plugins/compose.manager/projects/pile-photo/.env'), 'A=1\n');
  assert.deepEqual(trouverPile('unraid', racine), { dossier: '/boot/config/plugins/compose.manager/projects/pile-photo', existe: true, nouveauDossier: false });
  // Dossier existant d'un autre propriétaire : signalé, jamais changé.
  fs.mkdirSync(path.join(racine, 'srv/data'), { recursive: true });
  assert.equal(etatDossier({ chemin: '/srv/data', uid: UID + 1, gid: GID, mode: 0o750 }, racine).etat, 'proprietaire');
  fs.rmSync(racine, { recursive: true, force: true });
});

test('installateur : un réglage de la zone déjà plus strict n’est jamais baissé', () => {
  assert.equal(CF.reglageSuffit('min_tls_version', '1.3', '1.2'), true);
  assert.equal(CF.reglageSuffit('min_tls_version', '1.0', '1.2'), false);
  assert.equal(CF.reglageSuffit('security_level', 'high', 'medium'), true);
  assert.equal(CF.reglageSuffit('security_level', 'under_attack', 'medium'), true);
  assert.equal(CF.reglageSuffit('security_level', 'low', 'medium'), false);
  assert.equal(CF.reglageSuffit('tls_1_3', 'zrt', 'on'), true);
  assert.equal(CF.reglageSuffit('ssl', 'full', 'strict'), false);
});

test('installateur : adresses du tunnel fusionnées, redirection, clés de la Vigie au format de vigie/cli.js', () => {
  assert.deepEqual(CF.fusionnerIngress(
    [{ hostname: 'www.exemple.fr', service: 'http://ancien:3000' }, { hostname: 'kavita.autre.fr', service: 'http://k' }, { service: 'http_status:404' }],
    [{ hostname: 'www.exemple.fr', service: 'http://nicephos:3000' }],
  ), [{ hostname: 'www.exemple.fr', service: 'http://nicephos:3000' }, { hostname: 'kavita.autre.fr', service: 'http://k' }, { service: 'http_status:404' }]);
  assert.equal(CF.regleRedirection({ www: 'www.exemple.fr' }).expression, '(http.host ne "www.exemple.fr")');
  const k = clesVigie();
  for (const v of [k.vigie.VIGIE_INGEST_KEY, k.vigie.VIGIE_LOG_KEY]) assert.equal(Buffer.from(v, 'base64').length, 32);
  const privee = crypto.createPrivateKey({ key: Buffer.from(k.vigie.VIGIE_DECISIONS_PRIVATE_KEY, 'base64'), format: 'der', type: 'pkcs8' });
  const publique = crypto.createPublicKey({ key: Buffer.from(k.site.VIGIE_DECISIONS_PUBKEY, 'base64'), format: 'der', type: 'spki' });
  assert.ok(crypto.verify(null, Buffer.from('décision'), publique, crypto.sign(null, Buffer.from('décision'), privee)));
  assert.equal(clePubliqueDe(k.vigie.VIGIE_DECISIONS_PRIVATE_KEY), k.site.VIGIE_DECISIONS_PUBKEY);
  // Même fonction que vigie/cli.js (keys) : mêmes clés, mêmes formats.
  const cli = fs.readFileSync(path.join(RACINE_DEPOT, 'vigie/cli.js'), 'utf8');
  assert.match(cli, /privateKey\.export\(\{ format: 'der', type: 'pkcs8' \}\)\.toString\('base64'\)/);
  assert.match(cli, /publicKey\.export\(\{ format: 'der', type: 'spki' \}\)\.toString\('base64'\)/);
});

test('installateur : client HTTP (lecture seule, nouvel essai, erreurs sans le jeton) et saisie masquée', async () => {
  let appels = 0;
  const f = async () => (++appels < 2 ? { ok: false, status: 503, text: async () => '' } : { ok: false, status: 403, text: async () => JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }) });
  const c = creerClient({ service: 'Cloudflare', base: 'https://api', jeton: 'jeton-secret', fetch: f, pause: 1 });
  await assert.rejects(c.get('/zones'), err => err.statut === 403 && /10000 Authentication error/.test(err.message) && !err.message.includes('jeton-secret'));
  assert.equal(appels, 2);
  const lecture = creerClient({ service: 'Zitadel', base: 'https://z', jeton: 'x', fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }), lectureSeule: true });
  await lecture.post('/management/v1/projects/_search', {});
  await assert.rejects(lecture.post('/management/v1/projects', {}), /essai/);
  await assert.rejects(lecture.put('/management/v1/projects/1', {}), /essai/);

  const { ui, sortie } = uiScriptee(['mot-de-passe-123', '', 'valeur']);
  assert.equal(await ui.secret('Jeton'), 'mot-de-passe-123');
  assert.equal(await ui.question('Nom', { defaut: 'nicephos' }), 'nicephos');
  assert.equal(await ui.question('Autre'), 'valeur');
  ui.fermer();
  assert.ok(!sortie().includes('mot-de-passe-123'));
});
