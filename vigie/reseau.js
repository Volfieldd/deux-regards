import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import { clean } from './util.js';

// Source « réseau » de la Vigie (phase E4 ; registre des briques, BV-10 et BV-11 ; décisions D24 et D25) : la Vigie lit,
// en lecture seule et sans passer par le site, deux journaux écrits hors de lui :
//   - celui du mandataire de sortie (deploy/unraid/reseau/mandataire.js, une ligne JSON par demande) : un nom hors de la
//     liste autorisée demandé par le site → reseau_sortie_refusee ;
//   - celui des rejets de l'hôte (règles de deploy/unraid/reseau/regles.sh, rangées par rsyslog) : une connexion d'un
//     conteneur de la pile vers Internet sans le mandataire → reseau_sortie_directe ; un paquet entre deux conteneurs
//     hors des flux voulus → reseau_flux_hors_liste ; un battement horaire dit si les règles sont en place.
// Confiance « constaté » : un site compromis ne contrôle ni le mandataire ni le pare-feu de l'hôte.
// Lecture en suivant : position (inode et octet) gardée dans les réglages, dans la même transaction que les événements
// (un arrêt brutal ne crée ni doublon ni trou) ; rotation (fichier renommé en « .1 » : sa fin est lue avant le nouveau) et
// troncature reconnues ; 1 Mo lu au plus par passage, une ligne de plus de 8 Ko ignorée ; au-delà de 32 Mo de retard, le
// milieu est sauté et signalé. Les lignes d'un passage sont regroupées (même nature, même source, même destination) en
// un événement qui compte les autres (detail.nombre, comme les résumés du site, D23).
// Silence (vigie_reseau_silence) : journal illisible ; aucune ligne depuis 24 h alors que le site tourne (le mandataire
// et le script des règles écrivent chacun un battement par heure) ; règles de l'hôte absentes ou incomplètes.

const LU_MAX = 1024 * 1024;
const RETARD_MAX = 32 * 1024 * 1024;
const LIGNE_MAX = 8 * 1024;
const SILENCE = 24 * 3600e3;
const SITE_VIVANT = 10 * 60e3;                    // battement du site attendu chaque minute

// Adresses de la pile (deploy/unraid/compose.yaml), remplaçables par VIGIE_RESEAU_NOMS (« nom=adresse[/préfixe],… »).
export const NOMS_DEFAUT = 'cloudflared=172.29.42.10,vigie=172.29.42.20,site=172.29.42.30,traduction=172.29.42.40,vigie-reception=172.29.43.10,'
  + 'sortie=172.29.44.10,site=172.29.43.0/24,site=172.29.44.0/24,pile=172.29.42.0/24';

