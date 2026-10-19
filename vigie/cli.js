import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { loadVigieConfig } from './config.js';
import { openVigieDb, createStore } from './store.js';
import { createDecisions, DecisionError } from './decisions.js';
import { createSwitches } from './interrupteurs.js';
import { createEngine } from './moteur.js';
import { createThreats } from './menaces.js';
import { testChannel } from './notifications.js';
import { setTrust, runRolesCheck } from './reglages.js';
import { createUrgence } from './cloudflare-urgence.js';
import { createRights, LABELS } from './console/droits.js';

// Secours en ligne de commande (annexe architecture, section 6.4), dans le conteneur :
//   docker exec nicephos-vigie node vigie/cli.js <commande>
// Toute action est notée dans la base de la Vigie (chaînée), avec l'utilisateur du système.

const HELP = `Commandes :
  cles                                     clés à mettre dans les .env (une fois, à l'installation)
  etat                                     chaîne, décisions actives, interrupteurs, dernière lecture de Zitadel
  verifier                                 vérifie la chaîne du journal
  decisions                                liste les décisions actives
  bloquer <ip|réseau> --portee tout|admin|auth --motif "…" [--duree 24h]
  revoquer-session <empreinte> --motif "…" [--duree 48h]
  revoquer-compte <sub> --motif "…"        ferme toutes les sessions ouvertes de ce compte
  geler <sub> --motif "…" [--duree 24h]    compte traité comme désactivé sur le site
  suspendre-acces <n°> --motif "…" [--duree 7j]   accès d'une galerie privée suspendu par le site (l'équipe le rouvre)
  verrouiller --comptes <sub,…> [--adresses <ip,…>] --motif "…" [--duree 12h]
  lever <id> --motif "…" | lever --tout --motif "…"
  interrupteur <detection|alertes|blocages> marche | arret --duree 2h   (7j au plus)
  alertes [--toutes]                       alertes ouvertes (ou toutes, 50 dernières)
  alerte <id>                              détail : règle, entité, sources, événements, réponse
  prendre <id>                             alerte prise en charge
  classer <id> <incident|faux_positif|test> [--note "…"]   alerte close
  entites                                  entités les plus chaudes (score, sources)
  regles                                   règles et leur mode
  regle <règle> <arret|observer|alerter|bloquer> [--duree 4h] [--motif "…"]   motif obligatoire pour réduire
  seuil <ip|reseau|compte|session|appareil> <points> [--motif "…"]          motif obligatoire pour relever
  confiance ajouter <ip> --duree 7j --motif "…"   adresse jamais bloquée automatiquement (7 jours au plus)
  confiance retirer <ip>
  menaces                                  état des listes de menaces (Spamhaus DROP, Feodo, Tor)
  controle [--accepter --motif "…"]       contrôle des rôles sur la dernière sauvegarde du site ;
                                           --accepter : l'instantané devient la référence
  bordure                                  état de la bordure Cloudflare : copie des blocages, battement, en-têtes
                                           refusés par le site, stabilité des empreintes TLS (essai, phase C3)
  notifier essai <signal|email>            envoie un message d'essai sur le canal
  urgence [marche --duree 2h --motif "…" | arret]   mode urgence de Cloudflare (« I'm Under Attack ») ; sans argument : état
  console                                  droits de la console (plafond, attribution, effectif), sessions ouvertes,
                                           dix dernières connexions refusées (raison, amr)`;

function args(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); opt[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } else pos.push(argv[i]);
  }
  return { pos, opt };
}

