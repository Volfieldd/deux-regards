// Limites de l'API Instagram : la file publie dans un budget réglable, et se met en pause (sans consommer
// d'essai) quand Meta signale une limite. Il n'existe pas d'offre payante de l'API : on règle ici le rythme.
//   - Meta : 100 publications par compte sur 24 h glissantes (valeur lue avec content_publishing_limit),
//     et un budget d'appels calculé par Meta ; dépassement : erreurs 4, 17, 32, 613, ou 9 / 2207042.
//   - Préréglages : « Prudent » (défaut), « Limites de Meta », « Personnalisé ».

export const PRESETS = {
  prudent: { label: 'Prudent', postsPerDay: 25, minGapMinutes: 60, callsPerHour: 100 },
  meta: { label: 'Limites de Meta', postsPerDay: 100, minGapMinutes: 0, callsPerHour: 200 },
  custom: { label: 'Personnalisé' },
};
// Appels par heure : 20 au moins, une publication en demande jusqu'à 12 (quota, conteneur, 8 vérifications, envoi, lien).
export const BOUNDS = { postsPerDay: [1, 100], minGapMinutes: [0, 1440], callsPerHour: [20, 1000] };
export const LIMIT_DEFAULTS = { preset: 'prudent', postsPerDay: 25, minGapMinutes: 60, callsPerHour: 100 };
// Pauses successives quand Meta ne dit pas combien attendre : 1 h, 2 h, 4 h, 8 h, puis 24 h.
const BACKOFF_H = [1, 2, 4, 8, 24];
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
// Attente la plus longue qu'on accepte de Meta (Retry-After, x-business-use-case-usage) : une valeur absurde ne gèle
// pas la file pour des siècles, et l'heure de reprise reste affichable.
export const MAX_PAUSE = 7 * DAY;

