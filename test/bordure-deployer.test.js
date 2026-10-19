import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { remplir, main } from '../bordure/deployer.mjs';

// Déploiement du Worker de bordure (service « bordure » du compose) : wrangler.toml rempli depuis le modèle, valeurs
// vérifiées comme la Vigie et le site. Rien n'est envoyé à Cloudflare ici.
const MODELE = fs.readFileSync(new URL('../bordure/wrangler.toml.example', import.meta.url), 'utf8');
const OK = { compte: '0123456789abcdef0123456789abcdef', kv: 'fedcba9876543210fedcba9876543210', clePub: 'MCowBQYDK2VwAyEAabc+/def=' };

test('bordure : wrangler.toml rempli depuis le modèle', () => {
  const t = remplir(MODELE, OK);
  assert.match(t, /^account_id = "0123456789abcdef0123456789abcdef"$/m);
  assert.match(t, /\[\[kv_namespaces\]\][^[]*^id = "fedcba9876543210fedcba9876543210"$/m);
  assert.match(t, /\[\[analytics_engine_datasets\]\][^[]*^dataset = "vigie_bordure"$/m);
  assert.match(t, /^DECISIONS_PUBKEY = "MCowBQYDK2VwAyEAabc\+\/def="$/m);
  assert.match(t, /^DESACTIVE = "0"$/m);
  assert.ok(!/REMPLACER/.test(t));
  // Le reste du modèle n'a pas bougé : mêmes lignes, plus account_id.
  assert.equal(t.split('\n').length, MODELE.split('\n').length + 1);
  assert.match(remplir(MODELE, { ...OK, desactive: true }), /^DESACTIVE = "1"$/m);
  assert.match(remplir(MODELE, { ...OK, jeu: 'autre_jeu' }), /^dataset = "autre_jeu"$/m);
});

test('bordure : valeurs invalides refusées avant tout envoi', () => {
  assert.throws(() => remplir(MODELE, { ...OK, compte: 'abc' }), /VIGIE_CF_ACCOUNT_ID/);
  assert.throws(() => remplir(MODELE, { ...OK, kv: undefined }), /VIGIE_CF_KV_NAMESPACE/);
  assert.throws(() => remplir(MODELE, { ...OK, kv: `${OK.kv}"\nid = "x` }), /VIGIE_CF_KV_NAMESPACE/);
  assert.throws(() => remplir(MODELE, { ...OK, jeu: 'vigie-bordure' }), /VIGIE_CF_DATASET/);
  assert.throws(() => remplir(MODELE, { ...OK, clePub: 'a"b' }), /VIGIE_DECISIONS_PUBKEY/);
  const env = { VIGIE_CF_ACCOUNT_ID: OK.compte, VIGIE_CF_KV_NAMESPACE: OK.kv, VIGIE_DECISIONS_PUBKEY: OK.clePub, VIGIE_BORDURE_KEY: 'courte' };
  assert.throws(() => main([], env), /VIGIE_BORDURE_KEY/);
  assert.throws(() => main(['--tout'], env), /option inconnue/);
  assert.throws(() => main(['--desactiver', '--reactiver'], env), /pas les deux/);
  assert.throws(() => main([], { ...env, VIGIE_BORDURE_KEY: 'k'.repeat(40), BORDURE_TOKEN_FILE: '/nulle/part' }), /jeton de déploiement introuvable/);
});
