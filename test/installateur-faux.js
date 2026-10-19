// Faux Zitadel et faux Cloudflare en mémoire pour les tests de l'installateur : assez de leurs API pour une
// installation complète, avec les mêmes formes de réponses (Zitadel : champs camelCase, listes « result » ;
// Cloudflare : enveloppe success/result). Chaque requête est notée dans `journal`.

const json = (status, corps) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corps) });

function routeur(routes, journal, service) {
  return async (url, { method = 'GET', body, headers = {} } = {}) => {
    const u = new URL(url);
    const corps = body ? JSON.parse(body) : undefined;
    journal.push({ service, method, chemin: u.pathname + u.search, corps, auth: headers.Authorization });
    for (const [m, motif, fn] of routes) {
      if (m !== method) continue;
      const r = motif.exec(u.pathname);
      if (r) return fn({ params: r.slice(1), corps, query: u.searchParams });
    }
    return json(404, { message: `route inconnue ${method} ${u.pathname}` });
  };
}

export function fauxZitadel({ etat = {}, journal = [] } = {}) {
  const s = Object.assign({ projets: [], apps: [], roles: [], utilisateurs: [], autorisations: [], membres: [], cles: [], politique: null, n: 0 }, etat);
  const id = p => `${p}${++s.n}`;
  const ok = c => json(200, c);
  const texte = q => q?.name ?? q?.emailAddress ?? q?.userName;
  const routes = [
    ['GET', /^\/\.well-known\/openid-configuration$/, () => ok({ issuer: 'https://test.zitadel.cloud' })],
    ['GET', /^\/management\/v1\/orgs\/me$/, () => ok({ org: { id: 'org1', name: 'Nicephos' } })],
    ['GET', /^\/auth\/v1\/users\/me$/, () => ok({ user: { id: 'inst', userName: 'installateur' } })],
    ['POST', /^\/admin\/v1\/members\/_search$/, () => ok({ result: s.membres })],
    ['POST', /^\/admin\/v1\/members$/, ({ corps }) => { s.membres.push({ userId: corps.userId, roles: corps.roles }); return ok({}); }],
    ['PUT', /^\/admin\/v1\/members\/([^/]+)$/, ({ params, corps }) => { s.membres.find(m => m.userId === params[0]).roles = corps.roles; return ok({}); }],
    ['POST', /^\/management\/v1\/projects\/_search$/, ({ corps }) => ok({ result: s.projets.filter(p => p.name === texte(corps.queries?.[0]?.nameQuery)) })],
    ['POST', /^\/management\/v1\/projects$/, ({ corps }) => { const p = { id: id('projet'), ...corps, details: { resourceOwner: 'org1' } }; s.projets.push(p); return ok({ id: p.id }); }],
    ['PUT', /^\/management\/v1\/projects\/([^/]+)$/, ({ params, corps }) => { Object.assign(s.projets.find(p => p.id === params[0]), corps); return ok({}); }],
    ['POST', /^\/management\/v1\/projects\/([^/]+)\/roles\/_search$/, ({ params }) => ok({ result: s.roles.filter(r => r.projet === params[0]) })],
    ['POST', /^\/management\/v1\/projects\/([^/]+)\/roles$/, ({ params, corps }) => {
      if (s.roles.some(r => r.projet === params[0] && r.key === corps.roleKey)) return json(409, { message: 'Errors.Project.Role.AlreadyExists' });
      s.roles.push({ projet: params[0], key: corps.roleKey, displayName: corps.displayName }); return ok({});
    }],
    ['POST', /^\/management\/v1\/projects\/([^/]+)\/apps\/_search$/, ({ params }) => ok({ result: s.apps.filter(a => a.projet === params[0]) })],
    ['POST', /^\/management\/v1\/projects\/([^/]+)\/apps\/oidc$/, ({ params, corps }) => {
      const { name, ...oidc } = corps;
      const a = { projet: params[0], id: id('app'), name, oidcConfig: { ...oidc, clientId: id('client') }, secret: id('secret-0123456789abcdef-') };
      s.apps.push(a);
      return ok({ appId: a.id, clientId: a.oidcConfig.clientId, clientSecret: a.secret });
    }],
    ['PUT', /^\/management\/v1\/projects\/([^/]+)\/apps\/([^/]+)\/oidc_config$/, ({ params, corps }) => { const a = s.apps.find(x => x.id === params[1]); a.oidcConfig = { ...corps, clientId: a.oidcConfig.clientId }; return ok({}); }],
    ['POST', /^\/management\/v1\/projects\/([^/]+)\/apps\/([^/]+)\/oidc_config\/_generate_client_secret$/, ({ params }) => { const a = s.apps.find(x => x.id === params[1]); a.secret = id('secret-0123456789abcdef-'); return ok({ clientSecret: a.secret }); }],
    ['POST', /^\/management\/v1\/users\/_search$/, ({ corps }) => {
      const q = corps.queries || [];
      const email = q.find(x => x.emailQuery)?.emailQuery?.emailAddress?.toLowerCase();
      const nom = q.find(x => x.userNameQuery)?.userNameQuery?.userName;
      return ok({ result: s.utilisateurs.filter(u => (email ? u.human?.email?.email === email : true) && (nom ? u.userName === nom : true)) });
    }],
    ['POST', /^\/management\/v1\/users\/human$/, ({ corps }) => { const u = { id: id('user'), userName: corps.userName, human: { profile: corps.profile, email: { email: corps.email.email } } }; s.utilisateurs.push(u); return ok({ userId: u.id }); }],
    ['POST', /^\/management\/v1\/users\/machine$/, ({ corps }) => { const u = { id: id('machine'), userName: corps.userName, machine: { name: corps.name } }; s.utilisateurs.push(u); return ok({ userId: u.id }); }],
    ['POST', /^\/management\/v1\/users\/([^/]+)\/keys$/, ({ params, corps }) => {
      const cle = { type: 'serviceaccount', keyId: id('cle'), key: '-----BEGIN RSA PRIVATE KEY-----\nfaux\n-----END RSA PRIVATE KEY-----\n', expirationDate: corps.expirationDate, userId: params[0] };
      s.cles.push(cle);
      return ok({ keyId: cle.keyId, keyDetails: Buffer.from(JSON.stringify(cle)).toString('base64') });
    }],
    ['POST', /^\/management\/v1\/users\/grants\/_search$/, ({ corps }) => {
      const u = corps.queries.find(x => x.userIdQuery).userIdQuery.userId, p = corps.queries.find(x => x.projectIdQuery).projectIdQuery.projectId;
      return ok({ result: s.autorisations.filter(g => g.userId === u && g.projectId === p) });
    }],
    ['POST', /^\/management\/v1\/users\/([^/]+)\/grants$/, ({ params, corps }) => { s.autorisations.push({ id: id('grant'), userId: params[0], projectId: corps.projectId, roleKeys: corps.roleKeys }); return ok({}); }],
    ['PUT', /^\/management\/v1\/users\/([^/]+)\/grants\/([^/]+)$/, ({ params, corps }) => { s.autorisations.find(g => g.id === params[1]).roleKeys = corps.roleKeys; return ok({}); }],
    ['GET', /^\/management\/v1\/policies\/login$/, () => ok(s.politique ? { policy: s.politique } : { policy: { allowUsernamePassword: true, allowRegister: true, allowExternalIdp: true, passwordCheckLifetime: '864000s', isDefault: true }, isDefault: true })],
    ['POST', /^\/management\/v1\/policies\/login$/, ({ corps }) => { s.politique = { ...corps }; return ok({}); }],
    ['PUT', /^\/management\/v1\/policies\/login$/, ({ corps }) => { Object.assign(s.politique, corps); return ok({}); }],
  ];
  return { fetch: routeur(routes, journal, 'zitadel'), etat: s, journal };
}

