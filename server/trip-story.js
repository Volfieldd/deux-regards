import { project, MAP } from './geo/projection.js';
import { nameOf, countryName } from './geo/cities.js';

// Page publique d'un voyage : ses jours (une date = un jour, les deux photographes réunis), seulement ceux qui ont
// des photos publiées ; ses étapes (le lieu de chaque jour : la ville la plus fréquente de ses photos ; deux jours
// de suite au même endroit font une seule étape) ; le cadrage de la carte sur ces étapes, et l'itinéraire.
// Tout est calculé ici, en unités du fond de carte (1000 × 520) : la page reste lisible sans JavaScript.
const ASPECT = 0.6;                                   // hauteur / largeur de la carte du voyage
const MIN_W = 16;                                     // cadrage minimal (~6° de longitude) : une ville seule reste située

export function tripStory({ trip, photos, lang, locale }) {
  // photos : publiées, dans la langue de la page, avec taken_on (jour) et la ville.
  const byDay = new Map();
  for (const p of photos) {
    if (!byDay.has(p.taken_on)) byDay.set(p.taken_on, []);
    byDay.get(p.taken_on).push(p);
  }
  const fmt = (day, opts) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const days = [...byDay.keys()].sort().map((day, i) => {
    const list = byDay.get(day);
    // Lieu du jour : la ville la plus fréquente de ses photos (sinon, le lieu affiché d'une photo).
    const counts = new Map();
    for (const p of list) if (p.city_id && Number.isFinite(p.city_lat)) counts.set(p.city_id, (counts.get(p.city_id) || 0) + 1);
    const cityId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    const ref = cityId ? list.find(p => p.city_id === cityId) : null;
    const [x, y] = ref ? project(ref.city_lat, ref.city_lon) : [null, null];
    return {
      n: i + 1, day, id: `jour-${i + 1}`, photos: list,
      long: fmt(day, { weekday: 'long', day: 'numeric', month: 'long' }), short: fmt(day, { day: 'numeric', month: 'short' }),
      city: ref ? nameOf(ref, lang) : '', country: ref ? countryName(ref.city_cc, lang) : '', cityId: cityId || null,
      place: ref ? nameOf(ref, lang) : list.find(p => p.place)?.place || '', x, y,
    };
  });
  // Étapes : jours consécutifs (dans le récit) au même endroit réunis.
  const stops = [];
  for (const d of days) {
    if (d.x == null) continue;
    const last = stops.at(-1);
    if (last && last.cityId === d.cityId && last.days.at(-1).n === d.n - 1) last.days.push(d);
    else stops.push({ cityId: d.cityId, city: d.city, x: d.x, y: d.y, days: [d] });
  }
  if (!stops.length) return { days, stops, view: null };
  // Cadrage : les étapes et une marge, au moins MIN_W de large, au format de la carte, dans les limites du fond.
  const xs = stops.map(s => s.x), ys = stops.map(s => s.y);
  let w = Math.max(MIN_W, (Math.max(...xs) - Math.min(...xs)) * 1.5, ((Math.max(...ys) - Math.min(...ys)) * 1.6) / ASPECT);
  w = Math.min(w, MAP.width);
  const h = Math.min(w * ASPECT, MAP.height);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const view = { w, h, x: Math.min(MAP.width - w, Math.max(0, cx - w / 2)), y: Math.min(MAP.height - h, Math.max(0, cy - h / 2)) };
  // Tailles à l'écran constantes quel que soit le cadrage : en unités de carte, proportionnelles à la largeur vue.
  const u = w / 100;
  const r = 1.6 * u, fs = 1.55 * u;
  // Encarts : « J1 · 1 sept. » et la ville, placés sans se chevaucher ni couvrir une étape — à droite, à gauche, puis
  // décalés vers le haut ou le bas (un trait relie alors l'encart à son étape) ; dans le cadre.
  const placed = [];
  const dots = stops.map(s => ({ x: s.x - r * 1.2, y: s.y - r * 1.2, w: r * 2.4, h: r * 2.4 }));
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = b => b.x >= view.x && b.y >= view.y && b.x + b.w <= view.x + w && b.y + b.h <= view.y + h;
  for (const s of stops) {
    const first = s.days[0], lastDay = s.days.at(-1);
    s.n = first.n === lastDay.n ? String(first.n) : `${first.n}–${lastDay.n}`;
    s.when = first.n === lastDay.n ? first.short : `${first.short} – ${lastDay.short}`;
    s.href = `#${first.id}`;
  }
  for (const s of stops) {
    // Police à chasse fixe : ~0,62 em par caractère ; la première ligne porte « J1 · », la seconde la ville.
    const bw = Math.max(`J${s.n} · ${s.when}`.length * 0.62, s.city.length * 0.62 * 0.95) * fs + 2 * u;
    const bh = fs * 2.9;
    const tries = [];
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4]) for (const side of [1, -1]) tries.push({ side, dy: k * bh * 1.12 });
    let box = null;
    for (const tr of tries) {
      const b = { w: bw, h: bh, x: tr.side > 0 ? s.x + r + u : s.x - r - u - bw, y: s.y - bh / 2 + tr.dy };
      if (inside(b) && !placed.some(o => hit(o, b)) && !dots.some(o => hit(o, b))) { box = b; break; }
    }
    // Rien de libre (étapes très serrées) : à droite, quitte à chevaucher.
    box ||= { w: bw, h: bh, x: Math.min(s.x + r + u, view.x + w - bw), y: Math.min(Math.max(s.y - bh / 2, view.y), view.y + h - bh) };
    placed.push(box);
    s.box = box;
    // Trait de rappel quand l'encart est décalé : du bord de l'étape au bord de l'encart.
    const ex = box.x > s.x ? box.x : box.x + box.w, ey = Math.min(Math.max(s.y, box.y), box.y + box.h);
    s.leader = Math.abs(ey - s.y) > fs * 0.6 ? { x1: s.x, y1: s.y, x2: ex, y2: ey } : null;
  }
  // Itinéraire : les étapes dans l'ordre, en courbes douces.
  const path = stops.map((s, i) => {
    if (!i) return `M${s.x.toFixed(2)},${s.y.toFixed(2)}`;
    const p = stops[i - 1];
    const mx = (p.x + s.x) / 2, my = (p.y + s.y) / 2 - Math.hypot(s.x - p.x, s.y - p.y) * 0.18;
    return `Q${mx.toFixed(2)},${my.toFixed(2)} ${s.x.toFixed(2)},${s.y.toFixed(2)}`;
  }).join(' ');
  return { days, stops, view, path, r, fs, u };
}
