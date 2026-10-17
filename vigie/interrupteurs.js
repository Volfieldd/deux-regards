// Trois interrupteurs généraux (annexe architecture, section 6.1) : détection, alertes, blocages automatiques. Arrêtés
// pour une durée, ils se rallument seuls ; chaque changement est un événement. Les règles (phase C) les consultent.
import { parseDuration } from './decisions.js';

export const SWITCHES = ['detection', 'alertes', 'blocages'];

export function createSwitches({ store, now = Date.now }) {
  const read = () => store.setting.get('interrupteurs', {});
  const isOn = name => { const s = read()[name]; return !s || s.etat === 'marche' || (s.jusqua && s.jusqua <= now()); };
  function set(name, etat, { duree = null, par }) {
    if (!SWITCHES.includes(name)) throw new Error(`interrupteur inconnu : ${name} (${SWITCHES.join(', ')})`);
    if (!['marche', 'arret'].includes(etat)) throw new Error('état attendu : marche ou arret');
    const jusqua = etat === 'arret' && duree ? now() + parseDuration(duree) : null;
    store.setting.set('interrupteurs', { ...read(), [name]: { etat, jusqua, par, a: now() } });
    store.own('vigie_interrupteur', { emetteur: par, detail: { interrupteur: name, etat, jusqua } });
  }
  const state = () => Object.fromEntries(SWITCHES.map(n => [n, { marche: isOn(n), ...(read()[n] || {}) }]));
  return { isOn, set, state };
}
