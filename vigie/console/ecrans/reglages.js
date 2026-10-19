// Écran « Règles et réglages » de la console (MV-06, /reglages), phase D3c : les trois interrupteurs, les seuils du score, les
// adresses de confiance, les canaux de notification et leur essai, le mode de chaque règle. Cette page LIT seulement ; les
// formulaires postent vers les routes d'action (vigie/console/actions.js), qui vérifient le droit, relisent le plafond,
// redemandent l'identité s'il le faut, font le geste et reviennent ici avec un message (fait, ou refusé : raison, champ,
// valeurs saisies). Chaque formulaire porte un champ caché « formulaire » (son nom) : un refus revient près du bon formulaire,
// la saisie reprise.
//
// Les formulaires ne sont montrés qu'à qui a le droit (droits.js : « reglages » pour les interrupteurs, les modes et les seuils,
// « confiance » pour les adresses de confiance (Administrateur), « verifications » pour l'essai d'un canal) ; Lecteur et
// Intervenant voient l'état, en lecture seule ; l'Analyste voit les adresses de confiance sans pouvoir les changer.
// Pas de page de confirmation à part : réduire la surveillance (arrêter un interrupteur ou une règle, descendre d'un mode,
// relever un seuil, ajouter une adresse de confiance) passe par un dépliant (<details>) qui dit ce qui ne sera plus vu, le
// motif, la durée et l'identité redemandée ; le serveur exige déjà le motif, la durée et la ré-authentification.
// Les canaux : « réglé » ou « non réglé » et, au plus, un indice court masqué ; jamais un numéro, une adresse e-mail ni un
// identifiant de groupe.
import { fileURLToPath } from 'node:url';
import { loadRules } from '../../sigma.js';
import { LISTS } from '../../menaces.js';
import { THRESHOLDS } from '../../poids.js';
import { DETECTEURS } from '../../detecteurs.js';
import { can, LABELS } from '../droits.js';
import { FRESH } from '../sessions.js';
import { FINE, NBSP, adresseDetail, dateHeure, gravite, guillemets, heure, jusqua, masquer, quand } from '../format.js';
import { ENTITES, MODES, lire, pluriel, titreDe, typo, virgule } from '../lexique.js';
import { sansContacts } from '../../util.js';
import { INTERRUPTEURS, cartesInterrupteurs, surveillanceReduite } from '../vue-ensemble.js';

const D = `${FINE}: `;
const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const sansConsole = s => String(s).replace(/^console · /, '');

const ORDRE_MODES = ['arret', 'observer', 'alerter', 'bloquer'];
export const GRAVITES_FILTRE = { critique: 'Critique', haut: 'Haute', moyen: 'Moyenne', bas: 'Basse' };
export const SEUILS = { ip: 'Adresse', reseau: 'Réseau', compte: 'Compte', session: 'Session', appareil: 'Appareil' };
// Durées proposées pour l'arrêt d'une règle (actions.js : 30min, 2h, 24h, 7j… ; 7 jours au plus).
export const DUREES_REGLE = [['1h', `1${NBSP}h`], ['4h', `4${NBSP}h`], ['24h', `24${NBSP}h`], ['7j', `7${NBSP}jours`]];
// Durées d'un interrupteur : les autres en contour, la durée proposée (pleine) en dernier.
export const DUREES_INTER = { autres: [['1h', `1${NBSP}h`], ['24h', `24${NBSP}h`]], proposee: ['4h', `4${NBSP}h`] };

const ENT = { ...ENTITES, entite: 'l’entité visée' };
const REP = { geler_et_revoquer: `en Bloquer${FINE}: geler 24${NBSP}h, fermer les sessions`, revoquer_compte: `en Bloquer${FINE}: fermer les sessions du compte`,
  bloquer_ip: `en Bloquer${FINE}: bloquer l’adresse 24${NBSP}h` };
const CAS_CLAIR = { quorum: 'score', MV11: 'intégrité de la Vigie' };
export const FIGEE = 'sigma.surveillance_reduite';

