// Mandataire de sortie du site (registre des briques de la Vigie, BV-10 ; décision D24). Service « sortie » de la pile
// Unraid (profil « sortie »), lancé avec l'image du site : node reseau/mandataire.js.
//
// Ce qu'il fait, et rien d'autre :
//   - accepte les tunnels HTTP CONNECT (HTTPS, SMTP chiffré) vers les seuls noms de la liste autorisée, construite au
//     démarrage depuis les réglages du site (OIDC_ISSUER, TSA_URL, SMTP_URL, Instagram, Hugging Face, TRANSLATE_URL) et
//     SORTIE_NOMS ; tout autre nom, une adresse IP écrite telle quelle, un port hors liste, un nom qui se résout vers une
//     adresse privée (réseau local, Unraid) ou une requête HTTP en clair : refusés (403) et journalisés ;
//   - se connecte à l'adresse qu'il a lui-même résolue et vérifiée (un nom qui change d'adresse entre la vérification et la
//     connexion ne mène pas ailleurs) ;
//   - journalise une ligne JSON par demande : refusée (nom, port, raison), en échec (nom permis mais introuvable ou
//     injoignable) ou acceptée (nom, port, octets, durée), JAMAIS
//     un chemin, un en-tête ou un contenu (un tunnel CONNECT n'en montre d'ailleurs aucun) ; un battement chaque heure.
//     Journal dans SORTIE_JOURNAL (fichier sur un volume monté en lecture seule dans la Vigie), borné : au-delà de
//     SORTIE_JOURNAL_MAX octets, renommé en « .1 » (le précédent « .1 » est remplacé) ;
//   - ne reçoit aucun secret du site sauf SMTP_URL, dont il ne garde que le nom et le port (la variable est retirée de
//     process.env dès la lecture ; elle reste lisible par « docker inspect » : SORTIE_SMTP_URL=smtps://hôte:port, sans
//     identifiant, dans le .env de la pile l'évite).
// Pourquoi un mandataire écrit ici plutôt que Squid ou tinyproxy : 250 lignes sans dépendance, dans une image déjà
// tenue à jour (celle du site) ; un format de journal choisi pour la Vigie (aucun chemin par construction) ; le contrôle
// des adresses résolues, que tinyproxy ne fait pas ; aucune configuration à générer par un script au démarrage.
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const NOM = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;
const ENTETE_MAX = 8 * 1024;
const DELAI_ENTETE = 10e3, DELAI_CONNEXION = 10e3, INACTIVITE = 10 * 60e3;
const CONNEXIONS_MAX = 256;
const BATTEMENT = 3600e3;

// Adresses jamais jointes sans SORTIE_PRIVE=1 : boucle locale, réseaux privés et partagés, lien local, multidiffusion,
// réservées, documentation ; IPv6 locales ; une IPv4 écrite en IPv6 (::ffff:a.b.c.d) est jugée comme l'IPv4.
const PRIVEES4 = new net.BlockList(), PRIVEES6 = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) PRIVEES4.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 127], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) PRIVEES6.addSubnet(a, p, 'ipv6');
export function estPrivee(ip) {
  const s = String(ip).toLowerCase();
  const v4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s)?.[1] ?? (net.isIPv4(s) ? s : null);
  if (v4) return PRIVEES4.check(v4, 'ipv4');
  if (/^::ffff:/.test(s) || !net.isIPv6(s)) return true;          // forme transposée non décimale, ou illisible : refusée
  return PRIVEES6.check(s, 'ipv6');
}

// Nom écrit en minuscules, sans point final ; null s'il n'est pas un nom de domaine (une adresse IP n'en est pas un).
export function nomPropre(h) {
  const s = String(h ?? '').trim().toLowerCase().replace(/\.$/, '');
  return NOM.test(s) ? s : null;
}

