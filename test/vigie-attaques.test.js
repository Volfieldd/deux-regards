import { test } from 'node:test';
import assert from 'node:assert/strict';

// Jeu d'attaques rejouable de la Vigie (phase E2, scripts/attaques/) : tout le jeu, joué une fois (un site et une Vigie
// neufs par scénario, vraies requêtes HTTP sur 127.0.0.1, rien vers l'extérieur), puis un sous-test par scénario.
// Un trou constaté par le jeu (attente marquée « trou » dans le scénario) est un sous-test « todo » : visible, sans faire
// échouer la suite ; tout autre écart échoue.
process.env.AVIF_EFFORT ??= '0';
const { SCENARIOS } = await import('../scripts/attaques/scenarios/index.mjs');
const { jouerScenarios, rapport } = await import('../scripts/attaques/jeu.mjs');

test('jeu d’attaques : chaque scénario ouvre les alertes attendues, le parcours normal aucune', { timeout: 300_000 }, async t => {
  const r = await jouerScenarios(SCENARIOS);
  t.diagnostic(`${r.resultats.filter(x => x.ok).length} / ${r.resultats.length} scénarios verts en ${Math.round(r.duree / 1000)} s`);
  for (const x of r.resultats) {
    const echecs = x.resultats.filter(y => !y.info && !y.ok);
    const ecarts = echecs.filter(y => !y.trou), trous = echecs.filter(y => y.trou);
    await t.test(x.scenario.nom, () => {
      assert.equal(x.erreur, null, x.erreur?.stack);
      assert.deepEqual(ecarts.map(y => `[${y.etape}] ${y.libelle} — ${y.detail}`), [], rapport({ ...r, resultats: [x] }));
    });
    const marques = x.resultats.filter(y => y.trou);
    if (marques.length) {
      await t.test(`${x.scenario.nom} : trou constaté`, { todo: marques.map(y => y.trou).join(' ; ') }, () => {
        assert.deepEqual(trous.map(y => `[${y.etape}] ${y.libelle} — ${y.detail}`), []);
      });
    }
  }
});
