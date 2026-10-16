import { samePartSql, isDay } from './outings.js';

// Personnes : une personne photographiée et ses rencontres (une par sortie, chacune avec sa carte et son accord).
//   - Un accord vaut pour sa sortie (rien ne couvre les sorties suivantes) ; un refus vaut pour tout : le refus le
//     plus récent d'une personne s'étend à toutes ses rencontres.
//   - Chaque nouvelle rencontre a sa personne ; rapprocher deux personnes se fait à la main (« c'est la même
//     personne »), proposé quand l'adresse e-mail est la même (empreinte), jamais d'après le visage.
//   - Aucune donnée personnelle dans la table people : nom, adresse, visage restent sur les rencontres (chiffrés).
export function createPeople({ db, encounters, now = () => Date.now() }) {
  const q = {
    orphans: db.prepare('SELECT id FROM encounters WHERE person_id IS NULL AND anonymized = 0').pluck(),
    newPerson: db.prepare('INSERT INTO people (created_at, updated_at) VALUES (?, ?)'),
    setPerson: db.prepare('UPDATE encounters SET person_id = ? WHERE id = ?'),
    touch: db.prepare('UPDATE people SET updated_at = ? WHERE id = ?'),
    of: db.prepare('SELECT id FROM encounters WHERE person_id = ? ORDER BY COALESCE(NULLIF(session_day, \'\'), NULLIF(met_on, \'\'), \'\') DESC, id DESC').pluck(),
    empty: db.prepare('DELETE FROM people WHERE NOT EXISTS (SELECT 1 FROM encounters e WHERE e.person_id = people.id)'),
    exists: db.prepare('SELECT 1 FROM people WHERE id = ?'),
    distinct: db.prepare('SELECT 1 FROM people_distinct WHERE a = ? AND b = ?'),
    // Dernière décision de chaque personne : un refus le plus récent s'étend aux autres rencontres.
    latestRefusals: db.prepare(`SELECT e.person_id, e.refused_at FROM encounters e WHERE e.person_id IS NOT NULL AND e.refused = 1
      AND e.refused_at >= COALESCE((SELECT MAX(x.consent_at) FROM encounters x WHERE x.person_id = e.person_id AND x.refused = 0), 0)`),
    spread: db.prepare('SELECT id FROM encounters WHERE person_id = ? AND refused = 0 AND anonymized = 0').pluck(),
  };

  // Chaque rencontre a une personne ; un refus récent s'étend à toute la personne. Appelé après chaque changement.
  function sync() {
    const t = now();
    let created = 0, spread = 0;
    db.transaction(() => {
      for (const id of q.orphans.all()) {
        const pid = Number(q.newPerson.run(t, t).lastInsertRowid);
        q.setPerson.run(pid, id);
        created++;
      }
      for (const r of q.latestRefusals.all()) {
        for (const id of q.spread.all(r.person_id)) {
          db.prepare('UPDATE encounters SET refused = 1, refused_at = ?, updated_at = ? WHERE id = ?').run(r.refused_at, t, id);
          db.prepare('INSERT INTO encounter_events (encounter_id, at, kind, verified, detail) VALUES (?, ?, ?, 0, ?)').run(id, t, 'refus_personne', '{}');
          spread++;
        }
      }
      q.empty.run();
    })();
    return { created, spread };
  }

  const day = e => e.session_day || e.met_on || '';
  // Une personne : ses rencontres (déchiffrées), du plus récent au plus ancien, et ce qui la résume.
  function get(id) {
    if (!q.exists.get(id)) return null;
    const meetings = q.of.all(id).map(eid => encounters.get(eid)).filter(Boolean);
    if (!meetings.length) return null;
    const named = meetings.find(e => e.name);
    const face = meetings.find(e => e.hasPortrait);
    const decided = meetings.filter(e => e.refused || e.consent).sort((a, b) => Math.max(b.refused_at || 0, b.consent_at || 0) - Math.max(a.refused_at || 0, a.consent_at || 0));
    const photos = db.prepare(`SELECT DISTINCT p.id, p.title, p.slug, p.status, p.file, p.width, p.height, p.variant_key, p.taken_on, p.author_id FROM encounter_photos ep
      JOIN photos p ON p.id = ep.photo_id JOIN encounters e ON e.id = ep.encounter_id WHERE e.person_id = ? ORDER BY p.position, p.id`).all(id);
    return {
      id, meetings, name: named?.name || '', ref: meetings[0].ref, faceFrom: face?.id ?? null, refused: meetings.some(e => e.refused),
      latest: decided[0] || null, photos, fresh: meetings.some(e => e.status === 'nouvelle'),
      rights: meetings.find(e => e.rights_request && !e.rights_done_at) || null,
      days: [...new Set(meetings.map(day).filter(Boolean))],
    };
  }

  // Les plus récentes d'abord (500 au plus). authorId (portée « les miennes ») : seulement les personnes que ce
  // photographe a rencontrées, et la recherche ne lit que ses rencontres (un nom ou une adresse notés par l'autre
  // photographe ne se devinent pas). La recherche passe avant la limite : une personne ancienne se retrouve.
  function list({ search = '', authorId = null } = {}) {
    const needle = String(search || '').trim().toLowerCase();
    const ids = db.prepare(`SELECT p.id FROM people p WHERE (@author IS NULL OR EXISTS (SELECT 1 FROM encounters e WHERE e.person_id = p.id AND e.author_id = @author))
      ORDER BY (SELECT MAX(e.updated_at) FROM encounters e WHERE e.person_id = p.id) DESC ${needle ? '' : 'LIMIT 500'}`).pluck().all({ author: authorId });
    const own = p => (authorId == null ? p.meetings : p.meetings.filter(e => e.author_id === authorId));
    return ids.map(get).filter(Boolean)
      .filter(p => !needle || own(p).some(e => [e.name, e.ref, e.email].some(v => String(v || '').toLowerCase().includes(needle))))
      .slice(0, 500)
      .map(p => ({ ...p, suggestions: suggestions(p.id).length }));
  }

  // Rapprochements proposés : une autre personne qui a la même adresse e-mail (empreinte), sauf si écartée.
  function suggestions(id) {
    const rows = db.prepare(`SELECT DISTINCT o.person_id FROM encounters e JOIN encounters o ON o.email_hash = e.email_hash AND o.person_id <> e.person_id
      WHERE e.person_id = ? AND e.email_hash IS NOT NULL AND o.person_id IS NOT NULL`).pluck().all(id);
    return rows.filter(o => !q.distinct.get(Math.min(id, o), Math.max(id, o)));
  }
  const dismiss = (a, b) => db.prepare('INSERT OR IGNORE INTO people_distinct (a, b) VALUES (?, ?)').run(Math.min(a, b), Math.max(a, b));

  // « C'est la même personne » : les rencontres de `from` passent à `into`.
  function merge(into, from) {
    if (into === from || !q.exists.get(into) || !q.exists.get(from)) return false;
    db.transaction(() => {
      db.prepare('UPDATE encounters SET person_id = ? WHERE person_id = ?').run(into, from);
      q.touch.run(now(), into);
      q.empty.run();
    })();
    sync();
    return true;
  }
  // Rattacher une rencontre existante à cette personne (son ancienne personne disparaît si elle n'a plus rien).
  function attach(personId, encounterId) {
    if (!q.exists.get(personId) || !encounters.get(encounterId)) return false;
    q.setPerson.run(personId, encounterId);
    q.touch.run(now(), personId);
    q.empty.run();
    sync();
    return true;
  }
  // Refus d'une rencontre venu seulement du rapprochement (« refus étendu » par sync depuis une autre rencontre), sans
  // refus à elle depuis sa dernière décision (page /bonjour, téléphone, carte signée). Un refus d'origine inconnue
  // compte comme le sien (gardé).
  function extendedOnly(encounterId) {
    let own = null, extended = false;
    for (const ev of encounters.events(encounterId)) {
      const d = ev.detail || {};
      if ((ev.kind === 'visiteur' || ev.kind === 'app') && d.decision === 'refus') { own = 'refus'; extended = false; }
      else if ((ev.kind === 'visiteur' && d.decision === 'accord' && !d.non_verifiee) || (ev.kind === 'app' && d.decision === 'accord') || (ev.kind === 'carte' && d.signed)) { own = 'accord'; extended = false; }
      else if (ev.kind === 'refus_personne' && !d.leve) extended = true;
    }
    return extended && own !== 'refus';
  }
  // « Ce n'est pas elle » : la rencontre redevient une personne à part. Chaque côté qui n'a plus de refus à lui perd
  // le refus étendu depuis l'autre (ce n'était pas le sien) ; un refus à elle reste étendu à toute sa personne.
  function detach(encounterId) {
    const e = encounters.get(encounterId);
    if (!e || !e.person_id || q.of.all(e.person_id).length < 2) return null;
    const t = now();
    const pid = Number(q.newPerson.run(t, t).lastInsertRowid);
    db.transaction(() => {
      q.setPerson.run(pid, encounterId);
      dismiss(pid, e.person_id);
      for (const group of [pid, e.person_id]) {
        const refused = q.of.all(group).map(id => encounters.get(id)).filter(x => x?.refused && !x.anonymized);
        if (refused.some(x => !extendedOnly(x.id))) continue;
        for (const x of refused) {
          db.prepare('UPDATE encounters SET refused = 0, refused_at = NULL, updated_at = ? WHERE id = ?').run(t, x.id);
          db.prepare('INSERT INTO encounter_events (encounter_id, at, kind, verified, detail) VALUES (?, ?, ?, 0, ?)').run(x.id, t, 'refus_personne', '{"leve":true}');
        }
      }
    })();
    return pid;
  }

  // Rencontre de la personne dans la sortie d'une photo (même photographe, jour, partie de journée), créée « sans
  // décision » s'il n'y en a pas : un accord ne vaut que pour sa sortie.
  function meetingFor(personId, photoId) {
    const p = db.prepare('SELECT id, author_id, taken_on, taken_time FROM photos WHERE id = ?').get(photoId);
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p.taken_on || '')) return null;
    const found = db.prepare(`SELECT e.id FROM encounters e WHERE e.person_id = @person AND e.author_id = @author
      AND COALESCE(NULLIF(e.session_day, ''), NULLIF(e.met_on, '')) = @day
      AND ${samePartSql('e.author_id', '@day', 'e.met_time', "COALESCE(@time, '')")} ORDER BY e.id LIMIT 1`).pluck().get({ person: personId, author: p.author_id, day: p.taken_on, time: p.taken_time || '' });
    if (found) return found;
    return addMeeting(personId, { authorId: p.author_id, day: p.taken_on, time: p.taken_time || '' });
  }
  // Nouvelle rencontre de la personne lors d'une sortie (sans décision : l'accord se demande à part).
  function addMeeting(personId, { authorId, day: d, time = '' }) {
    if (!q.exists.get(personId) || !isDay(d)) return null;
    const t = now();
    const id = Number(db.prepare(`INSERT INTO encounters (author_id, status, met_on, met_time, person_id, created_at, updated_at)
      VALUES (?, 'en_cours', ?, ?, ?, ?, ?)`).run(authorId, d, /^\d{2}:\d{2}$/.test(time) ? time : '', personId, t, t).lastInsertRowid);
    db.prepare('INSERT INTO encounter_events (encounter_id, at, kind, verified, detail) VALUES (?, ?, ?, 0, ?)').run(id, t, 'creee', '{"depuis":"personne"}');
    q.touch.run(t, personId);
    sync();
    return id;
  }
  // Photos où la personne figure : liées à sa rencontre de la sortie de chaque photo.
  function linkPhotos(personId, photoIds) {
    let n = 0;
    for (const pid of photoIds) {
      const eid = meetingFor(personId, Number(pid));
      if (eid) { encounters.link(eid, [Number(pid)]); n++; }
    }
    return n;
  }

  return { sync, get, list, suggestions, dismiss, merge, attach, detach, addMeeting, linkPhotos, meetingFor };
}
