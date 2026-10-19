import fs from 'node:fs';
import path from 'node:path';

// Administration en deux versions, côte à côte : v1 (les gabarits de views/admin/) et v2 (ceux de views/admin/v2/, la
// refonte issue des maquettes MQ-07 à MQ-10 de l'audit d'ergonomie du 16 oct. 2026). Le choix est celui de chaque
// compte (« Admin : v1 / v2 », menu du compte) : chacun bascule quand il veut et revient d'un clic ; v1 par défaut.
// Comme pour le site public (server/version-publique.js), le repli se fait écran par écran : un écran qui n'a pas encore
// de gabarit v2 s'affiche en v1, entier (sa mise en page comprise).
// Le choix est une préférence du compte (table account_prefs, migration 057), pas un réglage du site : rien de public
// ne change, et la table accounts, surveillée par la Vigie, n'est pas touchée.
export const ADMIN_VERSIONS = ['v1', 'v2'];
const KEY = 'admin_version';

export function createAdminVersion({ db, viewsDir, cache = false }) {
  const idOf = db.prepare('SELECT id FROM accounts WHERE sub = ?').pluck();
  const read = db.prepare('SELECT value FROM account_prefs WHERE account_id = ? AND key = ?').pluck();
  const write = db.prepare(`INSERT INTO account_prefs (account_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  const known = new Map();                   // gabarit → existe-t-il en v2 ? (gardé en production seulement)

  // Version choisie par le compte de cette session (sub) : v1 sans compte ni choix.
  const of = sub => {
    const id = sub ? idOf.get(sub) : null;
    const v = id ? read.get(id, KEY) : null;
    return ADMIN_VERSIONS.includes(v) ? v : 'v1';
  };
  // Le gabarit v2 de cet écran existe-t-il ? (« batch » → views/admin/v2/batch.eta) Sinon, l'écran reste en v1.
  const hasV2 = template => {
    if (!/^[a-z][\w-]*$/i.test(template)) return false;
    if (cache && known.has(template)) return known.get(template);
    const ok = fs.existsSync(path.join(viewsDir, 'admin', 'v2', `${template}.eta`));
    if (cache) known.set(template, ok);
    return ok;
  };
  return {
    of,
    hasV2,
    // Enregistre le choix du compte ; faux pour une version inconnue ou un compte absent.
    set(sub, v) {
      if (!ADMIN_VERSIONS.includes(v)) return false;
      const id = sub ? idOf.get(sub) : null;
      if (!id) return false;
      write.run(id, KEY, v, Date.now());
      return true;
    },
    // Gabarit servi à cette requête : « admin/v2/<écran> » si le compte a choisi la v2 et que l'écran l'a, sinon
    // « admin/<écran> » (repli).
    template(request, template) {
      return of(request.session?.sub) === 'v2' && hasV2(template) ? `admin/v2/${template}` : `admin/${template}`;
    },
  };
}
