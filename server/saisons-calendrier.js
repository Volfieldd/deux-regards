// Calendrier de l’atelier : le fuseau est fourni explicitement par le branchement. Une heure locale inexistante ou
// répétée au changement d’heure est refusée, plutôt que déplacée ou choisie silencieusement par le serveur.
const formats = new Map();
const formatter = zone => {
  if (!formats.has(zone)) formats.set(zone, new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  return formats.get(zone);
};
const parts = (instant, zone) => Object.fromEntries(formatter(zone).formatToParts(instant).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));

export function formatSaisonDate(instant, zone) {
  if (instant == null) return '';
  const p = parts(instant, zone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function parseSaisonDate(value, zone) {
  if (typeof value !== 'string' || value.length !== 16 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [year, month, day, hour, minute] = value.split(/\D/).map(Number);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(utc).getUTCDate() !== day) return null;
  const offsets = new Set();
  // Les offsets possibles de part et d’autre du jour local, sans dépendre du fuseau de la machine.
  for (let hours = -36; hours <= 36; hours += 12) {
    const at = utc + hours * 3600000, p = parts(at, zone);
    offsets.add(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - at);
  }
  const matches = [...offsets].map(offset => utc - offset).filter(at => at >= 0 && formatSaisonDate(at, zone) === value);
  return matches.length === 1 ? matches[0] : null;
}
