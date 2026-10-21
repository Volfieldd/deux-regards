// Mesures de durée qui tiennent sous la charge de la machine (plusieurs agents en parallèle, charge de 60 à 95 sur 16
// cœurs). La charge ne fait qu'allonger une mesure, jamais la raccourcir : on garde donc la plus courte de plusieurs
// essais, et on compare des durées entre elles plutôt qu'à un seuil absolu en millisecondes.
// Règle : mesurer le travail (appels, pas) ou comparer des durées relatives ; jamais un seuil absolu seul.

// Plus courte durée (ms) de `essais` exécutions de `fn`.
export function meilleur(fn, essais = 5) {
  let best = Infinity;
  for (let i = 0; i < essais; i++) { const t0 = performance.now(); fn(); best = Math.min(best, performance.now() - t0); }
  return best;
}

// Idem pour une fonction asynchrone.
export async function meilleurAsync(fn, essais = 3) {
  let best = Infinity;
  for (let i = 0; i < essais; i++) { const t0 = performance.now(); await fn(); best = Math.min(best, performance.now() - t0); }
  return best;
}

// Attend qu'une condition soit vraie : on l'interroge jusqu'à une échéance large (30 s), jamais un nombre fixe de
// tentatives. Une attente n'est pas une mesure : la lenteur de la machine retarde le test sans le faire échouer, et
// seul un état qui n'arrive jamais l'échoue. Rend la dernière valeur lue.
export async function attendre(lire, fini, { echeance = 30_000, pas = 20 } = {}) {
  const fin = performance.now() + echeance;
  let v = await lire();
  while (!fini(v) && performance.now() < fin) { await new Promise(r => setTimeout(r, pas)); v = await lire(); }
  return v;
}
