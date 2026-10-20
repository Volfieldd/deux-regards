import { translator } from './admin-i18n.js';
import { grantsOf, SCOPES } from './permissions.js';

// Relances par e-mail (cadrage du 15 octobre 2026).
// - Demandes RGPD (accès, effacement) : délai légal d'un mois, coupé en quarts. À l'arrivée, e-mail au photographe
//   concerné ; au quart, rappel ; à la moitié, rappel avec l'administrateur en copie ; aux trois quarts, e-mail
//   prioritaire avec l'administrateur en copie. Une obligation légale : envoyé même à qui n'a pas choisi les e-mails
//   (à l'adresse du compte), et à l'administrateur quand aucun photographe n'est joignable. Jamais le nom ni
//   l'adresse de la personne dans l'e-mail : sa référence seulement, le détail est dans l'admin.
// - Récapitulatif de ce qui attend chaque compte (« Aujourd'hui ») : réglé par chacun, jamais, chaque jour ou chaque
//   semaine (le lundi), vers 8 h (heure de Paris), jamais plus d'un par jour, et seulement s'il y a quelque chose.
// - Messages des visiteurs (Contact, demande de licence ; server/messages.js) : à l'arrivée, un e-mail « Un nouveau
//   message vous attend » aux comptes du photographe concerné (aux deux pour un message adressé aux deux ; à
//   l'administrateur quand aucun ne peut le lire), avec le lien vers l'admin et rien d'autre : ni nom, ni adresse, ni
//   message, ni photo (registre de la Vigie, BV-29 et BV-30). 30 par jour au plus (compte gardé dans la base) : au-delà, les messages
//   attendent dans l'admin (« Aujourd'hui »), et la Vigie est prévenue une fois (boîtes bombardées).
// - Tester l'envoi (Comptes et rôles) : un e-mail à l'adresse choisie, l'erreur du serveur de messagerie sinon.
export const DIGESTS = ['off', 'daily', 'weekly'];
const DIGEST_HOUR = 8;
// Demandes de droits sur une rencontre non vérifiée (sans carte, ou référence tapée sans le code) : 30 e-mails par
// jour au plus, tous comptes confondus. Au-delà (afflux de fausses demandes), elles attendent le lendemain : elles
// restent signalées dans « Aujourd'hui » et sur leur fiche, et le quota de la messagerie reste aux personnes.
const UNVERIFIED_PER_DAY = 30;
const MESSAGES_PER_DAY = 30;

// Échéance légale d'une demande (RGPD, art. 12-3 : « un mois », compté de date à date, heure de Paris) : le même
// quantième le mois suivant, à la même heure, ou le dernier jour de ce mois s'il est plus court (31 janvier → 28 ou
// 29 février).
const PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
const wallOf = ms => { const p = Object.fromEntries(PARTS.formatToParts(ms).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)])); return p; };
export function rightsDue(at) {
  const p = wallOf(at);
  const days = new Date(Date.UTC(p.year, p.month + 1, 0)).getUTCDate();                 // jours du mois suivant
  const wall = Date.UTC(p.year, p.month, Math.min(p.day, days), p.hour, p.minute, p.second);   // mois suivant (index 0)
  // Heure de Paris → instant : on retire le décalage de Paris (deux passes, juste autour d'un changement d'heure).
  const offset = ms => { const w = wallOf(ms); return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000; };
  const first = wall - offset(wall);
  return wall - offset(first);
}

