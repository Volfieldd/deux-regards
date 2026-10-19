// Cloudflare : tunnel (géré par Cloudflare), adresses publiques, DNS, redirection vers www, réglages de la zone,
// durcissement (deploy/unraid/vigie-phase-0.md, partie 2) et Access devant la console de la Vigie. Ce qui existe déjà
// est gardé : les autres adresses du tunnel, les autres enregistrements et règles de la zone ne sont jamais touchés.
import { element } from './plan.mjs';

const D = 'Cloudflare';
export const ADRESSE_FICTIVE = '192.0.2.1'; // jamais jointe : la redirection vers www passe avant (README Unraid, 4.4)

export function apiCloudflare(client) {
  return {
    verifier: () => client.get('/user/tokens/verify'),
    verifierCompte: compte => client.get(`/accounts/${compte}/tokens/verify`),
    zones: nom => client.get(`/zones?name=${encodeURIComponent(nom)}`),
    tunnels: (compte, nom) => client.get(`/accounts/${compte}/cfd_tunnel?name=${encodeURIComponent(nom)}&is_deleted=false`),
    creerTunnel: (compte, nom) => client.post(`/accounts/${compte}/cfd_tunnel`, { name: nom, config_src: 'cloudflare' }),
    jetonTunnel: (compte, id) => client.get(`/accounts/${compte}/cfd_tunnel/${id}/token`),
    connexions: (compte, id) => client.get(`/accounts/${compte}/cfd_tunnel/${id}/connections`),
    configTunnel: (compte, id) => client.get(`/accounts/${compte}/cfd_tunnel/${id}/configurations`),
    ecrireConfigTunnel: (compte, id, config) => client.put(`/accounts/${compte}/cfd_tunnel/${id}/configurations`, { config }),
    dns: (zone, nom) => client.get(`/zones/${zone}/dns_records?name=${encodeURIComponent(nom)}&per_page=100`),
    creerDns: (zone, r) => client.post(`/zones/${zone}/dns_records`, r),
    majDns: (zone, id, r) => client.patch(`/zones/${zone}/dns_records/${id}`, r),
    entree: (zone, phase) => client.get(`/zones/${zone}/rulesets/phases/${phase}/entrypoint`, { absent404: true }),
    creerEntree: (zone, phase, rules) => client.put(`/zones/${zone}/rulesets/phases/${phase}/entrypoint`, { rules }),
    ajouterRegle: (zone, ruleset, regle) => client.post(`/zones/${zone}/rulesets/${ruleset}/rules`, regle),
    majRegle: (zone, ruleset, id, regle) => client.patch(`/zones/${zone}/rulesets/${ruleset}/rules/${id}`, regle),
    reglage: (zone, nom) => client.get(`/zones/${zone}/settings/${nom}`),
    ecrireReglage: (zone, nom, value) => client.patch(`/zones/${zone}/settings/${nom}`, { value }),
    entetesGeres: zone => client.get(`/zones/${zone}/managed_headers`),
    ecrireEntetesGeres: (zone, corps) => client.patch(`/zones/${zone}/managed_headers`, corps),
    dnssec: zone => client.get(`/zones/${zone}/dnssec`),
    activerDnssec: zone => client.patch(`/zones/${zone}/dnssec`, { status: 'active' }),
    listes: compte => client.get(`/accounts/${compte}/rules/lists`),
    creerListe: (compte, nom, description) => client.post(`/accounts/${compte}/rules/lists`, { name: nom, kind: 'ip', description }),
    organisationAccess: compte => client.get(`/accounts/${compte}/access/organizations`, { absent404: true }),
    fournisseurs: compte => client.get(`/accounts/${compte}/access/identity_providers`),
    creerFournisseur: (compte, f) => client.post(`/accounts/${compte}/access/identity_providers`, f),
    applicationsAccess: compte => client.get(`/accounts/${compte}/access/apps`),
    creerApplicationAccess: (compte, a) => client.post(`/accounts/${compte}/access/apps`, a),
    majApplicationAccess: (compte, id, a) => client.put(`/accounts/${compte}/access/apps/${id}`, a),
    politiquesAccess: compte => client.get(`/accounts/${compte}/access/policies`),
    creerPolitiqueAccess: (compte, p) => client.post(`/accounts/${compte}/access/policies`, p),
  };
}

