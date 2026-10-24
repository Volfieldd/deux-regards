// Journal de l'admin v2 (UX-A-19) : un libellé lisible pour chaque action notée (plus de « POST /admin/… » à l'écran),
// une famille pour filtrer, la cible nommée et cliquable, les connexions d'un même jour regroupées. Les lignes sont
// celles de la v1 (app.audit.list) : rien n'est lu en plus ; la cible reste l'identifiant noté par la route (« Photo
// n° 12 »), jamais un nom tiré de la base (aucune donnée personnelle de plus). Les libellés sont en français, traduits
// par l'admin (server/admin-i18n/) ; test/admin-v2-suivi.test.js échoue si une route d'écriture de l'admin n'en a pas.

// Actions notées par leur adresse (le crochet onResponse de server/routes/admin.js : « POST /admin/… »), et lectures
// notées (config.audit : exports, originaux).
export const LIBELLES = {
  'POST /admin/apparence/compositions': 'Thèmes par rubrique enregistrés',
  'POST /admin/apparence': 'Identité et apparence enregistrées',
  'POST /admin/apparence/apercu-v2': 'Vue du site public changée pour la session',
  'POST /admin/apparence/marque/:slot': 'Logo envoyé',
  'POST /admin/apparence/marque/:slot/delete': 'Logo retiré',
  'POST /admin/auteurs': 'Photographe ajouté',
  'POST /admin/auteurs/:id': 'Photographe modifié',
  'POST /admin/auteurs/:id/delete': 'Photographe supprimé',
  'POST /admin/a-valider': 'Photos validées',
  'POST /admin/carnet': 'Billet créé',
  'POST /admin/carnet/:id': 'Billet enregistré',
  'POST /admin/carnet/:id/apercu': 'Aperçu d’un billet',
  'POST /admin/carnet/:id/brouillon': 'Brouillon d’un billet enregistré',
  'POST /admin/carnet/:id/brouillon/ecarter': 'Brouillon d’un billet écarté',
  'POST /admin/carnet/:id/photos/:n': 'Photo d’un billet réglée',
  'POST /admin/carnet/:id/proposer': 'Billet proposé',
  'POST /admin/carnet/:id/publier': 'Billet publié ou programmé',
  'POST /admin/carnet/:id/supprimer': 'Billet supprimé',
  'POST /admin/carnet/:id/traduire': 'Traduction d’un billet demandée',
  'POST /admin/carnet/:id/versions/:rev/retablir': 'Version d’un billet rétablie',
  'POST /admin/carnet/reglages': 'Réglages des Carnets enregistrés',
  'POST /admin/saisons': 'Exposition créée',
  'POST /admin/saisons/accueil': 'Exposition de l’accueil choisie',
  'POST /admin/saisons/:id': 'Exposition enregistrée',
  'POST /admin/saisons/:id/programmer': 'Exposition programmée',
  'POST /admin/saisons/:id/ouvrir': 'Ouverture de l’exposition validée',
  'POST /admin/saisons/:id/annuler': 'Programmation de l’exposition annulée',
  'POST /admin/saisons/:id/retirer': 'Exposition retirée',
  'POST /admin/saisons/:id/vote/proposer': 'Photos proposées au vote enregistrées',
  'POST /admin/saisons/:id/vote/relire': 'Photos proposées au vote relues',
  'POST /admin/saisons/:id/vote/valider': 'Photos proposées au vote validées',
  'POST /admin/saisons/:id/vote/ordonner': 'Photos proposées au vote réordonnées',
  'POST /admin/circuit/:id': 'Circuit réglé',
  'POST /admin/compte/notifications': 'Avis par e-mail réglés',
  'POST /admin/compte/raccourcis': 'Raccourcis d’une touche réglés',
  'POST /admin/comptes/:id': 'Compte modifié',
  'POST /admin/comptes/:id/supprimer': 'Compte supprimé',
  'POST /admin/comptes/test-email': 'E-mail de test envoyé',
  'POST /admin/galeries': 'Galerie privée créée',
  'POST /admin/galeries/:id': 'Galerie privée modifiée',
  'POST /admin/galeries/:id/acces': 'Accès à une galerie privée créé',
  'POST /admin/galeries/:id/acces/:inv': 'Accès à une galerie privée modifié',
  'POST /admin/galeries/:id/photos': 'Photos d’une galerie privée réglées',
  'POST /admin/galeries/:id/supprimer': 'Galerie privée supprimée',
  'POST /admin/images': 'Filigrane et EXIF enregistrés',
  'POST /admin/images/apercu': 'Aperçu du filigrane',
  'POST /admin/images/logo': 'Logo du filigrane envoyé',
  'POST /admin/images/logo/delete': 'Logo du filigrane retiré',
  'POST /admin/instagram/deconnexion': 'Compte Instagram déconnecté',
  'POST /admin/instagram/file': 'Mise en file Instagram',
  'POST /admin/instagram/likes': 'J’aime Instagram relus',
  'POST /admin/instagram/propositions/:pid/renvoyer': 'Proposition Instagram renvoyée',
  'POST /admin/instagram/propositions/:pid/valider': 'Proposition Instagram validée',
  'POST /admin/instagram/reglages': 'Réglages Instagram enregistrés',
  'POST /admin/instagram/reprendre': 'File Instagram reprise',
  'POST /admin/langue': 'Langue de l’admin changée',
  'POST /admin/personnes/:id/detacher': 'Rencontre détachée d’une personne',
  'POST /admin/personnes/:id/ecarter': 'Rapprochement écarté',
  'POST /admin/personnes/:id/effacer': 'Personne effacée',
  'POST /admin/personnes/:id/fusionner': 'Personnes réunies',
  'POST /admin/personnes/:id/photos': 'Photos liées à une personne',
  'POST /admin/personnes/:id/rattacher': 'Rencontre rattachée à une personne',
  'POST /admin/personnes/:id/sortie': 'Personne liée à une sortie',
  'POST /admin/photos/actions': 'Action sur plusieurs photos',
  'POST /admin/photos/envoi': 'Photos envoyées',
  'POST /admin/photos/:id': 'Fiche photo enregistrée',
  'POST /admin/photos/:id/champs': 'Photo modifiée',
  'POST /admin/photos/:id/delete': 'Photo supprimée',
  'POST /admin/photos/:id/deprogrammer': 'Programmation annulée',
  'POST /admin/photos/:id/depublier': 'Photo dépubliée',
  'POST /admin/photos/:id/description': 'Description suggérée demandée',
  'POST /admin/photos/:id/instagram/demande': 'Demande d’accord Instagram',
  'POST /admin/photos/:id/instagram/proposer': 'Photo proposée pour Instagram',
  'POST /admin/photos/:id/instagram/retirer-proposition': 'Proposition Instagram retirée',
  'POST /admin/photos/:id/move': 'Photo déplacée',
  'POST /admin/photos/:id/proposer': 'Photo proposée',
  'POST /admin/photos/:id/remarques': 'Remarque adressée au photographe',
  'POST /admin/photos/:id/renvoyer': 'Photo renvoyée au photographe',
  'POST /admin/photos/:id/retirer-proposition': 'Proposition retirée',
  'POST /admin/photos/:id/serie': 'Série de la photo changée',
  'POST /admin/photos/:id/status': 'Statut de la photo changé',
  'POST /admin/photos/:id/textes': 'Textes de la photo modifiés',
  'POST /admin/photos/:id/valider': 'Photo validée',
  'POST /admin/photos/:id/verifier': 'Accords de la photo confirmés',
  'POST /admin/photos/:id/visages': 'Visages de la photo indiqués',
  'POST /admin/photos/import': 'Photos importées',
  'POST /admin/photos/lot': 'Lot de photos enregistré',
  'POST /admin/photos/order': 'Ordre des photos changé',
  'POST /admin/preuves/reessayer': 'Preuves d’antériorité relancées',
  'POST /admin/reglages': 'Réglages enregistrés',
  'POST /admin/remarques/:id/fait': 'Remarque faite',
  'POST /admin/rencontre': 'Rencontre saisie sur le terrain',
  'POST /admin/rencontre/:id/envoyer': 'Récapitulatif d’une rencontre envoyé',
  'POST /admin/rencontres': 'Carte signée saisie',
  'POST /admin/rencontres/cartes': 'Cartes d’accord préparées',
  'POST /admin/rencontres/:id': 'Rencontre modifiée',
  'POST /admin/rencontres/:id/droits-traites': 'Demande de droits traitée',
  'POST /admin/rencontres/:id/effacer': 'Rencontre effacée',
  'POST /admin/rencontres/:id/liens': 'Photo offerte',
  'POST /admin/rencontres/:id/liens/:token/retirer': 'Photo offerte retirée',
  'POST /admin/rencontres/:id/photos': 'Photos liées à une rencontre',
  'POST /admin/rencontres/:id/photos/:pid/retirer': 'Photo retirée d’une rencontre',
  'POST /admin/rencontres/:id/refus': 'Refus appliqué',
  'POST /admin/rencontres/:id/session/:pid': 'Photo exclue de la rencontre',
  'POST /admin/rencontres/:id/statut': 'Suivi d’une rencontre changé',
  'POST /admin/rencontres/:id/supprimer': 'Rencontre supprimée',
  'POST /admin/messages/:id/supprimer': 'Message supprimé',
  'POST /admin/messages/:id/traite': 'Message traité',
  'POST /admin/series': 'Série créée',
  'POST /admin/series/descriptions': 'Assistant « Décrire les photos » réglé',
  'POST /admin/series/:id': 'Série modifiée',
  'POST /admin/series/:id/delete': 'Série supprimée',
  'POST /admin/series/:id/move': 'Série déplacée',
  'POST /admin/series/order': 'Ordre des séries changé',
  'POST /admin/series/propositions': 'Assistant « Proposer une série » réglé',
  'POST /admin/signalements/:id/supprimer': 'Signalement supprimé',
  'POST /admin/signalements/:id/traite': 'Signalement traité',
  'POST /admin/sorties/:author/:day/couper': 'Sortie coupée en deux',
  'POST /admin/sorties/:author/:day/lieu': 'Lieu d’une sortie enregistré',
  'POST /admin/sorties/:author/:day/photos': 'Photos d’une sortie liées',
  'POST /admin/sorties/:author/:day/proposer': 'Sortie proposée',
  'POST /admin/sorties/:author/:day/publier': 'Sortie publiée',
  'POST /admin/sorties/:author/:day/reunir': 'Sorties réunies',
  'POST /admin/sorties/:author/:day/voyage': 'Sortie rangée dans un voyage',
  'POST /admin/theme': 'Mode clair ou sombre changé',
  'POST /admin/traduction': 'Traduction proposée',
  'POST /admin/version': 'Version de l’admin choisie',
  'POST /admin/voyages': 'Voyage créé',
  'POST /admin/voyages/:id': 'Voyage modifié',
  'POST /admin/voyages/:id/journees': 'Journées ajoutées à un voyage',
  'POST /admin/voyages/:id/journees/retirer': 'Journée retirée d’un voyage',
  'POST /admin/voyages/:id/proposer': 'Photos d’un voyage proposées',
  'POST /admin/voyages/:id/publier': 'Photos d’un voyage publiées',
  'POST /admin/voyages/:id/supprimer': 'Voyage supprimé',
  // Lectures notées (exports RGPD, originaux avec leur GPS, sélection d'une galerie privée).
  'GET /admin/rencontres/:id/export.zip': 'Rencontre exportée',
  'GET /admin/personnes/:id/export.zip': 'Personne exportée',
  'GET /admin/photos/:id/original': 'Original téléchargé',
  'GET /admin/galeries/:id/acces/:inv/selection.csv': 'Sélection d’une galerie privée exportée',
  // Actions notées par leur nom (server/auth.js, comptes, circuit, Instagram).
  'connexion': 'Connexion',
  'connexion (test)': 'Connexion (test)',
  'connexion en attente d’un rôle': 'Connexion en attente d’un rôle',
  'connexion refusée (compte désactivé)': 'Connexion refusée (compte désactivé)',
  'identité confirmée': 'Identité confirmée',
  'identité confirmée (test)': 'Identité confirmée (test)',
  'vérification d’identité refusée (authentification ancienne)': 'Vérification d’identité refusée (authentification ancienne)',
  'vérification d’identité refusée (autre compte)': 'Vérification d’identité refusée (autre compte)',
  'compte modifié': 'Compte modifié',
  'compte supprimé': 'Compte supprimé',
  'compte rétabli par ADMIN_SUBS': 'Compte rétabli par l’administrateur du serveur',
  'circuit réglé': 'Circuit réglé',
  'message lu': 'Message lu',
  'compte Instagram connecté': 'Compte Instagram connecté',
};

