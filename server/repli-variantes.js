import fs from 'node:fs';
import path from 'node:path';
import { VARIANT_RE, variantName, widthsFor } from './images.js';

// Variante demandée mais absente du disque : quel fichier servir à sa place ?
//
// Les gabarits citent toutes les largeurs de widthsFor() (srcset, vignettes). Une photo importée avant l'ajout des
// tailles de 160 et 480 px n'a ces fichiers qu'une fois rattrapée par le passage de fond du démarrage (server/variants.js) ;
// d'ici là, la page ne doit jamais casser. Le repli : la plus petite variante plus grande déjà présente, de la même photo,
// de la même empreinte (filigrane, métadonnées) et du même format. Elle est plus lourde, jamais plus floue.
//
// `photo` : la ligne de la photo (file, width, variant_key), déjà vérifiée par la route (publiée, galerie, droits) ;
// `name` : le nom demandé, déjà validé par VARIANT_RE et dont l'empreinte est la courante.
// Retour : { name, repli } (repli : vrai si ce n'est pas le fichier demandé), ou null (aucun fichier à servir).
// Une largeur que la photo n'a pas (« -999.webp », 2000 pour un original de 1600 px) n'a jamais de repli : 404, comme avant.
export function servedVariant(dir, photo, name) {
  if (fs.existsSync(path.join(dir, name))) return { name, repli: false };
  const m = VARIANT_RE.exec(name);
  if (!m) return null;
  const width = Number(m[3]);
  const widths = widthsFor(photo.width);
  if (!widths.includes(width)) return null;
  for (const w of widths.filter(x => x > width)) {
    const other = variantName(photo.file, w, m[4], m[2] || '');
    if (fs.existsSync(path.join(dir, other))) return { name: other, repli: true };
  }
  return null;
}

// Cache d'un repli : court partout (cinq minutes), jamais « immutable » : le vrai fichier, créé ensuite sous le nom
// demandé, le remplace au plus tard cinq minutes après, chez le visiteur comme dans le cache partagé (Cloudflare).
export const REPLI_CACHE = 'public, max-age=300';
