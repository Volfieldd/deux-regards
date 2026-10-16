// Graphiques SVG rendus côté serveur (aucun script, compatibles avec la CSP : couleurs par classes CSS).
const num = n => Math.round(n * 10) / 10;

// Barres (vues) et courbe (visiteurs) ; `labels` : [premier, dernier] sous l'axe ; `tip` : infobulle d'une barre, dans
// la langue de l'admin (en français par défaut).
const TIP = p => `${p.label} : ${p.views} vue${p.views > 1 ? 's' : ''}, ${p.visitors} visiteur${p.visitors > 1 ? 's' : ''}`;
export function barsAndLine(points, { width = 760, height = 200, labels = [], tip = TIP } = {}) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = Math.max(1, ...points.map(p => Math.max(p.views, p.visitors)));
  // Haut de l'axe arrondi (1, 2… 10, 20…) ; sous 10, pair, pour que la graduation du milieu tombe sur un entier.
  const nice = (() => { const m = 10 ** Math.floor(Math.log10(max)); const k = Math.ceil(max / m); return (m === 1 && k % 2 ? k + 1 : k) * m; })();
  const step = w / Math.max(1, points.length);
  const bw = Math.max(2, step * 0.62);
  const y = v => pad.t + h - (v / nice) * h;
  const bars = points.map((p, i) => `<rect class="c-bar" x="${num(pad.l + i * step + (step - bw) / 2)}" y="${num(y(p.views))}" width="${num(bw)}" height="${num(pad.t + h - y(p.views))}" rx="2"><title>${esc(tip(p))}</title></rect>`).join('');
  const line = points.map((p, i) => `${num(pad.l + i * step + step / 2)},${num(y(p.visitors))}`).join(' ');
  const grid = [0, 0.5, 1].map(f => `<line class="c-grid" x1="${pad.l}" x2="${width - pad.r}" y1="${num(y(nice * f))}" y2="${num(y(nice * f))}"/><text class="c-axis" x="${pad.l - 6}" y="${num(y(nice * f) + 4)}" text-anchor="end">${Math.round(nice * f)}</text>`).join('');
  const lab = labels.length === 2 ? `<text class="c-axis" x="${pad.l}" y="${height - 4}">${labels[0]}</text><text class="c-axis" x="${width - pad.r}" y="${height - 4}" text-anchor="end">${labels[1]}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${grid}${bars}<polyline class="c-line" points="${line}"/>${lab}</svg>`;
}

// Petite courbe (vues d'une photo).
export function sparkline(values, { width = 240, height = 44 } = {}) {
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${num(i * step)},${num(height - 3 - (v / max) * (height - 6))}`);
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><polygon class="s-area" points="0,${height} ${pts.join(' ')} ${width},${height}"/><polyline class="s-line" points="${pts.join(' ')}"/></svg>`;
}