const res = r => r?.result ?? null;

// `a` contient tout ce que dit `b` (les champs ajoutés par Cloudflare dans `a` ne comptent pas).
export function contient(a, b) {
  if (b === undefined) return true;
  if (b === null || typeof b !== 'object') return a === b;
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((x, i) => contient(a[i], x));
  return a !== null && typeof a === 'object' && Object.entries(b).every(([k, v]) => contient(a[k], v));
}
// Corps d'une règle tel qu'envoyé (sans les marques internes de l'installateur).
const corpsRegle = ({ enPremier, ...r }) => r;

// Droits du jeton, essayés en lecture : chaque usage dit s'il passe. Les droits d'écriture ne se voient qu'à l'usage ;
// un refus à l'écriture nomme le droit manquant (aideDroit).
export async function verifierJeton(api, { zoneNom, durcissement, access }) {
  const r = { zone: null, compte: null, droits: [] };
  // Jeton d'utilisateur (My Profile) ou de compte (Manage Account) : chacun a sa vérification.
  let valide = await api.verifier().then(() => true, () => false);
  let zones;
  try { zones = res(await api.zones(zoneNom)) || []; } catch (err) {
    if ([400, 401, 403].includes(err.statut)) throw new Error(`jeton Cloudflare refusé (expiré, révoqué, mal copié, ou sans « Zone → Zone → Read ») : ${err.detail || err.statut}`);
    throw err;
  }
  const z = zones.find(x => x.name === zoneNom);
  if (!z) throw new Error(`zone « ${zoneNom} » introuvable avec ce jeton (Zone Resources du jeton, ou domaine pas encore ajouté à Cloudflare)`);
  r.zone = { id: z.id, nom: z.name, statut: z.status, plan: z.plan?.legacy_id || z.plan?.name || '?' };
  r.compte = { id: z.account?.id, nom: z.account?.name };
  if (!valide) valide = await api.verifierCompte(r.compte.id).then(() => true, () => false);
  if (!valide) throw new Error('jeton Cloudflare inactif (expiré ou désactivé)');
  const essai = async (libelle, fn, obligatoire = true) => {
    try { await fn(); r.droits.push({ libelle, ok: true, obligatoire }); } catch (err) { r.droits.push({ libelle, ok: false, obligatoire, erreur: err.message }); }
  };
  await essai('Account → Cloudflare Tunnel', () => api.tunnels(r.compte.id, 'nicephos'));
  await essai('Zone → DNS', () => api.dns(z.id, zoneNom));
  await essai('Zone → Zone Settings', () => api.reglage(z.id, 'always_use_https'));
  await essai('Zone → Single Redirect', () => api.entree(z.id, 'http_request_dynamic_redirect'));
  if (durcissement) {
    await essai('Zone → Zone WAF', () => api.entree(z.id, 'http_request_firewall_custom'), false);
    await essai('Zone → Managed Headers', () => api.entetesGeres(z.id), false);
    await essai('Account → Account Filter Lists', () => api.listes(r.compte.id), false);
  }
  if (access) {
    await essai('Account → Access: Organizations, Identity Providers, and Groups', () => api.fournisseurs(r.compte.id), false);
    await essai('Account → Access: Apps and Policies', () => api.applicationsAccess(r.compte.id), false);
  }
  return r;
}

// ---------- tunnel ----------

// Fusion des adresses publiques : les nôtres remplacées ou ajoutées (même nom), les autres gardées dans leur ordre,
// la règle finale « http_status:404 » toujours en dernier.
export function fusionnerIngress(actuelles = [], voulues = []) {
  const noms = new Set(voulues.map(v => v.hostname));
  const autres = actuelles.filter(r => r.hostname && !noms.has(r.hostname));
  const finale = actuelles.find(r => !r.hostname) || { service: 'http_status:404' };
  return [...voulues, ...autres, finale];
}

