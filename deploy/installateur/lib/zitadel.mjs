// Zitadel : appels de l'API de gestion (v1) et des utilisateurs (v2), avec le jeton personnel (PAT) du compte de
// service « installateur ». Chaque fonction de plan inspecte d'abord ce qui existe (projet, rôle, application,
// comptes, autorisations, politique de connexion) et ne crée que ce qui manque ; rien n'est jamais supprimé.
import { element } from './plan.mjs';

const EGAL = 'TEXT_QUERY_METHOD_EQUALS';
const D = 'Zitadel';

// « Rien à changer » (400 NoChangesFound / NotChanged) et « existe déjà » (409) : l'état voulu est déjà là.
export async function sansChangement(promesse) {
  try { return await promesse; } catch (err) {
    if (err.statut === 409 || (err.statut === 400 && /NoChanges|NotChanged/i.test(err.detail || ''))) return { dejaLa: true };
    throw err;
  }
}

export function apiZitadel(client) {
  const m = '/management/v1';
  return {
    moi: () => client.get('/auth/v1/users/me'),
    organisation: () => client.get(`${m}/orgs/me`),
    membresInstance: () => client.post('/admin/v1/members/_search', { query: { limit: 200 } }),
    ajouterMembreInstance: (userId, roles) => sansChangement(client.post('/admin/v1/members', { userId, roles })),
    majMembreInstance: (userId, roles) => sansChangement(client.put(`/admin/v1/members/${userId}`, { roles })),

    projets: nom => client.post(`${m}/projects/_search`, { queries: [{ nameQuery: { name: nom, method: EGAL } }] }),
    creerProjet: nom => client.post(`${m}/projects`, { name: nom, projectRoleAssertion: true, projectRoleCheck: true }),
    majProjet: (id, p) => sansChangement(client.put(`${m}/projects/${id}`, {
      name: p.name, projectRoleAssertion: true, projectRoleCheck: true, hasProjectCheck: Boolean(p.hasProjectCheck),
      privateLabelingSetting: p.privateLabelingSetting || 'PRIVATE_LABELING_SETTING_UNSPECIFIED',
    })),
    roles: pid => client.post(`${m}/projects/${pid}/roles/_search`, { query: { limit: 200 } }),
    ajouterRole: (pid, cle, nom) => sansChangement(client.post(`${m}/projects/${pid}/roles`, { roleKey: cle, displayName: nom })),

    applications: pid => client.post(`${m}/projects/${pid}/apps/_search`, { query: { limit: 200 } }),
    creerAppOidc: (pid, conf) => client.post(`${m}/projects/${pid}/apps/oidc`, conf),
    majAppOidc: (pid, aid, conf) => sansChangement(client.put(`${m}/projects/${pid}/apps/${aid}/oidc_config`, conf)),
    nouveauSecret: (pid, aid) => client.post(`${m}/projects/${pid}/apps/${aid}/oidc_config/_generate_client_secret`, {}),

    utilisateurs: email => client.post(`${m}/users/_search`, {
      query: { limit: 10 }, queries: [{ emailQuery: { emailAddress: email, method: 'TEXT_QUERY_METHOD_EQUALS_IGNORE_CASE' } }, { typeQuery: { type: 'TYPE_HUMAN' } }],
    }),
    utilisateurParNom: nom => client.post(`${m}/users/_search`, { query: { limit: 10 }, queries: [{ userNameQuery: { userName: nom, method: EGAL } }] }),
    // Sans mot de passe et e-mail non vérifié : Zitadel envoie le message d'initialisation (choisir son mot de passe).
    creerHumain: ({ prenom, nom, email }) => client.post(`${m}/users/human`, {
      userName: email,
      profile: { firstName: prenom, lastName: nom, displayName: `${prenom} ${nom}`.trim() },
      email: { email, isEmailVerified: false },
    }),

    autorisations: (userId, pid) => client.post(`${m}/users/grants/_search`, {
      query: { limit: 50 }, queries: [{ userIdQuery: { userId } }, { projectIdQuery: { projectId: pid } }],
    }),
    autoriser: (userId, pid, roleKeys) => sansChangement(client.post(`${m}/users/${userId}/grants`, { projectId: pid, roleKeys })),
    majAutorisation: (userId, grantId, roleKeys) => sansChangement(client.put(`${m}/users/${userId}/grants/${grantId}`, { roleKeys })),

    politique: () => client.get(`${m}/policies/login`),
    creerPolitique: p => sansChangement(client.post(`${m}/policies/login`, p)),
    majPolitique: p => sansChangement(client.put(`${m}/policies/login`, p)),

    creerMachine: (userName, name) => client.post(`${m}/users/machine`, { userName, name, description: name, accessTokenType: 'ACCESS_TOKEN_TYPE_JWT' }),
    creerCle: (userId, expirationDate) => client.post(`${m}/users/${userId}/keys`, { type: 'KEY_TYPE_JSON', expirationDate }),
  };
}

