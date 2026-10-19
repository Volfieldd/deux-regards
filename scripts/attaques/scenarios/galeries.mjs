// Famille « galeries privées » (registre des briques BV-16 à BV-25 ; vigie/regles/85-galeries-carnets.yml). Un invité
// n'est jamais un compte : les alertes visent l'accès (entité « site », clé « acces:<n°> »), les points son adresse ou sa
// session visiteur. Toutes les règles sont en mode Alerter le premier mois (Tranché 5) ; seule acces_pays_multiples a
// une réponse automatique (suspendre l'accès), jouée ici après son passage en Bloquer.

const jour = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// Une galerie ouverte de Julien (photos publiées de la démonstration) et un accès pour une invitée. Faite par l'équipe
// avant le scénario (comme dans l'admin) : { s, token, password, invite }.
async function galerie(b, { telecharger = false, groupe = false, n = 4 } = {}) {
  const { app, db } = b.banc;
  const sp = app.spaces;
  const authorId = db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
  const id = sp.createSpace({ title: 'Lisbonne et Porto', closes: jour(60), intro: 'Marquez d’une étoile celles qui vous intéressent.' }, { authorId, by: 'local:julien' });
  sp.addPhotos(id, db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT ?").pluck().all(n));
  sp.setState(id, 'ouverte', null);
  const r = await sp.createInvite(id, { label: 'Lucie Exemple, Éditions du Fleuve', lang: 'fr', expires: jour(30), favoris: '1', ...(telecharger ? { telecharger: '1' } : {}), ...(groupe ? { groupe: '1' } : {}) }, { by: 'local:julien', request: null });
  await b.analyser();
  return { s: sp.get(id), token: r.token, password: r.password, invite: r.id };
}
// Une invitée (ou quelqu'un qui a le lien) entre avec le mot de passe : nouvelle session visiteur.
async function entrer(b, g, opts, password = g.password) {
  const v = b.nav(opts);
  const r = await v.post(`/g/${g.token}`, { password });
  return { v, r };
}
const faux = i => `FAUX-${String(1000 + i).slice(-4)}-ESSA-${String(i).padStart(4, '0')}`;

export default [
  {
    nom: 'galerie-mots-de-passe',
    famille: 'galeries',
    titre: 'Mots de passe faux en série sur un lien d’accès, depuis une adresse',
    cas: ['DS16'],
    resume: 'Dix mots de passe faux en quelques secondes depuis une adresse (le site pose une pause d’une minute au cinquième).',
    async jouer(b) {
      const g = await galerie(b);
      const n = b.nav({ ip: '203.0.113.50', ua: b.UA.linux });
      const statuts = [];
      for (let i = 0; i < 10; i++) statuts.push((await n.post(`/g/${g.token}`, { password: faux(i) })).status);
      b.constat('essais', 'chaque essai refusé (403), pause posée au 5e', statuts.every(s => s === 403) && b.banc.db.prepare('SELECT locked_until FROM space_invites WHERE id = ?').pluck().get(g.invite) > Date.now(), statuts.join(' '));
      await b.verifier('essais', [
        { signal: 'sigma.galerie_echecs_adresse', entite: 'ip:203.0.113.50' },
        { pasAlerte: 'sigma.galerie_suspendue', note: 'une pause n’alerte pas (Tranché 3)' },
        { pasSignal: 'sigma.oidc_echecs_repetes', note: 'les refus d’une galerie ne sont pas une force brute de l’admin' },
        { pasAlerte: 'entite.score' },
      ]);
    },
  },
  {
    nom: 'galerie-essais-repartis',
    famille: 'galeries',
    titre: 'Mot de passe d’un même accès essayé depuis trois adresses (le lien a fui)',
    cas: ['DS31'],
    resume: 'Un essai faux depuis chacune de trois adresses, sur le même lien.',
    async jouer(b) {
      const g = await galerie(b);
      for (const ip of ['203.0.113.51', '198.51.100.52', '192.0.2.53']) await b.nav({ ip, ua: b.UA.firefox }).post(`/g/${g.token}`, { password: faux(1) });
      await b.verifier('essais', [{ alerte: 'sigma.galerie_essais_repartis', entite: `site:acces:${g.invite}`, gravite: 'haut', mode: 'alerter' },
        { pasDecision: undefined, note: 'aucune réponse automatique prévue (alerter)' }]);
    },
  },
  {
    nom: 'galerie-jetons-devines',
    famille: 'galeries',
    titre: 'Liens de galerie devinés (jetons inventés)',
    cas: ['DS16'],
    resume: 'Douze adresses /g/<jeton> inventées depuis une adresse.',
    async jouer(b) {
      await galerie(b);
      const n = b.nav({ ip: '203.0.113.56', ua: b.UA.linux });
      const statuts = [];
      for (let i = 0; i < 12; i++) statuts.push((await n.get(`/g/${(`devine${i}`).padEnd(32, 'x')}`)).status);
      b.constat('jetons', 'chaque jeton inventé : 404 ordinaire', statuts.every(s => s === 404), statuts.join(' '));
      await b.verifier('jetons', [{ signal: 'sigma.enumeration_jetons', entite: 'ip:203.0.113.56' }, { pasAlerte: undefined }]);
    },
  },
  {
    nom: 'galerie-acces-revoque',
    famille: 'galeries',
    titre: 'Accès révoqué encore présenté (cookie gardé, ancien lien rejoué)',
    cas: ['DS1'],
    resume: 'L’invitée est entrée ; l’équipe révoque l’accès dans l’admin ; la session de l’invitée revient, puis quelqu’un rejoue le lien depuis une autre adresse.',
    async jouer(b) {
      const g = await galerie(b);
      const { v, r } = await entrer(b, g, { ip: '198.51.100.30', ua: b.UA.iphone });
      const vue = await v.get(`/prive/${g.s.public_id}`);
      b.constat('entrée', 'l’invitée voit la galerie', r.status === 303 && vue.status === 200, `${r.status}, ${vue.status}`);
      const rev = await b.julien.ecrire(`/admin/galeries/${g.s.id}/acces/${g.invite}/revoquer`);
      b.constat('révocation', 'l’équipe révoque l’accès (admin)', rev.status === 303, String(rev.status));
      const apres = await v.get(`/prive/${g.s.public_id}`);
      const lien = await b.nav({ ip: '203.0.113.57', ua: b.UA.linux }).get(`/g/${g.token}`);
      b.constat('rejeu', 'cookie de l’invitée refusé (404) ; ancien lien : 410', apres.status === 404 && lien.status === 410, `${apres.status}, ${lien.status}`);
      await b.verifier('rejeu', [{ alerte: 'sigma.acces_apres_revocation', entite: `site:acces:${g.invite}`, mode: 'alerter' }]);
    },
  },
  {
    nom: 'galerie-telechargements',
    famille: 'galeries',
    titre: 'Nouvel appareil sur un accès, puis téléchargements en masse',
    cas: ['DS15', 'DS18'],
    resume: 'L’invitée ouvre la galerie sur son téléphone ; un second appareil entre avec le même mot de passe et télécharge 51 fois (limite : 50 par heure).',
    async jouer(b) {
      const g = await galerie(b, { telecharger: true });
      await entrer(b, g, { ip: '198.51.100.31', ua: b.UA.iphone });
      const { v } = await entrer(b, g, { ip: '203.0.113.58', ua: b.UA.linux, pays: 'US' });
      let dernier = null;
      for (let i = 0; i < 51; i++) dernier = await v.get(`/prive/${g.s.public_id}/telecharger/${(i % 4) + 1}/web`);
      b.constat('téléchargements', 'le 51e téléchargement est refusé (renvoi « limite »)', dernier.status === 303 && /telechargements-limite/.test(dernier.location || ''), `${dernier.status} ${dernier.location || ''}`);
      await b.verifier('téléchargements', [
        { alerte: 'sigma.telechargements_en_masse', entite: `site:acces:${g.invite}`, gravite: 'moyen', mode: 'alerter' },
        { alerte: 'sigma.acces_nouvel_appareil_puis_siphonage', entite: `site:acces:${g.invite}`, gravite: 'haut', mode: 'alerter' },
      ]);
    },
  },
  {
    nom: 'galerie-csrf-invite',
    famille: 'galeries',
    titre: 'Formulaires d’une galerie envoyés sans le jeton de la session visiteur',
    cas: ['DS14'],
    resume: 'Une session d’invitée reçoit trois demandes d’archive avec un jeton faux (page tierce qui connaît l’adresse).',
    async jouer(b) {
      const g = await galerie(b, { telecharger: true });
      const { v } = await entrer(b, g, { ip: '198.51.100.32', ua: b.UA.iphone });
      const statuts = [];
      for (let i = 0; i < 3; i++) statuts.push((await v.post(`/prive/${g.s.public_id}/archive`, { csrf: `faux-${i}` })).status);
      b.constat('csrf', 'chaque envoi refusé (403)', statuts.every(s => s === 403), statuts.join(' '));
      await b.verifier('csrf', [{ signal: 'sigma.csrf_repetes_invite' }, { pasSignal: 'sigma.csrf_repetes', note: 'la règle des comptes de l’admin ne compte pas les invités' }, { pasAlerte: undefined }]);
    },
  },
  {
    nom: 'galerie-fuite-pays',
    famille: 'galeries',
    titre: 'Accès personnel ouvert depuis trois pays en une journée ; réponse automatique en mode Bloquer',
    cas: ['DS3'],
    resume: 'Le même lien et le même mot de passe ouvrent la galerie depuis la France, l’Allemagne et le Brésil (mode Alerter, le premier mois). La règle passe en Bloquer : l’attaque continue sur cet accès, puis recommence sur un autre.',
    async jouer(b) {
      const g = await galerie(b);
      for (const [ip, pays] of [['198.51.100.33', 'FR'], ['203.0.113.59', 'DE'], ['192.0.2.60', 'BR']]) await entrer(b, g, { ip, pays, ua: b.UA.iphone });
      await b.verifier('trois pays', [
        { alerte: 'sigma.acces_pays_multiples', entite: `site:acces:${g.invite}`, gravite: 'haut', mode: 'alerter' },
        { pasDecision: 'suspendre_acces', note: 'mode Alerter (Tranché 5) : aucune réponse le premier mois' },
      ]);
      // L'équipe passe la règle en Bloquer pendant que l'accès continue de circuler.
      b.banc.vigie.engine.setMode('sigma.acces_pays_multiples', 'bloquer', 'banc d’attaques');
      for (const [ip, pays] of [['203.0.113.61', 'US'], ['192.0.2.62', 'JP'], ['198.51.100.63', 'CA']]) await entrer(b, g, { ip, pays, ua: b.UA.linux });
      await b.verifier('même accès, mode bloquer', [{ decision: 'suspendre_acces', cible: String(g.invite) }]);
      // Un autre accès qui fuit, la règle déjà en Bloquer.
      const g2 = await galerie(b);
      for (const [ip, pays] of [['198.51.100.64', 'FR'], ['203.0.113.65', 'DE'], ['192.0.2.66', 'BR']]) await entrer(b, g2, { ip, pays, ua: b.UA.iphone });
      await b.verifier('autre accès, mode bloquer', [{ alerte: 'sigma.acces_pays_multiples', entite: `site:acces:${g2.invite}`, mode: 'bloquer' }, { decision: 'suspendre_acces', cible: String(g2.invite) }]);
      const lien = await b.nav({ ip: '198.51.100.67', ua: b.UA.iphone }).get(`/g/${g2.token}`);
      const etat = b.banc.db.prepare('SELECT suspended_at FROM space_invites WHERE id = ?').pluck().get(g2.invite);
      b.constat('autre accès, mode bloquer', 'le site applique la décision : accès suspendu (page « suspendu », 403)', Boolean(etat) && lien.status === 403, `${lien.status}, suspendu ${etat ? 'oui' : 'non'}`);
    },
  },
];
