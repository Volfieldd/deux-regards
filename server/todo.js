// « Aujourd'hui » : ce qui demande votre attention, trié par urgence.
//   - urgent : obligation légale (demande d'accès ou d'effacement, un mois pour répondre) ou refus encore en ligne ;
//   - bientôt : à regarder (refus dans une sortie, nouvelles personnes, Instagram en échec ou en pause) ;
//   - plus tard : à finir quand vous avez le temps (photos à finir, sans ville, traductions, preuves).
// Chaque ligne mène à l'écran qui la règle. Requêtes simples : la liste est recalculée à chaque page de l'admin
// (le badge du menu compte les urgences).
import { isProvisional } from './admin-repo.js';
import { samePartSql } from './outings.js';

export const LEVELS = ['urgent', 'bientot', 'plus-tard'];
const MONTH = 30 * 864e5;

const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const day = ms => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(ms);

export function createTodo({ db, encounters, instagram, proofs, now = () => Date.now() }) {
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
      AND NOT EXISTS (SELECT 1 FROM encounter_photos ep WHERE ep.encounter_id = e.id AND ep.photo_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM encounter_exclusions x WHERE x.encounter_id = e.id AND x.photo_id = p.id)
      AND ${samePartSql('p.author_id', 'p.taken_on', "COALESCE(p.taken_time, '')", 'e.met_time')}
      GROUP BY e.id ORDER BY e.id`),
    fresh: db.prepare("SELECT COUNT(*) FROM encounters WHERE status = 'nouvelle'").pluck(),
    igFailed: db.prepare("SELECT COUNT(*) FROM instagram_posts WHERE status = 'failed' AND NOT EXISTS (SELECT 1 FROM instagram_posts b WHERE b.photo_id = instagram_posts.photo_id AND b.id > instagram_posts.id)").pluck(),
    // À finir : brouillons, ou titre provisoire (le nom du fichier), comme la photothèque.
    toFinish: db.prepare('SELECT status, title, source_name FROM photos'),
    noCity: db.prepare("SELECT COUNT(*) FROM photos WHERE status = 'published' AND city_id IS NULL").pluck(),
    untranslated: db.prepare("SELECT COUNT(*) FROM photos WHERE status = 'published' AND (title_en = '' OR title_de = '')").pluck(),
  };
  const who = e => (e.anonymized ? 'refus anonymisé' : `${e.ref || 'sans carte'}${e.name ? ` · ${e.name}` : ''}`);

  function urgent() {
    const items = [];
    for (const id of q.rights.all()) {
      const e = encounters.get(id);
      if (!e) continue;
      const due = (e.rights_requested_at || 0) + MONTH;
      const late = due < now();
      items.push({ level: 'urgent', title: `Demande ${e.rights_request === 'effacement' ? 'd’effacement' : 'd’accès'} de ${who(e)}`,
        detail: late ? `en retard : à traiter depuis le ${day(due)}` : `à traiter avant le ${day(due)}`, href: `/admin/rencontres/${id}#droits`, action: 'Traiter' });
    }
    for (const r of q.refusedOnline.all()) {
      const e = encounters.get(r.id);
      if (!e) continue;
      items.push({ level: 'urgent', title: `Refus de ${who(e)} : ${plural(r.n, 'photo')} encore ${r.n > 1 ? 'publiées' : 'publiée'}`,
        detail: 'la personne refuse la publication des photos liées', href: `/admin/rencontres/${r.id}#refus`, action: 'Appliquer le refus' });
    }
    return items;
  }

  function list() {
    const items = urgent();
    for (const r of q.refusedSession.all()) {
      const e = encounters.get(r.id);
      if (!e) continue;
      items.push({ level: 'bientot', title: `${who(e)} a refusé : ${plural(r.n, 'photo publiée', 'photos publiées')} de sa sortie à vérifier`,
        detail: `${e.author || 'photographe'} · ${e.session_day || e.met_on} : liez au refus celles où la personne figure, excluez les autres`, href: `/admin/rencontres/${r.id}#session`, action: 'Vérifier' });
    }
    const fresh = q.fresh.get();
    if (fresh) items.push({ level: 'bientot', title: `${plural(fresh, 'nouvelle personne photographiée', 'nouvelles personnes photographiées')}`,
      detail: 'demandes reçues sur /bonjour ou rencontres à traiter', href: '/admin/rencontres?statut=nouvelle', action: 'Voir' });
    const failed = q.igFailed.get();
    if (failed) items.push({ level: 'bientot', title: `Instagram : ${plural(failed, 'publication en échec', 'publications en échec')}`,
      detail: 'bloquées par un accord, ou refusées par Instagram : la raison est dans l’historique', href: '/admin/instagram', action: 'Voir' });
    const paused = instagram?.usage().paused;
    if (paused) items.push({ level: 'bientot', title: 'Instagram en pause', detail: `reprise ${paused.when} : ${paused.reason}`, href: '/admin/instagram', action: 'Voir' });
    const toFinish = q.toFinish.all().filter(p => p.status === 'draft' || isProvisional(p)).length;
    if (toFinish) items.push({ level: 'plus-tard', title: `${plural(toFinish, 'photo')} à finir`, detail: 'brouillons ou titres provisoires', href: '/admin/photos?statut=afinir', action: 'Finir' });
    const noCity = q.noCity.get();
    if (noCity) items.push({ level: 'plus-tard', title: `${plural(noCity, 'photo publiée', 'photos publiées')} sans ville`, detail: 'elles ne peuvent pas apparaître sur la carte du monde', href: '/admin/photos?manque=ville', action: 'Compléter' });
    const untranslated = q.untranslated.get();
    if (untranslated) items.push({ level: 'plus-tard', title: `${plural(untranslated, 'titre', 'titres')} sans traduction`, detail: 'en anglais ou en allemand : le site montre alors le français', href: '/admin/photos?manque=traduction', action: 'Traduire' });
    const pr = proofs?.status();
    if (pr?.errors) items.push({ level: 'plus-tard', title: `${plural(pr.errors, 'preuve d’antériorité', 'preuves d’antériorité')} en attente après une erreur`, detail: 'l’horodatage sera retenté', href: '/admin#proofs-title', action: 'Voir' });
    return items;
  }

  return { list, urgentCount: () => urgent().length };
}