// Familles (filtre « Type ») : l'ordre est celui des puces.
export const FAMILLES = ['publication', 'personnes', 'equipe', 'reglages', 'lectures', 'connexions'];
export const FAMILLE_NOMS = { publication: 'Photos et publication', personnes: 'Personnes et galeries', equipe: 'Comptes et droits', reglages: 'Réglages du site', lectures: 'Exports et originaux', connexions: 'Connexions' };

export function famille(action) {
  const a = String(action || '');
  if (/^(connexion|identité confirmée|vérification d’identité)/.test(a)) return 'connexions';
  if (a.startsWith('GET ') || a === 'message lu') return 'lectures';
  if (a.startsWith('galerie privée') || /^POST \/admin\/(rencontres?|personnes|signalements|messages|galeries)\b/.test(a)) return 'personnes';
  if (/^(compte (modifié|supprimé|rétabli)|circuit réglé)/.test(a) || /^POST \/admin\/(comptes|circuit|auteurs|compte\/)/.test(a)) return 'equipe';
  if (/^POST \/admin\/(apparence|reglages|images|traduction|langue|theme|version|carnet\/reglages|instagram\/reglages|series\/(propositions|descriptions))\b/.test(a)) return 'reglages';
  return 'publication';
}

// Libellé (clé française) d'une action ; null si inconnue (la v2 montre alors l'action telle quelle, en petit).
export function libelle(action) {
  const a = String(action || '');
  if (Object.hasOwn(LIBELLES, a)) return LIBELLES[a];
  return null;
}

