// « Aujourd'hui » : ce qui demande votre attention, trié par urgence.
//   - urgent : obligation légale (demande d'accès ou d'effacement, un mois pour répondre) ou refus encore en ligne ;
//   - bientôt : à regarder (refus dans une sortie, nouvelles personnes, Instagram en échec ou en pause) ;
//   - plus tard : à finir quand vous avez le temps (photos à finir, sans ville, traductions, preuves).
// Chaque ligne mène à l'écran qui la règle. Requêtes simples : la liste est recalculée à chaque page de l'admin
// (le badge du menu compte les urgences).
import { isProvisional } from './admin-repo.js';
import { samePartSql } from './outings.js';
import { legalMissing } from './legal.js';
import { translator } from './admin-i18n.js';

export const LEVELS = ['urgent', 'bientot', 'plus-tard'];
const MONTH = 30 * 864e5;

const FR = translator('fr');
const dayOf = t => ms => new Intl.DateTimeFormat(t.locale || 'fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(ms);

export function createTodo({ db, encounters, instagram, proofs, readiness, feedback, seriesSuggest, accounts, notes, review, now = () => Date.now() }) {
  const q = {
    rights: db.prepare(`SELECT id FROM encounters WHERE rights_request IS NOT NULL AND rights_done_at IS NULL ORDER BY rights_requested_at`).pluck(),
    // Refus dont des photos liées sont encore publiées.
    refusedOnline: db.prepare(`SELECT e.id, COUNT(*) AS n FROM encounters e JOIN encounter_photos ep ON ep.encounter_id = e.id
      JOIN photos p ON p.id = ep.photo_id WHERE e.refused = 1 AND p.status = 'published' GROUP BY e.id ORDER BY e.id`),
    // Refus dans une sortie : photos publiées du même photographe ce jour-là, ni liées ni exclues (la personne y
    // figure peut-être).
    refusedSession: db.prepare(`SELECT e.id, COUNT(*) AS n FROM encounters e JOIN photos p ON p.author_id = e.author_id
      AND p.taken_on = COALESCE(NULLIF(e.session_day, ''), NULLIF(e.met_on, ''))
      WHERE e.refused = 1 AND e.anonymized = 0 AND p.status = 'published'
      -- seulement les photos où quelqu'un peut figurer (visage, ou pas encore examinée) : un paysage ne concerne personne
      AND (p.faces_override = 1 OR (p.faces_override IS NULL AND (p.faces IS NULL OR p.faces <> 0)))
      AND NOT EXISTS (SELECT 1 FROM encounter_photos ep WHERE ep.encounter_id = e.id AND ep.photo_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM encounter_exclusions x WHERE x.encounter_id = e.id AND x.photo_id = p.id)
      AND ${samePartSql('p.author_id', 'p.taken_on', "COALESCE(p.taken_time, '')", 'e.met_time')}
      GROUP BY e.id ORDER BY e.id`),
    fresh: db.prepare("SELECT COUNT(*) FROM encounters WHERE status = 'nouvelle' AND (@author IS NULL OR author_id = @author)").pluck(),
    igFailed: db.prepare("SELECT COUNT(*) FROM instagram_posts WHERE status = 'failed' AND NOT EXISTS (SELECT 1 FROM instagram_posts b WHERE b.photo_id = instagram_posts.photo_id AND b.id > instagram_posts.id)").pluck(),
    // À finir : brouillons, ou titre provisoire (le nom du fichier), comme la photothèque.
    toFinish: db.prepare('SELECT status, title, source_name FROM photos WHERE (@author IS NULL OR author_id = @author)'),
    noCity: db.prepare("SELECT COUNT(*) FROM photos WHERE status = 'published' AND city_id IS NULL AND (@author IS NULL OR author_id = @author)").pluck(),
    untranslated: db.prepare("SELECT COUNT(*) FROM photos WHERE status = 'published' AND (title_en = '' OR title_de = '') AND (@author IS NULL OR author_id = @author)").pluck(),
  };
  // t : request.t (langue de l'admin) ; sans t, en français. scope : request.scope (droits du compte, portée « les
  // miennes ») ; sans scope, tout. Chaque ligne n'apparaît que si le compte a le droit d'agir dessus, et les comptes
  // de photos ou de personnes se limitent à son photographe quand sa portée est « les miennes ».
  const ALL = { all: true };
  const access = scope => {
    const sc = perm => (scope ? scope(perm) : ALL);
    return {
      can: (perm, authorId) => { const r = sc(perm); return Boolean(r && (r.all || authorId === r.authorId)); },
      // Filtre SQL : null (tout), le photographe, ou undefined (aucun droit : la ligne n'est pas calculée).
      author: perm => { const r = sc(perm); return !r ? undefined : r.all ? null : r.authorId; },
      all: perm => Boolean(sc(perm)?.all),
    };
  };
  const who = (e, t) => (e.anonymized ? t('refus anonymisé') : `${e.ref || t('sans carte')}${e.name ? ` · ${e.name}` : ''}`);

  function urgent(t = FR, scope = null) {
    const day = dayOf(t);
    const a = access(scope);
    const items = [];
    for (const id of q.rights.all()) {
      const e = encounters.get(id);
      if (!e || !a.can('personnes.demandes', e.author_id)) continue;
      const due = (e.rights_requested_at || 0) + MONTH;
      const late = due < now();
      const w = who(e, t);
      items.push({ level: 'urgent', title: e.rights_request === 'effacement' ? t('Demande d’effacement de {who}', { who: w }) : t('Demande d’accès de {who}', { who: w }),
        detail: late ? t('en retard : à traiter depuis le {date}', { date: day(due) }) : t('à traiter avant le {date}', { date: day(due) }), href: `/admin/rencontres/${id}#droits`, action: t('Traiter') });
    }
    for (const r of q.refusedOnline.all()) {
      const e = encounters.get(r.id);
      if (!e || !a.can('personnes.refus', e.author_id)) continue;
      const w = who(e, t);
      items.push({ level: 'urgent', title: r.n > 1 ? t('Refus de {who} : {n} photos encore publiées', { who: w, n: r.n }) : t('Refus de {who} : {n} photo encore publiée', { who: w, n: r.n }),
        detail: t('la personne refuse la publication des photos liées'), href: `/admin/rencontres/${r.id}#refus`, action: t('Appliquer le refus') });
    }
    return items;
  }

  function list(t = FR, scope = null) {
    const a = access(scope);
    const items = urgent(t, scope);
    for (const r of q.refusedSession.all()) {
      const e = encounters.get(r.id);
      if (!e || !a.can('personnes.refus', e.author_id)) continue;
      const w = who(e, t);
      items.push({ level: 'bientot', title: r.n > 1 ? t('{who} a refusé : {n} photos publiées de sa sortie à vérifier', { who: w, n: r.n }) : t('{who} a refusé : {n} photo publiée de sa sortie à vérifier', { who: w, n: r.n }),
        detail: t('{author} · {day} : liez au refus celles où la personne figure, excluez les autres', { author: e.author || t('photographe'), day: e.session_day || e.met_on }), href: `/admin/rencontres/${r.id}#session`, action: t('Vérifier') });
    }
    // Photos publiées avant les règles d'accord, ou dont une personne de la sortie n'a pas encore décidé.
    const cache = new Map();
    const va = a.author('photos.voir');
    const verify = readiness && va !== undefined ? db.prepare("SELECT id, status, faces, faces_override FROM photos WHERE status = 'published' AND (@author IS NULL OR author_id = @author)").all({ author: va }).filter(p => readiness.pending(p, 'site', cache)).length : 0;
    if (verify) items.push({ level: 'bientot', title: verify > 1 ? t('{n} photos publiées à vérifier', { n: verify }) : t('{n} photo publiée à vérifier', { n: verify }),
      detail: t('un visage, et un accord manque : confirmez, liez la personne, ou dépubliez'), href: '/admin/photos?manque=verifier', action: t('Vérifier') });
    // Mentions légales / Impressum : obligatoires, signalées tant qu'il manque l'essentiel.
    const legal = Object.fromEntries(db.prepare("SELECT key, value FROM settings WHERE key LIKE 'legal_%' OR key = 'privacy_contact'").all()
      .map(r => { try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, '']; } }));
    if (a.all('reglages.droits') && legalMissing(legal).length) items.push({ level: 'bientot', title: t('Mentions légales / Impressum à compléter'), detail: t('obligatoires en France et en Allemagne : éditeurs, adresse postale, responsable'), href: '/admin/droits#mentions', action: t('Compléter') });
    // Remarques adressées : pour le photographe, chacune (jusqu'à 5) ; au-delà, ou pour qui voit tout, leur nombre.
    const na = a.author('photos.voir');
    const open = notes && na !== undefined ? notes.open({ authorId: na }) : [];
    if (open.length && open.length <= 5 && na != null) {
      for (const n of open) items.push({ level: 'bientot', title: t('Remarque de {name} sur « {title} »', { name: n.from_name || t('l’équipe'), title: n.title }), detail: n.message, href: `/admin/photos/${n.photo_id}#remarques`, action: t('Voir') });
    } else if (open.length) {
      items.push({ level: 'bientot', title: open.length > 1 ? t('{n} remarques sur des photos, pas encore traitées', { n: open.length }) : t('{n} remarque sur une photo, pas encore traitée', { n: open.length }), detail: t('adressées aux photographes'), href: `/admin/photos/${open[0].photo_id}#remarques`, action: t('Voir') });
    }
    // Circuit de publication : à valider (qui publie pour tout le monde) ; proposées et programmées (ses photos).
    const toValidate = review && a.all('photos.publier') ? review.countFor('proposee') : 0;
    if (toValidate) items.push({ level: 'bientot', title: toValidate > 1 ? t('{n} photos proposées à valider', { n: toValidate }) : t('{n} photo proposée à valider', { n: toValidate }), detail: t('publier, programmer ou renvoyer avec une remarque'), href: '/admin/a-valider', action: t('Valider') });
    const pr_ = a.author('photos.proposer');
    if (review && pr_ != null) {
      const waitingMine = review.countFor('proposee', pr_), planned = review.countFor('programmee', pr_);
      if (waitingMine) items.push({ level: 'plus-tard', title: waitingMine > 1 ? t('{n} photos proposées, en attente du modérateur', { n: waitingMine }) : t('{n} photo proposée, en attente du modérateur', { n: waitingMine }), detail: t('vous serez prévenu de sa décision'), href: '/admin/photos?manque=proposees', action: t('Voir') });
      if (planned) items.push({ level: 'plus-tard', title: planned > 1 ? t('{n} photos programmées', { n: planned }) : t('{n} photo programmée', { n: planned }), detail: t('publiées automatiquement à la date choisie'), href: '/admin/photos?manque=programmees', action: t('Voir') });
    }
    const waiting = accounts && a.all('comptes.gerer') ? accounts.pending() : 0;
    if (waiting) items.push({ level: 'bientot', title: waiting > 1 ? t('{n} comptes en attente d’un rôle', { n: waiting }) : t('{n} compte en attente d’un rôle', { n: waiting }), detail: t('connectés une fois, ils n’ont encore accès à rien'), href: '/admin/comptes', action: t('Voir') });
    const reports = feedback && a.all('signalements.traiter') ? feedback.pending() : 0;
    if (reports) items.push({ level: 'bientot', title: reports > 1 ? t('{n} signalements de visiteurs', { n: reports }) : t('{n} signalement de visiteur', { n: reports }),
      detail: t('photo à retirer, suggestion pour le texte ou autre'), href: '/admin/signalements', action: t('Voir') });
    const fa = a.author('personnes.voir');
    const fresh = fa === undefined ? 0 : q.fresh.get({ author: fa });
    if (fresh) items.push({ level: 'bientot', title: fresh > 1 ? t('{n} nouvelles personnes photographiées', { n: fresh }) : t('{n} nouvelle personne photographiée', { n: fresh }),
      detail: t('demandes reçues sur /bonjour ou rencontres à traiter'), href: '/admin/rencontres?statut=nouvelle', action: t('Voir') });
    const failed = a.all('instagram.voir') ? q.igFailed.get() : 0;
    if (failed) items.push({ level: 'bientot', title: failed > 1 ? t('Instagram : {n} publications en échec', { n: failed }) : t('Instagram : {n} publication en échec', { n: failed }),
      detail: t('bloquées par un accord, ou refusées par Instagram : la raison est dans l’historique'), href: '/admin/instagram', action: t('Voir') });
    const paused = a.all('instagram.voir') && instagram?.usage().paused;
    if (paused) items.push({ level: 'bientot', title: t('Instagram en pause'), detail: t('reprise {when} : {reason}', { when: paused.when, reason: paused.reason }), href: '/admin/instagram', action: t('Voir') });
    const pa = a.author('photos.voir'), ma = a.author('photos.modifier'), ta = a.author('photos.textes');
    const toFinish = pa === undefined ? 0 : q.toFinish.all({ author: pa }).filter(p => p.status === 'draft' || isProvisional(p)).length;
    const proposed = seriesSuggest?.enabled() && ma !== undefined ? seriesSuggest.forPhotos(db.prepare("SELECT id, category_id, status, series_checked FROM photos WHERE status = 'draft' AND series_checked = 0 AND (@author IS NULL OR author_id = @author)").all({ author: ma })).size : 0;
    if (proposed) items.push({ level: 'plus-tard', title: proposed > 1 ? t('{n} photos avec une série proposée', { n: proposed }) : t('{n} photo avec une série proposée', { n: proposed }), detail: t('une autre série leur ressemble davantage'), href: '/admin/photos?manque=proposee', action: t('Voir') });
    if (toFinish) items.push({ level: 'plus-tard', title: toFinish > 1 ? t('{n} photos à finir', { n: toFinish }) : t('{n} photo à finir', { n: toFinish }), detail: t('brouillons ou titres provisoires'), href: '/admin/photos?statut=afinir', action: t('Finir') });
    const noCity = ma === undefined ? 0 : q.noCity.get({ author: ma });
    if (noCity) items.push({ level: 'plus-tard', title: noCity > 1 ? t('{n} photos publiées sans ville', { n: noCity }) : t('{n} photo publiée sans ville', { n: noCity }), detail: t('elles ne peuvent pas apparaître sur la carte du monde'), href: '/admin/photos?manque=ville', action: t('Compléter') });
    const untranslated = ta === undefined ? 0 : q.untranslated.get({ author: ta });
    if (untranslated) items.push({ level: 'plus-tard', title: untranslated > 1 ? t('{n} titres sans traduction', { n: untranslated }) : t('{n} titre sans traduction', { n: untranslated }), detail: t('en anglais ou en allemand : le site montre alors le français'), href: '/admin/photos?manque=traduction', action: t('Traduire') });
    const pr = a.all('photos.modifier') && proofs?.status();
    if (pr?.errors) items.push({ level: 'plus-tard', title: pr.errors > 1 ? t('{n} preuves d’antériorité en attente après une erreur', { n: pr.errors }) : t('{n} preuve d’antériorité en attente après une erreur', { n: pr.errors }), detail: t('l’horodatage sera retenté'), href: '/admin#proofs-title', action: t('Voir') });
    return items;
  }

  return { list, urgentCount: (scope = null) => urgent(FR, scope).length };
}