export async function planTunnel(api, { compte, nom, adresses, sortie }) {
  const plan = [];
  const t = (res(await api.tunnels(compte, nom)) || []).find(x => x.name === nom && !x.deleted_at);
  if (!t) {
    plan.push(element(D, `tunnel « ${nom} » (géré par Cloudflare)`, 'creer', {
      appliquer: async () => {
        const r = res(await api.creerTunnel(compte, nom));
        sortie.tunnelId = r.id;
        sortie.jeton = r.token || res(await api.jetonTunnel(compte, r.id));
        return r.id;
      },
    }));
  } else {
    sortie.tunnelId = t.id;
    plan.push(element(D, `tunnel « ${nom} »`, 'ok', {}));
    if (t.remote_config === false || t.config_src === 'local') {
      plan.push(element(D, `tunnel « ${nom} » configuré localement (config.yml)`, 'alerte', { detail: 'ses adresses publiques ne se règlent pas par l’API : seules celles du tableau de bord comptent' }));
    }
    sortie.jeton = res(await api.jetonTunnel(compte, t.id));
    const connecteurs = res(await api.connexions(compte, t.id)) || [];
    if (connecteurs.length > 1) {
      plan.push(element(D, `${connecteurs.length} connecteurs actifs sur le tunnel « ${nom} »`, 'alerte', {
        detail: `${connecteurs.map(c => `${c.origin_ip || c.conns?.[0]?.origin_ip || '?'} (cloudflared ${c.version || '?'})`).join(', ')}.\nUn seul doit tourner : celui de la pile (nicephos-tunnel). Un second cloudflared avec le même jeton reçoit une partie des requêtes et ne joint pas la pile (502 une fois sur deux) : arrêtez-le, ou donnez-lui un tunnel à lui.`,
      }));
    }
  }
  const actuelles = t ? res(await api.configTunnel(compte, t.id))?.config?.ingress || [] : [];
  const manquent = adresses.filter(v => !actuelles.some(r => r.hostname === v.hostname && r.service === v.service));
  const libelle = `adresses publiques du tunnel : ${adresses.map(a => `${a.hostname} → ${a.service}`).join(', ')}`;
  plan.push(element(D, libelle, manquent.length ? (t ? 'modifier' : 'creer') : 'ok', {
    detail: actuelles.filter(r => r.hostname && !adresses.some(a => a.hostname === r.hostname)).length
      ? `les autres adresses du tunnel sont gardées (${actuelles.filter(r => r.hostname && !adresses.some(a => a.hostname === r.hostname)).map(r => r.hostname).join(', ')})` : undefined,
    appliquer: async () => {
      const courante = res(await api.configTunnel(compte, sortie.tunnelId))?.config || {};
      await api.ecrireConfigTunnel(compte, sortie.tunnelId, { ...courante, ingress: fusionnerIngress(courante.ingress, adresses) });
    },
  }));
  return plan;
}

// ---------- DNS ----------

// `noms` : [{ nom, type, contenu, proxied, seulementSiLibre, commentaire }]. Un nom déjà pris par un autre type
// d'enregistrement est signalé (jamais remplacé sans `remplacer`).
export async function planDns(api, { zone, enregistrements, remplacer = async () => false }) {
  const plan = [];
  for (const e of enregistrements) {
    const existants = res(await api.dns(zone, e.nom)) || [];
    const memes = existants.filter(x => x.type === e.type);
    const libelle = `DNS ${e.type} ${e.nom} → ${typeof e.contenu === 'function' ? 'le tunnel' : e.contenu}${e.proxied ? ' (proxifié)' : ''}`;
    const corps = () => ({ type: e.type, name: e.nom, content: typeof e.contenu === 'function' ? e.contenu() : e.contenu, proxied: e.proxied, ttl: 1, comment: e.commentaire });
    if (e.seulementSiLibre && existants.some(x => ['A', 'AAAA', 'CNAME'].includes(x.type))) { plan.push(element(D, `DNS ${e.nom} : enregistrement existant gardé`, 'ok')); continue; }
    const voulu = typeof e.contenu === 'function' ? null : e.contenu;
    const pareil = memes.find(x => (voulu === null ? e.attendu?.(x.content) : x.content === voulu) && Boolean(x.proxied) === Boolean(e.proxied));
    if (pareil) { plan.push(element(D, libelle, 'ok')); continue; }
    const conflit = existants.find(x => x.type !== e.type && ['A', 'AAAA', 'CNAME'].includes(x.type)) || memes[0];
    if (!conflit) { plan.push(element(D, libelle, 'creer', { appliquer: () => api.creerDns(zone, corps()) })); continue; }
    if (await remplacer(`${e.nom} a déjà un enregistrement ${conflit.type} vers ${conflit.content}. Le remplacer par le tunnel ?`)) {
      plan.push(element(D, libelle, 'modifier', {
        detail: `remplace ${conflit.type} ${conflit.content}`,
        appliquer: () => api.majDns(zone, conflit.id, corps()),
      }));
    } else plan.push(element(D, `${e.nom} : enregistrement ${conflit.type} ${conflit.content} gardé`, 'alerte', { detail: 'le site ne sera pas joignable à cette adresse tant qu’il n’est pas remplacé' }));
  }
  return plan;
}

