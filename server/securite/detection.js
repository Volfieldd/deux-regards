// Saisies malveillantes (cas DS11) : motifs courts, choisis pour ne presque jamais toucher un texte normal (une
// apostrophe, « l'aube », un « < » isolé ne suffisent pas). Le site refuse ou échappe déjà ces valeurs : on signale une
// tentative, pas une réussite.
export const FAMILIES = [
  ['sql', /\bunion\b[\s/*+]+(?:all[\s/*+]+)?select\b|'\s*or\s+'?\d+'?\s*=\s*'?\d|\bsleep\s*\(\s*\d|\bbenchmark\s*\(|;\s*drop\s+table\b|\bsqlite_master\b|\binformation_schema\b|\bwaitfor\s+delay\b/i],
  ['xss', /<\s*script\b|javascript\s*:|\bon(?:error|load|mouseover|focus|toggle)\s{0,5}=|<\s*svg[^>]{0,200}\bon\w{1,20}\s*=|<\s*iframe\b|\bsrcdoc\s*=/i],
  ['gabarit', /<%|\$\{[^}]{0,80}\}|\{\{[^}]{0,40}\}\}|#\{[^}]{0,80}\}/],
  ['chemin', /(?:\.\.[/\\]){1,}|%2e%2e(?:%2f|%5c|[/\\])|\/etc\/(?:passwd|shadow)\b|\bfile:\/\/|\bc:\\windows\\/i],
  ['commande', /\$\([^)]{1,80}\)|`[^`]{1,40}`|;\s*(?:cat|ls|id|whoami|uname|wget|curl|nc|bash|sh)\b|\|\s*(?:nc|bash|sh)\b/i],
  ['ssrf', /\b169\.254\.169\.254\b|\bgopher:\/\/|\bdict:\/\/|\bmetadata\.google\.internal\b/i],
  ['prototype', /\b__proto__\b|\bconstructor\s*\[\s*["']?prototype\b|\bconstructor\.prototype\b/],
  ['journal', /%0d%0a|%0a|%0d|\r|\n/i],
];
// Outils d'attaque reconnus à leur navigateur (AppSensor RE7).
const TOOLS = /\b(?:sqlmap|nikto|nuclei|masscan|zgrab|wpscan|acunetix|nessus|openvas|dirbuster|gobuster|ffuf|wfuzz|burp)\b/i;

const MAX_LEN = 4000;           // au-delà, seul le début est examiné (texte long saisi dans l'admin)

// Un retour à la ligne est normal dans un formulaire (légende, message) : la famille « journal » ne vaut que pour le
// chemin et les paramètres d'adresse, où il n'a rien à faire.
const LINE_SAFE = new Set(['params', 'query']);

export function scanValue(where, field, value) {
  if (typeof value !== 'string' || value.length < 2) return null;
  const v = value.length > MAX_LEN ? value.slice(0, MAX_LEN) : value;
  for (const [family, re] of FAMILIES) {
    if (family === 'journal' && !LINE_SAFE.has(where)) continue;
    if (re.test(v)) return { famille: family, champ: field };
  }
  return null;
}

// Parcourt un objet (paramètres, requête, formulaire) : renvoie les constats (au plus 5), clés comprises.
export function scanObject(where, obj, out = [], depth = 0, prefix = where) {
  if (!obj || typeof obj !== 'object' || depth > 3 || out.length >= 5) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (out.length >= 5) break;
    const field = `${prefix}.${String(k).slice(0, 40)}`;
    const keyHit = scanValue(where, field, String(k));
    if (keyHit) out.push({ ...keyHit, extrait: String(k) });
    if (typeof v === 'string') { const hit = scanValue(where, field, v); if (hit && out.length < 5) out.push({ ...hit, extrait: v }); }
    else if (Array.isArray(v)) v.slice(0, 50).forEach((x, i) => { if (typeof x === 'string' && out.length < 5) { const hit = scanValue(where, `${field}[${i}]`, x); if (hit) out.push({ ...hit, extrait: x }); } });
    else if (v && typeof v === 'object' && !Buffer.isBuffer(v) && typeof v.pipe !== 'function') scanObject(where, v, out, depth + 1, field);
  }
  return out;
}

export const isAttackTool = ua => TOOLS.test(String(ua || ''));

// Famille de navigateur et système, sans numéro de version fin : assez pour voir qu'une session change d'appareil.
export function uaFamily(ua) {
  const s = String(ua || '');
  if (!s) return 'vide';
  const os = /iPhone|iPad/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : 'autre';
  const browser = /\bEdg\//.test(s) ? 'Edge' : /\bFirefox\/|FxiOS/.test(s) ? 'Firefox' : /\bOPR\//.test(s) ? 'Opera' : /\bChrome\/|CriOS/.test(s) ? 'Chrome'
    : /\bSafari\//.test(s) ? 'Safari' : /curl|wget|python|go-http|java\/|okhttp|node/i.test(s) ? 'outil' : /bot|crawl|spider/i.test(s) ? 'robot' : 'autre';
  return `${browser} · ${os}`;
}