// Ce que les fichiers de règles disent de chaque règle Sigma (gravité, points, entité, réponse), relu une fois : vigie/regles,
// comme le moteur.
let metaLue = null;
function metaSigma() {
  if (!metaLue) {
    metaLue = new Map();
    try {
      const { rules, correlations } = loadRules(fileURLToPath(new URL('../../regles/', import.meta.url)));
      for (const r of [...rules, ...correlations]) {
        metaLue.set(`sigma.${r.name}`, { gravite: r.gravite, graviteEvenement: r.graviteEvenement, sourceUnique: r.sourceUnique, points: r.points,
          entite: r.entite?.kind, reponse: r.reponse, contexte: r.contexte });
      }
    } catch { /* règles illisibles : la page montre ce que le moteur dit */ }
  }
  return metaLue;
}

// Ce que dépose une règle : un détecteur, son barème (vigie/detecteurs.js, DETECTEURS, celui du moteur ; engine.rules() ne
// le dit pas) ; une règle Sigma, son fichier.
function metaDe(r) {
  if (r.id === 'entite.score') return { classe: 'score', gravite: 'moyen' };
  const det = r.id.startsWith('detecteur.') ? DETECTEURS[r.id.slice(10)] : null;
  const m = det || metaSigma().get(r.id) || { gravite: null, sourceUnique: Boolean(r.sourceUnique) };
  return { ...m, classe: m.sourceUnique ? 'seule' : 'points' };
}

const ordre = r => {
  const c = String(r.cas || '');
  if (/^DS\d+$/.test(c)) return [0, Number(c.slice(2))];
  return [c === 'quorum' ? 1 : 2, 0];
};
const compare = (a, b) => { const x = ordre(a), y = ordre(b); return x[0] - y[0] || x[1] - y[1] || a.titre.localeCompare(b.titre, 'fr'); };

// Filtres de la liste des règles (GET, sans script) : recherche (titre, identifiant ou cas), gravité, mode. Une valeur
// inconnue est ignorée.
export function lireFiltres(query = {}) {
  const s = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '');
  const q = s(query.q).slice(0, 100);
  const g = s(query.gravite), m = s(query.mode);
  const f = { q, gravite: Object.hasOwn(GRAVITES_FILTRE, g) ? g : '', mode: Object.hasOwn(MODES, m) ? m : '' };
  f.actifs = (f.q ? 1 : 0) + (f.gravite ? 1 : 0) + (f.mode ? 1 : 0);
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.gravite) p.set('gravite', f.gravite);
  if (f.mode) p.set('mode', f.mode);
  f.qs = p.toString() ? `?${p}` : '';
  return f;
}

// Le refus d'une action qui revient à ce formulaire (son nom, champ caché « formulaire »), avec le champ fautif quand il
// est l'un des siens : le nom donné par l'action, sinon deviné du texte (les refus du moteur et des interrupteurs ne nomment
// pas leur champ). Rend { texte, champ (null : erreur du formulaire), valeurs } ou null.
export function refusDe(message, formulaire, champs = []) {
  if (!message || message.k !== 'erreur' || !message.valeurs || message.valeurs.formulaire !== formulaire) return null;
  const texte = String(message.texte || '');
  let champ = champs.includes(message.champ) ? message.champ : null;
  if (!champ) {
    for (const [re, c] of [[/motif/i, 'motif'], [/adresse IP|adresse exacte/i, 'ip'], [/durée/i, 'duree_libre'], [/durée/i, 'duree']]) {
      if (re.test(texte) && champs.includes(c)) { champ = c; break; }
    }
  }
  return { texte, champ, valeurs: message.valeurs };
}

// L'identité confirmée (en-tête des pages qui agissent) : « Identité confirmée à 14 h 17, valable jusqu’à 14 h 22 ».
export function identiteDe(authA, t) {
  if (!Number.isFinite(authA)) return null;
  const fin = authA + FRESH;
  return fin > t ? { texte: `Identité confirmée à ${heure(authA)}, valable jusqu’à ${heure(fin)}`, fraiche: true, fin: heure(fin) }
    : { texte: `Identité confirmée à ${heure(authA)}${FINE}; redemandée au prochain geste sensible`, fraiche: false };
}