// ---------- règles (redirection, WAF, limite de débit) ----------

// Ajoute ou met à jour, dans l'entrée d'une phase, les règles repérées par leur « ref ». `reconnaitre(regle)` repère
// aussi une règle faite à la main d'après le guide (même effet, sans ref) : elle est mise à jour plutôt que doublée.
export async function planRegles(api, { zone, phase, regles, libelle, reconnaitre = () => false, limiteUne = false }) {
  const entree = res(await api.entree(zone, phase));
  const actuelles = entree?.rules || [];
  const plan = [];
  if (!entree) {
    plan.push(element(D, libelle, 'creer', { detail: regles.map(r => r.description).join('\n'), appliquer: () => api.creerEntree(zone, phase, regles.map(corpsRegle)) }));
    return plan;
  }
  for (const r of regles) {
    const trouvee = actuelles.find(x => x.ref === r.ref) || actuelles.find(x => reconnaitre(x, r));
    if (trouvee) {
      const memes = trouvee.expression === r.expression && trouvee.action === r.action && trouvee.enabled !== false
        && contient(trouvee.action_parameters, r.action_parameters) && contient(trouvee.ratelimit, r.ratelimit);
      plan.push(element(D, r.description, memes ? 'ok' : 'modifier', {
        detail: memes ? undefined : trouvee.ref === r.ref ? 'règle de l’installateur remise à jour' : 'règle faite à la main reconnue : mise à jour (sinon elle serait en double)',
        appliquer: () => api.majRegle(zone, entree.id, trouvee.id, corpsRegle(r)),
      }));
      continue;
    }
    if (limiteUne && actuelles.length) {
      plan.push(element(D, r.description, 'alerte', { detail: 'l’offre gratuite n’admet qu’une règle dans cette phase et elle est prise : rien n’est changé' }));
      continue;
    }
    plan.push(element(D, r.description, 'creer', { appliquer: () => api.ajouterRegle(zone, entree.id, r.enPremier ? { ...corpsRegle(r), position: { index: 1 } } : corpsRegle(r)) }));
  }
  return plan;
}

export function regleRedirection({ www, exclus = [] }) {
  const hotes = [www, ...exclus];
  return {
    ref: 'nicephos_vers_www',
    description: `Nicephos : toutes les adresses vers ${www}`,
    expression: hotes.length === 1 ? `(http.host ne "${www}")` : `not (http.host in {${hotes.map(h => `"${h}"`).join(' ')}})`,
    action: 'redirect',
    action_parameters: { from_value: { status_code: 301, target_url: { expression: `concat("https://${www}", http.request.uri.path)` }, preserve_query_string: true } },
    enabled: true,
  };
}

// Règle faite à la main d'après le README (étape 4.5) : redirection dont la cible est l'adresse www.
export const redirectionManuelle = www => x => x.action === 'redirect' && JSON.stringify(x.action_parameters || {}).includes(`https://${www}`);

