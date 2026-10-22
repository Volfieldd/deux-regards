import fs from 'node:fs';
import crypto from 'node:crypto';
import { readLimited } from './zitadel.js';
import { createAlertesVeille, cleVeille } from './veille-alertes.js';

// BV-34 : inventaires déclarés, sans score d'attaque ni ouverture de dossier. Les alertes de maintenance sont journalisées.
// OSV associe lui-même nom et version ; les correctifs affichés ne sont pas des consignes de mise à jour.
export const JOUR = 864e5, REESSAI = 3600e3;
const CLE = 'veille_npm_v1', MAX_PAQUETS = 3000, MAX_AVIS = 300;
const NOM = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const objet = x => x && typeof x === 'object' && !Array.isArray(x);
const texte = (x, n = 240) => typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, n) : '';
export const GRAVITES = { critique: 'Critique', haute: 'Haute', moyenne: 'Moyenne', basse: 'Basse', inconnue: 'Non précisée' };
const NIVEAUX = { CRITICAL: 'critique', HIGH: 'haute', MODERATE: 'moyenne', MEDIUM: 'moyenne', LOW: 'basse' };

export function lireInventaire(sources = [
  { id: 'site', nom: 'Site', fichier: new URL('../package-lock.json', import.meta.url) },
  { id: 'vigie', nom: 'Vigie', fichier: new URL('./package-lock.json', import.meta.url) },
]) {
  const paquets = new Map(), cibles = [];
  for (const source of sources) {
    const cible = { id: source.id, nom: source.nom, version: '', directs: 0, indirects: 0, optionnels: 0, developpement: 0, exclus: 0, erreur: null };
    cibles.push(cible);
    try {
      const brut = source.lock ?? JSON.parse(fs.readFileSync(source.fichier, 'utf8'));
      if (![2, 3].includes(brut.lockfileVersion) || !objet(brut.packages?.['']) || Object.keys(brut.packages).length > 10_000) throw new Error('inventaire illisible');
      cible.version = texte(brut.packages[''].version || brut.version, 80);
      const directs = { ...brut.packages[''].dependencies, ...brut.packages[''].optionalDependencies };
      const lus = new Map();
      for (const [chemin, p] of Object.entries(brut.packages)) {
        if (!chemin) continue;
        if (p?.dev === true) { cible.developpement++; continue; }
        const nom = p?.name || chemin.split('node_modules/').at(-1);
        // Les liens locaux et sources Git ne sont pas assimilés à une publication npm homonyme.
        if (!objet(p) || p.link || !chemin.includes('node_modules/') || typeof nom !== 'string' || !NOM.test(nom) || nom.length > 214
          || typeof p.version !== 'string' || !VERSION.test(p.version) || p.version.length > 100
          || typeof p.resolved !== 'string' || !p.resolved.startsWith('https://registry.npmjs.org/')) { cible.exclus++; continue; }
        const cle = `${nom}@${p.version}`, direct = Object.hasOwn(directs, chemin.replace(/^node_modules\//, ''));
        const ancien = lus.get(cle);
        lus.set(cle, { nom, version: p.version, direct: direct || ancien?.direct || false, optionnel: p.optional === true && (!ancien || ancien.optionnel) });
      }
      for (const [cle, p] of lus) {
        cible[p.direct ? 'directs' : 'indirects']++;
        if (p.optionnel) cible.optionnels++;
        if (!paquets.has(cle)) paquets.set(cle, { nom: p.nom, version: p.version, usages: [] });
        paquets.get(cle).usages.push({ cible: cible.id, direct: p.direct, optionnel: p.optionnel });
      }
    } catch { cible.erreur = 'Inventaire absent ou illisible.'; }
  }
  const liste = [...paquets.values()].sort((a, b) => a.nom.localeCompare(b.nom) || a.version.localeCompare(b.version));
  if (liste.length > MAX_PAQUETS) {
    for (const c of cibles) c.erreur = 'Inventaire trop grand : vérification suspendue.';
    liste.length = 0;
  }
  const empreinte = crypto.createHash('sha256').update(JSON.stringify({ cibles, paquets: liste })).digest('hex');
  return { cibles, paquets: liste, empreinte };
}

function reduireAvis(v, id, paquets) {
  if (!objet(v) || v.id !== id || !Array.isArray(v.affected)) throw new Error('Avis OSV illisible.');
  if (v.withdrawn) return null;
  const severity = v.database_specific?.severity;
  const gravite = Object.hasOwn(NIVEAUX, severity) ? NIVEAUX[severity] : 'inconnue';
  const parNom = new Map();
  for (const a of v.affected) {
    if (a?.package?.ecosystem !== 'npm' || typeof a.package.name !== 'string') continue;
    if (!parNom.has(a.package.name)) parNom.set(a.package.name, new Set());
    const versions = parNom.get(a.package.name);
    for (const r of Array.isArray(a.ranges) ? a.ranges : []) {
      if (!r || !['SEMVER', 'ECOSYSTEM'].includes(r.type)) continue;
      for (const e of Array.isArray(r.events) ? r.events : []) if (typeof e?.fixed === 'string' && e.fixed.length <= 100 && VERSION.test(e.fixed)) versions.add(e.fixed);
    }
  }
  return { id, titre: texte(v.summary) || id, gravite,
    aliases: Array.isArray(v.aliases) ? v.aliases.filter(x => typeof x === 'string' && /^CVE-\d{4}-\d{4,}$/.test(x)).slice(0, 20) : [],
    paquets: paquets.map(p => {
      if (!parNom.has(p.nom)) throw new Error('Avis OSV incohérent avec le paquet demandé.');
      const correctifs = [...parNom.get(p.nom)];
      return { ...p, correctifs: correctifs.slice(0, 20), correctifsTronques: correctifs.length > 20 };
    }) };
}

export function createVeille({ store, switches = null, fetchImpl = fetch, now = Date.now, inventaire = lireInventaire() }) {
  let encours = null, controle = null, ferme = false;
  const alertes = createAlertesVeille({ store, switches });
  const complet = !inventaire.cibles.some(c => c.erreur || c.exclus);
  // Cache, déduplication, alertes et journal réussissent ensemble. Une reprise après échec peut tout retenter.
  const publier = store.db.transaction(resultat => {
    alertes.synchroniser(resultat.avis, { complet, t: resultat.succes });
    store.setting.set(CLE, resultat);
  });
  const lire = () => {
    const ancien = store.setting.get(CLE);
    return ancien?.empreinte === inventaire.empreinte ? ancien : { empreinte: inventaire.empreinte, tentative: null, succes: null, erreur: null, avis: [] };
  };
  const etat = () => {
    const s = lire(), liens = alertes.liens();
    return { ...s, avis: s.avis.map(v => ({ ...v, paquets: v.paquets.map(p => ({ ...p, alerte: liens.get(cleVeille(v.id, p)) || null })) })),
      inventaire, encours: Boolean(encours), perime: s.succes != null && now() - s.succes >= JOUR,
      incomplet: !complet, prochain: s.tentative == null ? null : s.erreur ? s.tentative + REESSAI : s.succes + JOUR };
  };
  const actualiser = () => {
    if (ferme) return Promise.resolve();
    if (encours) return encours;
    const avant = lire(), t = now();
    if (avant.tentative != null && t - avant.tentative < (avant.erreur ? REESSAI : JOUR)) {
      // Rattrapage d'un cache frais créé avant les alertes, ou pendant un arrêt de la détection.
      if (!avant.erreur && avant.succes != null) {
        try { publier(avant); }
        catch { store.setting.set(CLE, { ...avant, tentative: t, erreur: 'Publication des alertes indisponible. Nouvel essai dans une heure.' }); }
      }
      return Promise.resolve();
    }
    controle = new AbortController();
    const signal = AbortSignal.any([controle.signal, AbortSignal.timeout(120e3)]);
    const demander = async (chemin, corps) => {
      const res = await fetchImpl(`https://api.osv.dev/v1/${chemin}`, { method: corps ? 'POST' : 'GET', redirect: 'error',
        headers: { accept: 'application/json', ...(corps ? { 'content-type': 'application/json' } : {}) },
        ...(corps ? { body: JSON.stringify(corps) } : {}), signal: AbortSignal.any([signal, AbortSignal.timeout(30e3)]) });
      if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new Error('Source OSV indisponible.'); }
      return JSON.parse(await readLimited(res, 2 * 1024 * 1024));
    };
    encours = (async () => {
      await Promise.resolve();
      try {
        if (!inventaire.paquets.length) throw new Error('Aucune bibliothèque interrogeable.');
        const correspondances = new Map();
        let liens = 0;
        for (let debut = 0; debut < inventaire.paquets.length; debut += 100) {
          let suite = inventaire.paquets.slice(debut, debut + 100).map(p => ({ p, token: undefined }));
          for (let page = 0; suite.length; page++) {
            if (page >= 10) throw new Error('Pagination OSV trop grande.');
            const r = await demander('querybatch', { queries: suite.map(({ p, token }) => ({ package: { ecosystem: 'npm', name: p.nom }, version: p.version, ...(token ? { page_token: token } : {}) })) });
            if (!Array.isArray(r.results) || r.results.length !== suite.length) throw new Error('Réponse OSV incomplète.');
            const suivante = [];
            for (let i = 0; i < suite.length; i++) {
              const x = r.results[i], { p } = suite[i];
              if (!objet(x) || x.error || (x.vulns != null && !Array.isArray(x.vulns))) throw new Error('Réponse OSV illisible.');
              for (const v of x.vulns || []) {
                if (typeof v?.id !== 'string' || !ID.test(v.id)) throw new Error('Identifiant OSV illisible.');
                if (!correspondances.has(v.id)) correspondances.set(v.id, new Set());
                if (!correspondances.get(v.id).has(p) && ++liens > 5000) throw new Error('Trop de correspondances OSV.');
                correspondances.get(v.id).add(p);
                if (correspondances.size > MAX_AVIS) throw new Error('Trop d’avis OSV.');
              }
              if (x.next_page_token) {
                if (typeof x.next_page_token !== 'string' || x.next_page_token.length > 2000) throw new Error('Pagination OSV illisible.');
                suivante.push({ p, token: x.next_page_token });
              }
            }
            suite = suivante;
          }
        }
        const avis = [];
        // Quatre lectures à la fois ; chaque lot se termine avant une écriture ou la fermeture de la base.
        const ids = [...correspondances];
        for (let i = 0; i < ids.length; i += 4) {
          const lot = await Promise.allSettled(ids.slice(i, i + 4).map(async ([id, ps]) => reduireAvis(await demander(`vulns/${encodeURIComponent(id)}`), id, [...ps])));
          if (lot.some(x => x.status === 'rejected')) throw new Error('Détail des avis OSV incomplet.');
          avis.push(...lot.map(x => x.value).filter(Boolean));
        }
        const ordre = Object.keys(GRAVITES);
        avis.sort((a, b) => ordre.indexOf(a.gravite) - ordre.indexOf(b.gravite) || a.id.localeCompare(b.id));
        const resultat = { empreinte: inventaire.empreinte, tentative: t, succes: now(), erreur: null, avis };
        if (Buffer.byteLength(JSON.stringify(resultat)) > 5 * 1024 * 1024) throw new Error('Résultats OSV trop grands.');
        if (!ferme) publier(resultat);
      } catch {
        // Pas de corps distant dans les logs ni de résultat partiel présenté comme une vérification réussie.
        if (!ferme) store.setting.set(CLE, { ...avant, tentative: t, erreur: 'Vérification incomplète ou source OSV indisponible. Nouvel essai dans une heure.' });
      } finally { encours = null; controle = null; }
    })();
    return encours;
  };
  return { etat, actualiser, async close() { ferme = true; controle?.abort(); await encours; } };
}
