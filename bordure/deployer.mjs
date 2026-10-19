// Déploiement du Worker de bordure depuis la pile Unraid (service « bordure » du compose, profil « bordure ») : une
// tâche ponctuelle, lancée à la main, qui s'arrête une fois le Worker en place. Aucune dépendance : Wrangler, en version
// fixée, est téléchargé à chaque lancement dans le /tmp du conteneur.
//
//   docker compose --profile bordure run --rm bordure               déployer (wrangler.toml rempli, puis BORDURE_KEY)
//   docker compose --profile bordure run --rm bordure --essai       vérifier sans rien envoyer (wrangler deploy --dry-run)
//   docker compose --profile bordure run --rm bordure --desactiver  dernier recours : tout passe, rien n'est bloqué
//   docker compose --profile bordure run --rm bordure --reactiver   redéploie normalement (comme sans option)
//
// Valeurs lues (mêmes règles que la Vigie et le site) : VIGIE_CF_ACCOUNT_ID, VIGIE_CF_KV_NAMESPACE, VIGIE_CF_DATASET
// (vigie.env) ; VIGIE_DECISIONS_PUBKEY, VIGIE_BORDURE_KEY (.env de la pile) ; jeton de déploiement dans un fichier
// (BORDURE_TOKEN_FILE), à part de celui de la Vigie : la Vigie ne peut pas déployer, ce conteneur ne lit pas la Vigie.
// Procédure : deploy/unraid/vigie-phase-0.md, étape 3.7.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WRANGLER = 'wrangler@4.151.1';
const ICI = path.dirname(fileURLToPath(import.meta.url));