const PAYS = '{"FR" "DE" "CH" "BE" "LU" "AT" "IT" "ES" "NL" "GB" "PT"}';
export function reglesWaf() {
  const r = (ref, description, action, expression, enPremier = false) => ({ ref, description, action, expression, enabled: true, ...(enPremier ? { enPremier } : {}) });
  return [
    r('nicephos_vigie_bloquees', 'Vigie : adresses bloquées', 'block', '(ip.src in $vigie_bloquees)', true),
    r('nicephos_outils', 'Outils d’attaque', 'block', '(http.user_agent eq "") or (lower(http.user_agent) contains "sqlmap") or (lower(http.user_agent) contains "nikto") or (lower(http.user_agent) contains "nuclei") or (lower(http.user_agent) contains "masscan") or (lower(http.user_agent) contains "zgrab") or (lower(http.user_agent) contains "wpscan") or (lower(http.user_agent) contains "acunetix")'),
    r('nicephos_scanners', 'Chemins de scanners', 'block', '(http.request.uri.path contains "/wp-") or (ends_with(http.request.uri.path, ".php")) or (http.request.uri.path contains "/.env") or (http.request.uri.path contains "/.git") or (http.request.uri.path contains "/phpmyadmin") or (http.request.uri.path contains "/cgi-bin") or (http.request.uri.path contains "/.aws") or (http.request.uri.path contains "/server-status")'),
    r('nicephos_methodes', 'Méthodes inutiles', 'block', 'not (http.request.method in {"GET" "HEAD" "POST"})'),
    r('nicephos_admin_pays', 'Admin hors pays habituels', 'managed_challenge', `(starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/auth/")) and not (ip.src.country in ${PAYS}) and not cf.client.bot`),
  ];
}

export const regleDebitImages = () => ({
  ref: 'nicephos_images',
  description: 'Images : aspiration',
  expression: '(starts_with(http.request.uri.path, "/media/"))',
  action: 'block',
  ratelimit: { characteristics: ['ip.src', 'cf.colo.id'], period: 10, requests_per_period: 200, mitigation_timeout: 10 },
  enabled: true,
});

// ---------- réglages de la zone ----------

export const REGLAGES_BASE = { always_use_https: 'on' };
export const REGLAGES_DURCIS = {
  ssl: 'strict', min_tls_version: '1.2', tls_1_3: 'on', automatic_https_rewrites: 'on',
  security_level: 'medium', browser_check: 'on', challenge_ttl: 1800,
  rocket_loader: 'off', email_obfuscation: 'off', hotlink_protection: 'off',
};
// Un réglage déjà plus strict que le voulu est gardé (TLS minimum plus haut, niveau de sécurité plus élevé).
const NIVEAUX = ['off', 'essentially_off', 'low', 'medium', 'high', 'under_attack'];
export function reglageSuffit(nom, actuel, voulu) {
  if (String(actuel) === String(voulu)) return true;
  if (nom === 'tls_1_3') return voulu === 'on' && actuel === 'zrt';
  if (nom === 'min_tls_version') return Number(actuel) >= Number(voulu);
  if (nom === 'security_level') return NIVEAUX.indexOf(actuel) >= NIVEAUX.indexOf(voulu);
  return false;
}

export async function planReglages(api, { zone, voulus }) {
  const ecarts = [];
  // Mode SSL automatique de Cloudflare : il choisit lui-même le mode ; à passer en « custom » avant d'imposer strict.
  if (voulus.ssl) {
    const auto = await api.reglage(zone, 'ssl_automatic_mode').then(res, () => null);
    if (auto?.value === 'auto') ecarts.push(['ssl_automatic_mode', 'auto', 'custom']);
  }
  for (const [nom, v] of Object.entries(voulus)) {
    const r = res(await api.reglage(zone, nom));
    if (!r) continue;
    if (r.editable === false) continue;
    if (!reglageSuffit(nom, r.value, v)) ecarts.push([nom, r.value, v]);
  }
  const libelle = `réglages de la zone : ${Object.entries(voulus).map(([k, v]) => `${k}=${v}`).join(', ')}`;
  if (!ecarts.length) return [element(D, libelle, 'ok')];
  return [element(D, `réglages de la zone (${ecarts.length} à changer)`, 'modifier', {
    detail: ecarts.map(([n, a, b]) => `${n} : ${a} → ${b}`).join('\n'),
    appliquer: async () => { for (const [n, , v] of ecarts) await api.ecrireReglage(zone, n, v); },
  })];
}

