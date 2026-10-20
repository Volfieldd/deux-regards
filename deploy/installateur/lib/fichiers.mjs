// Fichiers de la pile : .env et vigie.env (fusion qui ne perd jamais une valeur déjà posée), dossiers des données
// (créés avec leur propriétaire, jamais modifiés s'ils existent), fichiers de secrets.
import fs from 'node:fs';
import path from 'node:path';

const LIGNE = /^\s*(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/;

// Valeur d'une ligne KEY=valeur (guillemets retirés, commentaire de fin de ligne ignoré hors guillemets).
export function valeurBrute(reste) {
  const t = reste.trim();
  if (t.startsWith('"')) { const f = t.indexOf('"', 1); return f > 0 ? t.slice(1, f) : t.slice(1); }
  if (t.startsWith("'")) { const f = t.indexOf("'", 1); return f > 0 ? t.slice(1, f) : t.slice(1); }
  return t.replace(/\s+#.*$/, '');
}

// Valeurs actives d'un fichier .env (les lignes commentées ne comptent pas).
export function lireEnv(texte) {
  const v = {};
  for (const l of texte.split(/\r?\n/)) {
    const m = LIGNE.exec(l);
    if (m && !m[1]) v[m[2]] = valeurBrute(m[3]);
  }
  return v;
}

// Une valeur s'écrit telle quelle si elle ne contient que des caractères sûrs, sinon entre apostrophes (Compose ne
// remplace alors rien, pas même un « $ »). Retour à la ligne et apostrophe : refusés.
export function formater(valeur) {
  const s = String(valeur);
  if (/[\r\n]/.test(s)) throw new Error('valeur sur plusieurs lignes refusée');
  if (/^[A-Za-z0-9_.,:/@+=%-]*$/.test(s)) return s;
  if (s.includes("'")) throw new Error('valeur avec une apostrophe refusée');
  return `'${s}'`;
}

// Fusionne `valeurs` dans `texte` (le .env existant, sinon le modèle). Une valeur déjà posée (non vide) n'est jamais
// remplacée, sauf pour les clés de `forcer` (secret régénéré, nouveau tunnel). Une ligne commentée « # CLE= » du modèle
// est décommentée à sa place ; une clé absente s'ajoute à la fin. Rend le texte et la liste des changements.
export function fusionnerEnv(texte, valeurs, { forcer = [] } = {}) {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n');
  const actives = lireEnv(texte);
  const changements = [];
  const restantes = new Map(Object.entries(valeurs).filter(([, v]) => v !== undefined && v !== null));
  const deja = new Set();
  for (let i = 0; i < lignes.length; i++) {
    const m = LIGNE.exec(lignes[i]);
    if (!m || !restantes.has(m[2])) continue;
    const cle = m[2], nouvelle = String(restantes.get(cle));
    const commentee = Boolean(m[1]);
    if (commentee && Object.hasOwn(actives, cle)) continue; // la clé est active plus loin : c'est elle qui compte
    if (deja.has(cle)) continue;
    const actuelle = commentee ? '' : valeurBrute(m[3]);
    deja.add(cle);
    restantes.delete(cle);
    if (actuelle === nouvelle) continue;
    if (actuelle !== '' && !forcer.includes(cle)) { changements.push({ cle, action: 'gardee' }); continue; }
    lignes[i] = `${cle}=${formater(nouvelle)}`;
    changements.push({ cle, action: actuelle === '' ? 'posee' : 'remplacee' });
  }
  const ajout = [...restantes].filter(([cle]) => !deja.has(cle));
  if (ajout.length) {
    while (lignes.length && lignes[lignes.length - 1] === '') lignes.pop();
    lignes.push('', '# ---------- ajouté par l’installateur ----------');
    for (const [cle, v] of ajout) { lignes.push(`${cle}=${formater(v)}`); changements.push({ cle, action: 'posee' }); }
  }
  let sortie = lignes.join('\n');
  if (!sortie.endsWith('\n')) sortie += '\n';
  return { texte: sortie, changements };
}

// Écriture atomique (fichier temporaire puis renommage), droits restreints dès la création.
export function ecrireFichier(chemin, contenu, { mode = 0o600, proprietaire } = {}) {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const tmp = `${chemin}.installateur-${process.pid}`;
  fs.writeFileSync(tmp, contenu, { mode });
  try { fs.chmodSync(tmp, mode); } catch { /* FAT de /boot sur Unraid : pas de droits */ }
  if (proprietaire) try { fs.chownSync(tmp, proprietaire.uid, proprietaire.gid); } catch { /* idem */ }
  fs.renameSync(tmp, chemin);
}

// Copie de sécurité d'un fichier qu'on va remplacer : « nom.avant-installateur-AAAAMMJJ-HHMMSS ».
export function garderCopie(chemin, now = new Date()) {
  if (!fs.existsSync(chemin)) return null;
  const d = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const copie = `${chemin}.avant-installateur-${d}`;
  fs.copyFileSync(chemin, copie);
  try { fs.chmodSync(copie, 0o600); } catch { /* FAT */ }
  return copie;
}

// Dossiers de la pile (README Unraid, étape 2). Les chemins sont ceux de l'hôte ; `racine` les préfixe quand
// l'installateur tourne dans un conteneur qui voit l'hôte ailleurs (mode Linux : /hote).
export function planDossiers({ nicephos, sauvegardes, uid, gid, vigie = false }) {
  const p = (chemin, mode) => ({ chemin, uid, gid, mode });
  const plan = [p(path.posix.join(nicephos, 'data'), 0o750), p(sauvegardes, 0o750)];
  if (vigie) {
    plan.push(p(path.posix.join(nicephos, 'vigie'), 0o700), p(path.posix.join(nicephos, 'vigie-secrets'), 0o700), p(`${sauvegardes}-vigie`, 0o750));
  }
  return plan;
}

// État d'un dossier du plan : à créer, déjà là (bon propriétaire), ou déjà là avec un autre propriétaire (signalé,
// jamais changé : il peut contenir des données).
export function etatDossier(d, racine = '') {
  let st;
  try { st = fs.statSync(racine + d.chemin); } catch { return { ...d, etat: 'creer' }; }
  if (!st.isDirectory()) return { ...d, etat: 'conflit', detail: 'existe mais n’est pas un dossier' };
  if (st.uid !== d.uid || st.gid !== d.gid) return { ...d, etat: 'proprietaire', detail: `propriétaire ${st.uid}:${st.gid} au lieu de ${d.uid}:${d.gid}` };
  return { ...d, etat: 'ok' };
}

export function creerDossier(d, racine = '') {
  fs.mkdirSync(racine + d.chemin, { recursive: true, mode: d.mode });
  fs.chmodSync(racine + d.chemin, d.mode);
  fs.chownSync(racine + d.chemin, d.uid, d.gid);
}
