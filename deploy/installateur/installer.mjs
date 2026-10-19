// Installateur de Nicephos : questions à l'écran, vérification des prérequis et des jetons, inspection de ce qui
// existe déjà (Zitadel, Cloudflare, machine), plan affiché, puis application après confirmation. Lancé par
// installer.sh dans l'image du site (Node, aucune dépendance) ; guide : deploy/installateur/README.md.
//
//   node installer.mjs [--essai]
//
// Garanties : rien n'est supprimé, ni chez Zitadel, ni chez Cloudflare, ni sur la machine ; une valeur déjà posée dans
// le .env (secrets, clé de chiffrement des données) est gardée ; un fichier remplacé l'est après copie ; les jetons de
// l'installateur ne sont écrits nulle part. Relancer l'installateur reprend là où il s'était arrêté.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { creerUI, Interruption } from './lib/ui.mjs';
import { creerClient, ErreurApi } from './lib/http.mjs';
import { aleatoire, clesVigie } from './lib/cles.mjs';
import { prerequis } from './lib/prerequis.mjs';
import { element, afficherPlan, appliquerPlan } from './lib/plan.mjs';
import { lireEnv, fusionnerEnv, ecrireFichier, garderCopie, planDossiers, etatDossier, creerDossier } from './lib/fichiers.mjs';
import * as Z from './lib/zitadel.mjs';
import * as CF from './lib/cloudflare.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const MODELES = path.join(ICI, '..', 'unraid');
const NOM_PILE = 'nicephos';
const M = 'Machine';

export const MODES = {
  unraid: { projets: '/boot/config/plugins/compose.manager/projects', nicephos: '/mnt/cache/appdata/nicephos', sauvegardes: '/mnt/user/backups/nicephos', uid: 99, gid: 100 },
  linux: { projet: '/opt/nicephos', nicephos: '/srv/nicephos', sauvegardes: '/srv/nicephos-sauvegardes', uid: 1000, gid: 1000 },
};

export const CHEMIN = /^\/[A-Za-z0-9._/-]+$/;
export const NOM_DNS = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- contrôles des réponses ----------

export function controleDonnees(mode, racine = '') {
  return v => {
    if (!CHEMIN.test(v)) return 'Chemin absolu, sans espace ni accent (lettres, chiffres, . _ - /).';
    if (v.includes('..')) return 'Pas de « .. » dans le chemin.';
    if (mode === 'unraid') {
      if (/^\/mnt\/(user|user0)(\/|$)/.test(v)) return 'Chemin direct d’un pool (/mnt/<pool>/…), jamais /mnt/user/… : la base SQLite fonctionne mal à travers FUSE.';
      const m = /^\/mnt\/([^/]+)\/[^/]/.exec(v);
      if (!m) return 'Un dossier dans un pool : /mnt/<pool>/<dossier>…';
      if (!fs.existsSync(`${racine}/mnt/${m[1]}`)) return `Le pool /mnt/${m[1]} est introuvable sur cette machine.`;
    }
    return null;
  };
}

export function controleSauvegardes(nicephos) {
  return v => {
    if (!CHEMIN.test(v)) return 'Chemin absolu, sans espace ni accent (lettres, chiffres, . _ - /).';
    if (v.includes('..')) return 'Pas de « .. » dans le chemin.';
    const a = `${nicephos.replace(/\/+$/, '')}/`, b = `${v.replace(/\/+$/, '')}/`;
    if (a.startsWith(b) || b.startsWith(a)) return 'Les sauvegardes ne doivent être ni dans le dossier de Nicephos, ni le contenir.';
    return null;
  };
}

