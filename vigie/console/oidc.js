import * as client from 'openid-client';

// Connexion Zitadel propre à la console (annexe architecture § 5.2) : application « Console Vigie » du projet « Vigie »,
// méthode CODE avec secret client, plus PKCE, state et nonce (vérifiés par openid-client avec l'émetteur et
// l'audience). Rôles lus dans le jeton d'identité (« User roles inside ID Token »), dans l'organisation propriétaire du
// projet ; amr et auth_time lus dans le jeton d'identité seul (jamais dans userinfo).

const ROLE_CLAIM = 'urn:zitadel:iam:org:project:roles';

export function rolesFrom(claims, { projectId, orgId }) {
  const source = claims[`urn:zitadel:iam:org:project:${projectId}:roles`] || claims[ROLE_CLAIM];
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source).filter(([, orgs]) => orgs && typeof orgs === 'object' && Object.hasOwn(orgs, orgId)).map(([role]) => role);
}

export function createConsoleOidc({ issuer, clientId, clientSecret, projectId, orgId, url }) {
  const redirectUri = `${url}/auth/callback`;
  let discovered = null;
  const server = () => {
    discovered ??= client.discovery(new URL(issuer), clientId, undefined, client.ClientSecretBasic(clientSecret)).catch(err => { discovered = null; throw err; });
    return discovered;
  };
  return {
    origin: new URL(issuer).origin,
    // Toujours redemander l’authentification : une ancienne connexion Zitadel sans second facteur ferait boucler
    // « Se reconnecter » sur le refus MFA (D9). Pour une action sensible, max_age=300 reste vérifié au retour.
    async start({ reauth = false } = {}) {
      const cfg = await server();
      const tx = { verifier: client.randomPKCECodeVerifier(), state: client.randomState(), nonce: client.randomNonce() };
      const params = {
        redirect_uri: redirectUri,
        scope: `openid profile urn:zitadel:iam:org:project:id:${projectId}:aud urn:zitadel:iam:org:projects:roles`,
        code_challenge: await client.calculatePKCECodeChallenge(tx.verifier),
        code_challenge_method: 'S256',
        state: tx.state,
        nonce: tx.nonce,
        prompt: 'login',
      };
      if (reauth) params.max_age = '300';
      return { url: client.buildAuthorizationUrl(cfg, params).href, tx };
    },
    async finish(query, tx) {
      const cfg = await server();
      const u = new URL(redirectUri);
      u.search = new URLSearchParams(query).toString();
      // Ré-authentification : max_age vérifié par la bibliothèque (auth_time exigé et récent ; audit D3-A3).
      const tokens = await client.authorizationCodeGrant(cfg, u, { pkceCodeVerifier: tx.verifier, expectedState: tx.state, expectedNonce: tx.nonce, ...(tx.reauth ? { maxAge: 300 } : {}) });
      const c = tokens.claims();
      return {
        sub: c.sub,
        nom: typeof c.name === 'string' ? c.name : (typeof c.preferred_username === 'string' ? c.preferred_username : null),
        amr: Array.isArray(c.amr) ? c.amr.map(String) : [],
        authTime: Number.isFinite(c.auth_time) ? c.auth_time * 1000 : null,
        roles: rolesFrom(c, { projectId, orgId }),
      };
    },
    async logoutUrl() {
      const cfg = await server();
      if (!cfg.serverMetadata().end_session_endpoint) return null;
      return client.buildEndSessionUrl(cfg, { post_logout_redirect_uri: `${url}/`, client_id: clientId }).href;
    },
  };
}