// « nom=adresse[/préfixe],… » → fonction adresse → nom (préfixe le plus long d'abord ; inconnue : null).
export function nommeur(texte = NOMS_DEFAUT) {
  const entrees = [];
  for (const part of String(texte).split(',').map(s => s.trim()).filter(Boolean)) {
    const m = /^([a-z][a-z0-9-]{0,30})=(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(part);
    if (!m || !net.isIPv4(m[2]) || (m[3] && (Number(m[3]) < 8 || Number(m[3]) > 32))) throw new Error(`VIGIE_RESEAU_NOMS : entrée illisible « ${part.slice(0, 60)} » (nom=adresse ou nom=réseau/préfixe)`);
    const bl = new net.BlockList();
    bl.addSubnet(m[2], Number(m[3] ?? 32), 'ipv4');
    entrees.push({ nom: m[1], prefixe: Number(m[3] ?? 32), bl });
  }
  entrees.sort((a, b) => b.prefixe - a.prefixe);
  return ip => (net.isIPv4(String(ip)) ? entrees.find(e => e.bl.check(ip, 'ipv4'))?.nom ?? null : null);
}

// ---------------------------------------------------------------------------------------------------------------------
// Lecture des lignes

const NOM_HOTE = /^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const port = v => (Number.isInteger(v) && v >= 1 && v <= 65535 ? v : null);
const quand = (v, d) => { const t = Date.parse(v); return Number.isFinite(t) ? t : d; };

// Ligne du mandataire (JSON) : { t, evt, hote, port, raison, client, … } relue et bornée ; null si illisible.
export function lireLigneMandataire(ligne, { now = Date.now() } = {}) {
  let x;
  try { x = JSON.parse(ligne); } catch { return null; }
  if (!x || typeof x !== 'object' || !['refus', 'echec', 'accepte', 'battement', 'demarrage'].includes(x.evt)) return null;
  const hote = typeof x.hote === 'string' ? (NOM_HOTE.test(x.hote) ? x.hote : clean(x.hote, 120)) : null;
  return {
    t: quand(x.t, now), evt: x.evt, hote, port: port(x.port), raison: clean(x.raison, 80), client: net.isIP(String(x.client || '')) ? String(x.client) : null,
    octets_envoyes: Number.isSafeInteger(x.octets_envoyes) ? x.octets_envoyes : null, octets_recus: Number.isSafeInteger(x.octets_recus) ? x.octets_recus : null,
    noms: Array.isArray(x.noms) ? x.noms.slice(0, 50).map(n => clean(n, 120)).filter(Boolean) : null,
  };
}

// Ligne de rsyslog : horodatage RFC 3339 (modèle RSYSLOG_FileFormat, posé par regles.sh --rsyslog) ou classique
// (« Oct 19 10:12:01 », année courante, heure lue comme UTC), puis le message du noyau (« [12.345] » facultatif) :
//   NICEPHOS-SORTIE IN=br-… OUT=eth0 … SRC=172.29.42.30 DST=203.0.113.9 … PROTO=TCP SPT=40000 DPT=4444 …
// ou le battement du script : NICEPHOS-BATTEMENT etat=ok regles=14 attendues=14 version=1.
const MOIS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
export function lireLigneHote(ligne, { now = Date.now() } = {}) {
  const s = String(ligne);
  const m = /\bNICEPHOS-(SORTIE|FLUX|BATTEMENT)\b(.*)$/.exec(s);
  if (!m) return null;
  let t = now;
  const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s/.exec(s);
  const bsd = /^([A-Z][a-z]{2})\s+(\d{1,2})\s(\d{2}):(\d{2}):(\d{2})\s/.exec(s);
  if (iso) t = quand(iso[1], now);
  else if (bsd && Object.hasOwn(MOIS, bsd[1])) {
    const y = new Date(now).getUTCFullYear();
    t = Date.UTC(y, MOIS[bsd[1]], Number(bsd[2]), Number(bsd[3]), Number(bsd[4]), Number(bsd[5]));
    if (t > now + 864e5) t = Date.UTC(y - 1, MOIS[bsd[1]], Number(bsd[2]), Number(bsd[3]), Number(bsd[4]), Number(bsd[5]));
  }
  const champs = {};
  for (const [, k, v] of m[2].matchAll(/\b([A-Za-z]+)=(\S*)/g)) if (!Object.hasOwn(champs, k)) champs[k] = v;
  if (m[1] === 'BATTEMENT') {
    const etat = ['ok', 'absentes', 'incompletes'].includes(champs.etat) ? champs.etat : 'illisible';
    const n = v => (/^\d{1,4}$/.test(v || '') ? Number(v) : null);
    return { t, nature: 'battement', etat, regles: n(champs.regles), attendues: n(champs.attendues) };
  }
  if (!net.isIPv4(champs.SRC || '') || !net.isIPv4(champs.DST || '')) return null;
  const proto = /^[A-Za-z0-9]{1,10}$/.test(champs.PROTO || '') ? champs.PROTO.toLowerCase() : null;
  const dpt = /^\d{1,5}$/.test(champs.DPT || '') ? port(Number(champs.DPT)) : null;
  const iface = v => (/^[A-Za-z0-9._@-]{1,20}$/.test(v || '') ? v : null);
  return { t, nature: m[1] === 'SORTIE' ? 'sortie' : 'flux', src: champs.SRC, dst: champs.DST, proto, dpt, entree: iface(champs.IN), sortie: iface(champs.OUT) };
}

// Lignes complètes ajoutées à un fichier depuis la position gardée ({ ino, pos }) : { lignes, position, rotation,
// troncature, saute, erreur, absent }. Ne lit que des fichiers ordinaires.
export function lireSuite(fichier, position, { max = LU_MAX, retard = RETARD_MAX } = {}) {
  let st;
  try { st = fs.statSync(fichier); } catch (err) { return { lignes: [], position, absent: err.code === 'ENOENT', erreur: err.code || 'illisible' }; }
  if (!st.isFile()) return { lignes: [], position, erreur: 'pas un fichier ordinaire' };
  const out = { lignes: [], rotation: false, troncature: false, saute: 0, erreur: null };
  let budget = max;
  // Lit [debut, fin[ de file et rend les lignes complètes ; coupe : la première ligne est un morceau (lecture au milieu).
  const morceau = (file, debut, fin, coupe) => {
    const n = Math.min(fin - debut, budget);
    if (n <= 0) return debut;
    const buf = Buffer.alloc(n);
    let fd;
    try { fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)); fs.readSync(fd, buf, 0, n, debut); } finally { if (fd != null) fs.closeSync(fd); }
    let fait = 0;
    let i = buf.indexOf(10);
    if (coupe && i >= 0) { fait = i + 1; i = buf.indexOf(10, fait); }
    while (i >= 0) {
      if (i - fait <= LIGNE_MAX) out.lignes.push(buf.subarray(fait, i).toString('utf8'));
      fait = i + 1;
      i = buf.indexOf(10, fait);
    }
    // Rien de complet dans tout le morceau lu (ligne démesurée) : passé, pour ne jamais rester bloqué.
    if (fait === 0 && n === budget && n > LIGNE_MAX) fait = n;
    budget -= fait;
    return debut + fait;
  };
  let p = position && Number.isFinite(position.pos) ? { ...position } : null;
  let coupe = false;
  if (!p) { p = { ino: st.ino, pos: Math.max(0, st.size - max) }; coupe = p.pos > 0; }
  else if (p.ino !== st.ino) {
    // Rotation : la fin de l'ancien fichier (renommé en .1) d'abord, s'il est là.
    out.rotation = true;
    try {
      const vieux = fs.statSync(`${fichier}.1`);
      if (vieux.isFile() && vieux.ino === p.ino && vieux.size > p.pos) morceau(`${fichier}.1`, p.pos, vieux.size, false);
    } catch { /* ancien fichier parti */ }
    p = { ino: st.ino, pos: 0 };
  } else if (st.size < p.pos) { out.troncature = true; p = { ino: st.ino, pos: 0 }; }
  if (st.size - p.pos > retard) { out.saute = st.size - max - p.pos; p.pos = st.size - max; coupe = true; }
  p.pos = morceau(fichier, p.pos, st.size, coupe);
  out.position = p;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Le lecteur