// Le wrangler.toml du modèle, rempli. Rend le texte ; lève une erreur sur une valeur invalide.
export function remplir(modele, { compte, kv, jeu = 'vigie_bordure', clePub, desactive = false }) {
  if (!/^[0-9a-f]{32}$/.test(compte || '')) throw new Error('VIGIE_CF_ACCOUNT_ID absent ou invalide (vigie.env : 32 caractères hexadécimaux)');
  if (!/^[0-9a-f]{32}$/.test(kv || '')) throw new Error('VIGIE_CF_KV_NAMESPACE absent ou invalide (vigie.env : identifiant de l’espace KV « vigie-blocages »)');
  if (!/^[a-z_][a-z0-9_]{0,63}$/.test(jeu)) throw new Error('VIGIE_CF_DATASET invalide (vigie.env : à laisser en commentaire)');
  if (!/^[A-Za-z0-9+/]+=*$/.test(clePub || '')) throw new Error('VIGIE_DECISIONS_PUBKEY absente ou invalide (.env de la pile : sortie de « node vigie/cli.js cles »)');
  const remplace = (texte, motif, par, quoi) => {
    if (!motif.test(texte)) throw new Error(`wrangler.toml.example : ${quoi} introuvable`);
    return texte.replace(motif, par);
  };
  let t = modele;
  t = remplace(t, /^workers_dev\s*=.*$/m, m => `${m}\naccount_id = "${compte}"`, 'workers_dev');
  t = remplace(t, /^DESACTIVE\s*=.*$/m, `DESACTIVE = "${desactive ? '1' : '0'}"`, 'DESACTIVE');
  t = remplace(t, /^DECISIONS_PUBKEY\s*=.*$/m, `DECISIONS_PUBKEY = "${clePub}"`, 'DECISIONS_PUBKEY');
  t = remplace(t, /(^\[\[kv_namespaces\]\][^[]*?^id\s*=\s*)[^\n]*$/m, `$1"${kv}"`, 'id de [[kv_namespaces]]');
  t = remplace(t, /(^\[\[analytics_engine_datasets\]\][^[]*?^dataset\s*=\s*)[^\n]*$/m, `$1"${jeu}"`, 'dataset de [[analytics_engine_datasets]]');
  if (/REMPLACER/.test(t)) throw new Error('wrangler.toml : il reste des valeurs à remplacer');
  return t;
}

function wrangler(args, { dossier, env, entree = null }) {
  const r = spawnSync('npm', ['exec', '--yes', `--package=${WRANGLER}`, '--', 'wrangler', ...args],
    { cwd: dossier, env, input: entree ?? undefined, stdio: [entree == null ? 'inherit' : 'pipe', 'inherit', 'inherit'] });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`wrangler ${args[0]} : échec (code ${r.status})`);
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const options = new Set(argv);
  for (const o of options) if (!['--essai', '--desactiver', '--reactiver'].includes(o)) throw new Error(`option inconnue : ${o}`);
  if (options.has('--desactiver') && options.has('--reactiver')) throw new Error('--desactiver ou --reactiver, pas les deux');
  const essai = options.has('--essai'), desactive = options.has('--desactiver');
  const toml = remplir(fs.readFileSync(path.join(ICI, 'wrangler.toml.example'), 'utf8'), {
    compte: env.VIGIE_CF_ACCOUNT_ID, kv: env.VIGIE_CF_KV_NAMESPACE, jeu: env.VIGIE_CF_DATASET || 'vigie_bordure', clePub: env.VIGIE_DECISIONS_PUBKEY, desactive,
  });
  const cle = env.VIGIE_BORDURE_KEY || '';
  if (cle.length < 32) throw new Error('VIGIE_BORDURE_KEY absente ou trop courte (.env de la pile : openssl rand -base64 32)');
  // Le jeton, lu avant d'écrire quoi que ce soit (sauf pour l'essai, qui n'envoie rien).
  let jeton = null;
  if (!essai) {
    const fichier = env.BORDURE_TOKEN_FILE || '/secrets/cloudflare-deploiement';
    try { jeton = fs.readFileSync(fichier, 'utf8').trim(); } catch { throw new Error(`jeton de déploiement introuvable (${fichier}) : modèle « Edit Cloudflare Workers », étape 3.7`); }
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(jeton)) throw new Error(`jeton de déploiement illisible (${fichier}) : une seule ligne attendue`);
  }
  // Le Worker et sa configuration, dans le /tmp du conteneur (le reste est en lecture seule).
  const dossier = fs.mkdtempSync('/tmp/bordure-');
  for (const f of ['worker.js', 'decisions.js']) fs.copyFileSync(path.join(ICI, f), path.join(dossier, f));
  fs.writeFileSync(path.join(dossier, 'wrangler.toml'), toml);
  const enfant = { PATH: env.PATH, HOME: '/tmp/home', npm_config_cache: '/tmp/npm', npm_config_update_notifier: 'false', WRANGLER_SEND_METRICS: 'false', CI: '1' };
  if (essai) {
    wrangler(['deploy', '--dry-run', '--outdir', path.join(dossier, 'sortie')], { dossier, env: enfant });
    console.log('Essai réussi : wrangler.toml valide, Worker assemblé ; rien n’a été envoyé à Cloudflare.');
    return;
  }
  Object.assign(enfant, { CLOUDFLARE_API_TOKEN: jeton, CLOUDFLARE_ACCOUNT_ID: env.VIGIE_CF_ACCOUNT_ID });
  // Déployer d'abord : sans BORDURE_KEY, le Worker n'ajoute aucun en-tête et le site ne change rien ; puis la clé.
  wrangler(['deploy'], { dossier, env: enfant });
  wrangler(['secret', 'put', 'BORDURE_KEY'], { dossier, env: enfant, entree: cle });
  console.log(desactive
    ? 'Worker DÉSACTIVÉ : tout passe, rien n’est bloqué ni compté. Pour le remettre : … run --rm bordure --reactiver'
    : 'Worker déployé et BORDURE_KEY posée. Routes à poser ou vérifier (étape 3.7, point 8), puis : docker exec nicephos-vigie node vigie/cli.js bordure');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.error(`Bordure : ${err.message}`); process.exit(1); }
}
