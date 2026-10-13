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
export const BOUNDS = { postsPerDay: [1, 100], minGapMinutes: [0, 1440], callsPerHour: [10, 1000] };
export const LIMIT_DEFAULTS = { preset: 'prudent', postsPerDay: 25, minGapMinutes: 60, callsPerHour: 100 };
// Pauses successives quand Meta ne dit pas combien attendre : 1 h, 2 h, 4 h, 8 h, puis 24 h.
const BACKOFF_H = [1, 2, 4, 8, 24];
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const clamp = (v, [lo, hi], dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : dflt; };

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
  if (retryAfter > 0) wait = retryAfter * 1000;
  try {
    // { "<id>": [{ "estimated_time_to_regain_access": <minutes>, … }] }
    const usage = JSON.parse(headers?.get?.('x-business-use-case-usage') || 'null');
    const minutes = usage ? Math.max(0, ...Object.values(usage).flat().map(u => Number(u?.estimated_time_to_regain_access) || 0)) : 0;
    if (minutes > 0) wait = Math.max(wait || 0, minutes * 60 * 1000);
  } catch { /* en-tête illisible : attente par paliers */ }
  return { reason: quota ? 'quota de publications d’Instagram atteint' : 'trop d’appels à l’API Instagram', retryAfterMs: wait };
}

export const backoffMs = level => BACKOFF_H[Math.min(Math.max(level, 0), BACKOFF_H.length - 1)] * HOUR;

// « à 14 h 30 », ou « le 14 oct. à 9 h 05 » si ce n'est pas aujourd'hui (heure de Paris).
export function whenText(ms, nowMs) {
  const tz = { timeZone: 'Europe/Paris' };
  const day = d => new Intl.DateTimeFormat('fr-FR', { ...tz, dateStyle: 'short' }).format(d);
  const hm = new Intl.DateTimeFormat('fr-FR', { ...tz, hour: '2-digit', minute: '2-digit' }).format(ms).replace(':', ' h ');
  if (day(ms) === day(nowMs)) return `à ${hm}`;
  return `le ${new Intl.DateTimeFormat('fr-FR', { ...tz, day: 'numeric', month: 'short' }).format(ms)} à ${hm}`;
}

// Peut-on publier maintenant ? publishedAt : dates (ms) des publications réussies ; callsAt : dates des appels.
export function checkBudget({ limits, liveQuota = null, nowMs, publishedAt = [], callsAt = [], pausedUntil = 0, pauseReason = '' }) {
  const l = effectiveLimits(limits, liveQuota);
  const at = until => whenText(until, nowMs);
  if (pausedUntil > nowMs) return { ok: false, until: pausedUntil, reason: `Instagram a signalé une limite (${pauseReason || 'limite atteinte'}) : file en pause jusqu’${at(pausedUntil).replace(/^à /, 'à ').replace(/^le /, 'au ')}.` };
  const day = publishedAt.filter(t => t > nowMs - DAY).sort((a, b) => a - b);
  if (day.length >= l.postsPerDay) {
    const until = day[day.length - l.postsPerDay] + DAY;
    return { ok: false, until, reason: `${day.length} publication${day.length > 1 ? 's' : ''} sur les dernières 24 h (limite : ${l.postsPerDay}) : prochaine possible ${at(until)}.` };
  }
  const last = day.at(-1);
  if (last && l.minGapMinutes > 0 && nowMs - last < l.minGapMinutes * 60 * 1000) {
    const until = last + l.minGapMinutes * 60 * 1000;
    return { ok: false, until, reason: `Dernière publication il y a ${Math.round((nowMs - last) / 60000)} min ; ${l.minGapMinutes} min au moins entre deux publications : prochaine possible ${at(until)}.` };
  }
  const hour = callsAt.filter(t => t > nowMs - HOUR).sort((a, b) => a - b);
  // Une publication demande une dizaine d'appels : marge gardée sous le plafond horaire.
  if (hour.length + 10 > l.callsPerHour) {
    const until = hour[Math.max(0, hour.length + 10 - l.callsPerHour - 1)] + HOUR;
    return { ok: false, until, reason: `${hour.length} appels à l’API sur la dernière heure (limite : ${l.callsPerHour}) : prochaine publication possible ${at(until)}.` };
  }
  if (liveQuota && Number(liveQuota.total) > 0 && Number(liveQuota.usage) >= Number(liveQuota.total)) {
    return { ok: false, until: nowMs + HOUR, reason: `Quota d’Instagram atteint (${liveQuota.usage} / ${liveQuota.total} sur 24 h) : nouvel essai dans une heure.` };
  }
  return { ok: true, limits: l };
}