const EMETTEURS = { mandataire: 'mandataire de sortie', hote: 'hôte · pare-feu (DOCKER-USER)' };

export function createReseau({ store, mandataire = null, hote = null, noms = NOMS_DEFAUT, now = Date.now, log }) {
  const { setting } = store;
  const nomDe = nommeur(noms);
  const fichiers = { mandataire, hote };
  const siteVivant = t => {
    const r = store.db.prepare("SELECT recu_a FROM events WHERE type = 'sys_heartbeat' ORDER BY recu_a DESC LIMIT 1").pluck().get();
    return r != null && t - r < SITE_VIVANT;
  };

  // Événements d'un passage, regroupés.
  function evenements(source, lignes, t) {
    const groupes = new Map();
    const etat = {};
    const vus = setting.get('reseau_noms_acceptes', {});
    let vusChange = false;
    const grouper = (cle, ev) => {
      const g = groupes.get(cle);
      if (g) { g.nombre += 1; g.survenu_a = Math.min(g.survenu_a, ev.survenu_a); } else groupes.set(cle, { ...ev, nombre: 0 });
    };
    for (const texte of lignes) {
      if (source === 'mandataire') {
        const l = lireLigneMandataire(texte, { now: t });
        if (!l) { etat.illisibles = (etat.illisibles || 0) + 1; continue; }
        etat.derniere_ligne = Math.max(etat.derniere_ligne || 0, l.t);
        if (l.evt === 'battement' || l.evt === 'demarrage') etat.dernier_battement = Math.max(etat.dernier_battement || 0, l.t);
        if (l.evt === 'demarrage' && l.noms) etat.liste = l.noms;
        if (l.evt === 'accepte' && l.hote) {
          const k = `${l.hote}:${l.port ?? ''}`;
          vus[k] = { at: l.t, n: (vus[k]?.n || 0) + 1 };
          vusChange = true;
        }
        // Demande permise qui n'aboutit pas (serveur injoignable…) : comptée, sans événement.
        if (l.evt === 'echec') etat.echecs = (etat.echecs || 0) + 1;
        if (l.evt === 'refus') {
          grouper(`refus|${l.hote}|${l.port}|${l.raison}`, { type: 'reseau_sortie_refusee', survenu_a: l.t,
            detail: { hote: l.hote, port: l.port, raison: l.raison, client: l.client, client_nom: nomDe(l.client) } });
        }
      } else {
        const l = lireLigneHote(texte, { now: t });
        if (!l) { etat.illisibles = (etat.illisibles || 0) + 1; continue; }
        etat.derniere_ligne = Math.max(etat.derniere_ligne || 0, l.t);
        if (l.nature === 'battement') { etat.battement = { at: l.t, etat: l.etat, regles: l.regles, attendues: l.attendues }; continue; }
        const detail = { source: l.src, source_nom: nomDe(l.src) || 'inconnue', destination: l.dst, destination_nom: nomDe(l.dst), port: l.dpt, proto: l.proto, sortie: l.sortie };
        grouper(`${l.nature}|${l.src}|${l.dst}|${l.dpt}|${l.proto}`, { type: l.nature === 'sortie' ? 'reseau_sortie_directe' : 'reseau_flux_hors_liste', survenu_a: l.t, detail });
      }
    }
    if (vusChange) {
      // 200 noms acceptés au plus, les plus récents.
      const garde = Object.entries(vus).sort((a, b) => b[1].at - a[1].at).slice(0, 200);
      etat.noms_acceptes = Object.fromEntries(garde);
    }
    const out = [...groupes.values()].map(g => ({
      id: crypto.randomUUID(), recu_a: t, survenu_a: g.survenu_a, type: g.type, severity: g.type === 'reseau_sortie_refusee' ? 'moyen' : 'haut',
      composant: 'réseau', emetteur: EMETTEURS[source], canal: 'journal en lecture seule', confiance: 'constaté', reference: `reseau:${source}`,
      detail: JSON.stringify(g.nombre ? { ...g.detail, nombre: g.nombre } : g.detail),
    }));
    return { out, etat };
  }

  // Un passage : lit les deux journaux, écrit les événements et les positions ensemble, puis contrôle le silence. Chaque
  // journal est lu dans une transaction immédiate (position relue dedans) : la ligne de commande (« reseau --lire ») et le
  // service ne lisent jamais deux fois les mêmes lignes.
  function lire() {
    const t = now();
    let n = 0;
    const sautes = [];
    for (const source of ['mandataire', 'hote']) {
      const fichier = fichiers[source];
      if (!fichier) continue;
      store.db.transaction(() => {
        const tout = setting.get('reseau_etat', {});
        const avant = tout[source] || {};
        const e = { ...avant, fichier, lu_a: t, debut: avant.debut ?? t };
        const r = lireSuite(fichier, avant.position || null);
        e.erreur = r.erreur && !r.absent ? r.erreur : null;
        e.absent = Boolean(r.absent);
        if (!r.erreur) {
          e.position = r.position;
          const ev = evenements(source, r.lignes, t);
          for (const k of ['derniere_ligne', 'dernier_battement']) if (ev.etat[k]) e[k] = Math.max(e[k] || 0, ev.etat[k]);
          if (ev.etat.battement) e.battement = ev.etat.battement;
          if (ev.etat.liste) e.liste = ev.etat.liste;
          if (ev.etat.illisibles) e.illisibles = (e.illisibles || 0) + ev.etat.illisibles;
          if (ev.etat.echecs) e.echecs = (e.echecs || 0) + ev.etat.echecs;
          if (r.rotation) e.rotations = (e.rotations || 0) + 1;
          if (r.troncature) e.troncatures = (e.troncatures || 0) + 1;
          if (ev.etat.noms_acceptes) setting.set('reseau_noms_acceptes', ev.etat.noms_acceptes);
          if (ev.out.length) n += store.add(ev.out);
          if (r.saute) sautes.push([source, r.saute]);
        }
        setting.set('reseau_etat', { ...tout, [source]: e });
      }).immediate();
    }
    for (const [source, saute] of sautes) silence(source, `journal trop rapide : ${Math.round(saute / 1024)} Ko sautés`, t, { une_fois: true });
    controler(t, setting.get('reseau_etat', {}));
    return n;
  }

  // Silence d'un journal : signalé une fois, jusqu'à ce que la cause disparaisse.
  const signales = () => setting.get('reseau_silence_signale', {});
  function silence(source, raison, t, { une_fois = false, depuis = null } = {}) {
    const s = signales();
    if (!une_fois) { if (s[source]) return; setting.set('reseau_silence_signale', { ...s, [source]: raison }); }
    log?.warn({ journal: source, raison }, 'Vigie : journal réseau');
    store.own('vigie_reseau_silence', { emetteur: 'vigie/reseau.js', detail: { journal: source, raison, depuis: depuis ? new Date(depuis).toISOString().slice(0, 16) : undefined } });
  }
  function controler(t, tout) {
    const vivant = siteVivant(t);
    for (const source of ['mandataire', 'hote']) {
      if (!fichiers[source]) continue;
      const e = tout[source] || {};
      const derniere = e.derniere_ligne ?? e.debut ?? t;
      let raison = null, depuis = null;
      if (e.erreur) raison = `journal illisible (${e.erreur})`;
      else if (source === 'hote' && e.battement && e.battement.etat !== 'ok') { raison = `règles de l'hôte ${e.battement.etat}`; depuis = e.battement.at; }
      else if (t - derniere > SILENCE && vivant) { raison = e.absent ? 'journal absent depuis 24 h' : 'aucune ligne depuis 24 h'; depuis = derniere; }
      if (raison) silence(source, raison, t, { depuis });
      else if (signales()[source]) { const s = signales(); delete s[source]; setting.set('reseau_silence_signale', s); }
    }
  }

  return { lire, fichiers, nomDe };
}