// Indice court d'un numéro : ses deux derniers chiffres (« …78 ») ; rien d'autre du numéro, de l'adresse ou du groupe.
const finNumero = n => { const m = /(\d{2})$/.exec(String(n || '')); return m ? `…${m[1]}` : null; };
// Le texte d'une erreur d'envoi, sans adresse e-mail, numéro ni identifiant de groupe (vigie/util.js, sansContacts : le même
// masque qu'à l'écriture de l'événement, repris ici pour les anciens), adresses IP tronquées selon le rôle.
export const erreurEnvoi = (s, role) => typo(masquer(sansContacts(String(s || '').slice(0, 300)), role).slice(0, 200));

const requetesCache = new WeakMap();
function requetes(db) {
  let q = requetesCache.get(db);
  if (!q) {
    // Les 300 derniers d'un type, par l'index (type, recu_a).
    q = { derniers: db.prepare('SELECT recu_a, emetteur, detail FROM events WHERE type = ? ORDER BY recu_a DESC LIMIT 300') };
    requetesCache.set(db, q);
  }
  return q;
}

export function vueReglages({ db, store, engine, switches, notifications, now = Date.now, role, query = {}, message = null, authA = null }) {
  const t = now();
  const peut = { reglages: Boolean(role) && can(role, 'reglages'), essais: Boolean(role) && can(role, 'verifications'), confiance: Boolean(role) && can(role, 'confiance') };
  const lecteur = !role || role === 'viewer';
  const q = requetes(db);
  const identite = identiteDe(authA, t);

  // ---------- Interrupteurs ----------
  const etat = switches?.state?.() || {};
  const ouvrir = typeof query.arreter === 'string' ? query.arreter : '';
  const interrupteurs = cartesInterrupteurs({ etat, reduite: surveillanceReduite(db), t, role }).map(c => {
    const refus = refusDe(message, `inter-${c.nom}`, ['motif', 'duree_libre']) || refusDe(message, `inter-${c.nom}-marche`, []);
    return { ...c, ouvert: c.marche && (ouvrir === c.nom || Boolean(refus)), refus,
      motif: refus?.valeurs.motif || '', dureeLibre: refus?.valeurs.duree_libre || '' };
  });

  // ---------- Seuils ----------
  const actuels = engine.thresholds();
  const refusSeuils = refusDe(message, 'seuils', [...Object.keys(SEUILS), 'motif']);
  const seuils = {
    champs: Object.entries(SEUILS).filter(([k]) => Object.hasOwn(actuels, k)).map(([k, lib]) => ({
      k, lib, depart: virgule(THRESHOLDS[k]), valeur: refusSeuils && typeof refusSeuils.valeurs[k] === 'string' ? refusSeuils.valeurs[k] : String(actuels[k]),
    })),
    refus: refusSeuils,
    motif: refusSeuils?.valeurs.motif || '',
  };

  // ---------- Adresses de confiance (échues ignorées) ----------
  const confiance = (store.setting.get('adresses_confiance', []) || []).filter(x => x && typeof x === 'object' && typeof x.ip === 'string' && x.jusqua > t)
    .sort((a, b) => a.jusqua - b.jusqua).map(x => {
      const a = adresseDetail(x.ip, role);
      // L'adresse entière ne part vers la page que pour qui peut la retirer (champ caché du formulaire) ; motif et auteur
      // masqués selon le rôle (audit D3-C2).
      return { ip: peut.confiance ? x.ip : null, texte: a.texte, v6: a.v6, tronquee: a.tronquee, jusqua: dateHeure(x.jusqua), par: x.par ? masquer(sansConsole(x.par), role) : null,
        motif: x.motif ? typo(masquer(String(x.motif).slice(0, 200), role)) : null, refus: refusDe(message, `confiance-retirer:${x.ip}`, []) };
    });
  const refusAjout = refusDe(message, 'confiance-ajouter', ['ip', 'motif']);
  const ajout = { ouvert: Boolean(refusAjout), refus: refusAjout, ip: refusAjout?.valeurs.ip || '', motif: refusAjout?.valeurs.motif || '' };

  // ---------- Canaux : réglé ou non, l'essai, le dernier essai et le dernier échec ----------
  const n = notifications || {};
  const essais = q.derniers.all('vigie_interrupteur').map(r => ({ ...r, detail: lire(r.detail) || {} })).filter(r => r.detail.essai_canal);
  const echecs = q.derniers.all('vigie_canal_echec').map(r => ({ ...r, detail: lire(r.detail) || {} }));
  const h = heure(t);
  const canal = (k, titre, regle, kv, texte, env) => {
    const essai = essais.find(r => r.detail.essai_canal === k);
    const echec = echecs.find(r => r.detail.canal === k);
    if (regle) {
      kv.push({ dt: 'Dernier essai', t: essai ? quand(essai.recu_a, t) : 'aucun', sec: essai?.emetteur ? `par ${masquer(sansConsole(essai.emetteur), role)}` : null });
      kv.push({ dt: 'Dernier échec', t: echec ? quand(echec.recu_a, t) : 'aucun noté', sec: echec ? erreurEnvoi(echec.detail.erreur, role) : null });
    }
    kv.push({ dt: 'Réglé dans', env });
    return { k, titre, regle, etat: regle ? { k: 'abouti', mot: 'Réglé' } : { k: 'neutre', mot: 'Non réglé' }, kv, texte, refus: refusDe(message, `canal-${k}`, []) };
  };
  const signal = n.signal || null, mail = n.mail || null;
  const indice = signal && peut.essais ? finNumero(signal.number) : null;
  const kvSignal = signal ? [{ dt: 'Destinataire', t: 'un groupe Signal', sec: indice ? `envoyé depuis le numéro finissant par ${indice}` : null }] : [];
  const nTo = Array.isArray(mail?.to) ? mail.to.length : 0;
  const kvMail = mail ? [{ dt: 'Destinataires', t: `${nTo} ${pluriel(nTo, 'adresse')}`, sec: 'part si Signal manque ou échoue' }] : [];
  const canaux = [
    canal('signal', 'Signal', Boolean(signal), kvSignal, `Vigie${D}essai du canal signal (${h}).`, ['VIGIE_SIGNAL_NUMERO', 'VIGIE_SIGNAL_GROUPE']),
    canal('email', 'E-mail, en secours', Boolean(mail), kvMail,
      `Objet${D}Vigie${D}essai du canal email (${h}).\n\nVigie${D}essai du canal email (${h}).\n\nVigie Nicephos — ce message ne contient aucune donnée personnelle${FINE}; le détail est dans la console.\nOuvrez la Vigie depuis votre favori${FINE}; elle ne demande jamais votre mot de passe par message.`,
      ['VIGIE_SMTP_URL', 'VIGIE_MAIL_TO']),
  ];

  // ---------- Règles ----------
  const f = lireFiltres(query);
  const modesRegles = store.setting.get('regles_modes', {}) || {};
  const titres = new Map(engine.rules().map(r => [r.id, r.titre]));
  const toutes = engine.rules().map(r => ({ ...r, titre: titreDe(r.id, titres), meta: metaDe(r) }));
  const nb = Object.fromEntries(ORDRE_MODES.map(k => [k, toutes.filter(r => r.mode === k).length]));
  const cherche = norm(f.q);
  const garde = r => (!f.gravite || r.meta.gravite === f.gravite) && (!f.mode || r.mode === f.mode)
    && (!cherche || [r.titre, r.id, r.cas, CAS_CLAIR[r.cas]].some(x => norm(x).includes(cherche)));
  const listes = Object.values(LISTS).map(l => l.points);
  const ligne = r => {
    const m = r.meta;
    const rid = `r-${r.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    // Au téléphone, les règles à points sont repliées : le retour rouvre leur tableau (ancre).
    const ancre = m.classe === 'points' ? 'regles-points' : rid;
    let grav = null, points = null;
    if (m.classe === 'score') grav = { ...gravite('moyen'), sec: 'Haute au double du seuil' };
    else if (m.classe === 'points' || !m.gravite) {
      points = m.listes ? `${listes.slice(0, -1).map(virgule).join(', ')} ou ${virgule(listes.at(-1))} ${pluriel(Math.max(...listes), 'point')}`
        : m.points != null ? `${virgule(m.points)}${NBSP}${pluriel(m.points >= 2 ? 2 : 1, 'point')}` : '—';
    } else grav = { ...gravite(m.gravite), sec: m.graviteEvenement ? 'ou celle de l’événement' : null };
    const effet = m.classe === 'score' ? { t: 'alerte au seuil, avec deux sources', sec: `en Bloquer${FINE}: bloquer l’adresse 24${NBSP}h (jamais une adresse privée, de confiance ou d’un administrateur)` }
      : m.classe === 'seule' ? { t: 'alerte seule', sec: REP[m.reponse] || null }
        : m.listes ? { t: 'jamais d’alerte seule', sec: `par liste et par jour${FINE}; jamais une source du quorum` }
          : { t: 'jamais d’alerte seule', sec: m.contexte ? `en contexte${FINE}: jamais une source du quorum` : null };
    const ent = m.classe === 'score' ? Object.keys(THRESHOLDS).map(k => ENT[k]).join(', ') : ENT[m.entite] || m.entite || '—';
    // Le mode : les règles à points n'ont qu'Arrêt et Observer (elles n'ouvrent jamais d'alerte), sauf un mode déjà réglé autrement.
    const choix = m.classe === 'points' ? ORDRE_MODES.filter(k => k === 'arret' || k === 'observer' || k === r.mode) : ORDRE_MODES;
    const refus = refusDe(message, `regle:${r.id}`, ['motif', 'duree']);
    const voulu = refus && choix.includes(refus.valeurs.mode) ? refus.valeurs.mode : r.mode;
    const options = choix.map(k => ({ v: k, mot: MODES[k] + (k === 'bloquer' && m.classe === 'seule' && !m.reponse ? ' (sans réponse)' : ''), sel: k === voulu }));
    const reglage = modesRegles[r.id];
    let enArret = null;
    if (r.mode === 'arret' && reglage && typeof reglage === 'object' && reglage.jusqua) {
      enArret = `En Arrêt ${jusqua(reglage.jusqua, t)}${reglage.par ? `, par ${masquer(sansConsole(reglage.par), role)}` : ''}${reglage.motif ? `${D}${guillemets(typo(masquer(String(reglage.motif).slice(0, 200), role)))}` : ''}${FINE}; puis ${MODES[reglage.avant] || 'son mode de départ'}.`;
    }
    const avert = m.classe === 'score' ? `Arrêt${D}plus aucune alerte de score${FINE}; les règles à points comptent, mais rien ne s’ouvre.`
      : m.classe === 'points' ? `Arrêt${D}plus de points${FINE}; qui ne fait que cela n’atteint plus le seuil.` : `Arrêt${D}plus aucune alerte, même pour une preuve sûre.`;
    return { id: r.id, rid, titre: r.titre, idCas: `${r.id} · ${CAS_CLAIR[r.cas] || r.cas || '—'}`, grav, points, ent, effet, mode: r.mode, modeMot: MODES[r.mode] || r.mode,
      fige: r.id === FIGEE, options, change: voulu !== r.mode, avert, enArret, refus,
      motif: refus?.valeurs.motif || '', duree: refus && DUREES_REGLE.some(([v]) => v === refus.valeurs.duree) ? refus.valeurs.duree : '24h',
      retour: `/reglages${f.qs}#${ancre}`, formulaire: `regle:${r.id}` };
  };
  let rang = 0;
  const groupe = (id, titre, sec, liste) => ({ id, titre, sec, n: liste.length, lignes: liste.filter(garde).sort(compare).map(r => ({ ...ligne(r), n: ++rang })) });
  const seules = toutes.filter(r => r.meta.classe === 'seule'), score = toutes.filter(r => r.meta.classe === 'score'), pts = toutes.filter(r => r.meta.classe === 'points');
  const groupes = [
    groupe('seules', 'Ouvrent une alerte d’elles-mêmes', `${seules.length} ${pluriel(seules.length, 'règle')} · une observation suffit`, seules),
    groupe('score', 'Le score d’une entité', `${score.length} ${pluriel(score.length, 'règle')} · ouvre l’alerte des règles à points`, score),
    groupe('points', 'Ajoutent des points au score', `${pts.length} ${pluriel(pts.length, 'règle')} · jamais d’alerte seules${D}Observer ou Arrêt`, pts),
  ];
  const affichees = groupes.reduce((s, g) => s + g.lignes.length, 0);
  const resume = `${[['bloquer', 'en Bloquer'], ['alerter', 'en Alerter'], ['observer', 'en Observer']].map(([k, l]) => `${nb[k]} ${l}`).join(', ')}, ${nb.arret ? `${nb.arret} en Arrêt` : 'aucune en Arrêt'}`;

  return {
    maintenant: dateHeure(t), identite, peut, lecteur, role: LABELS[role] || 'Lecteur',
    interrupteurs,
    // « blocages automatiques arrêtés jusqu’à 15 h 10 » (en-tête).
    arretes: interrupteurs.filter(c => !c.marche).map(c => `${INTERRUPTEURS[c.nom].fait.toLowerCase()} ${c.etat.mot.replace(/^Arrêt ?/, '')}`.trim()),
    reauth: identite?.fraiche ? `Votre identité est confirmée jusqu’à ${identite.fin}${FINE}; au-delà, Zitadel la redemande (mot de passe et second facteur) avant de faire le geste.`
      : 'Zitadel vous redemandera votre identité (mot de passe et second facteur) avant de faire le geste.',
    seuils, confiance, ajout, canaux,
    regles: { filtres: f, groupes, total: toutes.length, affichees, nb, resume, gravites: GRAVITES_FILTRE, modes: MODES },
    dureesRegle: DUREES_REGLE, dureesInter: DUREES_INTER,
  };
}

