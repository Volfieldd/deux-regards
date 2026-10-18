import net from 'node:net';
import { DecisionError, KINDS, SCOPES, parseTarget } from '../decisions.js';
import { SWITCHES } from '../interrupteurs.js';
import { net64 } from '../moteur.js';
import { THRESHOLDS } from '../poids.js';
import { testChannel } from '../notifications.js';
import { setTrust, runRolesCheck } from '../reglages.js';
import { RightsError, ROLES, LABELS } from './droits.js';
import { FINE } from './format.js';
import { sansContacts } from '../util.js';

// Actions de la console (phase D3c, annexe architecture § 5.4 et § 6). Une route par geste, en POST, toujours :
//   1. les trois verrous et le jeton CSRF (crochets du serveur) ;
//   2. guard() : droit de l'action, plafond relu chez Zitadel à l'instant, ré-authentification de moins de 5 minutes
//      pour les actions forcées, les interrupteurs, les réglages qui réduisent la surveillance et les droits ;
//   3. les fonctions de la Vigie qu'emploie aussi la ligne de commande (mêmes garde-fous, mêmes événements) ;
//   4. un message pour la page suivante (fait, ou refusé : raison, champ, valeurs saisies), puis redirection 303 vers la
//      page d'où vient le formulaire (champ « retour », chemin local) : recharger la page ne refait jamais le geste.
// Les écrans (formulaires) sont dans vigie/console/ecrans/ et views/ ; ce module n'affiche rien.

// Messages des fonctions de la Vigie montrés tels quels (leurs refus sont écrits pour la personne) ; une erreur de
// programmation ou de la base est une panne, jamais montrée.
const userError = err => err instanceof DecisionError || err instanceof RightsError || err instanceof ActionError
  || (err?.constructor === Error && !String(err.code || '').startsWith('SQLITE'));
export class ActionError extends Error {
  constructor(message, champ) { super(message); this.champ = champ; }
}

const texte = (v, max = 300) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const liste = v => (Array.isArray(v) ? v : [v]).flatMap(x => texte(x, 4000).split(/[\s,;]+/)).filter(Boolean).slice(0, 50);
const DUREE = /^\d{1,4}\s*(min|h|j|d)$/;
function duree(body) {
  const d = texte(body.duree_libre, 20) || texte(body.duree, 20);
  if (!d) return null;
  if (!DUREE.test(d)) throw new ActionError('durée attendue : 30min, 2h, 24h, 7j…', body.duree_libre ? 'duree_libre' : 'duree');
  return d.replace(/\s+/g, '');
}
// Champ en cause d'un refus venu des fonctions de la Vigie (moteur, interrupteurs, adresses de confiance), qui ne le
// nomment pas : d'après le sujet du message, et seulement si le formulaire a ce champ.
function champDe(err, body) {
  const m = String(err?.message || '');
  const c = /motif/i.test(m) ? 'motif' : /durée/i.test(m) ? (body.duree_libre ? 'duree_libre' : 'duree') : /adresse IP/i.test(m) ? 'ip' : /^mode/i.test(m) ? 'mode' : null;
  return c && Object.hasOwn(body, c) ? c : c === 'motif' ? 'motif' : null;
}
const entier = v => (typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : null);