const liste = r => r?.result || r?.details?.result || [];
const utilisateursDe = r => r?.result || [];

// Le jeton : qui est-il, dans quelle organisation, a-t-il le rôle d'instance (utile au compte de lecture de la Vigie).
export async function verifierJeton(api) {
  const org = await api.organisation();
  const moi = await api.moi().catch(() => ({}));
  let instance = false;
  try { await api.membresInstance(); instance = true; } catch (err) { if (![403, 401].includes(err.statut) && err.statut !== 404) throw err; }
  return {
    utilisateur: moi.user?.userName || moi.user?.id || '?',
    orgId: org.org?.id, orgNom: org.org?.name,
    instance,
  };
}

// Configuration OIDC voulue d'une application web (méthode « Code », secret client envoyé en Basic, PKCE ajouté par
// le site et la Vigie).
export function confWeb({ nom, redirections, deconnexions, rolesDansIdToken = false, profilDansIdToken = false }) {
  return {
    name: nom,
    redirectUris: redirections,
    postLogoutRedirectUris: deconnexions,
    responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
    grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE'],
    appType: 'OIDC_APP_TYPE_WEB',
    authMethodType: 'OIDC_AUTH_METHOD_TYPE_BASIC',
    version: 'OIDC_VERSION_1_0',
    devMode: false,
    accessTokenType: 'OIDC_TOKEN_TYPE_BEARER',
    accessTokenRoleAssertion: false,
    idTokenRoleAssertion: rolesDansIdToken,
    idTokenUserinfoAssertion: profilDansIdToken,
  };
}

// Écarts entre la configuration OIDC trouvée et la voulue (les adresses voulues doivent y être ; d'autres adresses
// déjà déclarées sont gardées).
export function ecartsOidc(trouvee, voulue) {
  const e = [];
  const manque = (a = [], b = []) => b.filter(x => !a.includes(x));
  if (manque(trouvee.redirectUris, voulue.redirectUris).length) e.push('adresse de retour');
  if (manque(trouvee.postLogoutRedirectUris, voulue.postLogoutRedirectUris).length) e.push('adresse après déconnexion');
  if (trouvee.appType && trouvee.appType !== voulue.appType) e.push('type d’application');
  if (trouvee.authMethodType && trouvee.authMethodType !== voulue.authMethodType) e.push('méthode d’authentification');
  if (!(trouvee.grantTypes || []).includes('OIDC_GRANT_TYPE_AUTHORIZATION_CODE')) e.push('flux « code »');
  if (voulue.idTokenRoleAssertion && !trouvee.idTokenRoleAssertion) e.push('rôles dans l’ID token');
  if (voulue.idTokenUserinfoAssertion && !trouvee.idTokenUserinfoAssertion) e.push('profil dans l’ID token');
  if (trouvee.devMode) e.push('mode développement à couper');
  return e;
}

