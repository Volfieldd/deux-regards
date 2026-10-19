// Secrets générés à l'installation, mêmes formats que la documentation (openssl rand -base64 32) et que
// « node vigie/cli.js cles » (vigie/cli.js, keys()) : l'image du site n'embarque pas la Vigie.
import crypto from 'node:crypto';

export const aleatoire = () => crypto.randomBytes(32).toString('base64');

export function clesVigie() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    vigie: { VIGIE_INGEST_KEY: aleatoire(), VIGIE_LOG_KEY: aleatoire(), VIGIE_DECISIONS_PRIVATE_KEY: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') },
    site: { VIGIE_DECISIONS_PUBKEY: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') },
  };
}
