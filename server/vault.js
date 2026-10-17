import crypto from 'node:crypto';

// Chiffrement des données personnelles dans la base (AES-256-GCM), clé DATA_KEY du .env, jamais dans la base :
// une sauvegarde volée ou un disque perdu ne révèle ni noms, ni adresses, ni signatures.
//   - texte : « enc1: » + base64(nonce 12 o | étiquette 16 o | chiffré) ;
//   - binaire : « NCE1 » + nonce + étiquette + chiffré.
// Sans clé : rien n'est chiffré (lecture des anciennes valeurs en clair toujours possible). Une valeur chiffrée lue
// sans la bonne clé est remplacée par un avertissement (texte) ou absente (binaire), jamais par une erreur.

const TEXT = 'enc1:';
const MAGIC = Buffer.from('NCE1');
// Échecs de déchiffrement (clé différente, donnée altérée ou réinjectée) : signalés à qui écoute (la Vigie, si elle est
// configurée). Une donnée chiffrée lue sans aucune clé n'est pas un échec : la configuration le dit déjà.
const failures = new Set();
export const onDecryptFail = fn => { failures.add(fn); return () => failures.delete(fn); };
const failed = kind => { for (const fn of failures) { try { fn(kind); } catch { /* jamais d'erreur pour l'appelant */ } } };

export const LOCKED = '« donnée chiffrée : clé DATA_KEY absente ou différente »';

export function createVault(secret) {
  const key = secret ? Buffer.from(crypto.hkdfSync('sha256', secret, 'deux-regards', 'donnees-personnelles-v1', 32)) : null;
  const encrypt = buf => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(buf), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]);
  };
  const decrypt = buf => {
    const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
  };
  // Empreinte d'une valeur (adresse e-mail) pour la retrouver sans la stocker en clair ; sans clé : null.
  const indexKey = key ? Buffer.from(crypto.hkdfSync('sha256', secret, 'deux-regards', 'index-v1', 32)) : null;
  const isText = v => typeof v === 'string' && v.startsWith(TEXT);
  const isBuf = v => Buffer.isBuffer(v) && v.length > 32 && v.subarray(0, 4).equals(MAGIC);
  return {
    enabled: Boolean(key),
    index: v => (indexKey ? crypto.createHmac('sha256', indexKey).update(String(v)).digest('hex') : null),
    sealed: v => isText(v) || isBuf(v),
    // Texte : vide et null restent tels quels (rien à protéger, et les requêtes « = '' » fonctionnent toujours). Une
    // valeur qui ressemble déjà à un chiffré est chiffrée elle aussi : elle vient d'une saisie (page /bonjour,
    // signalement), et la garder telle quelle ferait déchiffrer par l'admin un chiffré tiré d'une sauvegarde volée.
    // Ne pas chiffrer deux fois une valeur de la base : c'est à l'appelant de vérifier sealed() (sealExisting).
    seal: v => (key && typeof v === 'string' && v !== '' ? TEXT + encrypt(Buffer.from(v, 'utf8')).toString('base64') : v),
    open(v) {
      if (!isText(v)) return v;
      if (!key) return LOCKED;
      try { return decrypt(Buffer.from(v.slice(TEXT.length), 'base64')).toString('utf8'); } catch { failed('texte'); return LOCKED; }
    },
    sealBuf: b => (key && Buffer.isBuffer(b) ? Buffer.concat([MAGIC, encrypt(b)]) : b),
    openBuf(b) {
      if (!isBuf(b)) return b;
      if (!key) return null;
      try { return decrypt(b.subarray(4)); } catch { failed('binaire'); return null; }
    },
  };
}