// Corps de la mise à jour (PUT, sans masque : tout est renvoyé) : la configuration trouvée, sans ses champs en lecture
// seule, plus ce qui est voulu ; adresses et flux déjà déclarés gardés.
function confFusionnee(trouvee, voulue) {
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  const { clientId, noneCompliant, complianceProblems, allowedOrigins, version, ...base } = trouvee;
  const { name, version: _v, ...v } = voulue;
  return {
    ...base,
    redirectUris: union(trouvee.redirectUris, v.redirectUris),
    postLogoutRedirectUris: union(trouvee.postLogoutRedirectUris, v.postLogoutRedirectUris),
    responseTypes: union(trouvee.responseTypes, v.responseTypes),
    grantTypes: union(trouvee.grantTypes, v.grantTypes),
    appType: v.appType, authMethodType: v.authMethodType, devMode: false,
    accessTokenType: trouvee.accessTokenType || v.accessTokenType,
    accessTokenRoleAssertion: Boolean(trouvee.accessTokenRoleAssertion),
    idTokenRoleAssertion: Boolean(trouvee.idTokenRoleAssertion || v.idTokenRoleAssertion),
    idTokenUserinfoAssertion: Boolean(trouvee.idTokenUserinfoAssertion || v.idTokenUserinfoAssertion),
    clockSkew: trouvee.clockSkew || '0s',
    additionalOrigins: trouvee.additionalOrigins || [],
  };
}

// Projet et rôles. `sortie.projetId` reçoit l'identifiant (trouvé à l'inspection, ou à la création).
export async function planProjet(api, { nomProjet, roles, orgId, sortie }) {
  const plan = [];
  const trouves = liste(await api.projets(nomProjet)).filter(p => p.name === nomProjet && (!orgId || !p.details?.resourceOwner || p.details.resourceOwner === orgId));
  if (trouves.length > 1) {
    plan.push(element(D, `projet « ${nomProjet} »`, 'alerte', { detail: `${trouves.length} projets portent ce nom : le premier (${trouves[0].id}) est utilisé.` }));
  }
  const projet = trouves[0];
  if (!projet) {
    plan.push(element(D, `projet « ${nomProjet} » (rôles vérifiés à la connexion)`, 'creer', {
      appliquer: async () => { const r = await api.creerProjet(nomProjet); sortie.projetId = r.id; return r.id; },
    }));
  } else {
    sortie.projetId = projet.id;
    const reglages = projet.projectRoleAssertion && projet.projectRoleCheck;
    plan.push(element(D, `projet « ${nomProjet} »`, reglages ? 'ok' : 'modifier', {
      detail: reglages ? undefined : 'cocher « Assert Roles on Authentication » et « Check authorization on Authentication »',
      appliquer: () => api.majProjet(projet.id, projet),
    }));
  }
  const existants = projet ? new Set(liste(await api.roles(projet.id)).map(r => r.key)) : new Set();
  for (const [cle, nom] of roles) {
    plan.push(element(D, `rôle « ${cle} » du projet ${nomProjet}`, existants.has(cle) ? 'ok' : 'creer', {
      appliquer: () => api.ajouterRole(sortie.projetId, cle, nom),
    }));
  }
  return plan;
}

// Application OIDC d'un projet. `sortie` reçoit appId, clientId, clientSecret (quand Zitadel le donne).
// `secretConnu(clientId)` : le secret déjà posé sur la machine pour ce client, s'il y en a un. Sans lui, et si
// `secretUtile`, un nouveau secret est généré (Zitadel ne remontre jamais l'ancien, qui cesse alors de fonctionner).
export async function planApplication(api, { projet, app, secretConnu, secretUtile = true, sortie }) {
  const plan = [];
  const voulue = confWeb(app);
  const trouvee = projet.projetId ? liste(await api.applications(projet.projetId)).find(a => a.name === app.nom) : null;
  if (!trouvee) {
    plan.push(element(D, `application « ${app.nom} » (Web, code, ${app.redirections[0]})`, 'creer', {
      appliquer: async () => {
        const r = await api.creerAppOidc(projet.projetId, voulue);
        Object.assign(sortie, { appId: r.appId, clientId: r.clientId, clientSecret: r.clientSecret, secretNouveau: true });
        return `Client ID ${r.clientId}`;
      },
    }));
    return plan;
  }
  const oidc = trouvee.oidcConfig || {};
  Object.assign(sortie, { appId: trouvee.id, clientId: oidc.clientId });
  const ecarts = ecartsOidc(oidc, voulue);
  plan.push(element(D, `application « ${app.nom} »`, ecarts.length ? 'modifier' : 'ok', {
    detail: ecarts.length ? `à corriger : ${ecarts.join(', ')} (les autres adresses déjà déclarées sont gardées)` : undefined,
    appliquer: () => api.majAppOidc(projet.projetId, trouvee.id, confFusionnee(oidc, voulue)),
  }));
  const connu = secretConnu?.(oidc.clientId);
  if (connu) sortie.clientSecret = connu;
  else if (secretUtile) {
    plan.push(element(D, `nouveau secret client de « ${app.nom} »`, 'modifier', {
      detail: 'le secret actuel n’est connu nulle part ici (Zitadel ne le remontre jamais) : un nouveau est généré, l’ancien cesse de fonctionner',
      appliquer: async () => { const r = await api.nouveauSecret(projet.projetId, trouvee.id); Object.assign(sortie, { clientSecret: r.clientSecret, secretNouveau: true }); },
    }));
  }
  return plan;
}