// Entrée de la liste : « nom », « nom:port » ou « *.domaine[:port] » (tous les sous-domaines, pas le domaine lui-même).
// Port par défaut : 443.
export function entree(texte) {
  const m = /^(\*\.)?([^:\s]+)(?::(\d{1,5}))?$/.exec(String(texte ?? '').trim().toLowerCase());
  if (!m) return null;
  const nom = nomPropre(m[2]);
  const port = m[3] ? Number(m[3]) : 443;
  if (!nom || port < 1 || port > 65535) return null;
  return { nom, port, sous: Boolean(m[1]), texte: `${m[1] || ''}${nom}:${port}` };
}

// Nom et port d'une adresse (https://…, smtps://…, smtp://…), ou null (adresse illisible, ou nom interne sans point :
// service de la pile, joint sans le mandataire).
function depuisUrl(url, ports = { 'https:': 443, 'http:': 80, 'smtps:': 465, 'smtp:': 587 }) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  const nom = nomPropre(u.hostname);
  if (!nom || !nom.includes('.')) return null;
  return entree(`${nom}:${u.port || ports[u.protocol] || 443}`);
}

// Liste autorisée d'après les réglages du site (même .env) : [{ nom, port, sous, texte, pour }].
export function listeAutorisee(env = process.env) {
  const out = [];
  const add = (e, pour) => { if (e && !out.some(x => x.texte === e.texte)) out.push({ ...e, pour }); };
  if (env.OIDC_ISSUER) add(depuisUrl(env.OIDC_ISSUER), 'connexion (OIDC_ISSUER)');
  const tsa = env.TSA_URL === 'off' ? null : env.TSA_URL || 'https://freetsa.org/tsr';
  if (tsa) add(depuisUrl(tsa), 'horodatage des preuves (TSA_URL)');
  if (env.SMTP_URL) add(depuisUrl(env.SMTP_URL), 'e-mails (SMTP_URL)');
  if (env.INSTAGRAM_APP_ID) for (const n of ['graph.instagram.com', 'api.instagram.com']) add(entree(n), 'Instagram');
  // Modèles des descriptions et des séries : téléchargés une fois (redirigés vers les serveurs de fichiers de Hugging Face,
  // *.hf.co) ; SORTIE_HUGGINGFACE=0 une fois les modèles dans /data.
  if (env.SORTIE_HUGGINGFACE !== '0') for (const n of ['huggingface.co', '*.huggingface.co', '*.hf.co']) add(entree(n), 'modèles (Hugging Face)');
  if (env.TRANSLATE_URL) add(depuisUrl(env.TRANSLATE_URL), 'traduction (TRANSLATE_URL externe)');
  for (const n of String(env.SORTIE_NOMS || '').split(/[,\s]+/).filter(Boolean)) {
    const e = entree(n);
    if (!e) throw new Error(`SORTIE_NOMS : entrée illisible « ${n.slice(0, 80)} » (nom, nom:port ou *.domaine)`);
    add(e, 'SORTIE_NOMS');
  }
  return out;
}

export function autorise(liste, nom, port) {
  return liste.some(e => e.port === port && (e.sous ? nom.endsWith(`.${e.nom}`) : nom === e.nom));
}

// Journal en lignes JSON, borné (renommé en .1 au-delà de max octets). Sans fichier : sortie standard.
export function createJournal({ fichier = null, max = 10 * 1024 * 1024, now = Date.now, sortie = process.stdout } = {}) {
  let fd = null, taille = 0;
  const ouvrir = () => { fd = fs.openSync(fichier, 'a', 0o644); taille = fs.fstatSync(fd).size; };
  if (fichier) { fs.mkdirSync(path.dirname(fichier), { recursive: true }); ouvrir(); }
  return {
    ecrire(evt, champs = {}) {
      const ligne = `${JSON.stringify({ t: new Date(now()).toISOString(), evt, ...champs })}\n`;
      if (!fichier) { sortie.write(ligne); return; }
      try {
        if (taille + ligne.length > max) { fs.closeSync(fd); fs.renameSync(fichier, `${fichier}.1`); ouvrir(); }
        fs.writeSync(fd, ligne);
        taille += Buffer.byteLength(ligne);
      } catch (err) { process.stderr.write(`mandataire : journal non écrit (${err.code || err.message})\n`); }
    },
    fermer() { if (fd != null) { fs.closeSync(fd); fd = null; } },
  };
}

