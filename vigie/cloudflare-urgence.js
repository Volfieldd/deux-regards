import fs from 'node:fs';
import { readLimited } from './zitadel.js';
import { parseDuration } from './decisions.js';

// Mode urgence de Cloudflare (« I'm Under Attack », annexe Cloudflare § 8) depuis la console ou la ligne de commande :
// chaque visiteur passe par une vérification de son navigateur (quelques secondes) avant le site ; utile face à une
// attaque massive que les blocages d'adresses ne suffisent pas à arrêter. Facultatif : jeton à part (droit large :
// « Zone → Zone Settings → Edit » sur la seule zone), jamais celui de la bordure.
//   - toujours pour une durée (24 h au plus par défaut, VIGIE_CF_URGENCE_MAX) : passée la durée, la Vigie remet le
//     niveau de sécurité d'avant (lu au moment d'activer) ;
//   - niveau changé à la main chez Cloudflare pendant le mode : la Vigie le voit à la vérification suivante et
//     n'écrase rien (elle note seulement la fin du mode) ;
//   - chaque activation et chaque fin sont des événements (« vigie_urgence ») : les Administrateurs sont prévenus.

const API = 'https://api.cloudflare.com/client/v4';
const UNDER = 'under_attack';
const LEVELS = ['off', 'essentially_off', 'low', 'medium', 'high', UNDER];

export function createUrgence({ store, zoneId, tokenFile, maxMs = 24 * 3600e3, fetchImpl = fetch, now = Date.now, log }) {
  if (!/^[0-9a-f]{32}$/.test(zoneId)) throw new Error('VIGIE_CF_ZONE_ID : identifiant de zone Cloudflare attendu (32 caractères hexadécimaux)');
  const { setting } = store;
  const token = () => fs.readFileSync(tokenFile, 'utf8').trim();
  async function call(init = {}) {
    const r = await fetchImpl(`${API}/zones/${zoneId}/settings/security_level`, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${token()}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
    const text = await readLimited(r, 256 * 1024);
    let j = null;
    try { j = JSON.parse(text); } catch { /* pas du JSON */ }
    if (r.status !== 200 || !j?.success) throw new Error(`Cloudflare (mode urgence) : réponse ${r.status}${j?.errors?.[0]?.message ? ` : ${String(j.errors[0].message).slice(0, 160)}` : ''}`);
    return j.result?.value;
  }
  const etat = () => setting.get('cf_urgence', null);

  async function activer({ duree, par, motif }) {
    const m = String(motif || '').trim().slice(0, 200);
    if (!m) throw new Error('mode urgence : motif obligatoire');
    if (!duree) throw new Error('mode urgence : toujours pour une durée');
    const ms = Math.min(parseDuration(duree), maxMs);
    const avant = await call();
    const cur = etat();
    // Déjà en urgence par la Vigie : on prolonge, en gardant le niveau d'avant d'origine.
    const niveauAvant = cur?.actif ? cur.avant : (LEVELS.includes(avant) && avant !== UNDER ? avant : 'medium');
    if (avant !== UNDER) await call({ method: 'PATCH', body: JSON.stringify({ value: UNDER }) });
    const e = { actif: true, depuis: cur?.actif ? cur.depuis : now(), jusqua: now() + ms, avant: niveauAvant, par, motif: m };
    setting.set('cf_urgence', e);
    store.own('vigie_urgence', { emetteur: par, detail: { action: cur?.actif ? 'prolongé' : 'activé', jusqua: e.jusqua, avant: niveauAvant, motif: m } });
    return e;
  }
  async function desactiver({ par, raison = 'levé' } = {}) {
    const cur = etat();
    if (!cur?.actif) return null;
    const niveau = await call();
    // Remis au niveau d'avant seulement si c'est encore le mode urgence (un niveau choisi à la main n'est pas écrasé).
    if (niveau === UNDER) await call({ method: 'PATCH', body: JSON.stringify({ value: cur.avant || 'medium' }) });
    setting.set('cf_urgence', { ...cur, actif: false, fin: now(), fin_par: par, fin_raison: raison });
    store.own('vigie_urgence', { emetteur: par || 'vigie/cloudflare-urgence.js', detail: { action: raison, niveau: niveau === UNDER ? cur.avant : niveau } });
    return cur;
  }
  // Chaque minute : fin de la durée, ou niveau changé à la main (fin notée sans rien écraser).
  let busy = false;
  async function tick() {
    const cur = etat();
    if (busy || !cur?.actif) return;
    busy = true;
    try {
      if (cur.jusqua <= now()) { await desactiver({ par: 'vigie/cloudflare-urgence.js', raison: 'échu' }); return; }
      const niveau = await call();
      if (niveau !== UNDER) {
        setting.set('cf_urgence', { ...cur, actif: false, fin: now(), fin_raison: 'changé chez Cloudflare' });
        store.own('vigie_urgence', { emetteur: 'vigie/cloudflare-urgence.js', detail: { action: 'changé chez Cloudflare', niveau } });
      }
    } catch (err) { log?.warn({ err: err.message }, 'Vigie : mode urgence'); } finally { busy = false; }
  }
  let timer = null;
  return {
    activer, desactiver, tick, etat, maxMs,
    start() { timer = setInterval(() => { tick(); }, 60e3); timer.unref?.(); },
    stop() { clearInterval(timer); },
  };
}