// Comptes des administrateurs : trouvés par leur e-mail, sinon créés et invités (Zitadel envoie le message pour
// choisir le mot de passe). `admins` : [{ email, prenom, nom }] ; leur identifiant (sub) est rangé dans admin.id.
export async function planAdmins(api, { admins, orgId }) {
  const plan = [];
  for (const a of admins) {
    const trouves = utilisateursDe(await api.utilisateurs(a.email));
    const u = trouves[0];
    if (u) {
      a.id = u.id || u.userId;
      plan.push(element(D, `compte de ${a.email}`, 'ok'));
      continue;
    }
    plan.push(element(D, `compte de ${a.email} (${a.prenom} ${a.nom}), invitation envoyée par Zitadel`, 'creer', {
      appliquer: async () => {
        const r = await api.creerHumain(a);
        a.id = r.userId;
        return `sub ${a.id}`;
      },
    }));
  }
  return plan;
}

// Rôles donnés aux administrateurs dans un projet (autorisation ajoutée, ou complétée si elle existe sans ce rôle).
export async function planAutorisations(api, { admins, projet, roleKeys, nomProjet }) {
  const plan = [];
  for (const a of admins) {
    const existantes = a.id && projet.projetId ? liste(await api.autorisations(a.id, projet.projetId)) : [];
    const g = existantes[0];
    const manque = g ? roleKeys.filter(r => !(g.roleKeys || []).includes(r)) : roleKeys;
    const libelle = `rôle ${roleKeys.join(', ')} de ${a.email} dans ${nomProjet}`;
    if (g && !manque.length) { plan.push(element(D, libelle, 'ok')); continue; }
    plan.push(element(D, libelle, g ? 'modifier' : 'creer', {
      appliquer: () => (g ? api.majAutorisation(a.id, g.id, [...new Set([...(g.roleKeys || []), ...roleKeys])]) : api.autoriser(a.id, projet.projetId, roleKeys)),
    }));
  }
  return plan;
}

// Politique de connexion de l'organisation : inscriptions libres fermées ; second facteur obligatoire pour tous si
// demandé (y compris par Google : forceMfaLocalOnly décoché).
export async function planPolitique(api, { forcerMfa }) {
  const r = await api.politique();
  const p = r.policy || {};
  const parDefaut = Boolean(r.isDefault ?? p.isDefault);
  const voulu = { allowRegister: false, ...(forcerMfa ? { forceMfa: true, forceMfaLocalOnly: false } : {}) };
  const ecarts = Object.entries(voulu).filter(([k, v]) => Boolean(p[k]) !== v).map(([k]) => k);
  const libelle = `connexion : inscriptions libres fermées${forcerMfa ? ', second facteur obligatoire pour tous' : ''}`;
  if (!ecarts.length) return [element(D, libelle, 'ok')];
  // Politique propre à l'organisation : créée depuis celle de l'instance (isDefault), sinon mise à jour ; tous les
  // autres réglages repris tels quels.
  const garder = ['allowUsernamePassword', 'allowRegister', 'allowExternalIdp', 'forceMfa', 'forceMfaLocalOnly', 'passwordlessType',
    'hidePasswordReset', 'ignoreUnknownUsernames', 'defaultRedirectUri', 'passwordCheckLifetime', 'externalLoginCheckLifetime',
    'mfaInitSkipLifetime', 'secondFactorCheckLifetime', 'multiFactorCheckLifetime', 'allowDomainDiscovery', 'disableLoginWithEmail', 'disableLoginWithPhone'];
  const corps = Object.fromEntries(garder.filter(k => p[k] !== undefined).map(k => [k, p[k]]));
  Object.assign(corps, voulu);
  return [element(D, libelle, 'modifier', {
    detail: parDefaut ? 'politique propre à l’organisation créée à partir de celle de l’instance' : undefined,
    appliquer: async () => {
      if (parDefaut) {
        // Facteurs et fournisseurs (Google…) de la politique de l'instance repris dans celle de l'organisation.
        const ajout = {
          ...corps,
          secondFactors: p.secondFactors?.length ? p.secondFactors : ['SECOND_FACTOR_TYPE_OTP', 'SECOND_FACTOR_TYPE_U2F'],
          multiFactors: p.multiFactors?.length ? p.multiFactors : ['MULTI_FACTOR_TYPE_U2F_WITH_VERIFICATION'],
          idps: (p.idps || []).map(i => ({ idpId: i.idpId, ownerType: 'IDP_OWNER_TYPE_SYSTEM' })),
        };
        await api.creerPolitique(ajout);
      } else await api.majPolitique(corps);
    },
  })];
}