export function keys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const r = () => crypto.randomBytes(32).toString('base64');
  return {
    vigie: { VIGIE_INGEST_KEY: r(), VIGIE_LOG_KEY: r(), VIGIE_DECISIONS_PRIVATE_KEY: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') },
    site: { VIGIE_DECISIONS_PUBKEY: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') },
  };
}

// Utilisateur du système pour le journal : le conteneur tourne sous un identifiant sans nom (99) ; jamais d'erreur.
const whoami = () => { try { return os.userInfo().username; } catch { return process.env.USER || `uid ${process.getuid?.() ?? '?'}`; } };

export function run(argv, { config, now = Date.now, user = whoami() } = {}) {
  const { pos, opt } = args(argv);
  const [cmd, ...rest] = pos;
  if (!cmd || cmd === 'aide' || cmd === 'help') return HELP;
  if (cmd === 'cles') {
    const k = keys();
    return [
      '# .env de la Vigie (jamais ailleurs) :', ...Object.entries(k.vigie).map(([a, b]) => `${a}=${b}`),
      '', '# .env du site (même VIGIE_INGEST_KEY, et la clé publique des décisions) :', `VIGIE_INGEST_KEY=${k.vigie.VIGIE_INGEST_KEY}`, ...Object.entries(k.site).map(([a, b]) => `${a}=${b}`),
    ].join('\n');
  }
  // Essai d'un canal : sans la base (asynchrone : le message part, ou l'erreur du canal s'affiche).
  if (cmd === 'notifier') {
    if (rest[0] !== 'essai' || !['signal', 'email'].includes(rest[1])) throw new DecisionError('usage : notifier essai <signal|email>');
    return testChannel(config.notifications || {}, rest[1]).then(() => `Message d’essai envoyé sur ${rest[1]}.`);
  }
  const db = openVigieDb(config.databasePath);
  try {
    const store = createStore({ db, logKey: config.logKey, retentionDays: config.retentionDays, now });
    const decisions = createDecisions({ store, privateKey: config.decisionsKey, now });
    const switches = createSwitches({ store, now });
    const engine = createEngine({ store, decisions, switches, now });
    // Événements écrits par la ligne de commande (chaîne rompue, contrôle des rôles) : analysés par le service, qui suit
    // la base par son curseur (dans la minute ; au démarrage s'il était arrêté), une seule fois.
    const par = `ligne de commande (${user})`;
    const motif = opt.motif === true ? '' : opt.motif || '';
    // Mêmes exigences que la console (audit D3-B10) : motif pour toute décision et toute levée, portée d'un blocage
    // choisie, alerte close ni reprise ni reclassée.
    const motifExige = () => { if (!String(motif).trim()) throw new DecisionError('motif obligatoire (--motif "…") : il dit aux autres pourquoi'); };
    const ouverte = id => {
      const a = db.prepare('SELECT statut FROM alerts WHERE id = ?').get(id);
      if (!a) throw new DecisionError('alerte inconnue');
      if (a.statut === 'close') throw new DecisionError(`alerte #${id} close`);
    };
    const list = () => decisions.active().map(d => `#${d.id}  ${d.kind}  ${d.cible}${d.portee ? ` (${d.portee})` : ''}  jusqu'au ${new Date(d.fin).toISOString().slice(0, 16).replace('T', ' ')} UTC  par ${d.par}${d.motif ? `  — ${d.motif}` : ''}`).join('\n') || 'Aucune décision active.';
    switch (cmd) {
      case 'etat': {
        const v = store.setting.get('chaine_verifiee');
        const z = store.setting.get('zitadel_derniere_lecture');
        const day = db.prepare('SELECT severity, COUNT(*) n FROM events WHERE recu_a > ? GROUP BY severity').all(now() - 864e5);
        return [
          `Chaîne : ${v ? `${v.ok ? 'intacte' : `ROMPUE (${v.rupture?.raison}, ligne ${v.rupture?.seq})`}, vérifiée le ${new Date(v.at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'jamais vérifiée'}`,
          `Événements des dernières 24 h : ${day.map(r => `${r.severity} ${r.n}`).join(', ') || 'aucun'}`,
          `Zitadel : ${z ? `lu le ${new Date(z).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'jamais lu (ou non configuré)'}`,
          // Abaques (docs/etudes/vigie-capacite.md) : retard d'analyse, lignes gardées, taille de la base.
          `Analyse : ${engine.lag()} événement(s) en attente ; base : ${db.prepare('SELECT COUNT(*) FROM events').pluck().get()} lignes, ${Math.round((db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true })) / 1048576)} Mo`,
          `Interrupteurs : ${Object.entries(switches.state()).map(([n, s]) => `${n} ${s.marche ? 'marche' : `ARRÊT${s.jusqua ? ` jusqu'au ${new Date(s.jusqua).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}`}`).join(', ')}`,
          `Décisions actives :\n${list()}`,
        ].join('\n');
      }
      case 'verifier': { const r = store.verify(); store.setting.set('chaine_verifiee', { at: now(), ...r }); if (!r.ok) store.own('log_integrity_fail', { emetteur: par, detail: { ruptures: r.ruptures } }); return r.ok ? `Chaîne intacte (${r.lignes} lignes).` : `CHAÎNE ROMPUE :\n${r.ruptures.map(x => `  ligne ${x.seq} : ${x.raison}`).join('\n')}`; }
      case 'decisions': return list();
      case 'bloquer':
        if (!['tout', 'admin', 'auth'].includes(opt.portee)) throw new DecisionError('portée à choisir : --portee tout|admin|auth');
        motifExige();
        return `Décision #${decisions.create({ kind: 'bloquer', cible: rest[0], portee: opt.portee, duree: opt.duree || '24h', motif, par })} : ${rest[0]} bloqué.`;
      case 'revoquer-session': motifExige(); return `Décision #${decisions.create({ kind: 'revoquer_session', cible: rest[0], duree: opt.duree || '48h', motif, par })} : session révoquée.`;
      case 'revoquer-compte': motifExige(); return `Décision #${decisions.create({ kind: 'revoquer_compte', cible: rest[0], duree: '48h', motif, par })} : sessions de ${rest[0]} fermées.`;
      case 'suspendre-acces': motifExige(); return `Décision #${decisions.create({ kind: 'suspendre_acces', cible: rest[0], duree: opt.duree || '7j', motif, par })} : accès ${rest[0]} à suspendre (le site l’applique une fois ; l’équipe le rouvre dans l’admin).`;
      case 'geler': motifExige(); return `Décision #${decisions.create({ kind: 'geler', cible: rest[0], duree: opt.duree || '24h', motif, par })} : ${rest[0]} gelé.`;
      case 'verrouiller': {
        const split = v => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
        motifExige();
        return `Décision #${decisions.create({ kind: 'verrouiller', cible: 'admin', duree: opt.duree || '12h', motif, par, details: { comptes: split(opt.comptes), adresses: split(opt.adresses) } })} : admin verrouillée.`;
      }
      case 'lever': {
        motifExige();
        const n = opt.tout ? decisions.lift({ all: true, par, motif }) : decisions.lift({ id: Number(rest[0]), par, motif });
        return n ? `${n} décision(s) levée(s).` : 'Rien à lever.';
      }
      case 'interrupteur':
        if (rest[1] === 'arret' && opt.duree && !motif) throw new DecisionError('arrêt d’un interrupteur : --motif "…" obligatoire (il est envoyé aux autres Administrateurs avec l’arrêt)');
        switches.set(rest[0], rest[1], { duree: opt.duree || null, par, motif }); return `Interrupteur ${rest[0]} : ${rest[1]}${opt.duree ? ` pour ${opt.duree}` : ''}.`;
      case 'alertes': {
        const rows = db.prepare(`SELECT * FROM alerts ${opt.toutes ? '' : "WHERE statut != 'close'"} ORDER BY CASE gravite WHEN 'critique' THEN 0 WHEN 'haut' THEN 1 WHEN 'moyen' THEN 2 ELSE 3 END, CASE statut WHEN 'ouverte' THEN 0 ELSE 1 END, derniere DESC LIMIT 50`).all();
        return rows.map(a => `#${a.id}  ${a.gravite.padEnd(8)} ${a.statut.padEnd(8)} ${a.regle}  ${a.entite_kind} ${a.entite_key}  ×${a.compteur}  sources ${JSON.parse(a.sources).join('+') || '—'}${a.mode === 'observer' ? '  (observée)' : ''}`).join('\n') || 'Aucune alerte.';
      }
      case 'alerte': {
        const a = db.prepare('SELECT * FROM alerts WHERE id = ?').get(Number(rest[0]));
        if (!a) return 'Alerte inconnue.';
        const evs = db.prepare('SELECT e.seq, e.recu_a, e.survenu_a, e.type, e.severity, e.composant, e.emetteur, e.confiance, e.ip, e.sub FROM alert_events x JOIN events e ON e.seq = x.seq WHERE x.alert_id = ? ORDER BY e.seq DESC LIMIT 20').all(a.id);
        const iso = t => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
        const gap = ms => (ms < 60e3 ? `${Math.round(ms / 1e3)} s` : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${Math.round(ms / 3600e3)} h`);
        return [`Alerte #${a.id} : ${a.regle} (${a.cas || '—'}), gravité ${a.gravite}, ${a.statut}${a.classement ? ` (${a.classement})` : ''}, mode ${a.mode}`,
          `Entité : ${a.entite_kind} ${a.entite_key}${a.score != null ? `, score ${a.score}` : ''}, sources : ${JSON.parse(a.sources).join(', ') || '—'}`,
          `Première ${iso(a.premiere)} UTC, dernière ${iso(a.derniere)} UTC, ${a.compteur} fois`, `Réponse : ${a.reponse || 'aucune'}`,
          'D’où vient le signal (heure de la source · écart jusqu’à la réception par la Vigie) :', ...evs.map(e => `  ${iso(e.survenu_a ?? e.recu_a)}${e.survenu_a != null && Math.abs(e.recu_a - e.survenu_a) >= 1000 ? ` (reçu ${e.recu_a >= e.survenu_a ? '+' : '−'}${gap(Math.abs(e.recu_a - e.survenu_a))})` : ''}  ${e.type} (${e.severity})  ${e.composant} · ${e.emetteur || ''} · ${e.confiance}${e.ip ? `  ${e.ip}` : ''}${e.sub ? `  ${e.sub}` : ''}`)].join('\n');
      }
      case 'prendre': ouverte(Number(rest[0])); return engine.classify(Number(rest[0]), { classement: null, par, statut: 'en_cours' }) ? `Alerte #${rest[0]} prise en charge.` : 'Alerte inconnue.';
      case 'classer': ouverte(Number(rest[0])); return engine.classify(Number(rest[0]), { classement: rest[1], note: opt.note === true ? '' : opt.note || '', par }) ? `Alerte #${rest[0]} close (${rest[1]}).` : 'Alerte inconnue.';
      case 'entites': return engine.top(20).map(e => `${e.kind.padEnd(8)} ${e.key}  score ${e.score.toFixed(1)}  sources ${e.sources.join('+') || '—'}  ${e.signaux} signaux`).join('\n') || 'Aucune entité active.';
      case 'regles': return engine.rules().map(r => `${r.id.padEnd(40)} ${r.mode.padEnd(9)} ${(r.cas || '').padEnd(5)}${r.expire ? ` ${r.expire < now() ? 'EXPIRÉE' : 'expire'} le ${new Date(r.expire).toISOString().slice(0, 10)}` : ''}`).join('\n') + `\nSeuils : ${Object.entries(engine.thresholds()).map(([k, v]) => `${k} ${v}`).join(', ')}`;
      case 'regle':
        if (!motif && ['arret', 'observer', 'alerter'].includes(rest[1]) && engine.rules().find(r => r.id === rest[0]) && ['arret', 'observer', 'alerter', 'bloquer'].indexOf(rest[1]) < ['arret', 'observer', 'alerter', 'bloquer'].indexOf(engine.modeOf(rest[0]))) throw new DecisionError('surveillance réduite : --motif "…" obligatoire');
        engine.setMode(rest[0], rest[1], par, { duree: opt.duree || null, motif }); return `Règle ${rest[0]} : ${rest[1]}${opt.duree ? ` pour ${opt.duree}` : ''}.`;
      case 'seuil':
        if (!motif && Number(rest[1]) > (engine.thresholds()[rest[0]] ?? Infinity)) throw new DecisionError('seuil relevé (surveillance réduite) : --motif "…" obligatoire');
        engine.setThreshold(rest[0], Number(rest[1]), par, { motif }); return `Seuil ${rest[0]} : ${rest[1]} points.`;
      case 'confiance': {
        const list = setTrust(store, { action: rest[0], ip: rest[1], duree: opt.duree, motif, par, now });
        return `Adresses de confiance : ${list.map(x => `${x.ip} (jusqu'au ${new Date(x.jusqua).toISOString().slice(0, 16).replace('T', ' ')} UTC)`).join(', ') || 'aucune'}.`;
      }
      case 'console': {
        const rights = createRights({ db, store, adminSubs: config.console?.adminSubs || [], mode: config.console?.roles || 'deux-cles', now });
        const lab = r => (r ? LABELS[r] : '—');
        const droits = rights.list().map(r => `  ${r.sub}${r.nom ? ` (${r.nom})` : ''}  plafond ${lab(r.plafond)}  attribution ${r.amorce ? 'amorce' : lab(r.attribution)}  effectif ${lab(r.effectif)}`);
        const ouvertes = db.prepare('SELECT COUNT(*) FROM console_sessions WHERE ferme_a IS NULL AND cree_a > ?').pluck().get(now() - 3600e3);
        const refus = db.prepare("SELECT recu_a, sub, detail FROM events WHERE type = 'vigie_console_refus' ORDER BY seq DESC LIMIT 10").all().map(r => {
          const d = JSON.parse(r.detail || '{}');
          return `  ${new Date(r.recu_a).toISOString().slice(0, 19)}  ${d.raison}${r.sub ? `  ${r.sub}` : ''}${d.amr ? `  amr ${JSON.stringify(d.amr)}` : ''}${d.erreur ? `  ${d.erreur}` : ''}`;
        });
        return [config.console ? 'Console réglée.' : 'Console non réglée (VIGIE_CONSOLE_CLIENT_ID absent).', 'Droits :', ...(droits.length ? droits : ['  aucun compte connu']),
          `Sessions ouvertes : ${ouvertes}`, 'Connexions refusées (10 dernières) :', ...(refus.length ? refus : ['  aucune'])].join('\n');
      }
      case 'urgence': {
        if (!config.urgence) throw new DecisionError('mode urgence non réglé (VIGIE_CF_ZONE_ID, VIGIE_CF_URGENCE_TOKEN_FILE)');
        const u = createUrgence({ store, ...config.urgence, now });
        const iso = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
        if (rest[0] === 'marche') return u.activer({ duree: opt.duree, par, motif }).then(e => `Mode urgence actif jusqu'au ${iso(e.jusqua)} UTC (niveau d'avant : ${e.avant}).`);
        if (rest[0] === 'arret') return u.desactiver({ par, raison: 'levé' }).then(e => (e ? `Mode urgence levé : niveau ${e.avant} remis.` : 'Le mode urgence n’était pas actif.'));
        const e = u.etat();
        return e?.actif ? `Mode urgence actif jusqu'au ${iso(e.jusqua)} UTC, par ${e.par} : « ${e.motif} ».` : `Mode urgence inactif${e?.fin ? ` (dernier terminé le ${iso(e.fin)} UTC, ${e.fin_raison})` : ''}.`;
      }
      case 'bordure': {
        // Grille de lecture de l'essai sur l'instance de test (docs/wiki/Vigie.md, bordure).
        const iso = t => (t ? `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'jamais');
        const kv = store.setting.get('bordure_kv'), beat = store.setting.get('bordure_dernier_battement');
        const day = now() - 864e5, week = now() - 7 * 864e5;
        const refused = db.prepare("SELECT json_extract(detail, '$.raison') r, COUNT(*) n FROM events WHERE type = 'edge_signature_invalid' AND recu_a > ? GROUP BY r").all(day);
        const withEdge = db.prepare("SELECT COUNT(DISTINCT reference) FROM events WHERE type = 'session_created' AND recu_a > ? AND json_extract(detail, '$.bordure.tls') IS NOT NULL").pluck().get(week);
        const tlsChanged = db.prepare("SELECT COUNT(DISTINCT session) FROM events WHERE type = 'session_context_change' AND recu_a > ? AND json_extract(detail, '$.tls_change') = 1").pluck().get(week);
        const seen = db.prepare("SELECT type, COUNT(*) n FROM events WHERE composant = 'bordure' AND recu_a > ? GROUP BY type").all(day);
        return [
          `Blocages copiés dans KV : ${kv ? `version ${kv.version}, le ${iso(kv.at)}` : 'jamais (VIGIE_CF_* non réglées ?)'}`,
          ...(() => { const l = store.setting.get('cf_liste'); return l ? [`Liste chez Cloudflare (${l.liste || '—'}) : ${l.ok === false ? `EN ÉCHEC le ${iso(l.at_echec)} : ${l.erreur}` : `${l.total} adresse(s), rapprochée le ${iso(l.at)} (+${l.ajoutees}, −${l.retirees})`}`] : []; })(),
          `Dernier battement du Worker : ${beat ? `${iso(beat.at)} (${beat.etat || '—'})` : 'jamais'} ; dernière requête vue : ${iso(store.setting.get('bordure_derniere_donnee'))} ; minute lue jusqu'à : ${iso(store.setting.get('bordure_curseur'))}`,
          `Constats de la bordure (24 h) : ${seen.map(r => `${r.type} ${r.n}`).join(', ') || 'aucun'}`,
          `En-têtes refusés par le site (24 h) : ${refused.map(r => `${r.r} ${r.n}`).join(', ') || 'aucun'}${refused.some(r => r.r === 'adresse différente') ? ' → vérifier TRUST_PROXY (adresse vue par le site)' : ''}`,
          `Empreinte TLS (7 jours) : ${withEdge} session(s) avec la bordure, ${tlsChanged} dont l'empreinte a changé${withEdge ? ` (${Math.round((100 * tlsChanged) / withEdge)} %)` : ''}`,
        ].join('\n');
      }
      case 'menaces': {
        const st = createThreats({ store, now }).state();
        return st ? `Listes mises à jour le ${new Date(st.at).toISOString().slice(0, 16).replace('T', ' ')} UTC : ${Object.entries(st).filter(([k]) => k !== 'at').map(([k, v]) => `${k} ${v}`).join(', ')}` : 'Listes jamais téléchargées.';
      }
      case 'controle': {
        // --accepter : l'instantané actuel devient la référence (après vérification d'un écart expliqué hors journal).
        const r = runRolesCheck(store, { accepter: Boolean(opt.accepter), motif, par, siteBackupDir: config.siteBackupDir, now });
        return r.ok === null ? r.raison : r.ok ? `Sauvegarde du site conforme : administrateurs déclarés et expliqués, déclencheurs intacts${r.severity === 'haut' ? ' (contrôle incomplet : voir l\'alerte)' : ''}.`
          : `ÉCART : ${r.erreur ? `instantané illisible (${r.erreur})` : `administrateurs non déclarés ${r.unknownAdmins.join(', ') || '—'} ; nouveaux administrateurs sans changement journalisé ${r.unexplained.join(', ') || '—'} ; déclencheurs absents ${r.missing.join(', ') || '—'} ; déclencheurs modifiés ${r.altered.join(', ') || '—'}`}.`;
      }
      default: throw new DecisionError(`commande inconnue : ${cmd}\n${HELP}`);
    }
  } finally { db.close(); }
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  try {
    const argv = process.argv.slice(2);
    // Sortie sans séquences de terminal : clés, adresses et émetteurs viennent d'événements reçus.
    console.log((await run(argv, { config: !argv[0] || ['cles', 'aide', 'help'].includes(argv[0]) ? null : loadVigieConfig() })).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '?'));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
