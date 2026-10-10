import crypto from 'node:crypto';
import http from 'node:http';

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

// Faux fournisseur OIDC minimal (découverte, JWKS, token, userinfo) pour tester le flux réel
// d'openid-client sans réseau. Le test fixe les claims de l'utilisateur puis émet un code
// lié aux paramètres de la requête d'autorisation (state, nonce, PKCE).
export async function startProvider(t, { clientId = 'site', clientSecret = 'secret' } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };
  const codes = new Map();
  const tokens = new Map();
  const provider = { user: {}, userinfo: {}, issuer: '', requests: [] };

  const sign = payload => {
    const input = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' })}.${b64(payload)}`;
    return `${input}.${crypto.sign('sha256', Buffer.from(input), privateKey).toString('base64url')}`;
  };

  const send = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, provider.issuer);
    provider.requests.push(url.pathname);
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (url.pathname === '/.well-known/openid-configuration') {
        return send(res, 200, {
          issuer: provider.issuer,
          authorization_endpoint: `${provider.issuer}/oauth/v2/authorize`,
          token_endpoint: `${provider.issuer}/oauth/v2/token`,
          userinfo_endpoint: `${provider.issuer}/oidc/v1/userinfo`,
          end_session_endpoint: `${provider.issuer}/oidc/v1/end_session`,
          jwks_uri: `${provider.issuer}/oauth/v2/keys`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic'],
        });
      }
      if (url.pathname === '/oauth/v2/keys') return send(res, 200, { keys: [jwk] });
      if (url.pathname === '/oauth/v2/token' && req.method === 'POST') {
        const auth = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
        if (auth !== `${clientId}:${clientSecret}`) return send(res, 401, { error: 'invalid_client' });
        const form = new URLSearchParams(body);
        const grant = codes.get(form.get('code'));
        codes.delete(form.get('code'));
        const challenge = crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
        if (!grant || grant.challenge !== challenge) return send(res, 400, { error: 'invalid_grant' });
        const now = Math.floor(Date.now() / 1000);
        const accessToken = crypto.randomBytes(16).toString('hex');
        tokens.set(accessToken, grant.user.sub);
        return send(res, 200, {
          access_token: accessToken, token_type: 'Bearer', expires_in: 3600,
          id_token: sign({ iss: provider.issuer, aud: clientId, iat: now, exp: now + 300, nonce: grant.nonce, ...grant.user }),
        });
      }
      if (url.pathname === '/oidc/v1/userinfo') {
        const sub = tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
        if (!sub) return send(res, 401, { error: 'invalid_token' });
        return send(res, 200, { sub, ...provider.userinfo });
      }
      send(res, 404, { error: 'not_found' });
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  provider.issuer = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));

  // Simule le passage de l'utilisateur sur la page de connexion de l'IdP.
  provider.authorize = authorizationUrl => {
    const params = new URL(authorizationUrl).searchParams;
    const code = crypto.randomBytes(16).toString('hex');
    codes.set(code, { challenge: params.get('code_challenge'), nonce: params.get('nonce'), user: { ...provider.user } });
    return { code, state: params.get('state'), params };
  };

  return provider;
}