export function register(app, ctx) {
  const { engine, switches, decisions, store, rights, sessions, now } = ctx;
  // Auteur d'un geste : le nom lisible et l'identifiant Zitadel (le nom affiché peut être changé par la personne ; audit
  // D3-B2). Parenthèses retirées du nom : l'identifiant est toujours la dernière parenthèse.
  const par = req => `console · ${String(req.moi.nom || '').replace(/[()]/g, '').trim().slice(0, 80) || 'sans nom'} (${req.moi.sub})`;
  // Connexion d'un administrateur depuis la cible ces 30 jours ? Adresse seule (index events_ip) ou réseau /24, /48
  // (index events_net) ; un réseau plus large n'est pas vérifié ici (le blocage en reste possible, avec motif).
  // Adresses d'où un administrateur (dernier contrôle des rôles) s'est connecté ces 30 jours, comparées à la cible par un
  // BlockList : tous les préfixes et toutes les écritures (/64 IPv6, /16, forme non canonique ; audit D3-B3).
  const q = {
    ipsDe: ctx.db.prepare("SELECT DISTINCT ip FROM events WHERE sub = ? AND type IN ('authn_login_success', 'session_created') AND recu_a > ? AND ip IS NOT NULL LIMIT 200").pluck(),
    alerte: ctx.db.prepare('SELECT 1 FROM alerts WHERE id = ?').pluck(),
  };
  const adminsDuSite = () => new Set(store.setting.get('controle_roles_admins', null)?.administrateurs || []);
  function adminSeen(t) {
    const adm = adminsDuSite();
    if (!adm.size) return false;
    const bl = new net.BlockList();
    bl.addSubnet(t.address, t.prefix, t.family);
    const depuis = now() - 30 * 864e5;
    for (const sub of adm) {
      for (const ip of q.ipsDe.all(sub, depuis)) {
        const v = net.isIP(ip);
        if (v && bl.check(ip, v === 6 ? 'ipv6' : 'ipv4')) return true;
      }
    }
    return false;
  }

  // Une action : garde, geste, message, redirection.
  function action(url, droit, { reauth = false, libelle, retour: retourDefaut = '/' }, geste) {
    app.post(url, async (req, reply) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const libelleVu = typeof libelle === 'function' ? libelle(req) : libelle;
      if (!(await ctx.guard(req, reply, droit, { reauth, libelle: libelleVu }))) return reply;
      const retour = body.retour ? ctx.safeRetour(body.retour) : typeof retourDefaut === 'function' ? retourDefaut(req) : retourDefaut;
      let message;
      try {
        const fait = await geste(req, body);
        message = { k: 'ok', texte: fait, action: url.split('/')[1] };
      } catch (err) {
        if (!userError(err)) ctx.log.error({ err: err.message, route: req.routeOptions?.url }, 'Vigie : console : action en échec');
        // Valeurs saisies renvoyées au formulaire (sans le jeton), pour corriger sans tout retaper.
        const valeurs = Object.fromEntries(Object.entries(body).filter(([k, v]) => k !== '_csrf' && typeof v === 'string').map(([k, v]) => [k, v.slice(0, 300)]).slice(0, 20));
        message = { k: 'erreur', texte: userError(err) ? err.message : 'L’action n’a pas pu être faite (erreur de la Vigie, notée dans son journal).', champ: err.champ || champDe(err, body), valeurs };
      }
      sessions.setMessage(req.moi.sid, message);
      return reply.redirect(retour, 303);
    });
  }

  // ---------- Alertes (Intervenant) ----------
  const alerte = req => {
    const id = entier(req.params.id);
    const a = id && ctx.db.prepare('SELECT id, statut FROM alerts WHERE id = ?').get(id);
    if (!a) throw new ActionError('alerte inconnue');
    return a;
  };
  action('/alertes/:id/prendre', 'alertes_traiter', { retour: req => `/alertes/${entier(req.params.id) || ''}` }, req => {
    const a = alerte(req);
    if (a.statut === 'close') throw new ActionError(`l’alerte #${a.id} est close`);
    engine.classify(a.id, { classement: null, par: par(req), statut: 'en_cours' });
    return `Alerte #${a.id} prise en charge.`;
  });
  action('/alertes/:id/classer', 'alertes_traiter', { retour: req => `/alertes/${entier(req.params.id) || ''}` }, (req, body) => {
    const a = alerte(req);
    if (a.statut === 'close') throw new ActionError(`l’alerte #${a.id} est déjà close`);
    if (!['incident', 'faux_positif', 'test'].includes(body.classement)) throw new ActionError('classement : incident, faux positif ou test', 'classement');
    engine.classify(a.id, { classement: body.classement, note: texte(body.note, 500), par: par(req) });
    return `Alerte #${a.id} close (${{ incident: 'incident', faux_positif: 'faux positif', test: 'test' }[body.classement]}).`;
  });
  action('/alertes/:id/note', 'alertes_traiter', { retour: req => `/alertes/${entier(req.params.id) || ''}` }, (req, body) => {
    const a = alerte(req);
    if (!texte(body.note, 500)) throw new ActionError('note vide', 'note');
    engine.note(a.id, texte(body.note, 500), par(req));
    return `Note ajoutée à l’alerte #${a.id}.`;
  });

  // ---------- Décisions (Intervenant, ré-authentification) ----------
  action('/decisions', 'actions_forcees', { reauth: true, libelle: 'Prendre une décision (bloquer, révoquer, geler, verrouiller)', retour: '/decisions' }, (req, body) => {
    const kind = body.type;
    if (!KINDS.includes(kind)) throw new ActionError('type de décision inconnu', 'type');
    let motif = texte(body.motif);
    // Depuis la fiche d'une alerte, l'alerte est le motif (un mot de plus reste possible) ; ailleurs, motif obligatoire.
    // L'alerte ne tient lieu de motif que si elle existe (audit D3-B8).
    const n = entier(body.alerte);
    if (n && !q.alerte.get(n)) throw new ActionError(`alerte #${n} inconnue`, 'alerte');
    if (n) motif = (motif ? `alerte #${n} · ${motif}` : `alerte #${n}`).slice(0, 300);
    if (!motif) throw new ActionError('motif obligatoire : il dit aux autres pourquoi', 'motif');
    const d = duree(body) || { bloquer: '24h', revoquer_session: '48h', revoquer_compte: '48h', geler: '24h', verrouiller: '12h' }[kind];
    const cible = texte(body.cible, 200);
    const ici = req.ip2 && net.isIP(req.ip2) ? req.ip2 : null;
    let details = null;
    if (kind === 'bloquer') {
      let t;
      try { t = parseTarget(cible); } catch (err) { throw new ActionError(err.message, 'cible'); }
      const portee = body.portee;
      if (!SCOPES.includes(portee)) throw new ActionError('portée à choisir : tout le site, l’admin ou la connexion', 'portee');
      // Sa propre adresse : seulement en le confirmant (on ne s'enferme pas dehors par mégarde).
      if (ici) {
        const bl = new net.BlockList();
        bl.addSubnet(t.address, t.prefix, t.family);
        if (bl.check(ici, net.isIPv6(ici) ? 'ipv6' : 'ipv4') && body.confirme !== 'oui') throw new ActionError('c’est votre adresse actuelle : cochez la confirmation pour la bloquer quand même', 'confirme');
      }
      // Adresse d'où un administrateur (contrôle des rôles) s'est connecté depuis 30 jours : seulement en le confirmant.
      if (body.confirme !== 'oui' && adminSeen(t)) throw new ActionError('un administrateur s’est connecté depuis cette adresse ces 30 derniers jours : cochez la confirmation pour la bloquer quand même', 'confirme');
      const id = decisions.create({ kind, cible: t.cible, portee, duree: d, motif, par: par(req), alerte: n || undefined });
      return `Décision #${id} : ${t.cible} bloqué.`;
    }
    if (kind === 'verrouiller') {
      // Le compte et l'adresse de qui verrouille sont ajoutés d'office (une adresse IPv6 avec son /64) : personne ne
      // s'enferme dehors (annexe § 6.3).
      const comptes = [...new Set([req.moi.sub, ...liste(body.comptes)])];
      const adresses = [...new Set([...(ici ? [net.isIPv6(ici) ? net64(ici) : ici] : []), ...liste(body.adresses)])];
      details = { comptes, adresses };
      const id = decisions.create({ kind, cible: 'admin', portee: 'admin', duree: d, motif, par: par(req), details, alerte: n || undefined });
      return `Décision #${id} : admin verrouillée (${comptes.length} compte${comptes.length > 1 ? 's' : ''}, ${adresses.length} adresse${adresses.length > 1 ? 's' : ''} admis).`;
    }
    if (!cible) throw new ActionError(kind === 'revoquer_session' ? 'empreinte de session attendue' : 'compte (sub) attendu', 'cible');
    // Son propre compte, un Administrateur de la console ou un administrateur du site : seulement en le confirmant
    // (audit D3-B5).
    if (['geler', 'revoquer_compte'].includes(kind) && body.confirme !== 'oui') {
      if (cible === req.moi.sub) throw new ActionError('c’est votre propre compte : cochez la confirmation pour le faire quand même', 'confirme');
      if (rights.effective(cible, 'admin') === 'admin' || adminsDuSite().has(cible)) throw new ActionError('compte d’un administrateur : cochez la confirmation pour le faire quand même', 'confirme');
    }
    const id = decisions.create({ kind, cible, duree: d, motif, par: par(req), alerte: n || undefined });
    return `Décision #${id} prise.`;
  });
  action('/decisions/:id/lever', 'actions_forcees', { reauth: true, libelle: 'Lever une décision', retour: '/decisions' }, (req, body) => {
    const id = entier(req.params.id);
    if (!id) throw new ActionError('décision inconnue');
    const motif = texte(body.motif);
    if (!motif) throw new ActionError('motif obligatoire : il dit aux autres pourquoi la décision est levée', 'motif');
    const n = decisions.lift({ id, par: par(req), motif });
    if (!n) throw new ActionError(`décision #${id} déjà levée ou échue`);
    return `Décision #${id} levée.`;
  });

  // ---------- Interrupteurs et réglages (Analyste, ré-authentification) ----------
  action('/interrupteurs/:nom', 'reglages', { reauth: true, libelle: 'Changer un interrupteur général', retour: '/reglages' }, (req, body) => {
    const nom = req.params.nom;
    if (!SWITCHES.includes(nom)) throw new ActionError('interrupteur inconnu');
    if (!['marche', 'arret'].includes(body.etat)) throw new ActionError('état : marche ou arrêt', 'etat');
    if (body.etat === 'arret' && !texte(body.motif)) throw new ActionError('arrêt : motif obligatoire', 'motif');
    switches.set(nom, body.etat, { duree: body.etat === 'arret' ? duree(body) : null, par: par(req), motif: texte(body.motif, 200) });
    return body.etat === 'marche' ? `Interrupteur « ${nom} » remis en marche.` : `Interrupteur « ${nom} » arrêté.`;
  });
  action('/reglages/regles/:id', 'reglages', { reauth: true, libelle: 'Changer le mode d’une règle', retour: '/reglages' }, (req, body) => {
    const id = texte(req.params.id, 120);
    if (!engine.rules().some(r => r.id === id)) throw new ActionError('règle inconnue');
    engine.setMode(id, body.mode, par(req), { duree: body.mode === 'arret' ? duree(body) : null, motif: texte(body.motif, 200) });
    return `Règle ${id} : ${body.mode}.`;
  });
  action('/reglages/seuils', 'reglages', { reauth: true, libelle: 'Changer les seuils d’alerte', retour: '/reglages' }, (req, body) => {
    const changes = [];
    const avant = engine.thresholds();
    for (const kind of Object.keys(THRESHOLDS)) {
      if (body[kind] === undefined || body[kind] === '') continue;
      const v = Number(String(body[kind]).replace(',', '.'));
      if (!(v >= 0.5 && v <= 1000)) throw new ActionError(`seuil ${kind} : nombre de points de 0,5 à 1000`, kind);
      if (v !== avant[kind]) changes.push([kind, v]);
    }
    if (!changes.length) throw new ActionError('aucun seuil changé');
    // Tout ou rien (audit D3-B7) : un seuil relevé sans motif refuse l'envoi entier, avant toute écriture.
    const motif = texte(body.motif, 200);
    if (!motif && changes.some(([kind, v]) => v > avant[kind])) throw new ActionError('seuil relevé (surveillance réduite) : motif obligatoire', 'motif');
    ctx.db.transaction(() => { for (const [kind, v] of changes) engine.setThreshold(kind, v, par(req), { motif }); })();
    return `Seuils : ${changes.map(([k, v]) => `${k} ${v}`).join(', ')}.`;
  });
  action('/reglages/confiance/ajouter', 'confiance', { reauth: true, libelle: 'Ajouter une adresse de confiance', retour: '/reglages' }, (req, body) => {
    setTrust(store, { action: 'ajouter', ip: texte(body.ip, 64), duree: duree(body), motif: texte(body.motif, 200), par: par(req), now });
    return `Adresse ${texte(body.ip, 64)} de confiance.`;
  });
  action('/reglages/confiance/retirer', 'confiance', { retour: '/reglages' }, (req, body) => {
    setTrust(store, { action: 'retirer', ip: texte(body.ip, 64), par: par(req), now });
    return `Adresse ${texte(body.ip, 64)} retirée des adresses de confiance.`;
  });

  // ---------- Vérifications (Analyste) ----------
  action('/reglages/canaux/:canal/essai', 'verifications', { retour: '/reglages' }, async req => {
    const canal = req.params.canal === 'email' ? 'email' : req.params.canal === 'signal' ? 'signal' : null;
    if (!canal) throw new ActionError('canal inconnu');
    // Raison de l'échec sans numéro, adresse ni identifiant de groupe (le bandeau est vu par toute personne de la console).
    const masque = t => sansContacts(t).slice(0, 160);
    try { await testChannel(ctx.notifications || {}, canal); } catch (err) { throw new ActionError(`essai ${canal} en échec : ${masque(err.message)}`); }
    store.own('vigie_interrupteur', { emetteur: par(req), detail: { essai_canal: canal } });
    return `Message d’essai envoyé sur ${canal === 'email' ? 'l’e-mail' : 'Signal'}.`;
  });
  action('/sante/verifier', 'verifications', { retour: '/sante' }, async req => {
    if (!ctx.verifyChain) throw new ActionError('vérification indisponible');
    const r = await ctx.verifyChain();
    store.own('vigie_interrupteur', { emetteur: par(req), detail: { verification_chaine: r.ok ? 'intacte' : 'rompue', lignes: r.lignes } });
    return r.ok ? `Chaîne intacte (${r.lignes} lignes).` : `CHAÎNE ROMPUE : ${r.ruptures.length} rupture(s), voir la santé.`;
  });
  action('/sante/bordure/copier', 'verifications', { retour: '/sante' }, async req => {
    if (!ctx.edge) throw new ActionError('bordure Cloudflare non réglée');
    await ctx.edge.push({ force: true });
    store.own('vigie_interrupteur', { emetteur: par(req), detail: { bordure: 'copie forcée' } });
    return 'Blocages recopiés à la bordure.';
  });

  // ---------- Administrateur ----------
  action('/sante/controle/accepter', 'droits', { reauth: true, libelle: 'Accepter la sauvegarde du site comme référence des administrateurs', retour: '/sante' }, (req, body) => {
    if (!ctx.siteBackupDir) throw new ActionError('sauvegardes du site non montées');
    const r = runRolesCheck(store, { accepter: true, motif: texte(body.motif, 200), par: par(req), siteBackupDir: ctx.siteBackupDir, now });
    return r.ok ? 'Référence acceptée : sauvegarde conforme.' : 'Référence acceptée, mais le contrôle relève encore un écart : voir la santé.';
  });
  action('/droits/:sub', 'droits', { reauth: true, libelle: 'Changer les droits d’une personne', retour: '/droits' }, (req, body) => {
    const sub = texte(req.params.sub, 200);
    if (!ROLES.includes(body.attribution)) throw new ActionError('rôle inconnu', 'attribution');
    const changed = rights.assign({ par: req.moi.sub, parAuteur: par(req), parRole: req.moi.role, sub, role: body.attribution });
    const nom = rights.list().find(r => r.sub === sub)?.nom || sub;
    return changed ? `Attribution changée${FINE}: ${nom}, ${LABELS[body.attribution]}. Les Administrateurs sont prévenus.` : `Rien à changer${FINE}: ${nom} est déjà ${LABELS[body.attribution]}.`;
  });

}
