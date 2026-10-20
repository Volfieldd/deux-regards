// Plan d'installation : chaque élément est inspecté d'abord (lectures seules), puis appliqué dans l'ordre après
// confirmation. Un élément déjà en place n'est jamais refait ; un échec arrête la suite (les éléments suivants dépendent
// souvent des précédents) et un nouveau lancement reprend là où il s'est arrêté.

// etat : « ok » (déjà en place), « creer », « modifier », « alerte » (à lire, rien n'est fait), « manuel » (à faire à la
// main, rappelé à la fin).
export function element(domaine, libelle, etat, { detail, appliquer } = {}) {
  return { domaine, libelle, etat, detail, appliquer };
}

const SYMBOLES = { ok: ['vert', '✔'], creer: ['cyan', '+'], modifier: ['jaune', '~'], alerte: ['jaune', '⚠'], manuel: ['pale', '☐'] };

export function afficherPlan(ui, plan) {
  const domaines = [...new Set(plan.map(e => e.domaine))];
  for (const d of domaines) {
    ui.ecrire(ui.c.gras(d));
    for (const e of plan.filter(x => x.domaine === d)) {
      const [teinte, s] = SYMBOLES[e.etat] || ['pale', '?'];
      ui.ecrire(`  ${ui.c[teinte](s)} ${e.libelle}${e.etat === 'ok' ? ui.c.pale(' (déjà en place)') : ''}`);
      if (e.detail && e.etat !== 'ok') for (const l of String(e.detail).split('\n')) ui.ecrire(`      ${ui.c.pale(l)}`);
    }
    ui.ecrire();
  }
  const n = k => plan.filter(e => e.etat === k).length;
  ui.ecrire(`${n('creer')} à créer, ${n('modifier')} à modifier, ${n('ok')} déjà en place${n('alerte') ? `, ${n('alerte')} à lire` : ''}.`);
}

export async function appliquerPlan(ui, plan) {
  for (const e of plan) {
    if (!['creer', 'modifier'].includes(e.etat) || !e.appliquer) continue;
    try {
      const note = await e.appliquer();
      ui.ok(`${e.domaine} : ${e.libelle}${typeof note === 'string' && note ? ui.c.pale(` — ${note}`) : ''}`);
    } catch (err) {
      ui.echec(`${e.domaine} : ${e.libelle}`);
      err.etape = e;
      throw err;
    }
  }
}
