// Écrans de la console, un module par groupe. Chaque module exporte register(app, ctx) et renvoie la liste des adresses
// de premier niveau qu'il sert (« /alertes »…), pour que la page d'attente ne s'y ajoute pas.
import * as alertes from './alertes.js';
import * as evenements from './evenements.js';
import * as santeFlux from './sante-flux.js';

export const ECRANS = [alertes, evenements, santeFlux];
