// Petits outils sans dépendance (la Vigie ne fait confiance à aucun champ reçu, même du site).
export const clean = (v, max = 200) => (v == null ? null : String(v).toWellFormed().replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029‎‏‪-‮⁦-⁩]/g, '␤').slice(0, max).replace(/[\ud800-\udbff]$/, '') || null);
export const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
