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
export const STATES = ['proposee', 'programmee', 'a_reprendre'];

export class ReviewError extends Error {}

export function createReview({ db, readiness, notes, accounts, mailer, siteName = () => '', publicUrl = '', publish, log, now = Date.now }) {
  const photo = id => db.prepare('SELECT id, title, status, author_id, review, publish_at FROM photos WHERE id = ?').get(id);
  const setReview = db.prepare('UPDATE photos SET review = ?, publish_at = ? WHERE id = ?');
  const history = db.prepare('INSERT INTO photo_reviews (photo_id, action, by_sub, by_name, at, message, publish_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const log_ = (id, action, by = {}, message = '', at = null) => history.run(id, action, by.sub || null, by.name || '', now(), String(message || '').slice(0, 1000), at);
  const fmt = ms => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(ms);

  // E-mails (best effort) : au photographe de la photo, ou aux comptes qui valident.
  async function mail(to, subject, lines) {
    if (!mailer?.enabled || !to.length) return;
    const text = [...lines, '', publicUrl ? `${publicUrl}/admin` : ''].join('\n');
    for (const addr of new Set(to)) await mailer.send({ to: addr, subject: `${siteName()} · ${subject}`, text }).catch(err => log?.warn({ err: err.message }, 'circuit : e-mail non envoyé'));
  }
  const photographerMail = authorId => accounts.list().filter(a => a.author_id === authorId && a.status === 'actif' && a.notify_email && (a.notify_to || a.email)).map(a => a.notify_to || a.email);
  const moderatorMail = () => accounts.list().filter(a => a.status === 'actif' && a.notify_email && (a.notify_to || a.email) && (a.roles.includes('moderateur') || a.roles.includes('admin'))).map(a => a.notify_to || a.email);

  return {
    STATES,
    // Proposer (le photographe) : ids déjà filtrés sur ses photos. confirm : il confirme les accords « à vérifier ».
    // Renvoie { proposed, verify, blocked } (les photos refusées et pourquoi).
    async propose(ids, by, { message = '', confirm = false } = {}) {
      const g = readiness.gate(ids.filter(id => photo(id)?.status === 'draft'));
      const verify = [];
      const ok = [...g.ok];
      for (const v of g.verify) {
        if (confirm) { readiness.confirm(v.id, 'site', by.name, v.reasons); ok.push(v.id); } else verify.push(v);
      }
      db.transaction(() => { for (const id of ok) { setReview.run('proposee', null, id); log_(id, 'proposee', by, message); } })();
      if (ok.length) {
        await mail(moderatorMail(), ok.length > 1 ? `${ok.length} photos proposées à la publication` : 'Une photo proposée à la publication',
          [`${by.name || 'Un photographe'} propose ${ok.length > 1 ? `${ok.length} photos` : `« ${photo(ok[0]).title} »`} à la publication.`, message ? `Son mot : ${message}` : '']);
      }
      return { proposed: ok, verify, blocked: g.blocked };
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
      for (const authorId of new Set(g.ok.map(id => photo(id).author_id))) {
        const mine = g.ok.filter(id => photo(id).author_id === authorId);
        await mail(photographerMail(authorId), at != null ? 'Photos programmées' : 'Photos publiées',
          [`${mine.length > 1 ? `${mine.length} de vos photos` : `« ${photo(mine[0]).title} »`} ${at != null ? `${mine.length > 1 ? 'seront publiées' : 'sera publiée'} le ${fmt(at)}` : mine.length > 1 ? 'sont publiées' : 'est publiée'} (validé par ${by.name || 'le modérateur'}).`]);
      }
      return { done: g.ok, verify: g.verify, blocked: g.blocked };
    },
    // Renvoyer avec une remarque : elle arrive dans l'« Aujourd'hui » du photographe (et par e-mail s'il l'a choisi).
    async sendBack(id, by, message) {
      const p = photo(id);
      if (!p) return false;
      if (!String(message || '').trim()) throw new ReviewError('Écrivez la remarque.');
      notes.add(id, message, by);
      setReview.run('a_reprendre', null, id); log_(id, 'renvoyee', by, message);
      await mail(photographerMail(p.author_id), 'Photo à reprendre', [`« ${p.title} » vous est renvoyée par ${by.name || 'le modérateur'} :`, String(message).trim()]);
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
      await mail(photographerMail(p.author_id), 'Photo dépubliée', [`« ${p.title} » a été dépubliée par ${by.name || 'le modérateur'} :`, String(reason).trim()]);
      return true;
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
      for (const authorId of new Set(g.ok.map(id => photo(id).author_id))) {
        const mine = g.ok.filter(id => photo(id).author_id === authorId);
        await mail(photographerMail(authorId), 'Photos publiées', [`${mine.length > 1 ? `${mine.length} de vos photos programmées sont publiées` : `« ${photo(mine[0]).title} », programmée, est publiée`}.`]);
      }
      return g.ok.length;
    },
    // Ce qui attend le modérateur (la plus ancienne proposition d'abord), avec le mot du photographe.
    pending: () => db.prepare(`SELECT p.id, p.author_id, (SELECT r.at FROM photo_reviews r WHERE r.photo_id = p.id AND r.action = 'proposee' ORDER BY r.at DESC LIMIT 1) AS at,
      (SELECT r.message FROM photo_reviews r WHERE r.photo_id = p.id AND r.action = 'proposee' ORDER BY r.at DESC LIMIT 1) AS message
      FROM photos p WHERE p.review = 'proposee' ORDER BY at, p.id`).all(),
    scheduled: () => db.prepare("SELECT id, author_id, publish_at FROM photos WHERE review = 'programmee' ORDER BY publish_at, id").all(),
    history: id => db.prepare('SELECT * FROM photo_reviews WHERE photo_id = ? ORDER BY at DESC, id DESC').all(id),
    countFor: (state, authorId = null) => db.prepare('SELECT COUNT(*) FROM photos WHERE review = @s AND (@a IS NULL OR author_id = @a)').pluck().get({ s: state, a: authorId }),
    // Une photo publiée directement (administrateur, ou photographe autorisé) sort du circuit.
    clear: id => setReview.run(null, null, id),
  };
}