// Cible : l'objet de l'action, d'après l'adresse de la route et l'identifiant noté (« 12 », « sebastien / 2025-10-12 »).
// { kind, id, href } ; kind est la clé française du nom (« Photo n° {id} ») ; href seulement vers une page de l'admin.
const OBJETS = [
  [/^POST \/admin\/photos\/:id\b/, 'Photo n° {id}', id => `/admin/photos/${id}`],
  [/^GET \/admin\/photos\/:id\b/, 'Photo n° {id}', id => `/admin/photos/${id}`],
  [/^POST \/admin\/series\/:id\b/, 'Série n° {id}', () => '/admin/series'],
  [/^POST \/admin\/voyages\/:id\b/, 'Voyage n° {id}', id => `/admin/voyages/${id}`],
  [/^(POST|GET) \/admin\/rencontres?\/:id\b/, 'Rencontre n° {id}', id => `/admin/rencontres/${id}`],
  [/^(POST|GET) \/admin\/personnes\/:id\b/, 'Personne n° {id}', id => `/admin/personnes/${id}`],
  [/^POST \/admin\/carnet\/:id\b/, 'Billet n° {id}', id => `/admin/carnet/${id}`],
  [/^POST \/admin\/saisons\/:id\b/, 'Exposition n° {id}', id => `/admin/saisons/${id}`],
  [/^(POST|GET) \/admin\/galeries\/:id\b/, 'Galerie n° {id}', id => `/admin/galeries/${id}`],
  [/^POST \/admin\/signalements\/:id\b/, 'Signalement n° {id}', () => '/admin/signalements'],
  [/^(?:POST \/admin\/messages\/:id\b|message lu$)/, 'Message n° {id}', id => `/admin/messages/${id}`],
  [/^POST \/admin\/comptes\/:id\b/, 'Compte n° {id}', () => '/admin/comptes'],
  [/^POST \/admin\/circuit\/:id\b/, 'Compte n° {id}', () => '/admin/circuit'],
  [/^POST \/admin\/auteurs\/:id\b/, 'Photographe n° {id}', () => '/admin/auteurs'],
  [/^POST \/admin\/remarques\/:id\b/, 'Remarque n° {id}', null],
  [/^POST \/admin\/instagram\/propositions\/:pid\b/, 'Photo n° {id}', id => `/admin/photos/${id}`],
];
export function cible(action, target, nom = '') {
  const a = String(action || ''), tg = String(target ?? '').trim();
  if (!tg) return null;
  // Voyage ou série nommés au moment de l'action : « Voyage « Lisbonne » ». Le numéro seul sinon (lignes d'avant).
  if (nom && /^[0-9]+$/.test(tg.split(' / ')[0])) {
    const id = tg.split(' / ')[0];
    if (/^POST \/admin\/voyages\/:id\b/.test(a)) return { kind: 'Voyage « {nom} »', id, nom, href: /\/supprimer$/.test(a) ? null : `/admin/voyages/${id}` };
    if (/^POST \/admin\/series\/:id\b/.test(a)) return { kind: 'Série « {nom} »', id, nom, href: /\/delete$/.test(a) ? null : '/admin/series' };
  }
  // Sorties : « auteur / jour ».
  const so = /^POST \/admin\/sorties\/:author\/:day\b/.test(a) && /^([a-z0-9-]+) \/ (\d{4}-\d{2}-\d{2})$/.exec(tg);
  if (so) return { kind: 'Sortie du {id}', id: `${so[2]} (${so[1]})`, href: `/admin/sorties/${so[1]}/${so[2]}` };
  for (const [re, kind, href] of OBJETS) {
    if (!re.test(a)) continue;
    const id = tg.split(' / ')[0];
    if (!/^\d+$/.test(id)) break;
    return { kind, id, href: href ? href(id) : null };
  }
  // Compte ou circuit nommés (« compte modifié » → le nom du compte) : la page des comptes ou du circuit.
  if (/^compte (modifié|supprimé)$/.test(a)) return { kind: '{id}', id: tg, href: a === 'compte modifié' ? '/admin/comptes' : null };
  if (a === 'circuit réglé') return { kind: '{id}', id: tg, href: '/admin/circuit' };
  return { kind: '{id}', id: tg, href: null };
}

