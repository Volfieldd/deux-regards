// Circuit de publication (cadrage du 15 octobre 2026) : le photographe propose, le modérateur valide (tout de suite
// ou à une date) ou renvoie avec une remarque, et peut dépublier en disant pourquoi. La photo garde son statut
// « brouillon » tant qu'elle n'est pas publiée ; photos.review dit où elle en est :
//   NULL           rien en cours
//   'proposee'     proposée, attend le modérateur
//   'programmee'   validée, publiée automatiquement à photos.publish_at
//   'a_reprendre'  renvoyée avec une remarque (photo_notes), à corriger puis reproposer
// Les accords sont vérifiés à la proposition, par le photographe (lui voit les personnes) : une photo bloquée ne peut
// pas être proposée, une photo à vérifier exige sa confirmation. Ils sont revérifiés au moment de publier.
// Prévenir : « Aujourd'hui » toujours ; par e-mail pour qui l'a choisi (compte : notify_email).
import { translator } from './admin-i18n.js';

export const STATES = ['proposee', 'programmee', 'a_reprendre'];

export class ReviewError extends Error {}

export function createReview({ db, readiness, notes, accounts, mailer, siteName = () => '', publicUrl = '', publish, log, now = Date.now, onWrite = () => {} }) {
  const photo = id => db.prepare('SELECT id, title, status, author_id, review, publish_at FROM photos WHERE id = ?').get(id);
  const setReview = db.prepare('UPDATE photos SET review = ?, publish_at = ? WHERE id = ?');
  const history = db.prepare('INSERT INTO photo_reviews (photo_id, action, by_sub, by_name, at, message, publish_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const log_ = (id, action, by = {}, message = '', at = null) => history.run(id, action, by.sub || null, by.name || '', now(), String(message || '').slice(0, 1000), at);
  const fmt = (ms, t) => new Intl.DateTimeFormat(t.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(ms);
  // Langue des e-mails : celle de l'admin du photographe lié au compte destinataire (comme les relances), sinon le français.
  const langOf = authorId => (authorId ? db.prepare('SELECT admin_lang FROM authors WHERE id = ?').pluck().get(authorId) : null) || 'fr';

  // E-mails (best effort) : au photographe de la photo, ou aux comptes qui valident ; compose(t) → { subject, lines }
  // dans la langue de chaque destinataire.
  async function mail(to, compose) {
    if (!mailer?.enabled || !to.length) return;
    const seen = new Set();
    for (const { addr, lang } of to) {
      if (seen.has(addr)) continue;
      seen.add(addr);
      const t = translator(lang);
      const { subject, lines } = compose(t);
      const text = [...lines, '', publicUrl ? `${publicUrl}/admin` : ''].join('\n');
      await mailer.send({ to: addr, subject: `${siteName()} · ${subject}`, text }).catch(err => log?.warn({ err: err.message }, 'circuit : e-mail non envoyé'));
    }
  }
  const photographerMail = authorId => accounts.list().filter(a => a.author_id === authorId && a.status === 'actif' && a.notify_email && (a.notify_to || a.email)).map(a => ({ addr: a.notify_to || a.email, lang: langOf(authorId) }));
  const moderatorMail = () => accounts.list().filter(a => a.status === 'actif' && a.notify_email && (a.notify_to || a.email) && (a.roles.includes('moderateur') || a.roles.includes('admin'))).map(a => ({ addr: a.notify_to || a.email, lang: langOf(a.author_id) }));

  return {
    STATES,
    // Proposer (le photographe) : ids déjà filtrés sur ses photos. confirm : il confirme les accords « à vérifier ».
    // Renvoie { proposed, verify, blocked } (les photos refusées et pourquoi).
    async propose(ids, by, { message = '', confirm = false } = {}) {
      // Déjà proposées ou programmées : laissées telles quelles (une date choisie par le modérateur n'est jamais perdue).
      const skipped = ids.filter(id => ['proposee', 'programmee'].includes(photo(id)?.review));
      const g = readiness.gate(ids.filter(id => photo(id)?.status === 'draft' && !skipped.includes(id)));
      const verify = [];
      const ok = [...g.ok];
      for (const v of g.verify) {
        if (confirm) { readiness.confirm(v.id, 'site', by.name, v.reasons); ok.push(v.id); } else verify.push(v);
      }
      db.transaction(() => { for (const id of ok) { setReview.run('proposee', null, id); log_(id, 'proposee', by, message); } })();
      // BV-20/21 : le lot peut avoir retouché des textes publics, même sans photo à proposer ni e-mail configuré.
      onWrite();
      if (ok.length) {
        const title = photo(ok[0]).title;
        await mail(moderatorMail(), t => ({ subject: ok.length > 1 ? t('{n} photos proposées à la publication', { n: ok.length }) : t('Une photo proposée à la publication'),
          lines: [ok.length > 1 ? t('{name} propose {n} photos à la publication.', { name: by.name || t('Un photographe'), n: ok.length }) : t('{name} propose « {title} » à la publication.', { name: by.name || t('Un photographe'), title }),
            message ? t('Son mot : {message}', { message }) : ''] }));
      }
      return { proposed: ok, verify, blocked: g.blocked, skipped };
    },
    withdraw(id, by) {
      const p = photo(id);
      if (!p || !['proposee', 'programmee'].includes(p.review)) return false;
      setReview.run(null, null, id); log_(id, 'retiree', by);
      return true;
    },
    // Valider (le modérateur) : publier tout de suite, ou programmer à une date (ms, dans le futur).
    async approve(ids, by, { at = null } = {}) {
      if (at != null && !(at > now())) throw new ReviewError('Choisissez une date à venir.');
      const g = readiness.gate(ids.filter(id => photo(id)?.status === 'draft'));
      if (at != null) {
        db.transaction(() => { for (const id of g.ok) { setReview.run('programmee', at, id); log_(id, 'programmee', by, '', at); } })();
      } else if (g.ok.length) {
        db.transaction(() => { for (const id of g.ok) { setReview.run(null, null, id); log_(id, 'publiee', by); } })();
        publish(g.ok);
      }
      onWrite();
      for (const authorId of new Set(g.ok.map(id => photo(id).author_id))) {
        const mine = g.ok.filter(id => photo(id).author_id === authorId);
        const title = photo(mine[0]).title;
        await mail(photographerMail(authorId), t => {
          const p = { n: mine.length, title, name: by.name || t('le modérateur'), date: at != null ? fmt(at, t) : '' };
          return { subject: at != null ? t('Photos programmées') : t('Photos publiées'),
            lines: [at != null ? (mine.length > 1 ? t('{n} de vos photos seront publiées le {date} (validé par {name}).', p) : t('« {title} » sera publiée le {date} (validé par {name}).', p))
              : mine.length > 1 ? t('{n} de vos photos sont publiées (validé par {name}).', p) : t('« {title} » est publiée (validé par {name}).', p)] };
        });
      }
      return { done: g.ok, verify: g.verify, blocked: g.blocked };
    },
    // Renvoyer avec une remarque : elle arrive dans l'« Aujourd'hui » du photographe (et par e-mail s'il l'a choisi).
    async sendBack(id, by, message) {
      const p = photo(id);
      if (!p || !['proposee', 'programmee'].includes(p.review)) throw new ReviewError('Seule une photo proposée ou programmée se renvoie.');
      if (!String(message || '').trim()) throw new ReviewError('Écrivez la remarque.');
      notes.add(id, message, by);
      setReview.run('a_reprendre', null, id); log_(id, 'renvoyee', by, message);
      onWrite();
      await mail(photographerMail(p.author_id), t => ({ subject: t('Photo à reprendre'), lines: [t('« {title} » vous est renvoyée par {name} :', { title: p.title, name: by.name || t('le modérateur') }), String(message).trim()] }));
      return true;
    },
    // Dépublier en disant pourquoi (remarque au photographe).
    async unpublish(id, by, reason) {
      const p = photo(id);
      if (!p || p.status !== 'published') return false;
      if (!String(reason || '').trim()) throw new ReviewError('Dites pourquoi la photo est dépubliée.');
      notes.add(id, `Dépubliée : ${String(reason).trim()}`, by);
      setReview.run(null, null, id); log_(id, 'depubliee', by, reason);
      publish([], [id]);
      onWrite();
      await mail(photographerMail(p.author_id), t => ({ subject: t('Photo dépubliée'), lines: [t('« {title} » a été dépubliée par {name} :', { title: p.title, name: by.name || t('le modérateur') }), String(reason).trim()] }));
      return true;
    },
    // Annuler une programmation : la photo attend de nouveau le modérateur si elle avait été proposée, sinon elle
    // redevient un simple brouillon.
    unschedule(id, by) {
      const p = photo(id);
      if (!p || p.review !== 'programmee') return false;
      const proposed = db.prepare("SELECT 1 FROM photo_reviews WHERE photo_id = ? AND action = 'proposee' LIMIT 1").get(id);
      setReview.run(proposed ? 'proposee' : null, null, id); log_(id, 'deprogrammee', by);
      return true;
    },
    // Une photo proposée ou programmée modifiée par son photographe : une programmation est annulée (le modérateur
    // doit revoir ce qui partira en ligne) ; une proposition reste en attente avec le nouveau contenu.
    edited(ids, by) {
      for (const id of ids) {
        const p = photo(id);
        if (p?.review !== 'programmee') continue;
        setReview.run('proposee', null, id); log_(id, 'modifiee', by, 'Modifiée après validation : à revoir.');
      }
    },
    // Publications programmées arrivées à échéance : publiées si elles sont toujours prêtes, sinon renvoyées.
    async runDue() {
      const due = db.prepare("SELECT id FROM photos WHERE review = 'programmee' AND publish_at <= ? AND status = 'draft'").pluck().all(now());
      if (!due.length) return 0;
      const g = readiness.gate(due);
      const sys = { sub: null, name: 'publication programmée' };
      db.transaction(() => { for (const id of g.ok) { setReview.run(null, null, id); log_(id, 'publiee', sys); } })();
      if (g.ok.length) publish(g.ok);
      for (const b of [...g.verify, ...g.blocked]) {
        notes.add(b.id, `Publication programmée annulée : ${b.reasons.join(' ; ')}. Vérifiez les accords puis reproposez la photo.`, sys);
        setReview.run('a_reprendre', null, b.id); log_(b.id, 'renvoyee', sys, b.reasons.join(' ; '));
      }
      onWrite({ scheduled: true });
      for (const authorId of new Set(g.ok.map(id => photo(id).author_id))) {
        const mine = g.ok.filter(id => photo(id).author_id === authorId);
        const title = photo(mine[0]).title;
        await mail(photographerMail(authorId), t => ({ subject: t('Photos publiées'), lines: [mine.length > 1 ? t('{n} de vos photos programmées sont publiées.', { n: mine.length }) : t('« {title} », programmée, est publiée.', { title })] }));
      }
      return g.ok.length;
    },
    // Ce qui attend le modérateur (la plus ancienne proposition d'abord), avec le mot du photographe.
    pending: () => db.prepare(`SELECT p.id, p.author_id, (SELECT r.at FROM photo_reviews r WHERE r.photo_id = p.id AND r.action = 'proposee' ORDER BY r.at DESC LIMIT 1) AS at,
      (SELECT r.message FROM photo_reviews r WHERE r.photo_id = p.id AND r.action = 'proposee' ORDER BY r.at DESC LIMIT 1) AS message
      FROM photos p WHERE p.review = 'proposee' AND p.status = 'draft' ORDER BY at, p.id`).all(),
    scheduled: () => db.prepare("SELECT id, author_id, publish_at FROM photos WHERE review = 'programmee' AND status = 'draft' ORDER BY publish_at, id").all(),
    history: id => db.prepare('SELECT * FROM photo_reviews WHERE photo_id = ? ORDER BY at DESC, id DESC').all(id),
    countFor: (state, authorId = null) => db.prepare("SELECT COUNT(*) FROM photos WHERE review = @s AND status = 'draft' AND (@a IS NULL OR author_id = @a)").pluck().get({ s: state, a: authorId }),
    // Une photo publiée directement (administrateur, ou photographe autorisé) sort du circuit.
    clear: id => setReview.run(null, null, id),
  };
}
