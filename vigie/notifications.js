import nodemailer from 'nodemailer';
import { readLimited } from './zitadel.js';

// Notifications de la Vigie (phase D, annexe architecture sections 4.3 et 8, décision D10) : Signal (passerelle
// signal-cli-rest-api sur un réseau interne), l'e-mail en secours. Un message court, SANS adresse, sans compte, sans
// donnée personnelle : gravité, nature de l'alerte, d'où vient le signal, heure, lien de la console (qui exige toujours
// Cloudflare Access et Zitadel).
//   - envoyé à l'ouverture d'une alerte haute ou critique et à son aggravation vers haut ou critique, en mode « alerter »
//     ou « bloquer » (jamais « observer »), interrupteur « alertes » en marche ;
//   - 20 messages par heure au plus et par canal, puis un message de synthèse à la fin de l'heure ;
//   - Signal en échec : l'e-mail part à sa place et l'échec ouvre une alerte (une fois par heure et par canal).

const PER_HOUR = 20;
const SOURCES = { site: 'site', zitadel: 'Zitadel', bordure: 'bordure Cloudflare', vigie: 'contrôles de la Vigie' };
const LABEL = { critique: 'Critique', haut: 'Haute', moyen: 'Moyenne', bas: 'Basse', info: 'Info' };
const hourOf = t => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(t).replace(':', ' h ');

// Essai d'un canal sans base ni moteur (ligne de commande) : un message sans alerte.
export function testChannel(config, canal, { fetchImpl = fetch, transport = null, now = Date.now } = {}) {
  const stub = { onAdded: () => {}, own: () => {}, db: null };
  return createNotifier({ store: stub, engine: null, switches: null, config, fetchImpl, transport, now }).test(canal);
}

// Texte d'un message (exporté pour les tests et la ligne de commande).
// Réponse déjà faite, sans cible (ni compte ni adresse) : de quoi savoir à 23 h si l'urgence demeure.
const DONE = { geler: 'compte gelé', revoquer_compte: 'sessions du compte fermées', revoquer_session: 'session fermée', bloquer: 'adresse bloquée', verrouiller: 'admin verrouillée' };
const lengthOf = ms => (ms >= 864e5 - 60e3 ? `${Math.round(ms / 864e5)} j` : `${Math.round(ms / 3600e3)} h`);
export const responseOf = decisions => (decisions.length ? `Réponse : ${decisions.map(d => `${DONE[d.kind] || d.kind}${d.kind === 'geler' || d.kind === 'bloquer' ? ` ${lengthOf(d.fin - d.cree_a)}` : ''}`).join(', ')}` : 'Aucune réponse automatique');

export function messageOf({ id, gravite, titre, sources = [], t, console: url, action = 'ouverte', reponse = null }) {
  const from = sources.map(s => SOURCES[s] || s).join(', ') || 'Vigie';
  return [`[${LABEL[gravite] || gravite}] ${titre}${action === 'aggravee' ? ' (aggravée)' : ''}`, `Source : ${from}`, ...(reponse ? [reponse] : []), `${hourOf(t)} · ${url}/alertes/${id}`].join('\n');
}

