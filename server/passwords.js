import crypto from 'node:crypto';

// Mots de passe des galeries privées (annexe de sécurité, § 3.2 ; exigences G14 à G18). Modules natifs de Node seulement.
//   - générés par le serveur, jamais choisis à la main : 12 caractères parmi 31 (sans 0/O ni 1/I/L), groupés par quatre
//     (« K7QM-P3XW-9TRA »), soit 12 × log₂(31) ≈ 59,4 bits (la CNIL demande 50 bits avec un blocage après échecs) ;
//   - saisie tolérante : casse, espaces et tirets ignorés (G15) ;
//   - gardés sous forme d'empreinte scrypt (N = 2¹⁵, r = 8, p = 3 : l'équivalent OWASP, 32 Mio ; maxmem 64 Mio), sel de
//     16 octets, clé de 32 octets, format auto-décrit « scrypt$15$8$3$<sel>$<clé> » : des paramètres relevés plus tard
//     sont relus de l'empreinte, et l'empreinte est refaite au prochain succès (needsRehash) ;
//   - comparés en temps constant (crypto.timingSafeEqual) ;
//   - calculés deux à la fois au plus, dix en attente, puis « occupé » (503) : scrypt tourne dans le pool de libuv,
//     partagé avec les lectures de fichiers (une rafale ralentirait le service des images, M16).
// Argon2id demanderait une dépendance native (crypto.argon2 n'existe pas dans Node 22) : scrypt, cité par la CNIL et
// l'OWASP, suffit.

export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const PASSWORD_LENGTH = 12;
export const PARAMS = { logN: 15, r: 8, p: 3 };
const KEY_LEN = 32, SALT_LEN = 16, MAXMEM = 64 * 1024 * 1024;

export function generatePassword() {
  let s = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return s.match(/.{4}/g).join('-');
}
// Ce que l'invité a tapé ou collé : majuscules, sans espaces, tirets ni points ; borné (un champ de mot de passe n'a pas
// à recevoir des kilo-octets).
export const normalizePassword = v => String(v ?? '').slice(0, 200).toUpperCase().replace(/[\s\-.·_]+/g, '');
// Forme d'affichage (« k7qm p3xw 9tra » sur la page des secrets ; MQ-18).
export const showPassword = v => normalizePassword(v).toLowerCase().match(/.{1,4}/g)?.join(' ') || '';

const scryptAsync = (pw, salt, { logN, r, p }) => new Promise((resolve, reject) =>
  crypto.scrypt(pw, salt, KEY_LEN, { N: 2 ** logN, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(pw, params = PARAMS) {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = await scryptAsync(normalizePassword(pw), salt, params);
  return `scrypt$${params.logN}$${params.r}$${params.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export function parseHash(stored) {
  const m = /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([\w-]{16,64})\$([\w-]{16,128})$/.exec(String(stored || ''));
  if (!m) return null;
  const params = { logN: Number(m[1]), r: Number(m[2]), p: Number(m[3]) };
  if (params.logN < 10 || params.logN > 20 || params.r < 1 || params.r > 32 || params.p < 1 || params.p > 16) return null;
  return { params, salt: Buffer.from(m[4], 'base64url'), key: Buffer.from(m[5], 'base64url') };
}
export const needsRehash = stored => { const h = parseHash(stored); return !h || h.params.logN !== PARAMS.logN || h.params.r !== PARAMS.r || h.params.p !== PARAMS.p; };

// Vrai si le mot de passe correspond ; une empreinte illisible ne correspond à rien.
export async function verifyPassword(pw, stored) {
  const h = parseHash(stored);
  if (!h) return false;
  const key = await scryptAsync(normalizePassword(pw), h.salt, h.params);
  return key.length === h.key.length && crypto.timingSafeEqual(key, h.key);
}

// Sémaphore : `max` calculs à la fois, `queue` en attente, au-delà BusyError (réponse 503). Un seul calcul à la fois pour
// une même clé (un accès) : une seconde demande pendant un calcul est refusée tout de suite, sans être comptée (I, § 3.3).
// work : fonction de calcul (injectable dans les tests : faux scrypt lent).
export function createPasswordGate({ max = 2, queue = 10 } = {}) {
  let running = 0;
  const waiting = [];
  const keys = new Set();
  const release = () => { running -= 1; const next = waiting.shift(); if (next) { running += 1; next(); } };
  return {
    stats: () => ({ running, waiting: waiting.length, keys: keys.size }),
    // Réserve la clé (synchrone) : null si c'est fait ; sinon la raison du refus, « meme_acces » (un calcul est déjà en
    // cours pour elle) ou « plein » (2 calculs et 10 en attente).
    reserve(key) {
      if (keys.has(key)) return 'meme_acces';
      if (running >= max && waiting.length >= queue) return 'plein';
      keys.add(key);
      return null;
    },
    // Réservation abandonnée sans calcul (pause, suspension constatées avant).
    cancel(key) { keys.delete(key); },
    // Calcul pour une clé réservée ; la clé est rendue à la fin, quoi qu'il arrive.
    async run(key, fn) {
      try {
        if (running >= max) await new Promise(resolve => waiting.push(resolve));
        else running += 1;
        try { return await fn(); } finally { release(); }
      } finally { keys.delete(key); }
    },
  };
}
