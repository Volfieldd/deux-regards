import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openVigieDb, createStore } from './store.js';
import { createDecisions } from './decisions.js';
import { createSwitches } from './interrupteurs.js';
import { createEngine } from './moteur.js';

// Banc de mesure de la Vigie (arbitrage NC6, abaques dans docs/etudes/vigie-capacite.md) : sur une base jetable, dans
// un dossier temporaire (jamais la vraie base), mesure
//   - l'écriture chaînée seule (réception sans analyse), par lots de 200 ;
//   - l'analyse complète (écriture + moteur : règles, corrélations, détecteurs), avec un historique de N événements ;
//   - la vérification de la chaîne (tâche quotidienne) et la taille de la base par événement.
// À lancer sur la machine cible, dans un conteneur à part (sans secret ni réseau ; /tmp des conteneurs est en mémoire,
// d'où un dossier sur disque) :
//   docker run --rm --network none --user 99:100 -v /mnt/cache/appdata/nicephos/vigie-banc:/banc \
//     ghcr.io/volfieldd/deux-regards-vigie:latest node vigie/banc.js --dossier /banc --historique 1000000
// Mélange d'événements proche d'un jour ordinaire : lectures de l'admin, connexions, pièges et 404 du public, Zitadel.

const raw = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const arg = (name, d) => (raw(name) === undefined ? d : Number(raw(name)));
const HISTORY = arg('historique', 100_000), EVENTS = arg('evenements', 5_000), ACCOUNTS = arg('comptes', 5), DIR = raw('dossier') || os.tmpdir();

const MIX = [
  [0.35, i => ({ type: 'sensitive_read', severity: 'info', composant: 'site · admin', sub: `zitadel-${i % ACCOUNTS}`, ip: `198.51.100.${i % ACCOUNTS}`, ip_net: '198.51.100.0', detail: '{"cible":"/admin/personnes/:id"}' })],
  [0.05, i => ({ type: 'authn_login_success', severity: 'info', composant: 'site · connexion', sub: `zitadel-${i % ACCOUNTS}`, ip: `198.51.100.${i % ACCOUNTS}`, ip_net: '198.51.100.0', country: 'FR', lat: 48.9, lon: 2.4, detail: '{"appareil":"abcd"}' })],
  [0.25, i => ({ type: 'malicious_excess_404', severity: 'bas', composant: 'site · public', ip: `203.0.${(i >> 8) & 255}.${i & 255}`, ip_net: `203.0.${(i >> 8) & 255}.0`, route: '/wp-login.php' })],
  [0.15, i => ({ type: 'malicious_honeypot', severity: 'moyen', composant: 'site · public', ip: `192.0.2.${i & 255}`, ip_net: '192.0.2.0', route: '/.env' })],
  [0.05, i => ({ type: 'malicious_input', severity: 'moyen', composant: 'site · public', ip: `203.0.113.${i & 255}`, ip_net: '203.0.113.0', detail: '{"motif":"sql","champ":"q"}' })],
  [0.10, i => ({ type: 'zitadel_connexion', severity: 'info', composant: 'zitadel', canal: 'API Zitadel', confiance: 'constaté', sub: `zitadel-${i % ACCOUNTS}`, detail: '{"type_zitadel":"session.added"}' })],
  [0.05, i => ({ type: 'authz_fail', severity: 'bas', composant: 'site · admin', sub: `zitadel-${i % ACCOUNTS}`, ip: `198.51.100.${i % ACCOUNTS}`, ip_net: '198.51.100.0' })],
];
function eventAt(i, t) {
  let x = (i * 2654435761 % 1000) / 1000, k = 0;
  while (k < MIX.length - 1 && x >= MIX[k][0]) { x -= MIX[k][0]; k += 1; }
  return { id: crypto.randomUUID(), recu_a: t, survenu_a: t, canal: 'ingestion signée', confiance: 'rapporté', ...MIX[k][1](i) };
}

export async function bench({ history = HISTORY, events = EVENTS, base = DIR, log = console.log } = {}) {
  const dir = fs.mkdtempSync(path.join(base, 'vigie-banc-'));
  const out = { historique: history, evenements: events };
  try {
    const db = openVigieDb(path.join(dir, 'vigie.db'));
    // Historique réparti sur 30 jours, avant l'instant de la mesure.
    const end = Date.now();
    let t = end - 30 * 864e5;
    const step = history ? (30 * 864e5) / history : 0;
    const clock = { t };
    const now = () => clock.t;
    const store = createStore({ db, logKey: 'banc-de-mesure-cle-de-chaine-0123456789', now });
    let s = process.hrtime.bigint();
    for (let i = 0; i < history; i += 200) {
      const batch = [];
      for (let j = i; j < Math.min(i + 200, history); j++) { clock.t = t + j * step; batch.push(eventAt(j, clock.t)); }
      store.add(batch);
    }
    const ms = Number(process.hrtime.bigint() - s) / 1e6;
    out.ecriture_seule_par_s = history ? Math.round(history / (ms / 1000)) : null;
    clock.t = end;
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const decisions = createDecisions({ store, privateKey, now });
    const engine = createEngine({ store, decisions, switches: createSwitches({ store, now }), now });
    // Comme le service : la réception écrit des lots (ici 20 événements, un envoi du site par seconde), le moteur suit
    // la base par son curseur, par lots de 200.
    store.onAdded(() => engine.enqueue());
    const mem0 = process.memoryUsage().rss;
    s = process.hrtime.bigint();
    for (let i = 0; i < events; i += 20) {
      const lot = [];
      for (let j = i; j < Math.min(i + 20, events); j++) { clock.t += 200; lot.push(eventAt(history + j, clock.t)); }
      store.add(lot);
      await new Promise(resolve => setImmediate(resolve));
    }
    await engine.drain();
    const ms2 = Number(process.hrtime.bigint() - s) / 1e6;
    out.analyse_par_s = Math.round(events / (ms2 / 1000));
    out.analyse_ms_par_evenement = Math.round((ms2 / events) * 100) / 100;
    out.memoire_mo = Math.round(process.memoryUsage().rss / 1048576);
    out.memoire_moteur_mo = Math.round((process.memoryUsage().rss - mem0) / 1048576);
    s = process.hrtime.bigint();
    const v = store.verify();
    out.verification_s = Math.round(Number(process.hrtime.bigint() - s) / 1e7) / 100;
    out.chaine = v.ok ? 'intacte' : 'rompue';
    db.pragma('wal_checkpoint(TRUNCATE)');
    const lines = db.prepare('SELECT COUNT(*) FROM events').pluck().get();
    db.close();
    const size = fs.statSync(path.join(dir, 'vigie.db')).size;
    out.lignes = lines;
    out.octets_par_ligne = Math.round(size / lines);
    out.base_mo = Math.round(size / 1048576);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  log(JSON.stringify(out));
  return out;
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) await bench();
