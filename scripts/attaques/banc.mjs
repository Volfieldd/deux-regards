import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../server/config.js';
import { openDb, migrate } from '../../server/db/index.js';
import { seed } from '../../server/db/seed.js';
import { buildApp } from '../../server/app.js';
import { startVigie } from '../../vigie/index.js';
import { loadVigieConfig } from '../../vigie/config.js';
import { checkRoles, snapshotName } from '../../vigie/controle-roles.js';

// Banc du jeu d'attaques (phase E2, annexe architecture § 10) : un site Nicephos et une Vigie neufs, reliés, dans des
// dossiers temporaires, sur des ports locaux libres (127.0.0.1 seulement), sans aucun réseau extérieur :
//   - le site part de la base de démonstration (graine de « npm run seed », faite une fois par lancement dans un dossier
//     jetable, recopiée pour chaque scénario) ; il croit l'en-tête X-Forwarded-For venu de 127.0.0.1 (TRUST_PROXY), comme
//     derrière cloudflared : chaque visiteur simulé a son adresse, et son pays (cf-ipcountry) ;
//   - la Vigie est la vraie (startVigie : réception signée, moteur, règles Sigma, détecteurs, décisions signées), listes
//     de menaces coupées (VIGIE_MENACES=0), bordure Cloudflare simulée seulement si un scénario la demande ;
//   - « analyser » vide la file du site (résumés compris), attend que le moteur ait tout lu (engine.drain) et fait lire les
//     décisions au site (comme sa lecture de chaque seconde).
// Les requêtes des scénarios sont de vraies requêtes HTTP (fetch) vers le site qui écoute.

export const JETON_TEST = 'jeton-du-banc-d-attaques-0123456789';
const CLE_ENVOI = crypto.randomBytes(24).toString('hex');
const CLE_CHAINE = crypto.randomBytes(24).toString('hex');
const CLES = (() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { pub64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), priv64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') };
})();

// Navigateurs (agents) : un appareil de l'équipe, un téléphone, un poste d'attaquant.
export const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const portLibre = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// Modèles factices (rien n'est téléchargé, rien ne part sur le réseau) : comme test/helpers.js.
function modeleImages() {
  let n = 0;
  return { ensure: async () => {}, present: () => true, remove: () => {}, progress: () => null,
    embed: async () => { const v = new Float32Array(512); v[(n++) % 512] = 1; return v; } };
}
const OPTIONS_SITE = {
  instagramOptions: { manual: true },
  faceOptions: { manual: true, detector: { detect: async () => [] } },
  seriesOptions: { manual: true, model: modeleImages() },
  describeOptions: { manual: true, model: { describe: async () => 'Une photo de démonstration.', unload: async () => {}, remove: async () => {} } },
};

// Graine de démonstration, faite une fois par lancement (images AVIF/WebP comprises).
export async function graine(racine) {
  const dir = path.join(racine, 'graine');
  fs.mkdirSync(dir, { recursive: true });
  const config = loadConfig({ STORAGE_DIR: dir, DATABASE_PATH: path.join(dir, 'site.db'), SITE_NAME: 'Nicephos (banc)', TSA_URL: 'off' });
  const db = openDb(config.databasePath);
  migrate(db);
  await seed(db, config);
  db.prepare('UPDATE photos SET faces = 0, face_boxes = \'[]\' WHERE faces IS NULL').run();
  // Textes de remplacement remplis (un billet ne se publie pas sans eux) : avant le démarrage du site, pour que son
  // instantané des textes publiés les contienne déjà (sinon la première écriture d'un scénario les compterait).
  db.prepare("UPDATE photos SET alt_text = 'Une photo de démonstration.' WHERE alt_text = '' OR alt_text IS NULL").run();
  db.close();
  return dir;
}

