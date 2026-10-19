// Point fort du cadrage d'une photo (migration 059) : neuf positions, 0, 50 ou 100 % sur chaque axe, écrites « x y » dans
// les formulaires de la fiche (« 50 50 », le centre). Sert à l'ouverture plein cadre de la v3 (object-position).
export const FOCALS = [
  ['0 0', 'En haut à gauche'], ['50 0', 'En haut'], ['100 0', 'En haut à droite'],
  ['0 50', 'À gauche'], ['50 50', 'Au centre'], ['100 50', 'À droite'],
  ['0 100', 'En bas à gauche'], ['50 100', 'En bas'], ['100 100', 'En bas à droite'],
];
// « x y » → [x, y], ou null si ce n'est pas l'une des neuf positions.
export function parseFocal(v) {
  const m = /^(0|50|100) (0|50|100)$/.exec(String(v ?? '').trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}
export const focalOf = p => `${p?.focal_x ?? 50} ${p?.focal_y ?? 50}`;