// Champ vidé (« ») : la valeur par défaut, pas la borne basse.
const clamp = (v, [lo, hi], dflt) => { const n = v === '' || v == null ? NaN : Math.round(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : dflt; };

// Réglages envoyés par le formulaire (limits_preset, limits_posts, limits_gap, limits_calls).
export function normalizeLimits(body = {}, current = LIMIT_DEFAULTS) {
  const preset = Object.hasOwn(PRESETS, body.limits_preset) ? body.limits_preset : current.preset || LIMIT_DEFAULTS.preset;
  return {
    preset,
    postsPerDay: clamp(body.limits_posts ?? current.postsPerDay, BOUNDS.postsPerDay, LIMIT_DEFAULTS.postsPerDay),
    minGapMinutes: clamp(body.limits_gap ?? current.minGapMinutes, BOUNDS.minGapMinutes, LIMIT_DEFAULTS.minGapMinutes),
    callsPerHour: clamp(body.limits_calls ?? current.callsPerHour, BOUNDS.callsPerHour, LIMIT_DEFAULTS.callsPerHour),
  };
}

// Valeurs appliquées : celles du préréglage, ou les siennes en « Personnalisé ». Le quota lu chez Meta plafonne
// toujours les publications (et les fixe en « Limites de Meta »).
export function effectiveLimits(limits = LIMIT_DEFAULTS, liveQuota = null) {
  const l = { ...LIMIT_DEFAULTS, ...limits };
  const base = l.preset === 'custom' ? l : { ...l, ...PRESETS[l.preset] };
  const metaTotal = Number(liveQuota?.total) > 0 ? Number(liveQuota.total) : null;
  const postsPerDay = l.preset === 'meta' && metaTotal ? metaTotal : Math.min(base.postsPerDay, metaTotal || Infinity);
  return { preset: l.preset, postsPerDay, minGapMinutes: base.minGapMinutes, callsPerHour: base.callsPerHour };
}

export class RateLimitError extends Error {
  constructor(message, retryAfterMs = null) { super(message); this.retryAfterMs = retryAfterMs; }
}

// Réponse de Meta signalant une limite atteinte : motif et attente indiquée (en ms), sinon null.
export function rateLimitFrom(status, headers, data) {
  const e = data?.error || {};
  const quota = e.code === 9 && Number(e.error_subcode) === 2207042;
  const calls = [4, 17, 32, 613].includes(Number(e.code)) || status === 429;
  if (!quota && !calls) return null;
  let wait = null;
  const retryAfter = Number(headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) wait = retryAfter * 1000;
  try {
    // { "<id>": [{ "estimated_time_to_regain_access": <minutes>, … }] }
    const usage = JSON.parse(headers?.get?.('x-business-use-case-usage') || 'null');
    const minutes = usage ? Math.max(0, ...Object.values(usage).flat().map(u => Number(u?.estimated_time_to_regain_access) || 0)) : 0;
    if (Number.isFinite(minutes) && minutes > 0) wait = Math.max(wait || 0, minutes * 60 * 1000);
  } catch { /* en-tête illisible : attente par paliers */ }
  if (wait != null) wait = Math.min(wait, MAX_PAUSE);
  return { reason: quota ? 'quota de publications d’Instagram atteint' : 'trop d’appels à l’API Instagram', retryAfterMs: wait };
}

export const backoffMs = level => BACKOFF_H[Math.min(Math.max(level, 0), BACKOFF_H.length - 1)] * HOUR;

// « à 14 h 30 », ou « le 14 oct. à 9 h 05 » si ce n'est pas aujourd'hui (heure de Paris). Dans une autre langue de
// l'admin (locale « en-GB », « de-DE ») : « 14:30 », « 14 Oct, 09:05 ». Instant qui ne s'écrit pas : « — ».
export function whenText(ms, nowMs, locale = 'fr-FR') {
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return '—';
  const tz = { timeZone: 'Europe/Paris' };
  const fr = locale === 'fr-FR';
  const day = d => new Intl.DateTimeFormat('fr-FR', { ...tz, dateStyle: 'short' }).format(d);
  const hm = new Intl.DateTimeFormat(locale, { ...tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
  const date = new Intl.DateTimeFormat(locale, { ...tz, day: 'numeric', month: 'short' }).format(ms);
  if (!fr) return day(ms) === day(nowMs) ? hm : `${date}, ${hm}`;
  if (day(ms) === day(nowMs)) return `à ${hm.replace(':', ' h ')}`;
  return `le ${date} à ${hm.replace(':', ' h ')}`;
}

// Quota lu chez Meta : il ne vaut que l'heure qui suit sa lecture. Plus ancien, il est relu avant l'envoi (sinon un
// quota lu plein bloquerait la file pour toujours : il n'est relu qu'une fois le budget accordé).
const freshQuota = (liveQuota, nowMs) => Boolean(liveQuota) && (!Number.isFinite(Number(liveQuota.at)) || nowMs - Number(liveQuota.at) < HOUR);

// Peut-on publier maintenant ? publishedAt : dates (ms) des publications réussies ; callsAt : dates des appels.
export function checkBudget({ limits, liveQuota = null, nowMs, publishedAt = [], callsAt = [], pausedUntil = 0, pauseReason = '' }) {
  const l = effectiveLimits(limits, liveQuota);
  const at = until => whenText(until, nowMs);
  // Refus : le motif en français (erreurs, journal), et sa clé et ses variables, pour l'écrire dans la langue de
  // l'admin avec l'heure de reprise ({when}) à sa façon.
  const no = (until, key, params) => ({ ok: false, until, key, params, reason: key.replace(/\{(\w+)\}/g, (m, k) => (k === 'when' ? at(until) : String(params[k]))) });
  if (pausedUntil > nowMs) return { ok: false, until: pausedUntil, reason: `Instagram a signalé une limite (${pauseReason || 'limite atteinte'}) : file en pause jusqu’${at(pausedUntil).replace(/^le /, 'au ')}.` };
  const day = publishedAt.filter(t => t > nowMs - DAY).sort((a, b) => a - b);
  if (day.length >= l.postsPerDay) {
    return no(day[day.length - l.postsPerDay] + DAY, `{n} publication${day.length > 1 ? 's' : ''} sur les dernières 24 h (limite : {max}) : prochaine possible {when}.`, { n: day.length, max: l.postsPerDay });
  }
  const last = day.at(-1);
  if (last && l.minGapMinutes > 0 && nowMs - last < l.minGapMinutes * 60 * 1000) {
    return no(last + l.minGapMinutes * 60 * 1000, 'Dernière publication il y a {n} min ; {gap} min au moins entre deux publications : prochaine possible {when}.', { n: Math.round((nowMs - last) / 60000), gap: l.minGapMinutes });
  }
  const hour = callsAt.filter(t => t > nowMs - HOUR).sort((a, b) => a - b);
  // Une publication demande une dizaine d'appels : marge gardée sous le plafond horaire.
  if (hour.length + 10 > l.callsPerHour) {
    return no(hour[Math.max(0, hour.length + 10 - l.callsPerHour - 1)] + HOUR, '{n} appels à l’API sur la dernière heure (limite : {max}) : prochaine publication possible {when}.', { n: hour.length, max: l.callsPerHour });
  }
  if (freshQuota(liveQuota, nowMs) && Number(liveQuota.total) > 0 && Number(liveQuota.usage) >= Number(liveQuota.total)) {
    return no(nowMs + HOUR, 'Quota d’Instagram atteint ({used} / {total} sur 24 h) : nouvel essai dans une heure.', { used: liveQuota.usage, total: liveQuota.total });
  }
  return { ok: true, limits: l };
}
