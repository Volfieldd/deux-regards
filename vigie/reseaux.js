import { cleReseau } from '../server/securite/adresses-ip.js';
import { HALF_LIFE_MIN } from './poids.js';

// Réécriture, une fois, des clés de réseau IPv6 mal calculées avant l'audit D3-C4 / D3-D5 (le /48 prenait les trois premiers
// morceaux du texte : « 2a01::bad:5 » donnait « 2a01::bad:: », l'hôte compris ; « 2606:4700::1a » donnait « 2606:4700::: »).
// Appelée au démarrage du service (vigie/index.js), avant le moteur ; faite une fois, notée par le réglage
// « reseaux_canoniques ». Les migrations de la base ne sont que du SQL (store.js) : le calcul de la forme canonique d'une
// IPv6 se fait ici, en JavaScript, avec celui du site (server/securite/adresses-ip.js).
//   - entities (kind « reseau »), entity_links (l'un ou l'autre bout « reseau »), alerts (entite_kind « reseau ») : réécrites ;
//     aucune n'est chaînée ni signée (store.js : seule la table events l'est ; decisions a son HMAC par ligne et n'a pas de
//     clé de réseau). Deux clés qui tombent sur le même réseau sont fusionnées (score et contributions ramenés au même
//     instant puis additionnés, comme le moteur ; liens : le plus récent) ;
//   - events.ip_net n'est JAMAIS réécrit : chaque ligne est chaînée par HMAC (store.js, canonical), la changer romprait la
//     chaîne. La console cherche les deux écritures (formesReseau) et retronque toute clé non canonique à l'affichage.
const FAIT = 'reseaux_canoniques';
const DECAY = ms => 0.5 ** (Math.max(0, ms) / (HALF_LIFE_MIN * 60e3));
const lire = s => { try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

export function canoniserReseaux(store, { now = Date.now } = {}) {
  const { db, setting } = store;
  if (setting.get(FAIT)) return null;
  const compte = { entites: 0, fusions: 0, liens: 0, alertes: 0 };
  db.transaction(() => {
    // Entités : seules les clés IPv6 peuvent être fausses (l'IPv4 l'a toujours été juste).
    const get = db.prepare("SELECT * FROM entities WHERE kind = 'reseau' AND key = ?");
    const del = db.prepare("DELETE FROM entities WHERE kind = 'reseau' AND key = ?");
    const ren = db.prepare("UPDATE entities SET key = ? WHERE kind = 'reseau' AND key = ?");
    const save = db.prepare(`UPDATE entities SET score = @score, at = @at, contributions = @contributions, signaux = @signaux, premiere = @premiere,
      derniere = @derniere WHERE kind = 'reseau' AND key = @key`);
    for (const e of db.prepare("SELECT * FROM entities WHERE kind = 'reseau' AND key LIKE '%:%'").all()) {
      const c = cleReseau(e.key);
      if (!c || c === e.key) continue;
      const deja = get.get(c);
      if (!deja) { ren.run(c, e.key); compte.entites += 1; continue; }
      const t = Math.max(e.at, deja.at);
      const contributions = {};
      for (const [x, f] of [[lire(e.contributions), DECAY(t - e.at)], [lire(deja.contributions), DECAY(t - deja.at)]]) {
        for (const [s, v] of Object.entries(x)) if (Number.isFinite(v)) contributions[s] = (contributions[s] || 0) + v * f;
      }
      save.run({ key: c, score: e.score * DECAY(t - e.at) + deja.score * DECAY(t - deja.at), at: t, contributions: JSON.stringify(contributions),
        signaux: e.signaux + deja.signaux, premiere: Math.min(e.premiere, deja.premiere), derniere: Math.max(e.derniere, deja.derniere) });
      del.run(e.key);
      compte.fusions += 1;
    }
    // Liens : réécrits un par un (clé primaire : un lien déjà là garde la date la plus récente).
    const put = db.prepare(`INSERT INTO entity_links (a_kind, a_key, b_kind, b_key, derniere) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (a_kind, a_key, b_kind, b_key) DO UPDATE SET derniere = MAX(derniere, excluded.derniere)`);
    const drop = db.prepare('DELETE FROM entity_links WHERE a_kind = ? AND a_key = ? AND b_kind = ? AND b_key = ?');
    const liens = db.prepare(`SELECT * FROM entity_links WHERE (a_kind = 'reseau' AND a_key LIKE '%:%')
      UNION SELECT * FROM entity_links WHERE (b_kind = 'reseau' AND b_key LIKE '%:%')`).all();
    for (const l of liens) {
      const a = l.a_kind === 'reseau' ? cleReseau(l.a_key) || l.a_key : l.a_key;
      const b = l.b_kind === 'reseau' ? cleReseau(l.b_key) || l.b_key : l.b_key;
      if (a === l.a_key && b === l.b_key) continue;
      drop.run(l.a_kind, l.a_key, l.b_kind, l.b_key);
      put.run(l.a_kind, a, l.b_kind, b, l.derniere);
      compte.liens += 1;
    }
    // Alertes sur un réseau.
    const maj = db.prepare('UPDATE alerts SET entite_key = ? WHERE id = ?');
    for (const a of db.prepare("SELECT id, entite_key FROM alerts WHERE entite_kind = 'reseau' AND entite_key LIKE '%:%'").all()) {
      const c = cleReseau(a.entite_key);
      if (c && c !== a.entite_key) { maj.run(c, a.id); compte.alertes += 1; }
    }
    setting.set(FAIT, { ...compte, a: now() });
  }).immediate();
  return compte;
}
