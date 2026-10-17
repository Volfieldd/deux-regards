import net from 'node:net';
import { readLimited } from './zitadel.js';

// Listes de menaces gratuites (décision D22, recadrage du 17 octobre 2026), téléchargées une fois par jour par la
// Vigie et gardées dans sa base ; aucune adresse de visiteur n'est envoyée à un tiers (pas d'interrogation en ligne).
//   - Spamhaus DROP (IPv4, IPv6) : réseaux détournés ou entièrement malveillants (gratuit ; citer Spamhaus) ;
//   - abuse.ch Feodo Tracker : serveurs de commande de botnets (usage libre) ;
//   - sorties Tor : contexte, pas un blocage.
// Une étiquette ajoute des points à l'adresse (jamais une source du quorum : ce n'est pas une observation du site).

export const LISTS = {
  spamhaus_drop: { urls: ['https://www.spamhaus.org/drop/drop_v4.json', 'https://www.spamhaus.org/drop/drop_v6.json'], format: 'ndjson-cidr', points: 3, titre: 'réseau listé par Spamhaus DROP' },
  feodo: { urls: ['https://feodotracker.abuse.ch/downloads/ipblocklist.txt'], format: 'lignes', points: 3, titre: 'serveur de botnet (abuse.ch Feodo Tracker)' },
  tor: { urls: ['https://check.torproject.org/torbulkexitlist'], format: 'lignes', points: 1, titre: 'sortie Tor' },
};
const MAX_BYTES = 8 * 1024 * 1024;

export function parseList(format, text) {
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
    if (!Number.isInteger(p) || p < (v === 4 ? 8 : 16) || p > (v === 4 ? 32 : 128)) continue;
    out.push(`${addr}/${p}`);
  }
  return out;
}

export function createThreats({ store, fetchImpl = fetch, now = Date.now, log }) {
  const { db, setting } = store;
  db.exec(`CREATE TABLE IF NOT EXISTS menaces (liste TEXT NOT NULL, reseau TEXT NOT NULL, PRIMARY KEY (liste, reseau))`);
  let lists = {};                    // liste → BlockList
  const build = () => {
    lists = {};
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
    for (const [name, def] of Object.entries(LISTS)) {
      try {
        const entries = [];
        for (const url of def.urls) {
          const r = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Vigie Nicephos (liste quotidienne)' } });
          if (r.status !== 200) throw new Error(`${url} : réponse ${r.status}`);
          entries.push(...parseList(def.format, await readLimited(r, MAX_BYTES)));
        }
        if (!entries.length) throw new Error('liste vide');
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
