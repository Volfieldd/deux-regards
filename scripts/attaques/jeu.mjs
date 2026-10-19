import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { graine, demarrer, lire, Navigateur, Equipe, UA } from './banc.mjs';

// Moteur du jeu d'attaques : pour chaque scénario, un banc neuf (site et Vigie), une préparation commune (l'équipe
// existe, l'administrateur s'est connecté depuis son bureau, la Vigie a contrôlé une sauvegarde du site), puis le
// scénario, qui joue ses requêtes et vérifie, étape par étape, ce que la Vigie en a fait.

export const BUREAU = { ip: '192.0.2.10', ua: UA.mac, pays: 'FR' };        // poste habituel de l'administrateur

// Attentes (une étape = une analyse puis ces vérifications, sur ce qui s'est passé depuis l'étape précédente) :
//   { alerte: 'sigma.x', entite: 'compte:local:julien', gravite?, mode? }   alerte ouverte (ou mise à jour) ;
//   { pasAlerte: 'sigma.x' | undefined, entite? }                         aucune alerte de cette règle (ou sur l'entité) ;
//   { aucuneAlerte: true }                                                aucune alerte du tout ;
//   { signal: 'sigma.x', entite }                                         signal noté (points déposés, quorum) ;
//   { pasSignal: 'sigma.x', entite? } ;
//   { decision: 'bloquer', cible }  /  { pasDecision: 'bloquer' | undefined } ;
//   { score: 'ip:203.0.113.9', min, sources? }                            score de l'entité, sources du quorum.
// Chacune peut porter « trou » (constat du jeu : l'attente est juste, la Vigie ou le site ne la tiennent pas encore ;
// le scénario échoue tant que le trou n'est pas comblé) et « note » (explication affichée).
const cle = e => (e ? `${e.kind}:${e.key}` : '');
function evaluer(a, r, banc) {
  const alertes = r.alertes, quoi = x => `${x.regle} · ${x.entite_kind}:${x.entite_key} · ${x.gravite} · ${x.mode}`;
  const memeEntite = (x, ent) => !ent || `${x.entite_kind}:${x.entite_key}` === ent;
  if (a.alerte) {
    const trouvees = alertes.filter(x => x.regle === a.alerte && memeEntite(x, a.entite));
    const bonne = trouvees.find(x => (!a.gravite || x.gravite === a.gravite) && (!a.mode || x.mode === a.mode));
    return { libelle: `alerte ${a.alerte} sur ${a.entite || '(toute entité)'}${a.gravite ? ` (${a.gravite})` : ''}${a.mode ? ` [${a.mode}]` : ''}`, ok: Boolean(bonne),
      detail: bonne ? `n° ${bonne.id}, ${bonne.compteur} événement(s), sources ${bonne.sources}${bonne.reponse ? `, réponse : ${bonne.reponse}` : ''}`
        : trouvees.length ? `trouvée autrement : ${trouvees.map(quoi).join(' ; ')}` : `absente ; alertes de l'étape : ${alertes.map(quoi).join(' ; ') || 'aucune'}` };
  }
  if ('pasAlerte' in a) {
    const t = alertes.filter(x => (!a.pasAlerte || x.regle === a.pasAlerte) && memeEntite(x, a.entite));
    return { libelle: `pas d'alerte ${a.pasAlerte || ''}${a.entite ? ` sur ${a.entite}` : ''}`.replace(/\s+/g, ' '), ok: !t.length, detail: t.length ? `ouverte : ${t.map(quoi).join(' ; ')}` : '' };
  }
  if (a.aucuneAlerte) return { libelle: 'aucune alerte', ok: !alertes.length, detail: alertes.length ? alertes.map(quoi).join(' ; ') : '' };
  if (a.signal || 'pasSignal' in a) {
    const regle = a.signal || a.pasSignal;
    const t = r.signaux.filter(s => (!regle || s.regle === regle) && (!a.entite || cle(s.entite) === a.entite));
    const ok = a.signal ? t.length > 0 : t.length === 0;
    const vus = [...new Set(r.signaux.map(s => `${s.regle} · ${cle(s.entite)}`))];
    return { libelle: `${a.signal ? 'signal' : 'pas de signal'} ${regle || ''} sur ${a.entite || '(toute entité)'}`, ok,
      detail: a.signal ? (ok ? `gravité ${t[0].gravite}` : `absent ; signaux de l'étape : ${vus.join(' ; ') || 'aucun'}`) : (ok ? '' : `noté : ${t.map(s => s.regle).join(', ')}`) };
  }
  if (a.decision || 'pasDecision' in a) {
    const kind = a.decision || a.pasDecision;
    const t = r.decisions.filter(d => (!kind || d.kind === kind) && (!a.cible || d.cible === a.cible));
    const ok = a.decision ? t.length > 0 : t.length === 0;
    return { libelle: `${a.decision ? 'décision' : 'pas de décision'} ${kind || ''} ${a.cible || ''}`.trim(), ok,
      detail: t.length ? t.map(d => `${d.kind} ${d.cible} par ${d.par}`).join(' ; ') : r.decisions.length ? `autres : ${r.decisions.map(d => `${d.kind} ${d.cible}`).join(' ; ')}` : 'aucune décision' };
  }
  if (a.score) {
    const [kind, ...rest] = a.score.split(':');
    const e = banc.vigie.engine.current(kind, rest.join(':'));
    const score = e ? Math.round(e.score * 10) / 10 : 0;
    const sources = e ? Object.entries(e.contributions).filter(([s, v]) => s !== 'menaces' && s !== 'contexte' && v >= 0.5).map(([s]) => s).sort() : [];
    const ok = score >= (a.min ?? 0.1) && (!a.sources || JSON.stringify(sources) === JSON.stringify([...a.sources].sort()));
    return { libelle: `score de ${a.score} ≥ ${a.min ?? 0.1}${a.sources ? ` (sources ${a.sources.join(' + ')})` : ''}`, ok, detail: `score ${score}, sources ${sources.join(' + ') || 'aucune'}` };
  }
  throw new Error(`attente inconnue : ${JSON.stringify(a)}`);
}

