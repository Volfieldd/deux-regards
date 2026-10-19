import * as client from 'openid-client';

const ROLE_CLAIM = 'urn:zitadel:iam:org:project:roles';
const REAUTH_MAX_AGE = 300;                     // secondes : vérification d'identité (comme la console de la Vigie)

// Rôles Zitadel : { admin: { <orgId>: <domaine> }, ... }. Le claim propre au projet est
// préféré au claim générique ; avec orgId, seuls les rôles donnés dans cette organisation comptent.
export function rolesFrom(claims, { projectId, orgId } = {}) {
  const specific = projectId && claims[`urn:zitadel:iam:org:project:${projectId}:roles`];
  const source = specific || claims[ROLE_CLAIM];
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source)
    .filter(([, orgs]) => !orgId || (orgs && typeof orgs === 'object' && Object.hasOwn(orgs, orgId)))
    .map(([role]) => role);
}

// Admin si le rôle de projet est présent, ou (repli sans Zitadel) si le sub est
// dans la liste blanche et l'e-mail vérifié par l'IdP.
export function isAdmin(claims, roles, oidc) {
  if (roles.includes(oidc.adminRole)) return true;
  return listedAdmin(claims, oidc);
}
// Repli OIDC_ALLOWED_SUBS seul (liste explicite de sub, indépendante de toute organisation Zitadel).
export const listedAdmin = (claims, oidc) => oidc.allowedSubs.includes(claims.sub) && claims.email_verified === true;

export function scopesFor(oidc) {
  const scopes = ['openid', 'profile', 'email'];
  if (oidc.projectId) scopes.push(`urn:zitadel:iam:org:project:id:${oidc.projectId}:aud`, 'urn:zitadel:iam:org:projects:roles');
  return scopes.join(' ');
}

// Client OIDC : découverte paresseuse (le site public démarre même si l'IdP est injoignable),
// mise en cache une fois réussie.
export function createOidc(config) {
  const { oidc } = config;
  const configured = Boolean(oidc.issuer && oidc.clientId);
  let discovered = null;

  function server() {
    // Avec secret : client_secret_basic (méthode « Code » d'une application Web Zitadel) ;
    // sans secret : client public, PKCE seul.
    discovered ??= client.discovery(new URL(oidc.issuer), oidc.clientId, undefined,
      oidc.clientSecret ? client.ClientSecretBasic(oidc.clientSecret) : client.None(),
      // HTTP accepté seulement en développement (IdP local ou de test) ; refusé par loadConfig sinon.
      !config.deployed && oidc.issuer.startsWith('http://') ? { execute: [client.allowInsecureRequests] } : undefined)
      .catch(err => { discovered = null; throw err; });
    return discovered;
  }

  return {
    configured,
    origin: configured ? new URL(oidc.issuer).origin : null,

    // Prépare une redirection vers l'IdP ; `tx` est à conserver jusqu'au retour.
    // reauth : vérification d'identité demandée par la Vigie (décision verifier_identite) : prompt=login et max_age=300,
    // comme la ré-authentification de la console (Zitadel redemande la clé d'accès, auth_time exigé).
    async start({ prompt, reauth = false } = {}) {
      const cfg = await server();
      const tx = { verifier: client.randomPKCECodeVerifier(), state: client.randomState(), nonce: client.randomNonce() };
      const params = {
        redirect_uri: oidc.redirectUri,
        scope: scopesFor(oidc),
        code_challenge: await client.calculatePKCECodeChallenge(tx.verifier),
        code_challenge_method: 'S256',
        state: tx.state,
        nonce: tx.nonce,
      };
      if (prompt) params.prompt = prompt;
      if (reauth) Object.assign(params, { prompt: 'login', max_age: String(REAUTH_MAX_AGE) });
      return { url: client.buildAuthorizationUrl(cfg, params).href, tx };
    },

    // Échange le code ; state, nonce, PKCE, signature, émetteur et audience sont vérifiés par openid-client.
    // Vérification d'identité (tx.reauth) : max_age vérifié par la bibliothèque (auth_time exigé et récent).
    async finish(query, tx) {
      const cfg = await server();
      const url = new URL(oidc.redirectUri);
      url.search = new URLSearchParams(query).toString();
      const tokens = await client.authorizationCodeGrant(cfg, url, {
        pkceCodeVerifier: tx.verifier, expectedState: tx.state, expectedNonce: tx.nonce, ...(tx.reauth ? { maxAge: REAUTH_MAX_AGE } : {}),
      });
      const idClaims = tokens.claims();
      // Zitadel ne met les rôles dans l'ID token que si l'option est cochée : on complète par userinfo.
      let userinfo = {};
      if (cfg.serverMetadata().userinfo_endpoint && tokens.access_token) {
        userinfo = await client.fetchUserInfo(cfg, tokens.access_token, idClaims.sub);
      }
      const claims = { ...userinfo, ...idClaims };
      const roles = rolesFrom(claims, oidc);
      // Heure de l'authentification chez Zitadel : lue dans le jeton d'identité seul (jamais dans userinfo).
      const authTime = Number.isFinite(idClaims.auth_time) ? idClaims.auth_time * 1000 : null;
      return { claims, roles, admin: isAdmin(claims, roles, oidc), listed: listedAdmin(claims, oidc), idToken: tokens.id_token, authTime };
    },

    // URL de déconnexion côté IdP (RP-initiated logout), ou null si l'IdP n'en propose pas.
    async logoutUrl(idToken) {
      const cfg = await server();
      if (!cfg.serverMetadata().end_session_endpoint) return null;
      const params = { post_logout_redirect_uri: `${config.publicUrl}/`, client_id: oidc.clientId };
      if (idToken) params.id_token_hint = idToken;
      return client.buildEndSessionUrl(cfg, params).href;
    },
  };
}
