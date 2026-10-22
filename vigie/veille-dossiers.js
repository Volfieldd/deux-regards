// BV-34 / D35 : contexte déclaré du service, jamais une preuve d'exploitation ni une nouvelle phase.
// Lecture bornée et cache invalidé par une révision SQLite, y compris après écriture d'un autre processus.
export const MOTIF_VEILLE = 'veille : vulnérabilité haute ou critique sur le service visé (+1 au maximum)';
export function createVeilleDossiers(db) {
  const revision = db.prepare('SELECT revision FROM veille_revision WHERE id = 1').pluck();
  const actifs = db.prepare(`SELECT a.id, a.gravite, v.avis, v.nom, v.version, v.verifie_a
    FROM veille_alertes v JOIN alerts a ON a.id = v.alerte_id
    WHERE v.presente = 1 AND a.statut IN ('ouverte', 'en_cours') AND a.regle = 'veille.vulnerabilite'
      AND a.gravite IN ('haut', 'critique') AND EXISTS (SELECT 1 FROM json_each(v.cibles_actuelles) WHERE value = ?)
    ORDER BY CASE a.gravite WHEN 'critique' THEN 0 ELSE 1 END, a.id LIMIT 21`);
  let cache;
  function lire() {
    const r = revision.get();
    if (cache?.revision === r) return cache;
    cache = { revision: r, site: actifs.all('site'), vigie: actifs.all('vigie') };
    return cache;
  }
  function pourDossier(entites, signaux, etat = lire()) {
    const cibles = new Set();
    if (!etat.site.length && !etat.vigie.length) return { cibles: [], alertes: [], tronque: false };
    // Une source de contrôle Vigie peut observer le site : elle ne suffit pas à désigner la Vigie comme cible.
    // Bordure, réseau et Zitadel seuls ne désignent pas une bibliothèque npm de l'un des deux services.
    for (const e of entites) if (e.kind === 'cible' && e.role === 'cible') {
      const service = /^(site|vigie):/.exec(e.key)?.[1];
      if (service) cibles.add(service);
    }
    for (const s of signaux) {
      if (s.source === 'site') cibles.add('site');
      if (/^sigma\.console_/.test(s.regle)) cibles.add('vigie');
    }
    const services = [...cibles].sort(), avis = new Map();
    for (const service of services) for (const a of etat[service]) {
      if (!avis.has(a.id)) avis.set(a.id, { ...a, cibles: [] });
      avis.get(a.id).cibles.push(service);
    }
    const lignes = [...avis.values()].sort((a, b) => Number(b.gravite === 'critique') - Number(a.gravite === 'critique') || a.id - b.id);
    return { cibles: services, alertes: lignes.slice(0, 20), tronque: lignes.length > 20 };
  }
  return { lire, pourDossier };
}