// Contexte remis à un scénario.
function contexte(banc, resultats) {
  let depuis = { at: banc.debut, ...banc.repere() };
  const ctx = {
    banc, UA, BUREAU,
    nav: opts => new Navigateur(banc, opts),
    equipe: opts => new Equipe(banc, opts),
    analyser: () => banc.analyser(),
    // Étape : analyse, puis attentes vérifiées sur ce qui s'est passé depuis l'étape précédente.
    async verifier(etape, attentes) {
      await banc.analyser();
      const r = lire(banc, depuis);
      for (const a of attentes) {
        const v = evaluer(a, r, banc);
        resultats.push({ etape, ...v, trou: a.trou, note: a.note });
      }
      const autres = r.alertes.filter(x => !attentes.some(a => a.alerte === x.regle && (!a.entite || a.entite === `${x.entite_kind}:${x.entite_key}`)));
      if (autres.length) resultats.push({ etape, info: true, libelle: 'autres alertes de l\'étape', detail: autres.map(x => `${x.regle} · ${x.entite_kind}:${x.entite_key} · ${x.gravite}`).join(' ; ') });
      depuis = banc.repere();
      return r;
    },
    // Constat fait par le scénario lui-même (réponse HTTP, application d'une décision).
    constat(etape, libelle, ok, detail = '', { trou, note } = {}) { resultats.push({ etape, libelle, ok: Boolean(ok), detail, trou, note }); },
    note(etape, texte) { resultats.push({ etape, info: true, libelle: texte, detail: '' }); },
  };
  return ctx;
}