export async function planEntetesGeres(api, { zone }) {
  const r = res(await api.entetesGeres(zone)) || {};
  const voulus = {
    managed_request_headers: { add_visitor_location_headers: true },
    managed_response_headers: { 'remove_x-powered-by_header': true, add_security_headers: false },
  };
  const corps = {};
  const ecarts = [], conflits = [];
  for (const [groupe, valeurs] of Object.entries(voulus)) {
    for (const [id, enabled] of Object.entries(valeurs)) {
      const t = (r[groupe] || []).find(x => x.id === id);
      if (!t || Boolean(t.enabled) === enabled) continue;
      if (enabled && t.has_conflict) { conflits.push(`${id} (en conflit avec ${(t.conflicts_with || []).join(', ') || '?'})`); continue; }
      (corps[groupe] ||= []).push({ id, enabled });
      ecarts.push(`${id} : ${enabled ? 'on' : 'off'}`);
    }
  }
  const libelle = 'en-têtes gérés : pays du visiteur ajouté, X-Powered-By retiré, en-têtes de sécurité de Cloudflare coupés (le site envoie les siens)';
  const plan = [element(D, libelle, ecarts.length ? 'modifier' : 'ok', { detail: ecarts.join('\n') || undefined, appliquer: () => api.ecrireEntetesGeres(zone, corps) })];
  if (conflits.length) plan.push(element(D, 'en-têtes gérés impossibles à activer', 'alerte', { detail: conflits.join('\n') }));
  return plan;
}

export async function planListeBloquees(api, { compte, sortie }) {
  const listes = res(await api.listes(compte)) || [];
  const l = listes.find(x => x.name === 'vigie_bloquees');
  if (l) { sortie.listeId = l.id; return [element(D, 'liste d’adresses « vigie_bloquees »', 'ok')]; }
  return [element(D, 'liste d’adresses « vigie_bloquees » (vide, remplie plus tard par la Vigie)', 'creer', {
    appliquer: async () => { sortie.listeId = res(await api.creerListe(compte, 'vigie_bloquees', 'Vigie : adresses bloquées (installateur Nicephos)'))?.id; },
  })];
}

export async function planDnssec(api, { zone, sortie }) {
  const r = res(await api.dnssec(zone)) || {};
  if (r.status === 'active') return [element(D, 'DNSSEC', 'ok')];
  if (r.status === 'pending') {
    sortie.ds = r.ds;
    return [element(D, 'DNSSEC activé chez Cloudflare, en attente de l’enregistrement DS chez le registraire', 'manuel', { detail: r.ds ? `DS : ${r.ds}` : undefined })];
  }
  return [element(D, 'DNSSEC (l’enregistrement DS est à copier ensuite chez le registraire)', 'creer', {
    appliquer: async () => { const a = res(await api.activerDnssec(zone)) || {}; sortie.ds = a.ds; return a.ds ? 'DS affiché à la fin' : undefined; },
  })];
}

export async function planCaa(api, { zone, zoneNom }) {
  const existants = (res(await api.dns(zone, zoneNom)) || []).filter(x => x.type === 'CAA');
  if (existants.length) return [element(D, 'CAA : enregistrements existants gardés', 'ok')];
  return [element(D, `CAA ${zoneNom} : issue « pki.goog » (Cloudflare ajoute ses autres autorités)`, 'creer', {
    appliquer: () => api.creerDns(zone, { type: 'CAA', name: zoneNom, data: { flags: 0, tag: 'issue', value: 'pki.goog' }, ttl: 1, comment: 'Nicephos (installateur)' }),
  })];
}

// ---------- Access devant la console de la Vigie ----------

export async function equipeAccess(api, compte) {
  const o = res(await api.organisationAccess(compte));
  const domaine = o?.auth_domain || '';
  return domaine.endsWith('.cloudflareaccess.com') ? domaine.replace(/\.cloudflareaccess\.com$/, '') : null;
}

