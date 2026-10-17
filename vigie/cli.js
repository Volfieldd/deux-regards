import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { loadVigieConfig } from './config.js';
import { openVigieDb, createStore } from './store.js';
import { createDecisions, DecisionError } from './decisions.js';
import { createSwitches } from './interrupteurs.js';

// Secours en ligne de commande (annexe architecture, section 6.4), dans le conteneur :
//   docker exec nicephos-vigie node vigie/cli.js <commande>
// Toute action est notée dans la base de la Vigie (chaînée), avec l'utilisateur du système.

const HELP = `Commandes :
  cles                                     clés à mettre dans les .env (une fois, à l'installation)
  etat                                     chaîne, décisions actives, interrupteurs, dernière lecture de Zitadel
  verifier                                 vérifie la chaîne du journal
  decisions                                liste les décisions actives
  bloquer <ip|réseau> [--duree 24h] [--portee tout|admin|auth] [--motif "…"]
  revoquer-session <empreinte> [--duree 48h] [--motif "…"]
  revoquer-compte <sub> [--motif "…"]      ferme toutes les sessions ouvertes de ce compte
  geler <sub> [--duree 24h] [--motif "…"]  compte traité comme désactivé sur le site
  verrouiller --comptes <sub,…> [--adresses <ip,…>] [--duree 12h] [--motif "…"]
  lever <id> | lever --tout
  interrupteur <detection|alertes|blocages> marche | arret --duree 2h   (7j au plus)`;

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
  const db = openVigieDb(config.databasePath);
  try {
    const store = createStore({ db, logKey: config.logKey, retentionDays: config.retentionDays, now });
    const decisions = createDecisions({ store, privateKey: config.decisionsKey, now });
    const switches = createSwitches({ store, now });
    const par = `ligne de commande (${user})`;
    const motif = opt.motif === true ? '' : opt.motif || '';
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
          `Interrupteurs : ${Object.entries(switches.state()).map(([n, s]) => `${n} ${s.marche ? 'marche' : `ARRÊT${s.jusqua ? ` jusqu'au ${new Date(s.jusqua).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}`}`).join(', ')}`,
          `Décisions actives :\n${list()}`,
        ].join('\n');
      }
      case 'verifier': { const r = store.verify(); store.setting.set('chaine_verifiee', { at: now(), ...r }); if (!r.ok) store.own('log_integrity_fail', { emetteur: par, detail: { ruptures: r.ruptures } }); return r.ok ? `Chaîne intacte (${r.lignes} lignes).` : `CHAÎNE ROMPUE :\n${r.ruptures.map(x => `  ligne ${x.seq} : ${x.raison}`).join('\n')}`; }
      case 'decisions': return list();
      case 'bloquer': return `Décision #${decisions.create({ kind: 'bloquer', cible: rest[0], portee: opt.portee || 'tout', duree: opt.duree || '24h', motif, par })} : ${rest[0]} bloqué.`;
      case 'revoquer-session': return `Décision #${decisions.create({ kind: 'revoquer_session', cible: rest[0], duree: opt.duree || '48h', motif, par })} : session révoquée.`;
      case 'revoquer-compte': return `Décision #${decisions.create({ kind: 'revoquer_compte', cible: rest[0], duree: '48h', motif, par })} : sessions de ${rest[0]} fermées.`;
      case 'geler': return `Décision #${decisions.create({ kind: 'geler', cible: rest[0], duree: opt.duree || '24h', motif, par })} : ${rest[0]} gelé.`;
      case 'verrouiller': {
        const split = v => (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
        return `Décision #${decisions.create({ kind: 'verrouiller', cible: 'admin', duree: opt.duree || '12h', motif, par, details: { comptes: split(opt.comptes), adresses: split(opt.adresses) } })} : admin verrouillée.`;
      }
      case 'lever': {
        const n = opt.tout ? decisions.lift({ all: true, par }) : decisions.lift({ id: Number(rest[0]), par });
        return n ? `${n} décision(s) levée(s).` : 'Rien à lever.';
      }
      case 'interrupteur': switches.set(rest[0], rest[1], { duree: opt.duree || null, par }); return `Interrupteur ${rest[0]} : ${rest[1]}${opt.duree ? ` pour ${opt.duree}` : ''}.`;
      default: throw new DecisionError(`commande inconnue : ${cmd}\n${HELP}`);
    }
  } finally { db.close(); }
}

const isMain = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  try {
    const argv = process.argv.slice(2);
    console.log(run(argv, { config: argv[0] === 'cles' || !argv[0] ? null : loadVigieConfig() }));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