export function register(app, ctx) {
  const { db, store, engine, switches, now, view } = ctx;
  app.get('/reglages', async (req, reply) => {
    // Le message laissé par l'action précédente : lu ici (une fois) pour le mettre près de son formulaire, puis passé au
    // gabarit, qui le montre aussi en tête de page (layout).
    const message = ctx.isRefresh(req) ? null : ctx.sessions.takeMessage(req.moi.sid);
    const reglages = vueReglages({ db, store, engine, switches, notifications: ctx.notifications, now, role: req.moi.role, query: req.query || {}, message, authA: req.moi.authA });
    // Mode urgence de Cloudflare (« I'm Under Attack ») : seulement s'il est réglé.
    const u = ctx.urgence ? ctx.urgence.etat() : null;
    const urgence = ctx.urgence ? {
      actif: Boolean(u?.actif), jusqua: u?.actif ? dateHeure(u.jusqua) : null, depuis: u?.actif ? dateHeure(u.depuis) : null,
      par: u?.par ? String(u.par).replace(/^console · /, '') : null, motif: u?.motif || null,
      fin: !u?.actif && u?.fin ? `${dateHeure(u.fin)} (${u.fin_raison || 'levé'})` : null,
      max: Math.round(ctx.urgence.maxMs / 3600e3), peut: can(req.moi.role, 'reglages'),
    } : null;
    return view(reply, req, 'reglages', { page: 'reglages', titre: 'Règles et réglages · Vigie', reglages, message, urgence });
  });
}