export function createNotifier({ store, engine, switches, config = {}, fetchImpl = fetch, now = Date.now, log, transport = null }) {
  const { signal = null, mail = null, consoleUrl = 'https://vigie.nicephos.art' } = config;
  const mailer = mail ? (transport || nodemailer.createTransport({ url: mail.url, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, requireTLS: !/^smtps:/i.test(mail.url), tls: { minVersion: 'TLSv1.2' } })) : null;
  const channels = { signal: Boolean(signal), email: Boolean(mailer) };
  const budget = new Map();                 // canal → { hour, sent, skipped }
  const failedTold = new Map();             // canal → heure de l'échec signalé

  async function sendSignal(text) {
    const r = await fetchImpl(`${signal.url}/v2/send`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, number: signal.number, recipients: [signal.group] }) });
    const body = await readLimited(r, 64 * 1024).catch(() => '');
    if (r.status !== 201 && r.status !== 200) throw new Error(`passerelle Signal : réponse ${r.status}${/rate.?limit/i.test(body) ? ' (limite de Signal : captcha à résoudre)' : ''}`);
  }
  async function sendMail(text) {
    await mailer.sendMail({ from: mail.from, to: mail.to, subject: text.split('\n')[0].slice(0, 120), text: `${text}\n\nVigie Nicephos — ce message ne contient aucune donnée personnelle ; le détail est dans la console.\nOuvrez la Vigie depuis votre favori ; elle ne demande jamais votre mot de passe par message.` });
  }
  const senders = { signal: sendSignal, email: sendMail };

  const failed = (canal, err) => {
    const hour = Math.floor(now() / 3600e3);
    log?.warn({ err: err.message, canal }, 'Vigie : notification non envoyée');
    if (failedTold.get(canal) === hour) return;
    failedTold.set(canal, hour);
    store.own('vigie_canal_echec', { emetteur: 'vigie/notifications.js', detail: { canal, erreur: String(err.message).slice(0, 200) } });
  };
  // Un canal, dans son budget horaire ; renvoie vrai si le message est parti.
  async function viaChannel(canal, text) {
    if (!channels[canal]) return false;
    const hour = Math.floor(now() / 3600e3);
    let b = budget.get(canal);
    if (!b || b.hour !== hour) {
      // Heure nouvelle : synthèse de ce qui n'a pas été envoyé une à une pendant la précédente.
      const pending = b?.skipped || 0;
      b = { hour, sent: 0, skipped: 0 };
      budget.set(canal, b);
      if (pending) await viaChannel(canal, `Vigie : ${pending} autre(s) alerte(s) l’heure précédente, non envoyées une à une (plus de ${PER_HOUR} par heure).\n${consoleUrl}`);
    }
    if (!text) return true;                   // appel de tick() : seulement la synthèse
    if (b.sent >= PER_HOUR) { b.skipped += 1; return true; }
    b.sent += 1;
    try { await senders[canal](text); return true; } catch (err) { failed(canal, err); return false; }
  }
  // Envoi : Signal d'abord, l'e-mail s'il n'y a pas Signal ou s'il a échoué.
  async function send(text) {
    const ok = await viaChannel('signal', text);
    if (!ok) return viaChannel('email', text);
    return ok;
  }

  // Alerte ouverte ou aggravée → message, selon la gravité, le mode et l'interrupteur.
  async function onAlert(detail, t = now()) {
    if (!['ouverte', 'aggravee'].includes(detail.action)) return false;
    const a = store.db.prepare('SELECT * FROM alerts WHERE id = ?').get(detail.id);
    if (!a || !['alerter', 'bloquer'].includes(a.mode)) return false;
    // La surveillance réduite part toujours (y compris quand c'est l'interrupteur des alertes qu'on vient d'arrêter),
    // quelle que soit sa gravité ; les autres alertes : hautes et critiques, interrupteur en marche.
    const reduced = a.regle === 'sigma.surveillance_reduite';
    if (!reduced && (!switches.isOn('alertes') || !['haut', 'critique'].includes(detail.gravite))) return false;
    const rule = engine.rules().find(r => r.id === a.regle);
    let sources = [];
    try { sources = JSON.parse(a.sources); } catch { /* illisible */ }
    const decisions = store.db.prepare('SELECT kind, cree_a, fin FROM decisions WHERE motif = ? AND auto = 1 ORDER BY id').all(`alerte #${a.id}`);
    return send(messageOf({ id: a.id, gravite: detail.gravite, titre: rule?.titre || a.regle, sources, t, console: consoleUrl, action: detail.action, reponse: reduced ? null : responseOf(decisions) }));
  }

  // Abonnement : les alertes écrites dans la chaîne (vigie_alerte), traitées hors de l'écriture.
  const queue = [];
  let busy = false;
  const drainQueue = async () => {
    if (busy) return;
    busy = true;
    try { while (queue.length) { const d = queue.shift(); await onAlert(d).catch(err => log?.error({ err: err.message }, 'Vigie : notification')); } } finally { busy = false; }
  };
  store.onAdded(rows => {
    for (const r of rows) {
      if (r.type !== 'vigie_alerte') continue;
      try { queue.push(JSON.parse(r.detail)); } catch { /* illisible */ }
    }
    if (queue.length) setImmediate(drainQueue);
  });

  // Chaque minute : synthèse d'une heure finie dont des messages n'ont pas été envoyés (même sans nouvelle alerte).
  async function tick() {
    const hour = Math.floor(now() / 3600e3);
    for (const [canal, b] of budget) if (b.hour !== hour && b.skipped) await viaChannel(canal, '');
  }

  return {
    channels,
    tick,
    send,
    onAlert,
    idle: async () => { while (queue.length || busy) await new Promise(r => setImmediate(r)); },
    // Essai d'un canal (ligne de commande, console) : un message sans alerte.
    test: canal => (senders[canal] && channels[canal] ? senders[canal](`Vigie : essai du canal ${canal} (${hourOf(now())}).`).then(() => true) : Promise.reject(new Error(`canal ${canal} non configuré`))),
  };
}
