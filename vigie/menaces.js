import net from 'node:net';
import { readLimited } from './zitadel.js';

// Listes de menaces gratuites (décision D22, recadrage du 17 octobre 2026), téléchargées une fois par jour par la
// Vigie et gardées dans sa base ; aucune adresse de visiteur n'est envoyée à un tiers (pas d'interrogation en ligne).
//   - Spamhaus DROP (IPv4, IPv6) : réseaux détournés ou entièrement malveillants (gratuit ; citer Spamhaus) ;
//   - abuse.ch Feodo Tracker : serveurs de commande de botnets (usage libre) ;
//   - sorties Tor : contexte, pas un blocage.
// Une étiquette ajoute des points à l'adresse (jamais une source du quorum : ce n'est pas une observation du site).
// Revue du 17 octobre 2026 : préfixes bornés par liste (une liste altérée ne marque pas tout Internet), 20 000 entrées
// au plus, mise à jour refusée si la liste triple d'un jour à l'autre, pas de redirection suivie.

export const LISTS = {
  spamhaus_drop: { urls: ['https://www.spamhaus.org/drop/drop_v4.json', 'https://www.spamhaus.org/drop/drop_v6.json'], format: 'ndjson-cidr', points: 3, titre: 'réseau listé par Spamhaus DROP', min4: 10, min6: 19 },
  feodo: { urls: ['https://feodotracker.abuse.ch/downloads/ipblocklist.txt'], format: 'lignes', points: 3, titre: 'serveur de botnet (abuse.ch Feodo Tracker)', min4: 32, min6: 128 },
  tor: { urls: ['https://check.torproject.org/torbulkexitlist'], format: 'lignes', points: 1, titre: 'sortie Tor', min4: 32, min6: 128 },
};
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

export function parseList(format, text, { min4 = 8, min6 = 16 } = {}) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let cidr = line;
    if (format === 'ndjson-cidr') { try { cidr = JSON.parse(line).cidr; } catch { continue; } }
    const [addr, prefix] = String(cidr || '').split('/');
    const v = net.isIP(addr);
    if (!v) continue;
    const p = prefix == null ? (v === 4 ? 32 : 128) : Number(prefix);
    if (!Number.isInteger(p) || p < (v === 4 ? min4 : min6) || p > (v === 4 ? 32 : 128)) continue;
    out.push(`${addr}/${p}`);
  }
  return out;
}

export function createThreats({ store, fetchImpl = fetch, now = Date.now, log, enabled = true }) {
  const { db, setting } = store;
  db.exec(`CREATE TABLE IF NOT EXISTS menaces (liste TEXT NOT NULL, reseau TEXT NOT NULL, PRIMARY KEY (liste, reseau))`);
  let lists = {};                    // liste → BlockList
  const build = () => {
    lists = {};
    if (!enabled) return;                // listes désactivées : celles déjà en base ne marquent plus rien
    for (const name of Object.keys(LISTS)) {
      const b = new net.BlockList();
      for (const r of db.prepare('SELECT reseau FROM menaces WHERE liste = ?').pluck().iterate(name)) {
        const [a, p] = r.split('/');
        b.addSubnet(a, Number(p), net.isIPv4(a) ? 'ipv4' : 'ipv6');
      }
      lists[name] = b;
    }
  };
  build();

  async function update() {
    const res = {};
    if (!enabled) return res;
    for (const [name, def] of Object.entries(LISTS)) {
      try {
        const entries = [];
        for (const url of def.urls) {
          const r = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Vigie Nicephos (liste quotidienne)' } });
          if (r.status !== 200) throw new Error(`${url} : réponse ${r.status}`);
          entries.push(...parseList(def.format, await readLimited(r, MAX_BYTES), def));
          if (entries.length > MAX_ENTRIES) throw new Error(`plus de ${MAX_ENTRIES} entrées`);
        }
        if (!entries.length) throw new Error('liste vide');
        const before = db.prepare('SELECT COUNT(*) FROM menaces WHERE liste = ?').pluck().get(name);
        if (before >= 50 && entries.length > 3 * before) throw new Error(`liste triplée (${before} → ${entries.length}) : mise à jour refusée`);
        db.transaction(() => {
          db.prepare('DELETE FROM menaces WHERE liste = ?').run(name);
          const ins = db.prepare('INSERT OR IGNORE INTO menaces (liste, reseau) VALUES (?, ?)');
          for (const e of entries) ins.run(name, e);
        })();
        res[name] = entries.length;
      } catch (err) { res[name] = `erreur : ${err.message}`; log?.warn({ err: err.message, liste: name }, 'Vigie : liste de menaces'); }
    }
    setting.set('menaces_maj', { at: now(), ...res });
    build();
    return res;
  }

  // Étiquettes d'une adresse (listes où elle figure).
  function labels(ip) {
    const a = String(ip || '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1');
    const type = net.isIPv4(a) ? 'ipv4' : net.isIPv6(a) ? 'ipv6' : null;
    if (!type) return [];
    return Object.entries(lists).filter(([, b]) => b.check(a, type)).map(([name]) => name);
  }
  return { update, labels, state: () => setting.get('menaces_maj') };
}