// Connexions d'un même compte, le même jour (heure de Paris) : une ligne, avec leur nombre et la première heure.
// Les autres lignes restent telles quelles, dans l'ordre (la plus récente d'abord).
const jourDeParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
export const jour = at => jourDeParis.format(new Date(at));
export function regrouper(entries) {
  const out = [];
  const seen = new Map();
  for (const e of entries) {
    if (famille(e.action) !== 'connexions') { out.push({ ...e, n: 1 }); continue; }
    const k = `${jour(e.at)}|${e.sub}|${e.action}|${e.status ?? ''}`;
    const g = seen.get(k);
    if (g) { g.n += 1; g.first = e.at; continue; }
    const row = { ...e, n: 1, first: e.at };
    seen.set(k, row);
    out.push(row);
  }
  return out;
}

// Période (filtre) : la valeur et sa durée en jours ; « tout » : les 13 mois gardés.
export const PERIODES = { '1': 1, '7': 7, '30': 30 };

// ----- Ce que l'écriture du journal note en plus (finitions de l'admin v2) : le titre d'un voyage ou d'une série, et le détail
// d'une action groupée. Jamais une valeur personnelle : le titre d'une rencontre ou d'une personne n'est pas noté (leur cible
// reste « Rencontre n° 12 »). Rangé dans le détail de la ligne, après « champs : … » : « lot : publiees 5 ; nom : Lisbonne ».