export async function planAccess(api, { compte, hote, issuer, appZitadel, emails, sortie }) {
  const plan = [];
  const fournisseurs = res(await api.fournisseurs(compte)) || [];
  const zit = fournisseurs.find(f => f.type === 'oidc' && f.name === 'Zitadel');
  const otp = fournisseurs.find(f => f.type === 'onetimepin');
  if (zit) sortie.idpZitadel = zit.id;
  if (otp) sortie.idpOtp = otp.id;
  plan.push(element(D, 'Access : connexion par Zitadel (OpenID Connect, PKCE)', zit ? 'ok' : 'creer', {
    appliquer: async () => {
      const r = res(await api.creerFournisseur(compte, {
        name: 'Zitadel', type: 'oidc',
        config: {
          client_id: appZitadel.clientId, client_secret: appZitadel.clientSecret,
          auth_url: `${issuer}/oauth/v2/authorize`, token_url: `${issuer}/oauth/v2/token`, certs_url: `${issuer}/oauth/v2/keys`,
          pkce_enabled: true, scopes: ['openid', 'email', 'profile'],
        },
      }));
      sortie.idpZitadel = r.id;
    },
  }));
  plan.push(element(D, 'Access : code par e-mail (One-time PIN), en secours', otp ? 'ok' : 'creer', {
    appliquer: async () => { sortie.idpOtp = res(await api.creerFournisseur(compte, { name: 'One-time PIN', type: 'onetimepin', config: {} })).id; },
  }));
  // Politique réutilisable (modèle actuel d'Access), puis l'application qui la cite.
  const nomPolitique = 'Nicephos : administrateurs de la Vigie';
  const pol = (res(await api.politiquesAccess(compte)) || []).find(p => p.name === nomPolitique);
  if (pol) sortie.politique = pol.id;
  const inclus = (pol?.include || []).map(i => i.email?.email).filter(Boolean);
  const manquent = emails.filter(e => !inclus.includes(e));
  plan.push(element(D, `Access : politique « ${nomPolitique} » (${emails.join(', ')})`, !pol ? 'creer' : manquent.length ? 'alerte' : 'ok', {
    detail: !pol ? 'seules ces adresses passent' : manquent.length ? `adresses absentes de la politique existante, à ajouter à la main : ${manquent.join(', ')}` : undefined,
    appliquer: async () => {
      sortie.politique = res(await api.creerPolitiqueAccess(compte, { name: nomPolitique, decision: 'allow', include: emails.map(email => ({ email: { email } })) })).id;
    },
  }));
  const apps = res(await api.applicationsAccess(compte)) || [];
  const app = apps.find(a => a.domain === hote || a.self_hosted_domains?.includes(hote) || a.destinations?.some(d => d.uri === hote));
  if (app) { sortie.aud = app.aud; sortie.appAccess = app.id; }
  const corpsApp = () => ({
    name: 'Vigie', type: 'self_hosted', domain: hote, session_duration: '8h',
    allowed_idps: [sortie.idpZitadel, sortie.idpOtp].filter(Boolean), auto_redirect_to_identity: false, app_launcher_visible: false,
    policies: [{ id: sortie.politique, precedence: 1 }],
  });
  plan.push(element(D, `Access : application « Vigie » sur ${hote} (session de 8 h)`, app ? 'ok' : 'creer', {
    appliquer: async () => { const r = res(await api.creerApplicationAccess(compte, corpsApp())); Object.assign(sortie, { aud: r.aud, appAccess: r.id }); return `AUD ${r.aud}`; },
  }));
  if (app && pol && !(app.policies || []).some(p => p.id === pol.id)) {
    plan.push(element(D, 'Access : l’application « Vigie » existante ne cite pas la politique des administrateurs', 'alerte', { detail: 'Access → Applications → Vigie → Policies : vérifier qui peut entrer' }));
  }
  return plan;
}

// Aide au refus d'écriture : le droit du jeton probablement manquant.
export function aideDroit(chemin) {
  if (/cfd_tunnel/.test(chemin)) return 'Account → Cloudflare Tunnel → Edit';
  if (/dns_records|dnssec/.test(chemin)) return 'Zone → DNS → Edit';
  if (/http_request_dynamic_redirect/.test(chemin)) return 'Zone → Single Redirect → Edit';
  if (/rulesets/.test(chemin)) return 'Zone → Zone WAF → Edit';
  if (/settings/.test(chemin)) return 'Zone → Zone Settings → Edit';
  if (/managed_headers/.test(chemin)) return 'Zone → Managed Headers → Edit';
  if (/rules\/lists/.test(chemin)) return 'Account → Account Filter Lists → Edit';
  if (/access\/(apps|policies)/.test(chemin)) return 'Account → Access: Apps and Policies → Edit';
  if (/access\//.test(chemin)) return 'Account → Access: Organizations, Identity Providers, and Groups → Edit';
  return null;
}
