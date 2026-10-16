import nodemailer from 'nodemailer';

// Envoi d'e-mails (facultatif) par la boîte d'une adresse que vous possédez : SMTP_URL, par exemple
// smtps://adresse%40gmail.com:motdepasse-application@smtp.gmail.com:465, et MAIL_FROM (« Nicephos <adresse@gmail.com> »).
// Sans SMTP_URL, rien n'est envoyé par le serveur : l'admin propose d'écrire depuis sa messagerie (mailto).

export class MailError extends Error {}

// Délais courts : à l'enregistrement d'une rencontre, le photographe attend dans la rue. Chiffrement exigé : smtps://
// (TLS dès la connexion), ou smtp:// avec STARTTLS obligatoire (un intermédiaire ne peut pas le retirer pour lire le
// mot de passe et les messages), sauf vers un relais sur cette machine. Un relais sans TLS sur le réseau local
// s'écrit explicitement : smtp://relais:25?requireTLS=false.
const LOCAL = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
export const transportOptions = url => {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* adresse illisible : nodemailer le dira */ }
  return { url, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, requireTLS: !/^smtps:/i.test(url) && !LOCAL.has(host), tls: { minVersion: 'TLSv1.2' } };
};
// Réponse du serveur de messagerie pour les journaux : sans les adresses qu'elle répète souvent (« 550 <alice@…> »).
export const maskAddresses = v => (v == null ? v : String(v).replace(/[^\s<>()"',;:]+@[^\s<>()"',;:]+/g, '…@…'));

export function createMailer({ url, from, log, transport = null } = {}) {
  // Options passées dans l'objet (le second argument de createTransport ne vaut que pour les messages).
  const t = transport || (url ? nodemailer.createTransport(transportOptions(url)) : null);
  return {
    enabled: Boolean(t),
    from: from || '',
    // cc : copie (relances RGPD à l'administrateur) ; priority : 'high' pour la dernière relance.
    async send({ to, subject, text, replyTo, cc, priority }) {
      if (!t) throw new MailError('Envoi d’e-mails non configuré (SMTP_URL).');
      try {
        await t.sendMail({ from, to, subject, text, ...(replyTo ? { replyTo } : {}), ...(cc?.length ? { cc } : {}), ...(priority ? { priority } : {}) });
      } catch (err) {
        // Jamais le mot de passe dans un message : seulement le code et la réponse du serveur de messagerie, sans les
        // adresses e-mail qu'elle contient.
        log?.warn({ code: err.code, responseCode: err.responseCode, response: maskAddresses(err.response) }, 'e-mail non envoyé');
        throw new MailError(`E-mail non envoyé : ${err.code === 'EAUTH' ? 'identifiants refusés par le serveur de messagerie' : err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT' ? 'serveur de messagerie injoignable' : 'le serveur de messagerie a refusé le message'}.`);
      }
    },
  };
}