// Ce qu'une action groupée a fait (clé du verbe → libellé français au féminin pluriel : des photos).
export const LOTS = ['publiees', 'repassees', 'proposees', 'validees', 'programmees', 'supprimees', 'carte_ajoutees', 'carte_retirees'];
export const LOT_LIBELLES = {
  publiees: 'Publiées', repassees: 'Repassées en brouillon', proposees: 'Proposées', validees: 'Validées', programmees: 'Programmées', supprimees: 'Supprimées',
  carte_ajoutees: 'Mises sur la carte', carte_retirees: 'Retirées de la carte',
};
// À appeler par la route, une fois l'action faite : combien de photos, et ce qui leur est arrivé.
export function noterLot(request, verbe, n) {
  if (LOTS.includes(verbe) && Number.isInteger(n) && n >= 0) request.auditLot = { verbe, n };
}
// Un titre pour une ligne du journal : une ligne, sans caractère de commande, 80 signes au plus ; vide si rien.
export function nomPropre(nom) {
  const s = String(nom ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > 80 ? `${s.slice(0, 79)}…` : s;
}
// Le détail d'une ligne : « champs : … ; lot : publiees 5 ; nom : Lisbonne » (les parties absentes sont omises).
export function detailDe({ champs = '', lot = null, nom = '' } = {}) {
  return [champs ? `champs : ${champs}` : '', lot ? `lot : ${lot.verbe} ${lot.n}` : '', nom ? `nom : ${nom}` : ''].filter(Boolean).join(' ; ');
}
// L'inverse, pour l'affichage : le reste du détail (les champs), l'action groupée et le titre. Le titre est la dernière partie
// (il peut contenir « ; »).
export function extraire(detail) {
  let rest = String(detail ?? ''), nom = '', lot = null;
  const n = /(?:^| ; )nom : ([^]*)$/.exec(rest);
  if (n) { nom = n[1]; rest = rest.slice(0, n.index); }
  const l = /(?:^| ; )lot : ([a-z_]+) (\d+)$/.exec(rest);
  if (l && LOTS.includes(l[1])) { lot = { verbe: l[1], n: Number(l[2]) }; rest = rest.slice(0, l.index); }
  return { reste: rest, lot, nom };
}
