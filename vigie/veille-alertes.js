import crypto from 'node:crypto';

export const REGLE_VEILLE = 'veille.vulnerabilite';
export const TITRE_VEILLE = 'Avis de vulnérabilité sur une bibliothèque déclarée, à vérifier';
const GRAVITES = { critique: 'critique', haute: 'haut', moyenne: 'moyen', basse: 'bas', inconnue: 'info' };
const RANG = { info: 0, bas: 1, moyen: 2, haut: 3, critique: 4 };
export const cleVeille = (avis, p) => crypto.createHash('sha256').update(JSON.stringify([avis, p.nom, p.version])).digest('hex');

// Une même bibliothèque/version dans les deux cibles ne produit qu'une alerte. Le classement de l'équipe ne se
// défait pas chaque jour ; une aggravation ou une réapparition après disparition complète ouvre un nouveau suivi.
export function createAlertesVeille({ store, switches = null }) {
  const { db } = store;
  const q = {
    suivi: db.prepare('SELECT * FROM veille_alertes WHERE cle = ?'),
    alerte: db.prepare('SELECT * FROM alerts WHERE id = ?'),
    creer: db.prepare(`INSERT INTO alerts (regle, cas, entite_kind, entite_key, gravite, mode, premiere, derniere, sources)
      VALUES (?, 'BV-34', 'vigie', ?, ?, 'alerter', ?, ?, '["vigie"]')`),
    toucher: db.prepare('UPDATE alerts SET derniere = MAX(derniere, ?), gravite = ?, compteur = compteur + ? WHERE id = ?'),
    garder: db.prepare(`INSERT INTO veille_alertes (cle, avis, nom, version, cibles, alerte_id, gravite, presente, verifie_a)
      VALUES (@cle, @avis, @nom, @version, @cibles, @alerte_id, @gravite, 1, @t)
      ON CONFLICT(cle) DO UPDATE SET cibles = excluded.cibles, alerte_id = excluded.alerte_id, gravite = excluded.gravite, presente = 1, verifie_a = excluded.verifie_a`),
    presents: db.prepare('SELECT * FROM veille_alertes WHERE presente = 1'),
    absent: db.prepare('UPDATE veille_alertes SET presente = 0, verifie_a = ? WHERE cle = ?'),
    clore: db.prepare(`UPDATE alerts SET statut = 'close', classement = NULL, note = ?, traite_par = 'Vigie (veille)', traite_a = ? WHERE id = ? AND statut != 'close'`),
    liens: db.prepare('SELECT v.cle, a.id, a.statut FROM veille_alertes v JOIN alerts a ON a.id = v.alerte_id WHERE v.presente = 1'),
    purger: db.prepare('DELETE FROM veille_alertes WHERE presente = 0 AND alerte_id IS NULL AND verifie_a < ?'),
  };
  const noter = detail => {
    if (store.own('vigie_alerte', { emetteur: 'vigie/veille-alertes.js', detail: { ...detail, regle: REGLE_VEILLE, cas: 'BV-34', sources: ['vigie'], mode: 'alerter' } }) !== 1) throw new Error('Journal de la veille indisponible.');
  };
  function synchroniser(avis, { complet, t }) {
    if (switches?.isOn('detection') === false) return;
    const vus = new Set();
    for (const v of avis) for (const p of v.paquets) {
      const cle = cleVeille(v.id, p);
      vus.add(cle);
      const avant = q.suivi.get(cle), a = avant?.alerte_id ? q.alerte.get(avant.alerte_id) : null;
      const gravite = GRAVITES[v.gravite] || 'info';
      const nouvelle = !avant?.presente;
      const ciblesAvant = nouvelle ? [] : JSON.parse(avant.cibles);
      const cibles = [...new Set([...ciblesAvant, ...p.usages.map(u => u.cible)])].sort();
      const etendue = !nouvelle && cibles.length > ciblesAvant.length;
      const aggravee = !nouvelle && RANG[gravite] > RANG[avant.gravite];
      // La gravité maximale du même épisode évite de renotifier une oscillation de la source.
      const g = nouvelle || aggravee ? gravite : avant.gravite;
      let id = a?.id ?? null, action = null;
      const entite = { kind: 'vigie', key: `${v.id} · ${p.nom}@${p.version}` };
      if (nouvelle || ((aggravee || etendue) && (!a || a.statut === 'close'))) {
        id = Number(q.creer.run(REGLE_VEILLE, entite.key, g, t, t).lastInsertRowid);
        action = 'ouverte';
      } else if (a && a.statut !== 'close') {
        q.toucher.run(t, g, aggravee || etendue ? 1 : 0, id);
        if (aggravee || etendue) action = aggravee ? 'aggravee' : 'etendue';
      }
      q.garder.run({ cle, avis: v.id, nom: p.nom, version: p.version, cibles: JSON.stringify(cibles), alerte_id: id, gravite: g, t });
      if (action) noter({ action, id, gravite: g, entite, avant: aggravee ? avant.gravite : undefined,
        avis: v.id, bibliotheque: p.nom, version: p.version, cibles: p.usages.map(u => u.cible), inventaire: 'déclaré' });
    }
    // Une panne ou une couverture partielle ne prouve jamais une disparition. Cette clôture ne prétend pas qu'un
    // correctif est installé : seulement que l'avis ne correspond plus à l'inventaire déclaré vérifié entièrement.
    if (complet) for (const s of q.presents.all()) {
      if (vus.has(s.cle)) continue;
      q.absent.run(t, s.cle);
      const note = 'sans suite : avis absent du dernier rapprochement complet avec l’inventaire déclaré ; correction installée non attestée';
      if (s.alerte_id && q.clore.run(note, t, s.alerte_id).changes) noter({ action: 'close', id: s.alerte_id, note });
    }
    // Les correspondances encore présentes, même classées puis purgées, gardent leur déduplication.
    q.purger.run(t - 395 * 864e5);
  }
  return { synchroniser, liens: () => new Map(q.liens.all().map(a => [a.cle, { id: a.id, statut: a.statut }])) };
}