export function createReminders({ db, accounts, todo, mailer, messages = null, onMessagesCap = () => {}, siteName = () => '', publicUrl = '', log, now = Date.now }) {
  const langOf = authorId => (authorId ? db.prepare('SELECT admin_lang FROM authors WHERE id = ?').pluck().get(authorId) : null) || 'fr';
  const addr = a => a.notify_to || a.email || '';
  const active = () => accounts.list().filter(a => a.status === 'actif' && addr(a));
  const admins = () => active().filter(a => a.roles.includes('admin'));
  const link = path => (publicUrl ? `${publicUrl}${path}` : '');
  const paris = (ms, opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...opts }).format(ms);
  const day = (ms, t) => new Intl.DateTimeFormat(t.locale, { timeZone: 'Europe/Paris', dateStyle: 'long' }).format(ms);

  async function send(msg) {
    if (!mailer?.enabled || !msg.to.length) return false;
    try {
      await mailer.send({ ...msg, to: msg.to.join(', '), subject: `${siteName()} · ${msg.subject}` });
      return true;
    } catch (err) {
      log?.warn({ err: err.message }, 'relance : e-mail non envoyé');
      return false;
    }
  }

  // Étape due pour une demande arrivée à `at` : 1 (arrivée) à 4 (trois quarts du délai).
  const stageOf = at => 1 + Math.min(3, Math.floor(Math.max(0, now() - at) / ((rightsDue(at) - at) / 4)));
  // E-mails envoyés aujourd'hui (heure de Paris) pour des demandes non vérifiées.
  const unverifiedSent = { day: '', n: 0 };

  async function rights() {
    const pending = db.prepare(`SELECT id, ref, author_id, verified, rights_request, rights_requested_at, rights_reminders FROM encounters
      WHERE rights_request IS NOT NULL AND rights_done_at IS NULL AND rights_requested_at IS NOT NULL`).all();
    let sent = 0;
    const today = paris(now(), { dateStyle: 'short' });
    if (unverifiedSent.day !== today) Object.assign(unverifiedSent, { day: today, n: 0 });
    for (const e of pending) {
      const stage = stageOf(e.rights_requested_at);
      if (stage <= e.rights_reminders) continue;
      if (!e.verified && unverifiedSent.n >= UNVERIFIED_PER_DAY) continue;
      const accounts = e.author_id ? active().filter(a => a.author_id === e.author_id) : [];
      const photographers = accounts.map(addr);
      const adm = admins().map(addr);
      // Personne côté photographe : l'administrateur la reçoit directement.
      const to = photographers.length ? photographers : adm;
      const cc = photographers.length && stage >= 3 ? adm.filter(x => !to.includes(x)) : [];
      // Aucun compte du photographe ne peut traiter la demande (exporter, effacer, marquer traitée : le rôle
      // Photographe ne le peut pas) : l'e-mail lui demande de prévenir l'administrateur tout de suite.
      const canHandle = !photographers.length || accounts.some(a => { const sc = scopeOf(a)('personnes.effacer'); return Boolean(sc && (sc.all || sc.authorId === e.author_id)); });
      const t = translator(langOf(e.author_id));
      const due = rightsDue(e.rights_requested_at);
      const ref = e.ref || t('sans carte');
      const subject = [
        t('Demande RGPD reçue ({ref}) : à traiter avant le {date}', { ref, date: day(due, t) }),
        t('Rappel : demande RGPD ({ref}) à traiter avant le {date}', { ref, date: day(due, t) }),
        t('Second rappel : demande RGPD ({ref}) à traiter avant le {date}', { ref, date: day(due, t) }),
        t('URGENT : demande RGPD ({ref}) à traiter avant le {date}', { ref, date: day(due, t) }),
      ][stage - 1];
      const text = [
        e.rights_request === 'effacement' ? t('Une personne photographiée ({ref}) a demandé l’effacement de ses données le {date}.', { ref, date: day(e.rights_requested_at, t) })
          : t('Une personne photographiée ({ref}) a demandé l’accès à ses données le {date}.', { ref, date: day(e.rights_requested_at, t) }),
        t('La loi (RGPD) laisse un mois pour y répondre : au plus tard le {date}.', { date: day(due, t) }),
        stage >= 3 && cc.length ? t('L’administrateur est en copie.') : null,
        stage === 4 ? t('Il reste environ une semaine.') : null,
        '',
        canHandle ? t('Vérifiez l’identité de la personne, puis traitez la demande depuis sa fiche :')
          : t('Votre compte ne peut ni exporter ni effacer ces données : prévenez dès maintenant l’administrateur, qui traitera la demande depuis sa fiche :'),
        link(`/admin/rencontres/${e.id}#droits`),
      ].filter(l => l !== null).join('\n');
      const ok = await send({ to, cc, subject, text, priority: stage === 4 ? 'high' : undefined });
      // Envoyé (ou impossible faute d'adresse) : l'étape est notée, pour ne pas renvoyer à chaque passage.
      if (ok || !to.length) db.prepare('UPDATE encounters SET rights_reminders = ? WHERE id = ?').run(stage, e.id);
      if (ok) sent++;
      if (ok && !e.verified) unverifiedSent.n++;
    }
    return sent;
  }

  // Un seul passage des demandes RGPD à la fois (passage horaire, demandes arrivées ensemble sur /bonjour) : l'étape
  // n'est notée qu'après l'envoi, deux passages simultanés enverraient les mêmes e-mails. Un appel pendant un passage
  // en relance un seul autre, à sa fin.
  let rightsRun = null, rightsAgain = false;
  function rightsOnce() {
    if (rightsRun) { rightsAgain = true; return rightsRun; }
    rightsRun = (async () => { let n = 0; do { rightsAgain = false; n += await rights(); } while (rightsAgain); return n; })()
      .finally(() => { rightsRun = null; });
    return rightsRun;
  }

  // Portée d'un compte hors requête (comme request.scope).
  const scopeOf = a => {
    const g = grantsOf(a.roles, a.adjust);
    return perm => (!g.has(perm) ? null : g.get(perm) === SCOPES.ALL ? { all: true } : { all: false, authorId: a.author_id ?? -1 });
  };
  const LEVELS = { urgent: '[!]', bientot: '[•]', 'plus-tard': '[ ]' };

  // Messages des visiteurs : un e-mail par compte et par passage, quel que soit le nombre de messages arrivés. Le compte du
  // jour (heure de Paris) est gardé dans la base (réglage messages_annonces) : un redémarrage ne le remet pas à zéro.
  const COUNTER = 'messages_annonces';
  const readCounter = () => { try { return JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(COUNTER) || 'null') || {}; } catch { return {}; } };
  const saveCounter = c => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(COUNTER, JSON.stringify(c));
  async function notifyMessages() {
    if (!messages || !mailer?.enabled) return 0;
    const fresh = messages.toNotify();
    if (!fresh.length) return 0;
    const today = paris(now(), { dateStyle: 'short' });
    const stored = readCounter();
    const messagesSent = stored.day === today ? { day: today, n: Number(stored.n) || 0, capped: Boolean(stored.capped) } : { day: today, n: 0, capped: false };
    const readers = active().map(a => ({ a, sc: scopeOf(a)('messages.traiter') })).filter(x => x.sc);
    // Destinataires d'un message : les comptes de son photographe (de tous les photographes, s'il est adressé aux deux) ;
    // sinon (photographe supprimé depuis, aucun compte lié), qui voit tous les messages.
    const recipientsOf = m => {
      const mine = x => x.a.author_id != null && x.a.author_id > 0 && (m.to_all === 1 || (m.author_id != null && x.a.author_id === m.author_id));
      const own = readers.filter(x => !x.sc.all && mine(x));
      const linked = readers.filter(x => x.sc.all && mine(x));
      const list = [...own, ...linked];
      return list.length ? list : readers.filter(x => x.sc.all);
    };
    const byAccount = new Map();
    for (const m of fresh) for (const x of recipientsOf(m)) { const e = byAccount.get(x.a.id) || { a: x.a, n: 0 }; e.n++; byAccount.set(x.a.id, e); }
    // Plafond du jour : un passage entier ou rien (un compte ne reçoit jamais deux fois l'annonce des mêmes messages) ;
    // au-delà, les messages restent à annoncer (le lendemain), et la Vigie est prévenue une fois (BV-29).
    if (messagesSent.n + byAccount.size > MESSAGES_PER_DAY) {
      if (!messagesSent.capped) { messagesSent.capped = true; saveCounter(messagesSent); try { onMessagesCap({ envoyes: messagesSent.n, en_attente: fresh.length }); } catch { /* jamais d'erreur ici */ } }
      return 0;
    }
    let sent = 0;
    for (const { a, n } of byAccount.values()) {
      const t = translator(langOf(a.author_id));
      const ok = await send({ to: [addr(a)], subject: n > 1 ? t('{n} nouveaux messages vous attendent', { n }) : t('Un nouveau message vous attend'),
        text: [n > 1 ? t('{n} nouveaux messages vous attendent dans l’admin (page Contact ou demande de licence).', { n }) : t('Un nouveau message vous attend dans l’admin (page Contact ou demande de licence).'),
          t('Pour le lire, connectez-vous :'), link('/admin/messages')].join('\n') });
      messagesSent.n++;
      saveCounter(messagesSent);
      if (ok) sent++;
    }
    // Annoncés (ou tentés : une panne de la messagerie ne fait pas renvoyer l'annonce aux autres comptes) ; le message
    // reste signalé dans « Aujourd'hui ».
    for (const m of fresh) messages.notified(m.id);
    return sent;
  }
  let messagesRun = null, messagesAgain = false;
  function messagesOnce() {
    if (messagesRun) { messagesAgain = true; return messagesRun; }
    messagesRun = (async () => { let n = 0; do { messagesAgain = false; n += await notifyMessages(); } while (messagesAgain); return n; })()
      .finally(() => { messagesRun = null; });
    return messagesRun;
  }

  async function digests() {
    const t0 = now();
    const today = paris(t0, { dateStyle: 'short' });
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).formatToParts(t0).find(p => p.type === 'hour').value);
    if (hour < DIGEST_HOUR) return 0;
    const monday = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(t0) === 'Mon';
    let sent = 0;
    for (const a of active()) {
      if (a.digest === 'daily' ? false : a.digest === 'weekly' ? !monday : true) continue;
      if (a.digest_sent_at && paris(a.digest_sent_at, { dateStyle: 'short' }) === today) continue;
      db.prepare('UPDATE accounts SET digest_sent_at = ? WHERE id = ?').run(t0, a.id);
      const t = translator(langOf(a.author_id));
      // Sans le nom des personnes (chiffré dans la base) : la référence seulement, comme les relances.
      const items = todo.list(t, scopeOf(a), { mail: true });
      if (!items.length) continue;
      const text = [
        items.length > 1 ? t('{n} choses vous attendent :', { n: items.length }) : t('{n} chose vous attend :', { n: items.length }),
        '',
        ...items.map(i => `${LEVELS[i.level] || '-'} ${i.title}${i.detail ? ` — ${i.detail}` : ''}${i.href ? `\n    ${link(i.href)}` : ''}`),
        '',
        t('Récapitulatif {freq}, réglable dans l’admin (Aujourd’hui → Votre compte).', { freq: a.digest === 'weekly' ? t('hebdomadaire') : t('quotidien') }),
      ].join('\n');
      if (await send({ to: [addr(a)], subject: t('Ce qui vous attend ({n})', { n: items.length }), text })) sent++;
    }
    return sent;
  }

  return {
    stageOf,
    // Toutes les heures (et juste après une demande reçue).
    async run() {
      try { return { rights: await rightsOnce(), messages: await messagesOnce(), digests: await digests() }; } catch (err) { log?.error({ err }, 'relances'); return null; }
    },
    rights: rightsOnce,
    messages: messagesOnce,
    digests,
    // E-mail de test : lève l'erreur du serveur de messagerie (MailError) pour l'afficher.
    async test(to, t) {
      await mailer.send({ to, subject: `${siteName()} · ${t('E-mail de test')}`,
        text: [t('Cet e-mail confirme que le serveur sait envoyer des e-mails.'), t('Envoyé depuis l’admin, page « Comptes et rôles », le {date}.', { date: day(now(), t) })].join('\n') });
    },
  };
}