// Préparation commune : comptes de l'équipe (Julien, administrateur, connexion de test ; Sébastien, photographe, compte
// lié), première connexion de l'administrateur depuis son bureau, sauvegarde du site contrôlée par la Vigie.
async function preparer(banc) {
  const { app, db } = banc;
  app.accounts.ensure({ sub: 'zitadel-sebastien', name: 'Sébastien', roles: ['photographe'] });
  const seb = app.accounts.bySub('zitadel-sebastien');
  app.accounts.update(seb.id, { authorId: db.prepare("SELECT id FROM authors WHERE slug = 'sebastien'").pluck().get() }, 'banc');
  const julien = new Equipe(banc, BUREAU);
  const r = await julien.connecter('julien');
  if (r.status !== 303 || !julien.csrf) throw new Error(`préparation : connexion de l'administrateur refusée (${r.status})`);
  const controle = await banc.sauvegarder();
  if (controle?.ok === false) throw new Error(`préparation : contrôle des rôles en échec (${controle.erreur})`);
  return { julien };
}

export async function jouerScenarios(scenarios, { garder = false, racine = null, log = () => {} } = {}) {
  const base = racine || fs.mkdtempSync(path.join(os.tmpdir(), 'nicephos-attaques-'));
  const t0 = Date.now();
  log(`Graine de démonstration dans ${base}…`);
  const graineDir = await graine(base);
  log(`Graine prête (${Math.round((Date.now() - t0) / 100) / 10} s).`);
  const sortie = [];
  try {
    for (const s of scenarios) {
      const debut = Date.now();
      const resultats = [];
      let banc = null, erreur = null;
      try {
        banc = await demarrer({ racine: base, graineDir, nom: s.nom, preparer: s.preparerBase, bordure: s.bordure });
        const prep = await preparer(banc);
        banc.debut = Date.now();
        const ctx = contexte(banc, resultats);
        await s.jouer({ ...ctx, ...prep });
      } catch (err) { erreur = err; } finally { await banc?.fermer({ garder }).catch(() => {}); }
      const echecs = resultats.filter(x => !x.info && !x.ok);
      sortie.push({ scenario: s, resultats, erreur, ok: !erreur && !echecs.length, duree: Date.now() - debut });
      log(`${!erreur && !echecs.length ? '✓' : '✗'} ${s.nom} (${Math.round((Date.now() - debut) / 100) / 10} s)`);
    }
  } finally {
    if (!garder) fs.rmSync(base, { recursive: true, force: true });
  }
  return { racine: base, resultats: sortie, duree: Date.now() - t0, garde: garder };
}

// Rapport lisible : ✓ / ✗ par scénario, ce qui manque, les trous constatés.
export function rapport({ resultats, duree, racine, garde }) {
  const lignes = [];
  const ok = resultats.filter(r => r.ok).length;
  lignes.push('', 'Jeu d’attaques de la Vigie', '='.repeat(26), '');
  for (const r of resultats) {
    const s = r.scenario;
    lignes.push(`${r.ok ? '✓' : '✗'} ${s.nom} — ${s.titre} (${[].concat(s.cas).join(', ')}) · ${Math.round(r.duree / 100) / 10} s`);
    if (r.erreur) lignes.push(`    ✗ erreur : ${r.erreur.stack?.split('\n').slice(0, 3).join(' | ') || r.erreur}`);
    for (const x of r.resultats) {
      if (x.info) { lignes.push(`    · [${x.etape}] ${x.libelle}${x.detail ? ` : ${x.detail}` : ''}`); continue; }
      if (x.ok && !x.note) { lignes.push(`    ✓ [${x.etape}] ${x.libelle}${x.detail ? ` — ${x.detail}` : ''}`); continue; }
      lignes.push(`    ${x.ok ? '✓' : '✗'} [${x.etape}] ${x.libelle}${x.detail ? ` — ${x.detail}` : ''}`);
      if (x.note) lignes.push(`        note : ${x.note}`);
      if (!x.ok && x.trou) lignes.push(`        trou constaté : ${x.trou}`);
    }
  }
  lignes.push('', `${ok} / ${resultats.length} scénario(s) verts en ${Math.round(duree / 1000)} s.`);
  if (garde) lignes.push(`Dossiers gardés : ${racine}`);
  return lignes.join('\n');
}
