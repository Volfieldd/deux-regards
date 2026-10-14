import nodemailer from 'nodemailer';

// Envoi d'e-mails (facultatif) par la boîte d'une adresse que vous possédez : SMTP_URL, par exemple
// smtps://adresse%40gmail.com:motdepasse-application@smtp.gmail.com:465, et MAIL_FROM (« Nicephos <adresse@gmail.com> »).
// Sans SMTP_URL, rien n'est envoyé par le serveur : l'admin propose d'écrire depuis sa messagerie (mailto).

export class MailError extends Error {}

// Délais courts : à l'enregistrement d'une rencontre, le photographe attend dans la rue.
export function createMailer({ url, from, log, transport = null } = {}) {
  const t = transport || (url ? nodemailer.createTransport(url, { connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 }) : null);
  return {
    enabled: Boolean(t),
    async send({ to, subject, text, replyTo }) {
      if (!t) throw new MailError('Envoi d’e-mails non configuré (SMTP_URL).');
      try {
        await t.sendMail({ from, to, subject, text, ...(replyTo ? { replyTo } : {}) });
      } catch (err) {
        // Jamais le mot de passe dans un message : seulement le code et la réponse du serveur de messagerie.
        log?.warn({ code: err.code, response: err.response }, 'e-mail non envoyé');
        throw new MailError(`E-mail non envoyé : ${err.code === 'EAUTH' ? 'identifiants refusés par le serveur de messagerie' : err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT' ? 'serveur de messagerie injoignable' : 'le serveur de messagerie a refusé le message'}.`);
      }
    },
  };
}