// Demande lue sur la connexion du client : ligne de requête et en-têtes (8 Ko au plus), puis ce qui suit déjà (début du
// TLS que certains clients envoient sans attendre la réponse).
function lireEntete(socket) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const fin = (err, v) => { clearTimeout(minuteur); socket.off('data', data); socket.off('error', erreur); socket.off('end', vide); if (err) reject(err); else resolve(v); };
    const data = d => {
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i >= 0) { socket.pause(); fin(null, { tete: buf.subarray(0, i).toString('latin1'), reste: buf.subarray(i + 4) }); }
      else if (buf.length > ENTETE_MAX) fin(Object.assign(new Error('en-tête trop long'), { raison: 'en-tête trop long' }));
    };
    const erreur = err => fin(err);
    const vide = () => fin(Object.assign(new Error('connexion fermée'), { raison: 'connexion fermée' }));
    const minuteur = setTimeout(() => fin(Object.assign(new Error('délai'), { raison: 'en-tête trop lent' })), DELAI_ENTETE);
    socket.on('data', data); socket.on('error', erreur); socket.on('end', vide);
  });
}

// Le mandataire : { serveur, liste, fermer() }. resolve(nom) → [adresses] (remplaçable pour les essais).
export function createMandataire({ liste, journal, prive = false, resolve = async n => (await dns.lookup(n, { all: true, verbatim: true })).map(a => a.address),
  connect = (host, port) => net.connect({ host, port }), now = Date.now } = {}) {
  let actives = 0;
  const serveur = net.createServer({ pauseOnConnect: false }, async client => {
    const source = String(client.remoteAddress || '').replace(/^::ffff:/, '');
    const debut = now();
    if (actives >= CONNEXIONS_MAX) { journal.ecrire('echec', { hote: null, port: null, raison: 'trop de connexions', client: source }); client.destroy(); return; }
    actives += 1;
    client.once('close', () => { actives -= 1; });
    client.on('error', () => {});
    // « refus » : la demande sort de ce qui est permis (nom hors liste, adresse privée…), ce que la Vigie signale ; « echec » :
    // une demande permise qui n'aboutit pas (nom introuvable, serveur injoignable, client trop lent), comptée sans alerte.
    const refuser = (hote, port, raison, statut = '403 Forbidden', evt = statut.startsWith('403') || statut.startsWith('400') ? 'refus' : 'echec') => {
      journal.ecrire(evt, { hote, port, raison, client: source });
      client.end(`HTTP/1.1 ${statut}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    };
    let demande;
    try { demande = await lireEntete(client); } catch (err) { if (err.raison && err.raison !== 'connexion fermée') refuser(null, null, err.raison, '400 Bad Request', err.raison === 'en-tête trop lent' ? 'echec' : 'refus'); else client.destroy(); return; }
    const [methode, cible] = demande.tete.split('\r\n')[0].split(' ');
    if (methode !== 'CONNECT') {
      // HTTP en clair : jamais relayé (le site ne sort qu'en HTTPS) ; le nom seul est noté, jamais le chemin.
      let hote = null;
      try { hote = nomPropre(new URL(cible).hostname) || clip(new URL(cible).hostname); } catch { /* cible illisible */ }
      refuser(hote, null, /^[A-Z]{3,10}$/.test(methode || '') ? 'http en clair' : 'demande illisible');
      return;
    }
    const m = /^\[?([^\]\s]+?)\]?:(\d{1,5})$/.exec(cible || '');
    const port = m ? Number(m[2]) : null;
    const nom = m ? nomPropre(m[1]) : null;
    if (!m || !port || port > 65535) { refuser(clip(cible), null, 'demande illisible', '400 Bad Request'); return; }
    if (!nom) { refuser(clip(m[1]), port, net.isIP(m[1]) ? 'adresse ip sans nom' : 'nom illisible'); return; }
    if (!autorise(liste, nom, port)) { refuser(nom, port, 'hors liste'); return; }
    let adresses;
    try { adresses = await resolve(nom); } catch { refuser(nom, port, 'nom introuvable', '502 Bad Gateway'); return; }
    if (!adresses.length) { refuser(nom, port, 'nom introuvable', '502 Bad Gateway'); return; }
    if (!prive && adresses.some(estPrivee)) { refuser(nom, port, 'adresse privée'); return; }
    const amont = connect(adresses[0], port);
    let envoyes = 0, recus = 0, etabli = false;
    const delai = setTimeout(() => amont.destroy(Object.assign(new Error('délai'), { code: 'ETIMEDOUT' })), DELAI_CONNEXION);
    amont.once('connect', () => {
      clearTimeout(delai);
      etabli = true;
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (demande.reste.length) { envoyes += demande.reste.length; amont.write(demande.reste); }
      client.on('data', d => { envoyes += d.length; });
      amont.on('data', d => { recus += d.length; });
      client.pipe(amont); amont.pipe(client);
      client.resume();
      client.setTimeout(INACTIVITE, () => client.destroy());
    });
    amont.once('error', err => {
      clearTimeout(delai);
      if (!etabli) refuser(nom, port, `connexion impossible (${err.code || 'erreur'})`, '502 Bad Gateway');
      else client.destroy();
    });
    amont.once('close', () => {
      if (etabli) { journal.ecrire('accepte', { hote: nom, port, client: source, octets_envoyes: envoyes, octets_recus: recus, duree_ms: now() - debut }); client.destroy(); }
    });
    client.once('close', () => amont.destroy());
  });
  const battement = setInterval(() => journal.ecrire('battement', { noms: liste.length, connexions: actives }), BATTEMENT);
  battement.unref();
  return { serveur, liste, actives: () => actives, fermer: () => new Promise(r => { clearInterval(battement); serveur.close(() => r()); }) };
}

const clip = v => (v == null ? null : String(v).replace(/[^\x20-\x7e]/g, '?').slice(0, 120));

const principal = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); } catch { return false; } })();
if (principal) {
  const port = Number(process.env.SORTIE_PORT || 3128);
  if (process.argv[2] === '--sante') {
    // Contrôle de santé de Compose : le port répond.
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.end(); process.exit(0); });
    s.on('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 3000).unref();
  } else {
    let liste;
    try { liste = listeAutorisee(process.env); } catch (err) { console.error(`Démarrage refusé : ${err.message}`); process.exit(1); }
    delete process.env.SMTP_URL;                     // seul secret reçu : le nom et le port suffisent
    const journal = createJournal({ fichier: process.env.SORTIE_JOURNAL || null, max: Number(process.env.SORTIE_JOURNAL_MAX) || 10 * 1024 * 1024 });
    const m = createMandataire({ liste, journal, prive: process.env.SORTIE_PRIVE === '1' });
    m.serveur.listen(port, process.env.SORTIE_HOTE || '0.0.0.0', () => {
      journal.ecrire('demarrage', { noms: liste.map(e => `${e.sous ? '*.' : ''}${e.nom}:${e.port}`), prive: process.env.SORTIE_PRIVE === '1' });
      process.stdout.write(`Mandataire de sortie : port ${port}, ${liste.length} nom(s) autorisé(s) : ${liste.map(e => e.texte).join(', ') || 'aucun'}\n`);
    });
    for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, async () => { await m.fermer(); journal.fermer(); process.exit(0); });
  }
}
