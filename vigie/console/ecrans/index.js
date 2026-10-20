// Écrans de la console, un module par groupe. Chaque module exporte register(app, ctx), qui déclare ses routes.
import * as alertes from './alertes.js';
import * as evenements from './evenements.js';
import * as santeFlux from './sante-flux.js';
import * as decisionsE from './decisions.js';
import * as reglages from './reglages.js';
import * as droits from './droits.js';
import * as actions from '../actions.js';
import * as dossiers from './dossiers.js';

export const ECRANS = [alertes, dossiers, evenements, santeFlux, decisionsE, reglages, droits, actions];