export function fauxCloudflare({ etat = {}, journal = [] } = {}) {
  const s = Object.assign({
    tunnels: [], configs: {}, connecteurs: {}, dns: [], entrees: {}, listes: [], fournisseurs: [], apps: [], politiques: [], n: 0,
    reglages: { always_use_https: 'off', ssl: 'full', ssl_automatic_mode: 'auto', min_tls_version: '1.0', tls_1_3: 'on', automatic_https_rewrites: 'off', security_level: 'medium', browser_check: 'on', challenge_ttl: 1800, rocket_loader: 'off', email_obfuscation: 'on', hotlink_protection: 'off' },
    entetes: {
      managed_request_headers: [{ id: 'add_visitor_location_headers', enabled: false }],
      managed_response_headers: [{ id: 'remove_x-powered-by_header', enabled: false }, { id: 'add_security_headers', enabled: false }],
    },
    dnssec: { status: 'disabled' },
    equipe: 'nicephos',
  }, etat);
  const id = p => `${p}${String(++s.n).padStart(4, '0')}`;
  const ok = result => json(200, { success: true, errors: [], result });
  const zone = { id: 'zone1', name: 'exemple.fr', status: 'active', account: { id: 'compte1', name: 'Seb' }, plan: { legacy_id: 'free' } };
  const routes = [
    ['GET', /^\/client\/v4\/user\/tokens\/verify$/, () => ok({ status: 'active' })],
    ['GET', /^\/client\/v4\/zones$/, ({ query }) => ok(query.get('name') === zone.name ? [zone] : [])],
    ['GET', /^\/client\/v4\/accounts\/compte1\/cfd_tunnel$/, ({ query }) => ok(s.tunnels.filter(t => t.name === query.get('name')))],
    ['POST', /^\/client\/v4\/accounts\/compte1\/cfd_tunnel$/, ({ corps }) => { const t = { id: id('tunnel-'), name: corps.name, remote_config: true }; s.tunnels.push(t); s.configs[t.id] = { ingress: [{ service: 'http_status:404' }] }; return ok({ ...t, token: `jeton-${t.id}` }); }],
    ['GET', /^\/client\/v4\/accounts\/compte1\/cfd_tunnel\/([^/]+)\/token$/, ({ params }) => ok(`jeton-${params[0]}`)],
    ['GET', /^\/client\/v4\/accounts\/compte1\/cfd_tunnel\/([^/]+)\/connections$/, ({ params }) => ok(s.connecteurs[params[0]] || [])],
    ['GET', /^\/client\/v4\/accounts\/compte1\/cfd_tunnel\/([^/]+)\/configurations$/, ({ params }) => ok({ config: s.configs[params[0]] })],
    ['PUT', /^\/client\/v4\/accounts\/compte1\/cfd_tunnel\/([^/]+)\/configurations$/, ({ params, corps }) => { s.configs[params[0]] = corps.config; return ok({}); }],
    ['GET', /^\/client\/v4\/zones\/zone1\/dns_records$/, ({ query }) => ok(s.dns.filter(r => r.name === query.get('name')))],
    ['POST', /^\/client\/v4\/zones\/zone1\/dns_records$/, ({ corps }) => { const r = { id: id('dns'), ...corps }; s.dns.push(r); return ok(r); }],
    ['PATCH', /^\/client\/v4\/zones\/zone1\/dns_records\/([^/]+)$/, ({ params, corps }) => { Object.assign(s.dns.find(r => r.id === params[0]), corps); return ok({}); }],
    ['GET', /^\/client\/v4\/zones\/zone1\/rulesets\/phases\/([^/]+)\/entrypoint$/, ({ params }) => (s.entrees[params[0]] ? ok(s.entrees[params[0]]) : json(404, { success: false, errors: [{ code: 10003, message: 'not found' }] }))],
    ['PUT', /^\/client\/v4\/zones\/zone1\/rulesets\/phases\/([^/]+)\/entrypoint$/, ({ params, corps }) => { s.entrees[params[0]] = { id: id('ruleset'), phase: params[0], rules: corps.rules.map(r => ({ id: id('regle'), ...r })) }; return ok(s.entrees[params[0]]); }],
    ['POST', /^\/client\/v4\/zones\/zone1\/rulesets\/([^/]+)\/rules$/, ({ params, corps }) => {
      const e = Object.values(s.entrees).find(x => x.id === params[0]);
      const { position, ...r } = corps;
      const regle = { id: id('regle'), ...r };
      if (position?.index) e.rules.splice(position.index - 1, 0, regle); else e.rules.push(regle);
      return ok(e);
    }],
    ['PATCH', /^\/client\/v4\/zones\/zone1\/rulesets\/([^/]+)\/rules\/([^/]+)$/, ({ params, corps }) => { const e = Object.values(s.entrees).find(x => x.id === params[0]); Object.assign(e.rules.find(r => r.id === params[1]), corps); return ok(e); }],
    ['GET', /^\/client\/v4\/zones\/zone1\/settings\/([^/]+)$/, ({ params }) => (params[0] in s.reglages ? ok({ id: params[0], value: s.reglages[params[0]], editable: true }) : json(404, { success: false, errors: [{ message: 'inconnu' }] }))],
    ['PATCH', /^\/client\/v4\/zones\/zone1\/settings\/([^/]+)$/, ({ params, corps }) => { s.reglages[params[0]] = corps.value; return ok({ id: params[0], value: corps.value }); }],
    ['GET', /^\/client\/v4\/zones\/zone1\/managed_headers$/, () => ok(s.entetes)],
    ['PATCH', /^\/client\/v4\/zones\/zone1\/managed_headers$/, ({ corps }) => {
      for (const [g, l] of Object.entries(corps)) for (const x of l) s.entetes[g].find(y => y.id === x.id).enabled = x.enabled;
      return ok(s.entetes);
    }],
    ['GET', /^\/client\/v4\/zones\/zone1\/dnssec$/, () => ok(s.dnssec)],
    ['PATCH', /^\/client\/v4\/zones\/zone1\/dnssec$/, () => { s.dnssec = { status: 'pending', ds: 'exemple.fr. 3600 IN DS 2371 13 2 ABCDEF' }; return ok(s.dnssec); }],
    ['GET', /^\/client\/v4\/accounts\/compte1\/rules\/lists$/, () => ok(s.listes)],
    ['POST', /^\/client\/v4\/accounts\/compte1\/rules\/lists$/, ({ corps }) => { const l = { id: id('liste'), ...corps }; s.listes.push(l); return ok(l); }],
    ['GET', /^\/client\/v4\/accounts\/compte1\/access\/organizations$/, () => (s.equipe ? ok({ auth_domain: `${s.equipe}.cloudflareaccess.com` }) : json(404, { success: false, errors: [{ message: 'none' }] }))],
    ['GET', /^\/client\/v4\/accounts\/compte1\/access\/identity_providers$/, () => ok(s.fournisseurs)],
    ['POST', /^\/client\/v4\/accounts\/compte1\/access\/identity_providers$/, ({ corps }) => { const f = { id: id('idp'), ...corps }; s.fournisseurs.push(f); return ok(f); }],
    ['GET', /^\/client\/v4\/accounts\/compte1\/access\/policies$/, () => ok(s.politiques)],
    ['POST', /^\/client\/v4\/accounts\/compte1\/access\/policies$/, ({ corps }) => { const p = { id: id('pol'), ...corps }; s.politiques.push(p); return ok(p); }],
    ['GET', /^\/client\/v4\/accounts\/compte1\/access\/apps$/, () => ok(s.apps)],
    ['POST', /^\/client\/v4\/accounts\/compte1\/access\/apps$/, ({ corps }) => { const a = { id: id('app'), aud: 'a'.repeat(64), ...corps }; s.apps.push(a); return ok(a); }],
  ];
  return { fetch: routeur(routes, journal, 'cloudflare'), etat: s, journal };
}

// Un seul fetch pour les deux, aiguillé par l'hôte.
export function fauxServices(opts = {}) {
  const journal = [];
  const z = fauxZitadel({ ...opts.zitadel, journal });
  const c = fauxCloudflare({ ...opts.cloudflare, journal });
  const fetch = (url, o) => (new URL(url).host === 'api.cloudflare.com' ? c.fetch(url, o) : z.fetch(url, o));
  return { fetch, zitadel: z.etat, cloudflare: c.etat, journal };
}