// Un site et une Vigie neufs pour un scénario. preparer(db) : retouche de la base de démonstration avant le démarrage
// (données de départ d'un scénario, jamais une attaque).
export async function demarrer({ racine, graineDir, nom, preparer, bordure = false }) {
  const dir = path.join(racine, nom);
  const siteDir = path.join(dir, 'site'), vigieDir = path.join(dir, 'vigie'), sauvegardes = path.join(dir, 'sauvegardes-du-site');
  fs.cpSync(graineDir, siteDir, { recursive: true });
  fs.mkdirSync(vigieDir, { recursive: true });
  fs.mkdirSync(path.join(sauvegardes, 'db'), { recursive: true });

  // Vigie. Bordure simulée : un faux Cloudflare (KV et Analytics Engine) servi par fetchImpl, sans réseau.
  const cf = bordure ? fauxCloudflare() : null;
  const envVigie = { VIGIE_DATA_DIR: vigieDir, VIGIE_SITE_BACKUP_DIR: sauvegardes, VIGIE_HOST: '127.0.0.1', VIGIE_INGEST_PORT: '0', VIGIE_INGEST_KEY: CLE_ENVOI,
    VIGIE_LOG_KEY: CLE_CHAINE, VIGIE_DECISIONS_PRIVATE_KEY: CLES.priv64, VIGIE_MENACES: '0' };
  if (cf) {
    const jeton = path.join(vigieDir, 'cloudflare-token');
    fs.writeFileSync(jeton, 'jeton-factice', { mode: 0o600 });
    Object.assign(envVigie, { VIGIE_CF_ACCOUNT_ID: 'a'.repeat(32), VIGIE_CF_KV_NAMESPACE: 'b'.repeat(32), VIGIE_CF_TOKEN_FILE: jeton });
  }
  const vigie = await startVigie({ config: loadVigieConfig(envVigie), logger: false, fetchImpl: cf ? cf.fetch : async () => { throw new Error('réseau coupé (banc)'); } });
  const portVigie = vigie.ingest.server.address().port;

  // Site.
  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const config = loadConfig({ STORAGE_DIR: siteDir, DATABASE_PATH: path.join(siteDir, 'site.db'), SITE_NAME: 'Nicephos (banc)', TSA_URL: 'off', HOST: '127.0.0.1', PORT: String(port),
    PUBLIC_URL: base, TRUST_PROXY: '127.0.0.1', LOCAL_AUTH_TOKEN: JETON_TEST,
    VIGIE_URL: `http://127.0.0.1:${portVigie}`, VIGIE_INGEST_KEY: CLE_ENVOI, VIGIE_DECISIONS_PUBKEY: CLES.pub64 });
  const db = openDb(config.databasePath);
  migrate(db);
  if (preparer) await preparer(db);
  const app = await buildApp({ config, db, logger: false, ...OPTIONS_SITE, vigieOptions: { timers: false, pollDecisions: false } });
  await app.listen({ host: '127.0.0.1', port });

  const banc = {
    dir, base, app, db, vigie, cf, debut: Date.now(),
    // File du site vidée (résumés des familles agrégées compris), moteur de la Vigie à jour, décisions lues par le site.
    async analyser() {
      app.securite.sweep(true);
      app.securite.retryNow();
      await app.securite.flush();
      // Bordure : la lecture de la minute suivante (la Vigie lit Analytics Engine une fois par minute ; le banc ne
      // l'attend pas).
      if (cf) { vigie.store.setting.set('bordure_curseur', null); await vigie.edge.read(); }
      vigie.engine.enqueue();
      await vigie.engine.drain();
      // Lecture des décisions par le site, seulement si la liste a changé (sinon la Vigie fait attendre 25 s : attente
      // longue de GET /v1/decisions).
      if ((app.decisions.state?.version ?? -1) < vigie.decisions.version()) await app.decisions.poll();
    },
    // Sauvegarde du site (comme le service backup) puis contrôle des rôles par la Vigie : administrateurs connus (aucune
    // adresse d'administrateur n'est jamais bloquée automatiquement), rôles des comptes (détecteur « rôle incohérent »).
    async sauvegarder() {
      await banc.analyser();
      const file = path.join(sauvegardes, 'db', snapshotName(Date.now()));
      db.prepare('VACUUM INTO ?').run(file);
      const r = checkRoles({ store: vigie.store, siteBackupDir: sauvegardes });
      vigie.engine.enqueue();
      await vigie.engine.drain();
      return r;
    },
    // Repère : ce qui vient après appartient au scénario.
    repere() {
      const { db: vdb } = vigie.store;
      return { at: Date.now(), alerte: vdb.prepare('SELECT COALESCE(MAX(id), 0) FROM alerts').pluck().get(), seq: vdb.prepare('SELECT COALESCE(MAX(seq), 0) FROM events').pluck().get(),
        decision: vdb.prepare('SELECT COALESCE(MAX(id), 0) FROM decisions').pluck().get() };
    },
    async fermer({ garder = false } = {}) {
      await app.close().catch(() => {});
      db.close();
      await vigie.close().catch(() => {});
      if (!garder) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return banc;
}

// Faux Cloudflare pour la bordure (phase C3) : KV accepte la liste des blocages ; Analytics Engine rend les points que
// le scénario a déclarés (ce que le Worker aurait écrit), à la minute que demande la Vigie.
function fauxCloudflare() {
  const points = [];
  const kv = [];
  return {
    points, kv,
    // Points du Worker pour une adresse : { ip, classe: 'page' | 'admin' | 'erreur' | 'bloque', statut, n, pays }.
    ajouter: p => points.push(p),
    async fetch(url, init = {}) {
      const u = String(url);
      if (/\/storage\/kv\//.test(u)) { kv.push(init.body); return new Response('{"success":true}', { status: 200 }); }
      if (/\/analytics_engine\/sql$/.test(u)) {
        const from = /timestamp >= toDateTime\('([^']+)'\)/.exec(String(init.body))?.[1];
        const minute = from ? Date.parse(`${from.replace(' ', 'T')}Z`) / 1000 : Math.floor(Date.now() / 60e3) * 60 - 240;
        const data = points.splice(0).map(p => ({ minute, ip: p.ip, classe: p.classe || 'page', statut: String(p.statut || '200'), pays: p.pays || 'FR', asn: p.asn || '64500',
          org: p.org || 'Opérateur fictif', tls: p.tls || null, note: '', n: p.n || 1 }));
        return new Response(JSON.stringify({ data }), { status: 200 });
      }
      return new Response('introuvable', { status: 404 });
    },
  };
}

// Un visiteur simulé : son adresse (vue par le site derrière le proxy de confiance), son pays, son navigateur, ses
// cookies. Les redirections ne sont pas suivies (les cookies posés par une réponse 303 sont gardés).
export class Navigateur {
  constructor(banc, { ip, ua = UA.mac, pays = 'FR', langue = 'fr-FR,fr;q=0.9' } = {}) {
    this.banc = banc; this.ip = ip; this.ua = ua; this.pays = pays; this.langue = langue;
    this.cookies = new Map();
  }
  cookie() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  // Cookies copiés d'un autre navigateur (vol de cookie).
  copierCookies(autre) { this.cookies = new Map(autre.cookies); return this; }
  async requete(chemin, { method = 'GET', headers = {}, corps, json } = {}) {
    const h = { 'x-forwarded-for': this.ip, 'cf-ipcountry': this.pays, 'user-agent': this.ua, 'accept-language': this.langue, accept: 'text/html,application/xhtml+xml', ...headers };
    if (this.cookies.size) h.cookie = this.cookie();
    let body;
    if (json !== undefined) { body = JSON.stringify(json); h['content-type'] = 'application/json'; h.accept = 'application/json'; }
    else if (corps !== undefined) { body = new URLSearchParams(corps).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
    if (method !== 'GET' && method !== 'HEAD') { h.origin ??= this.banc.base; h['sec-fetch-site'] ??= 'same-origin'; }
    const res = await fetch(`${this.banc.base}${chemin}`, { method, headers: h, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [paire, ...attrs] = c.split(';');
      const i = paire.indexOf('=');
      const nom = paire.slice(0, i).trim(), valeur = paire.slice(i + 1).trim();
      const efface = !valeur || attrs.some(a => /^\s*max-age=0\s*$/i.test(a) || (/^\s*expires=/i.test(a) && Date.parse(a.split('=')[1]) < Date.now()));
      if (efface) this.cookies.delete(nom); else this.cookies.set(nom, valeur);
    }
    const texte = method === 'HEAD' ? '' : await res.text();
    return { status: res.status, location: res.headers.get('location'), texte, headers: res.headers };
  }
  get(chemin, opts) { return this.requete(chemin, opts); }
  post(chemin, corps, opts = {}) { return this.requete(chemin, { ...opts, method: 'POST', corps }); }
  postJson(chemin, json, opts = {}) { return this.requete(chemin, { ...opts, method: 'POST', json }); }
}

// Un membre de l'équipe : connexion de test (LOCAL_AUTH_TOKEN, comme la connexion OIDC sans le fournisseur), jeton CSRF
// lu dans la page de l'admin (data-csrf).
export class Equipe extends Navigateur {
  async connecter(auteur, { jeton = JETON_TEST } = {}) {
    const r = await this.post('/auth/local', { token: jeton, author: auteur, next: '/admin' });
    if (r.status !== 303) return r;
    await this.lireCsrf();
    return r;
  }
  async lireCsrf() {
    const r = await this.get('/admin');
    this.csrf = /data-csrf="([^"]+)"/.exec(r.texte)?.[1] || null;
    return this.csrf;
  }
  ecrire(chemin, corps = {}, opts) { return this.post(chemin, { _csrf: this.csrf, ...corps }, opts); }
  ecrireJson(chemin, json = {}) { return this.postJson(chemin, json, { headers: { 'x-csrf-token': this.csrf } }); }
}

// Lecture des résultats dans la base de la Vigie (après un repère).
export function lire(banc, depuis) {
  const { db } = banc.vigie.store;
  const parse = s => { try { return JSON.parse(s); } catch { return {}; } };
  return {
    alertes: db.prepare('SELECT * FROM alerts WHERE id > ? OR derniere >= ? ORDER BY id').all(depuis.alerte, depuis.at),
    signaux: db.prepare("SELECT seq, detail FROM events WHERE type = 'vigie_signal' AND seq > ? ORDER BY seq").all(depuis.seq).map(r => ({ seq: r.seq, ...parse(r.detail) })),
    decisions: db.prepare('SELECT * FROM decisions WHERE id > ? ORDER BY id').all(depuis.decision),
    evenements: (type) => db.prepare('SELECT * FROM events WHERE seq > ? AND type = ? ORDER BY seq').all(depuis.seq, type),
  };
}