// Même pool (ou même disque) pour les données et les sauvegardes : signalé, pas refusé.
export function memeSupport(mode, nicephos, sauvegardes) {
  if (mode !== 'unraid') return false;
  const pool = p => (/^\/mnt\/(user|user0)\//.test(p) ? 'tableau' : /^\/mnt\/([^/]+)\//.exec(p)?.[1]);
  return pool(nicephos) === pool(sauvegardes);
}

// Partage Unraid exporté sans mot de passe (README Unraid, étape 2) : l'invité SMB est nobody (99), propriétaire des
// données. Lu dans /boot/config/shares/<partage>.cfg ; un doute est signalé, jamais bloquant.
export function partageOuvert(chemin, racine = '') {
  const m = chemin === '/boot' ? [null, 'flash'] : /^\/mnt\/(?:user0?\/|[^/]+\/)([^/]+)/.exec(chemin);
  if (!m) return null;
  let cfg;
  try { cfg = fs.readFileSync(`${racine}/boot/config/shares/${m[1]}.cfg`, 'utf8'); } catch { return null; }
  const v = k => new RegExp(`^${k}="([^"]*)"`, 'm').exec(cfg)?.[1];
  const smb = Boolean(v('shareExport')) && v('shareExport') !== '-' && v('shareSecurity') === 'public';
  const nfs = Boolean(v('shareExportNFS')) && v('shareExportNFS') !== '-' && v('shareSecurityNFS') === 'public';
  return smb || nfs ? { partage: m[1], smb, nfs } : null;
}

// ---------- la pile existante ----------

// Unraid : la pile de Compose Manager nommée « nicephos » (dossier ou fichier « name »), sinon un nouveau dossier.
export function trouverPile(mode, racine = '', projetLinux = MODES.linux.projet) {
  if (mode === 'linux') return { dossier: projetLinux, existe: fs.existsSync(`${racine}${projetLinux}/.env`) };
  const base = MODES.unraid.projets;
  let dossiers = [];
  try { dossiers = fs.readdirSync(`${racine}${base}`, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { /* aucune pile */ }
  const nomDe = d => { try { return fs.readFileSync(`${racine}${base}/${d}/name`, 'utf8').trim(); } catch { return d; } };
  const trouve = dossiers.find(d => nomDe(d) === NOM_PILE) || dossiers.find(d => d === NOM_PILE);
  const dossier = `${base}/${trouve || NOM_PILE}`;
  return { dossier, existe: fs.existsSync(`${racine}${dossier}/.env`), nouveauDossier: !trouve };
}

const lire = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };

// Clé publique des décisions déduite de la clé privée de la Vigie (vigie.env déjà rempli, .env du site incomplet).
export function clePubliqueDe(privee) {
  try {
    const k = crypto.createPrivateKey({ key: Buffer.from(privee, 'base64'), format: 'der', type: 'pkcs8' });
    return crypto.createPublicKey(k).export({ format: 'der', type: 'spki' }).toString('base64');
  } catch { return null; }
}

// ---------- les écrans ----------

function accueil(ui, { mode, essai }) {
  ui.titre(`Nicephos : installation${essai ? ' (essai)' : ''}`);
  ui.ecrire(`Mode : ${ui.c.gras(mode === 'unraid' ? 'Unraid (Compose Manager)' : 'Linux (Docker Compose)')}.`);
  ui.ecrire('L’installateur prépare les dossiers, la connexion à l’admin (Zitadel), le tunnel et le domaine (Cloudflare),');
  ui.ecrire('écrit les réglages de la pile, puis la démarre. Il montre d’abord tout ce qu’il va faire, et attend votre accord.');
  ui.note('Rien n’est jamais supprimé ; les secrets déjà posés sont gardés ; les jetons saisis ne sont écrits nulle part.');
  if (essai) ui.alerte('Essai : seules des lectures partent vers Zitadel et Cloudflare, rien n’est écrit sur la machine.');
}

async function ecranPrerequis(ui, { mode, hote }) {
  ui.titre('Prérequis');
  const liste = prerequis({ mode, hote });
  const symbole = { ok: ui.c.vert('✔'), ko: ui.c.rouge('✘'), inconnu: ui.c.jaune('?'), 'a-voir': ui.c.cyan('☐') };
  let groupe = null;
  liste.forEach((p, i) => {
    if (p.groupe !== groupe) { groupe = p.groupe; ui.ecrire(ui.c.gras(groupe)); }
    ui.ecrire(`  ${symbole[p.etat]} ${ui.c.pale(`${i + 1}.`)} ${p.titre}`);
  });
  ui.note('\n✔ vérifié   ☐ à préparer (vérifié à la saisie)   ✘ manquant');
  const bloquant = liste.find(p => p.etat === 'ko');
  for (;;) {
    const r = await ui.choix('Et maintenant ?', [
      { libelle: 'Tout est prêt : continuer', valeur: 'go' },
      { libelle: 'Afficher le pas à pas d’un prérequis', valeur: 'detail' },
      { libelle: 'Tout afficher (pas à pas complet)', valeur: 'tout' },
      { libelle: 'Quitter (rien n’a été changé)', valeur: 'quitter' },
    ]);
    if (r === 'quitter') throw new Interruption();
    if (r === 'detail' || r === 'tout') {
      const choisis = r === 'tout' ? liste : [liste[Number(await ui.question('Numéro du prérequis', { controle: v => (Number(v) >= 1 && Number(v) <= liste.length ? null : `De 1 à ${liste.length}.`) })) - 1]];
      for (const p of choisis) { ui.ecrire(`\n${ui.c.gras(p.titre)}`); for (const l of p.detail.split('\n')) ui.ecrire(`  ${l}`); }
      ui.ecrire();
      continue;
    }
    if (bloquant && !(await ui.ouiNon(`« ${bloquant.titre} » manque. Continuer quand même ?`, { defaut: false }))) continue;
    return;
  }
}

async function questionsMachine(ui, ctx) {
  ui.titre('La machine');
  const { mode, racine } = ctx;
  let pile = trouverPile(mode, racine);
  if (mode === 'linux') {
    const dossier = await ui.question('Dossier de la pile (docker-compose.yml, .env)', { defaut: MODES.linux.projet, controle: v => (CHEMIN.test(v) ? null : 'Chemin absolu, sans espace.') });
    pile = trouverPile(mode, racine, dossier);
  }
  ctx.pile = pile;
  ctx.ancien = pile.existe ? lireEnv(lire(`${racine}${pile.dossier}/.env`) || '') : {};
  ctx.ancienVigie = lireEnv(lire(`${racine}${pile.dossier}/vigie.env`) || '');
  if (pile.existe) {
    ui.alerte(`Installation existante trouvée (${pile.dossier}) : mise à jour. Les valeurs déjà posées sont proposées et les secrets gardés.`);
  } else ui.info(`Nouvelle pile : ${pile.dossier}`);

  const d = MODES[mode];
  ctx.nicephos = await ui.question('Dossier de Nicephos (données du site, Vigie)', {
    defaut: ctx.ancien.NICEPHOS_DIR || d.nicephos, controle: controleDonnees(mode, racine),
    aide: mode === 'unraid' ? 'Sur un pool, chiffré de préférence, chemin direct /mnt/<pool>/…' : undefined,
  });
  ctx.sauvegardes = await ui.question('Dossier des sauvegardes', {
    defaut: ctx.ancien.BACKUP_DIR || d.sauvegardes, controle: controleSauvegardes(ctx.nicephos),
    aide: 'Sur d’autres disques que les données (le tableau, par exemple).',
  });
  if (memeSupport(mode, ctx.nicephos, ctx.sauvegardes)) ui.alerte('Données et sauvegardes sur le même pool : un disque perdu emporte les deux. Mieux vaut le tableau pour les sauvegardes.');
  if (mode === 'unraid') { ctx.uid = d.uid; ctx.gid = d.gid; } else {
    const n = v => (/^\d{1,6}$/.test(v) ? null : 'Un nombre.');
    ctx.uid = Number(await ui.question('Utilisateur des conteneurs (uid)', { defaut: ctx.ancien.PUID || d.uid, controle: n }));
    ctx.gid = Number(await ui.question('Groupe des conteneurs (gid)', { defaut: ctx.ancien.PGID || d.gid, controle: n }));
  }
  ctx.port = await ui.question('Port du site sur le réseau local (contrôle seulement)', {
    defaut: ctx.ancien.LAN_PORT || '3080', controle: v => (/^\d{2,5}$/.test(v) && Number(v) >= 1024 && Number(v) <= 65535 ? null : 'Un port entre 1024 et 65535.'),
  });
  if (ctx.ancien.DATA_KEY) ui.ok('Chiffrement des données personnelles dans la base : déjà actif (clé gardée).');
  else {
    ui.note('  La base contient des noms, des e-mails, des signatures. Avec une clé, ils y sont chiffrés ; clé perdue = données illisibles.');
    ctx.dataKey = await ui.ouiNon('Chiffrer les données personnelles dans la base (DATA_KEY) ?', { defaut: true });
  }
  const profils = (ctx.ancien.COMPOSE_PROFILES || '').split(',').map(s => s.trim()).filter(Boolean);
  ctx.profils = profils;
  ctx.vigie = await ui.ouiNon('Installer aussi la Vigie (journal de sécurité, facultative) ?', { defaut: profils.includes('vigie') });
}

async function questionsDomaine(ui, ctx) {
  ui.titre('Le domaine');
  const ancienne = ctx.ancien.PUBLIC_URL && /^https:\/\/([^/]+)/.exec(ctx.ancien.PUBLIC_URL)?.[1];
  const zoneDefaut = ancienne ? ancienne.split('.').slice(-2).join('.') : 'nicephos.art';
  ctx.zone = (await ui.question('Domaine (zone Cloudflare)', { defaut: zoneDefaut, controle: v => (NOM_DNS.test(v.toLowerCase()) ? null : 'Un nom de domaine, par exemple nicephos.art.') })).toLowerCase();
  ctx.www = (await ui.question('Adresse publique du site (toutes les autres y sont redirigées)', {
    defaut: ancienne && ancienne.endsWith(`.${ctx.zone}`) ? ancienne : `www.${ctx.zone}`,
    controle: v => (NOM_DNS.test(v.toLowerCase()) && v.toLowerCase().endsWith(`.${ctx.zone}`) && v.split('.').length === ctx.zone.split('.').length + 1
      ? null : `Un seul niveau sous ${ctx.zone} (le certificat gratuit ne couvre que *.${ctx.zone}), par exemple www.${ctx.zone}.`),
  })).toLowerCase();
  ctx.adresse = `https://${ctx.www}`;
}

async function questionsZitadel(ui, ctx) {
  ui.titre('Zitadel : la connexion à l’admin');
  ctx.issuer = (await ui.question('Adresse de l’instance Zitadel', {
    defaut: ctx.ancien.OIDC_ISSUER && !ctx.ancien.OIDC_ISSUER.includes('<') ? ctx.ancien.OIDC_ISSUER : '',
    aide: 'Par exemple https://nicephos-xxxxxx.zitadel.cloud',
    controle: async v => {
      if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/.test(v)) return 'Une adresse https://… sans chemin.';
      try {
        const r = await ctx.fetch(`${v.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) return `Cette adresse ne répond pas comme une instance Zitadel (${r.status}).`;
      } catch (err) { return `Injoignable (${err.cause?.code || err.message}).`; }
      return null;
    },
  })).replace(/\/$/, '');
  for (;;) {
    const jeton = await ui.secret('Jeton personnel (PAT) du compte de service « installateur »', { aide: 'Prérequis : compte de service avec un Personal Access Token (pas à pas dans l’écran des prérequis).' });
    const client = creerClient({ service: 'Zitadel', base: ctx.issuer, jeton, fetch: ctx.fetch, lectureSeule: ctx.essai });
    const api = Z.apiZitadel(client);
    try {
      const v = await Z.verifierJeton(api);
      ui.ok(`Connecté : « ${v.utilisateur} », organisation « ${v.orgNom} » (${v.orgId})`);
      if (v.instance) ui.ok('Rôle d’instance (IAM_OWNER) : oui');
      else ui.alerte('Pas de rôle d’instance (IAM_OWNER) : le rôle du compte de lecture de la Vigie sera à donner à la main.');
      Object.assign(ctx, { zitadel: api, orgId: v.orgId, iamOwner: v.instance });
      break;
    } catch (err) {
      ui.echec(err.statut === 401 ? 'Jeton refusé (expiré ou mal copié).' : err.message);
    }
  }
  ui.ecrire();
  ui.ecrire('Administrateurs : un compte Zitadel chacun, avec le rôle « admin » du projet. E-mail vide pour finir.');
  ctx.admins = [];
  for (let i = 1; ; i++) {
    const email = (await ui.question(`E-mail de l’administrateur n° ${i}`, {
      controle: v => (v === '' && ctx.admins.length ? null : EMAIL.test(v) ? (ctx.admins.some(a => a.email === v.toLowerCase()) ? 'Déjà dans la liste.' : null) : 'Une adresse e-mail.'),
    })).toLowerCase();
    if (!email) break;
    const trouve = (await ctx.zitadel.utilisateurs(email))?.result?.[0];
    if (trouve) {
      const nom = trouve.human?.profile?.displayName || trouve.preferredLoginName || email;
      ui.ok(`compte existant : ${nom}`);
      ctx.admins.push({ email, id: trouve.id, prenom: '', nom: '' });
    } else {
      const prenom = await ui.question('  Prénom');
      const nom = await ui.question('  Nom');
      ctx.admins.push({ email, prenom, nom });
    }
  }
  ui.note('  Second facteur obligatoire : chaque compte enregistre une clé d’accès ou une application d’authentification à sa');
  ui.note('  prochaine connexion (y compris par Google). Conseillé : deux facteurs par compte, pour ne pas se bloquer.');
  ctx.forcerMfa = await ui.ouiNon('Exiger un second facteur pour tous les comptes ?', { defaut: true });
}

async function questionsCloudflare(ui, ctx) {
  ui.titre('Cloudflare : le tunnel et le domaine');
  ui.note('  Durcissement conseillé (deploy/unraid/vigie-phase-0.md, partie 2) : TLS 1.2 minimum, Full (strict), en-têtes,');
  ui.note('  règles du pare-feu (outils et chemins de scanners, méthodes inutiles, admin hors pays habituels), limite de débit');
  ui.note('  des images, DNSSEC et CAA. Bot Fight Mode reste à faire à la main (à tester avec une publication Instagram).');
  ctx.durcir = await ui.ouiNon('Appliquer le durcissement conseillé ?', { defaut: true });
  if (ctx.vigie) ctx.console = await ui.ouiNon(`Console de la Vigie sur vigie.${ctx.zone}, derrière Cloudflare Access ?`, { defaut: true });
  for (;;) {
    const jeton = await ui.secret('Jeton d’API Cloudflare de l’installateur', { aide: 'Prérequis : jeton « Nicephos : installateur » (droits listés dans l’écran des prérequis).' });
    const client = creerClient({ service: 'Cloudflare', base: ctx.cfBase || 'https://api.cloudflare.com/client/v4', jeton, fetch: ctx.fetch, lectureSeule: ctx.essai });
    const api = CF.apiCloudflare(client);
    try {
      const v = await CF.verifierJeton(api, { zoneNom: ctx.zone, durcissement: ctx.durcir, access: ctx.console });
      ui.ok(`Zone ${v.zone.nom} (${v.zone.statut}, offre ${v.zone.plan}), compte « ${v.compte.nom} »`);
      if (v.zone.statut !== 'active') ui.alerte('La zone n’est pas encore « active » : serveurs DNS à changer chez le registraire, ou en cours de prise en compte.');
      for (const d of v.droits) (d.ok ? ui.ok : d.obligatoire ? ui.echec : ui.alerte)(`${d.libelle}${d.ok ? '' : ' : refusé'}`);
      const manque = v.droits.filter(d => !d.ok && d.obligatoire);
      if (manque.length) { ui.echec('Droits manquants : complétez le jeton (My Profile → API Tokens → Edit), puis saisissez-le à nouveau.'); continue; }
      const facultatifs = v.droits.filter(d => !d.ok && !d.obligatoire);
      if (facultatifs.length && !(await ui.ouiNon('Des droits facultatifs manquent : les étapes concernées échoueront. Continuer quand même ?', { defaut: false }))) continue;
      Object.assign(ctx, { cloudflare: api, zoneId: v.zone.id, compte: v.compte.id, offre: v.zone.plan });
      break;
    } catch (err) { ui.echec(err.message); }
  }
  ctx.tunnelNom = await ui.question('Nom du tunnel', { defaut: 'nicephos', controle: v => (/^[A-Za-z0-9_-]{1,64}$/.test(v) ? null : 'Lettres, chiffres, _ et - seulement.') });
  if (ctx.console) {
    ctx.equipe = await CF.equipeAccess(ctx.cloudflare, ctx.compte);
    if (ctx.equipe) ui.ok(`Cloudflare Zero Trust : équipe « ${ctx.equipe} »`);
    else {
      ui.alerte('Cloudflare Zero Trust n’est pas activé sur ce compte : la console de la Vigie ne sera pas configurée cette fois.');
      ui.note('  one.dash.cloudflare.com → choisir un nom d’équipe et l’offre Free, puis relancer l’installateur.');
      ctx.console = false;
    }
  }
}

// ---------- le plan ----------

async function construirePlan(ui, ctx) {
  ui.titre('Inspection');
  ui.etape('Lecture de ce qui existe déjà (rien n’est changé)…');
  const { racine } = ctx;
  const plan = [];
  const sortie = ctx.sortie = { site: {}, vigieProjet: {}, console: {}, accesZ: {}, lecture: {}, cf: {}, acces: {} };
  const vigieHote = `vigie.${ctx.zone}`;
  const secrets = path.posix.join(ctx.nicephos, 'vigie-secrets');

  // La machine : dossiers d'abord (la clé de la Vigie y est écrite pendant l'étape Zitadel).
  for (const d of planDossiers({ nicephos: ctx.nicephos, sauvegardes: ctx.sauvegardes, uid: ctx.uid, gid: ctx.gid, vigie: ctx.vigie })) {
    const e = etatDossier(d, racine);
    const libelle = `dossier ${d.chemin} (${d.uid}:${d.gid}, ${d.mode.toString(8)})`;
    if (e.etat === 'creer') plan.push(element(M, libelle, 'creer', { appliquer: () => creerDossier(d, racine) }));
    else if (e.etat === 'ok') plan.push(element(M, libelle, 'ok'));
    else plan.push(element(M, `dossier ${d.chemin}`, 'alerte', { detail: `${e.detail} : laissé tel quel (il peut contenir des données) ; vérifiez-le` }));
  }
  if (ctx.mode === 'unraid') {
    for (const ch of [ctx.nicephos, ctx.sauvegardes]) {
      const o = partageOuvert(ch, racine);
      if (o) plan.push(element(M, `partage « ${o.partage} » exporté sans mot de passe (${[o.smb && 'SMB', o.nfs && 'NFS'].filter(Boolean).join(', ')})`, 'alerte', { detail: 'Shares → le partage → Export : No (ou sécurité Private avec un utilisateur nommé) : l’invité réseau est nobody, propriétaire des données' }));
    }
    // La clé USB porte le .env et vigie.env de la pile (secrets) : partage « flash » à fermer aussi.
    if (partageOuvert('/boot', racine)) {
      plan.push(element(M, 'partage « flash » (clé USB d’Unraid) exporté sans mot de passe', 'alerte', { detail: 'les secrets de la pile y sont (.env, vigie.env) : Main → Flash → SMB Security Settings → Export : No' }));
    }
  }

  // Zitadel : le site.
  const za = ctx.zitadel;
  plan.push(...await Z.planProjet(za, { nomProjet: 'Nicephos', roles: [['admin', 'Administrateur']], orgId: ctx.orgId, sortie: sortie.site }));
  plan.push(...await Z.planApplication(za, {
    projet: sortie.site, sortie: sortie.site,
    app: { nom: 'Site Nicephos', redirections: [`${ctx.adresse}/auth/callback`], deconnexions: [`${ctx.adresse}/`] },
    secretConnu: id => (ctx.ancien.OIDC_CLIENT_ID === id && ctx.ancien.OIDC_CLIENT_SECRET ? ctx.ancien.OIDC_CLIENT_SECRET : null),
  }));
  plan.push(...await Z.planAdmins(za, { admins: ctx.admins, orgId: ctx.orgId }));
  plan.push(...await Z.planAutorisations(za, { admins: ctx.admins, projet: sortie.site, roleKeys: ['admin'], nomProjet: 'Nicephos' }));
  plan.push(...await Z.planPolitique(za, { forcerMfa: ctx.forcerMfa }));

  // Zitadel : la Vigie (compte de lecture ; projet et applications de la console).
  if (ctx.vigie) {
    const cleZitadel = `${racine}${secrets}/zitadel.json`;
    plan.push(...await Z.planLectureVigie(za, {
      cleDejaPosee: fs.existsSync(cleZitadel), instance: ctx.iamOwner, sortie: sortie.lecture,
      ecrireCle: contenu => ecrireFichier(cleZitadel, contenu, { mode: 0o600, proprietaire: { uid: ctx.uid, gid: ctx.gid } }),
    }));
  }
  if (ctx.console) {
    plan.push(...await Z.planProjet(za, { nomProjet: 'Vigie', roles: Z.ROLES_VIGIE, orgId: ctx.orgId, sortie: sortie.vigieProjet }));
    const secretConsole = (lire(`${racine}${secrets}/console-secret`) || '').trim();
    plan.push(...await Z.planApplication(za, {
      projet: sortie.vigieProjet, sortie: sortie.console,
      app: { nom: 'Console Vigie', redirections: [`https://${vigieHote}/auth/callback`], deconnexions: [`https://${vigieHote}/`], rolesDansIdToken: true, profilDansIdToken: true },
      secretConnu: id => (ctx.ancienVigie.VIGIE_CONSOLE_CLIENT_ID === id && secretConsole.length >= 16 ? secretConsole : null),
    }));
    const fournisseurs = (await ctx.cloudflare.fournisseurs(ctx.compte))?.result || [];
    plan.push(...await Z.planApplication(za, {
      projet: sortie.vigieProjet, sortie: sortie.accesZ,
      app: { nom: 'Cloudflare Access', redirections: [`https://${ctx.equipe}.cloudflareaccess.com/cdn-cgi/access/callback`], deconnexions: [], profilDansIdToken: true },
      secretUtile: !fournisseurs.some(f => f.type === 'oidc' && f.name === 'Zitadel'),
    }));
    plan.push(...await Z.planAutorisations(za, { admins: ctx.admins, projet: sortie.vigieProjet, roleKeys: ['vigie.admin'], nomProjet: 'Vigie' }));
  }

  // Cloudflare.
  const cf = ctx.cloudflare;
  const adresses = [{ hostname: ctx.www, service: 'http://nicephos:3000' }];
  if (ctx.console) adresses.push({ hostname: vigieHote, service: `http://${ctx.ancien.VIGIE_CONSOLE_IP || '172.29.42.20'}:4200` });
  plan.push(...await CF.planTunnel(cf, { compte: ctx.compte, nom: ctx.tunnelNom, adresses, sortie: sortie.cf }));
  const versTunnel = { type: 'CNAME', contenu: () => `${sortie.cf.tunnelId}.cfargotunnel.com`, attendu: c => c === `${sortie.cf.tunnelId}.cfargotunnel.com`, proxied: true, commentaire: 'Nicephos : tunnel (installateur)' };
  plan.push(...await CF.planDns(cf, {
    zone: ctx.zoneId,
    remplacer: q => (ctx.essai ? Promise.resolve(false) : ui.ouiNon(q, { defaut: false })),
    enregistrements: [
      { nom: ctx.www, ...versTunnel },
      ...(ctx.console ? [{ nom: vigieHote, ...versTunnel }] : []),
      { nom: ctx.zone, type: 'A', contenu: CF.ADRESSE_FICTIVE, proxied: true, seulementSiLibre: true, commentaire: 'Nicephos : redirigé vers www (installateur)' },
      { nom: `*.${ctx.zone}`, type: 'A', contenu: CF.ADRESSE_FICTIVE, proxied: true, seulementSiLibre: true, commentaire: 'Nicephos : redirigé vers www (installateur)' },
    ],
  }));
  plan.push(...await CF.planRegles(cf, {
    zone: ctx.zoneId, phase: 'http_request_dynamic_redirect', libelle: `redirection de toutes les adresses vers ${ctx.www} (301)`,
    regles: [CF.regleRedirection({ www: ctx.www, exclus: ctx.console ? [vigieHote] : [] })], reconnaitre: CF.redirectionManuelle(ctx.www),
  }));
  plan.push(...await CF.planReglages(cf, { zone: ctx.zoneId, voulus: ctx.durcir ? { ...CF.REGLAGES_BASE, ...CF.REGLAGES_DURCIS } : CF.REGLAGES_BASE }));
  if (ctx.durcir) {
    plan.push(...await CF.planEntetesGeres(cf, { zone: ctx.zoneId }));
    plan.push(...await CF.planListeBloquees(cf, { compte: ctx.compte, sortie: sortie.cf }));
    plan.push(...await CF.planRegles(cf, { zone: ctx.zoneId, phase: 'http_request_firewall_custom', libelle: 'règles personnalisées du pare-feu (5)', regles: CF.reglesWaf() }));
    plan.push(...await CF.planRegles(cf, { zone: ctx.zoneId, phase: 'http_ratelimit', libelle: 'limite de débit des images (200 requêtes / 10 s)', regles: [CF.regleDebitImages()], limiteUne: ctx.offre === 'free' }));
    plan.push(...await CF.planDnssec(cf, { zone: ctx.zoneId, sortie: sortie.cf }));
    plan.push(...await CF.planCaa(cf, { zone: ctx.zoneId, zoneNom: ctx.zone }));
  }
  if (ctx.console) {
    plan.push(...await CF.planAccess(cf, { compte: ctx.compte, hote: vigieHote, issuer: ctx.issuer, appZitadel: sortie.accesZ, emails: ctx.admins.map(a => a.email), sortie: sortie.acces }));
  }

  // La machine : les fichiers de la pile, à la fin (ils reprennent ce que Zitadel et Cloudflare ont donné).
  plan.push(...planFichiers(ctx));
  return plan;
}

// Valeurs du .env du site. `nouvelles` : imposées (réponses, identifiants de Zitadel et Cloudflare) ; `siAbsentes` :
// posées seulement si la clé n'a pas encore de valeur (secrets générés ici).
export function valeursSite(ctx) {
  const s = ctx.sortie;
  const nouvelles = {
    NICEPHOS_DIR: ctx.nicephos, BACKUP_DIR: ctx.sauvegardes, PUID: ctx.uid, PGID: ctx.gid, LAN_PORT: ctx.port,
    PUBLIC_URL: ctx.adresse,
    OIDC_ISSUER: ctx.issuer, OIDC_CLIENT_ID: s.site.clientId, OIDC_PROJECT_ID: s.site.projetId, OIDC_ORG_ID: ctx.orgId, OIDC_ADMIN_ROLE: 'admin',
    TUNNEL_TOKEN: s.cf.jeton,
  };
  if (s.site.clientSecret) nouvelles.OIDC_CLIENT_SECRET = s.site.clientSecret;
  const siAbsentes = { COOKIE_SECRET: aleatoire() };
  if (ctx.dataKey) siAbsentes.DATA_KEY = aleatoire();
  if (ctx.vigie) {
    const v = ctx.clesVigie;
    Object.assign(nouvelles, { VIGIE_URL: 'http://vigie-reception:4100', VIGIE_INGEST_KEY: v.VIGIE_INGEST_KEY, VIGIE_DECISIONS_PUBKEY: v.VIGIE_DECISIONS_PUBKEY });
    nouvelles.COMPOSE_PROFILES = [...new Set([...ctx.profils, 'vigie'])].join(',');
    if (ctx.console) nouvelles.VIGIE_CONSOLE_URL = `https://vigie.${ctx.zone}`;
  }
  return { nouvelles, siAbsentes };
}

export function valeursVigie(ctx) {
  const s = ctx.sortie;
  const v = ctx.clesVigie;
  const nouvelles = { VIGIE_INGEST_KEY: v.VIGIE_INGEST_KEY, VIGIE_LOG_KEY: v.VIGIE_LOG_KEY, VIGIE_DECISIONS_PRIVATE_KEY: v.VIGIE_DECISIONS_PRIVATE_KEY, VIGIE_ZITADEL_ISSUER: ctx.issuer };
  if (ctx.console) {
    Object.assign(nouvelles, {
      VIGIE_CONSOLE_CLIENT_ID: s.console.clientId, VIGIE_CONSOLE_PROJECT_ID: s.vigieProjet.projetId, VIGIE_CONSOLE_ORG_ID: ctx.orgId,
      VIGIE_ACCESS_TEAM: ctx.equipe, VIGIE_ACCESS_AUD: s.acces.aud, VIGIE_ADMIN_SUBS: ctx.admins.map(a => a.id).filter(Boolean).join(','),
      VIGIE_CONSOLE_URL: `https://vigie.${ctx.zone}`,
    });
  }
  return nouvelles;
}

// Clés de la Vigie : celles du vigie.env existant si elles y sont (clé publique déduite de la privée), sinon neuves.
export function clesVigieDe(ancienVigie) {
  if (ancienVigie.VIGIE_INGEST_KEY && ancienVigie.VIGIE_LOG_KEY && ancienVigie.VIGIE_DECISIONS_PRIVATE_KEY) {
    const pub = clePubliqueDe(ancienVigie.VIGIE_DECISIONS_PRIVATE_KEY);
    if (pub) return { ...ancienVigie, VIGIE_DECISIONS_PUBKEY: pub, existantes: true };
  }
  const k = clesVigie();
  return { ...k.vigie, ...k.site, existantes: false };
}

function planFichiers(ctx) {
  const { racine, pile } = ctx;
  const plan = [];
  const projet = `${racine}${pile.dossier}`;
  const proprietaireRoot = { uid: 0, gid: 0 };
  if (ctx.vigie) ctx.clesVigie = clesVigieDe(ctx.ancienVigie);

  const modele = lire(path.join(MODELES, 'compose.yaml'));
  const actuel = lire(`${projet}/docker-compose.yml`);
  if (actuel === modele) plan.push(element(M, `fichier de la pile ${pile.dossier}/docker-compose.yml`, 'ok'));
  else {
    plan.push(element(M, `fichier de la pile ${pile.dossier}/docker-compose.yml`, actuel ? 'modifier' : 'creer', {
      detail: actuel ? 'remplacé par celui de cette version (copie de l’ancien gardée à côté)' : undefined,
      appliquer: () => { const c = garderCopie(`${projet}/docker-compose.yml`); ecrireFichier(`${projet}/docker-compose.yml`, modele, { mode: 0o644 }); return c ? `copie : ${path.basename(c)}` : undefined; },
    }));
  }
  if (ctx.mode === 'unraid' && pile.nouveauDossier) {
    plan.push(element(M, 'pile « nicephos » dans Compose Manager', 'creer', { appliquer: () => ecrireFichier(`${projet}/name`, `${NOM_PILE}\n`, { mode: 0o644 }) }));
  }

  const changementsEnv = (base, valeurs, siAbsentes, nouveau) => {
    const actives = lireEnv(base);
    const toutes = { ...valeurs };
    for (const [k, v] of Object.entries(siAbsentes)) if (!actives[k] || nouveau) toutes[k] = v;
    // Nouveau fichier : les exemples du modèle sont remplacés ; fichier existant : seules les valeurs imposées le sont.
    return fusionnerEnv(base, toutes, { forcer: nouveau ? Object.keys(toutes) : Object.keys(valeurs) });
  };
  const resume = (ch, nouveau) => {
    const faits = ch.filter(c => c.action !== 'gardee');
    if (nouveau) return `${faits.length} réglages posés`;
    return faits.map(c => `${c.cle} (${c.action === 'posee' ? 'posée' : 'remplacée'})`).join(', ');
  };

  plan.push(element(M, `réglages du site ${pile.dossier}/.env`, pile.existe ? 'modifier' : 'creer', {
    detail: pile.existe ? 'valeurs déjà posées gardées (secrets, clé de chiffrement) ; copie de l’ancien fichier gardée à côté' : undefined,
    appliquer: () => {
      const nouveau = !pile.existe;
      const base = nouveau ? lire(path.join(MODELES, 'env.example')) : lire(`${projet}/.env`);
      const { nouvelles, siAbsentes } = valeursSite(ctx);
      const { texte, changements } = changementsEnv(base, nouvelles, siAbsentes, nouveau);
      ctx.dataKeyPosee = changements.some(c => c.cle === 'DATA_KEY' && c.action === 'posee');
      if (!nouveau) garderCopie(`${projet}/.env`);
      ecrireFichier(`${projet}/.env`, texte, { mode: 0o600, proprietaire: proprietaireRoot });
      return resume(changements, nouveau) || 'rien à changer';
    },
  }));

  if (ctx.vigie) {
    const existe = Boolean(lire(`${projet}/vigie.env`));
    plan.push(element(M, `réglages de la Vigie ${pile.dossier}/vigie.env${ctx.clesVigie.existantes ? ' (clés gardées)' : ' (clés neuves)'}`, existe ? 'modifier' : 'creer', {
      appliquer: () => {
        const base = existe ? lire(`${projet}/vigie.env`) : lire(path.join(MODELES, 'vigie.env.example'));
        const valeurs = valeursVigie(ctx);
        const { texte, changements } = fusionnerEnv(base, valeurs, { forcer: existe ? Object.keys(valeurs).filter(k => !/^VIGIE_(INGEST_KEY|LOG_KEY|DECISIONS_PRIVATE_KEY)$/.test(k)) : Object.keys(valeurs) });
        if (existe) garderCopie(`${projet}/vigie.env`);
        ecrireFichier(`${projet}/vigie.env`, texte, { mode: 0o600, proprietaire: proprietaireRoot });
        return resume(changements, !existe) || 'rien à changer';
      },
    }));
  }
  if (ctx.console) {
    const fichier = `${racine}${path.posix.join(ctx.nicephos, 'vigie-secrets', 'console-secret')}`;
    plan.push(element(M, 'secret client de la console (vigie-secrets/console-secret)', 'creer', {
      detail: 'écrit si Zitadel en a donné un nouveau, sinon gardé',
      appliquer: () => {
        const s = ctx.sortie.console.clientSecret;
        if (!s) return 'gardé';
        if ((lire(fichier) || '').trim() === s) return 'inchangé';
        ecrireFichier(fichier, `${s}\n`, { mode: 0o600, proprietaire: { uid: ctx.uid, gid: ctx.gid } });
        return 'posé';
      },
    }));
  }
  return plan;
}

// ---------- la fin ----------

export function resteAFaire(ctx) {
  const l = [];
  l.push('Zitadel : supprimer le compte de service « installateur » (Users → Service Users), ou au moins son jeton.');
  l.push('Cloudflare : supprimer le jeton « Nicephos : installateur » (My Profile → API Tokens).');
  const nouveaux = ctx.admins.filter(a => a.prenom || a.nom);
  if (nouveaux.length) l.push(`Invitations envoyées par Zitadel à ${nouveaux.map(a => a.email).join(', ')} : chacun choisit son mot de passe.`);
  if (ctx.forcerMfa) l.push('Chaque administrateur : à la première connexion, enregistrer deux facteurs (clé d’accès et application d’authentification).');
  l.push(`Lier chaque compte à son auteur : admin → Auteurs → fiche → Compte de connexion (sub : ${ctx.admins.map(a => `${a.email} = ${a.id || '?'}`).join(', ')}).`);
  if (ctx.dataKeyPosee) l.push(`DATA_KEY générée : copiez-la dans votre gestionnaire de mots de passe (ligne DATA_KEY de ${ctx.pile.dossier}/.env). Perdue, les données personnelles sont illisibles, sauvegardes comprises.`);
  if (ctx.sortie?.cf?.ds) l.push(`DNSSEC : copier l’enregistrement DS chez le registraire du domaine : ${ctx.sortie.cf.ds}`);
  if (ctx.durcir) {
    l.push('Cloudflare, à la main : Security → Bots → Block AI bots et Bot Fight Mode, puis tester une publication Instagram (sinon couper Bot Fight Mode).');
    l.push('Cloudflare, à la main : Web Analytics sans injection automatique ; Notifications : HTTP DDoS Attack Alert, Tunnel Health Alert.');
  }
  l.push('Admin → Réglages → Droits & confidentialité : cocher « disques chiffrés » et « deux facteurs » quand c’est vrai.');
  if (ctx.vigie) {
    l.push('Vigie : alertes Signal (deploy/unraid/signal/README.md), bordure et mode urgence (vigie-phase-0.md, 3.4 à 3.7) restent à faire si vous les voulez.');
    if (!ctx.iamOwner) l.push('Zitadel : donner le rôle d’instance IAM_OWNER_VIEWER (et aucun autre) au compte « vigie-lecture ».');
  }
  return l;
}

function ecrireSuite(ctx) {
  const fichier = process.env.INSTALLEUR_SORTIE;
  if (!fichier) return;
  const lignes = [`PROJET=${ctx.pile.dossier}`, `NOM=${NOM_PILE}`, `ADRESSE=${ctx.adresse}`, `REDIRECTION=https://${ctx.zone}`, `DEMARRER=${ctx.demarrer ? 1 : 0}`];
  fs.writeFileSync(fichier, `${lignes.join('\n')}\n`, { mode: 0o600 });
  // Reste à faire, réaffiché par le lanceur après le démarrage de la pile (texte seul, jamais exécuté).
  fs.writeFileSync(`${fichier}-a-faire`, `${resteAFaire(ctx).join('\n')}\n`, { mode: 0o600 });
}

export async function deroule({ ui, mode, hote = {}, racine = '', essai = false, fetch: f = globalThis.fetch, cfBase, quandApplique = () => {} }) {
  const ctx = { ui, mode, hote, racine, essai, fetch: f, cfBase };
  accueil(ui, ctx);
  await ecranPrerequis(ui, ctx);
  await questionsMachine(ui, ctx);
  await questionsDomaine(ui, ctx);
  await questionsZitadel(ui, ctx);
  await questionsCloudflare(ui, ctx);
  const plan = await construirePlan(ui, ctx);
  ui.titre('Ce qui va être fait');
  afficherPlan(ui, plan);
  if (essai) { ui.ecrire(); ui.ok('Essai terminé : rien n’a été changé.'); return ctx; }
  const aFaire = plan.some(e => ['creer', 'modifier'].includes(e.etat));
  if (!(await ui.ouiNon(aFaire ? 'Appliquer ce plan ?' : 'Tout est déjà en place. Réécrire la suite et démarrer la pile ?', { defaut: aFaire }))) throw new Interruption();
  quandApplique();
  ui.titre('Application');
  await appliquerPlan(ui, plan);
  ctx.demarrer = await ui.ouiNon('Démarrer (ou mettre à jour) la pile maintenant ?', { defaut: true });
  ui.titre('Reste à faire à la main');
  for (const l of resteAFaire(ctx)) ui.ecrire(`  ☐ ${l}`);
  ecrireSuite(ctx);
  return ctx;
}

async function main() {
  const argv = process.argv.slice(2);
  for (const a of argv) if (a !== '--essai') { console.error(`option inconnue : ${a}`); process.exit(2); }
  const essai = argv.includes('--essai');
  let hote = {};
  try { hote = JSON.parse(process.env.INSTALLEUR_HOTE || '{}'); } catch { /* lanceur ancien */ }
  const mode = process.env.INSTALLEUR_MODE || hote.mode || (fs.existsSync('/etc/unraid-version') ? 'unraid' : 'linux');
  const racine = process.env.INSTALLEUR_RACINE ?? '';
  const ui = creerUI();
  let applique = false;
  try {
    await deroule({ ui, mode, hote, racine, essai, quandApplique: () => { applique = true; } });
    ui.fermer();
  } catch (err) {
    ui.fermer();
    if (err instanceof Interruption) {
      console.log(`\n${applique ? 'Interrompu : ce qui est fait sera retrouvé au prochain lancement.' : 'Interrompu : rien n’a été changé.'}`);
      process.exit(130);
    }
    console.error(`\n✘ ${err.message}`);
    if (err instanceof ErreurApi && err.statut === 403 && err.service === 'Cloudflare') {
      const d = CF.aideDroit(err.chemin);
      if (d) console.error(`  Droit probablement manquant au jeton Cloudflare : ${d}.`);
    }
    if (err.etape) console.error('  Ce qui a déjà été fait est retrouvé au prochain lancement : corrigez, puis relancez l’installateur.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