// Compte de service « vigie-lecture » de la Vigie : lecture des événements de l'instance (IAM_OWNER_VIEWER, aucun autre
// rôle), clé JSON d'un an écrite par `ecrireCle(contenu)` si aucune clé n'est déjà posée sur la machine.
export async function planLectureVigie(api, { cleDejaPosee, ecrireCle, sortie, maintenant = new Date(), instance }) {
  const plan = [];
  const nom = 'vigie-lecture';
  const u = utilisateursDe(await api.utilisateurParNom(nom))[0];
  if (u) sortie.lectureId = u.id || u.userId;
  plan.push(element(D, `compte de service « ${nom} » (jeton JWT)`, u ? 'ok' : 'creer', {
    appliquer: async () => { const r = await api.creerMachine(nom, 'Vigie (lecture)'); sortie.lectureId = r.userId; },
  }));
  if (!instance) {
    plan.push(element(D, `rôle d’instance IAM_OWNER_VIEWER de « ${nom} »`, 'manuel', {
      detail: 'le jeton de l’installateur n’a pas le rôle IAM_OWNER : à donner à la main (Default settings → Managers → Add)',
    }));
  } else {
    const membres = liste(await api.membresInstance());
    const m = sortie.lectureId && membres.find(x => x.userId === sortie.lectureId);
    const roles = m?.roles || [];
    const juste = roles.length === 1 && roles[0] === 'IAM_OWNER_VIEWER';
    plan.push(element(D, `rôle d’instance IAM_OWNER_VIEWER de « ${nom} » (et aucun autre)`, juste ? 'ok' : m ? 'modifier' : 'creer', {
      appliquer: () => (m ? api.majMembreInstance(sortie.lectureId, ['IAM_OWNER_VIEWER']) : api.ajouterMembreInstance(sortie.lectureId, ['IAM_OWNER_VIEWER'])),
    }));
  }
  if (cleDejaPosee) plan.push(element(D, `clé JSON de « ${nom} » (vigie-secrets/zitadel.json)`, 'ok'));
  else {
    const fin = new Date(maintenant.getTime() + 365 * 86400_000).toISOString();
    plan.push(element(D, `clé JSON de « ${nom} », valable un an (vigie-secrets/zitadel.json)`, 'creer', {
      appliquer: async () => {
        const r = await api.creerCle(sortie.lectureId, fin);
        const contenu = Buffer.from(r.keyDetails, 'base64').toString('utf8');
        JSON.parse(contenu); // la clé doit être un JSON valide avant d'être posée
        ecrireCle(contenu);
        return `expire le ${fin.slice(0, 10)}`;
      },
    }));
  }
  return plan;
}

export const ROLES_VIGIE = [['vigie.viewer', 'Lecteur'], ['vigie.handler', 'Intervenant'], ['vigie.analyst', 'Analyste'], ['vigie.admin', 'Administrateur']];
