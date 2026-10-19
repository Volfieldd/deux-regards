// Famille « sessions et droits » : cookie d'une session fermée rejoué depuis un autre appareil (10-preuves.yml, seule
// règle de la famille en mode Bloquer dès le départ), CSRF répétés et exploration des droits (20-connexion.yml,
// 30-exploration.yml), écriture hors portée (85-galeries-carnets.yml).

const JULIEN = 'local:julien', SEBASTIEN = 'zitadel-sebastien';
const attendre = ms => new Promise(r => setTimeout(r, ms));

export default [
  {
    nom: 'cookie-rejoue',
    famille: 'sessions',
    titre: 'Cookie d’une session fermée rejoué depuis un autre appareil',
    cas: ['DS1'],
    resume: 'Julien a deux sessions (bureau, téléphone). Le cookie du bureau est copié, Julien se déconnecte au bureau ; 10 s plus tard, l’attaquant présente le cookie depuis un autre réseau et un autre navigateur.',
    async jouer(b) {
      const telephone = b.equipe({ ip: '192.0.2.11', ua: b.UA.iphone });
      await telephone.connecter('julien');
      const vol = b.equipe({ ip: '203.0.113.40', ua: b.UA.linux, pays: 'NL' }).copierCookies(b.julien);
      const sortie = await b.julien.ecrire('/auth/logout');
      b.constat('déconnexion', 'déconnexion au bureau', sortie.status === 303, String(sortie.status));
      await attendre(10_500);                       // server/auth.js : les requêtes des 10 s qui suivent la fermeture ne comptent pas
      const rejeu = await vol.get('/admin');
      b.constat('rejeu', 'le cookie fermé n’ouvre rien (renvoi à la connexion)', rejeu.status === 302, `${rejeu.status} ${rejeu.location || ''}`);
      await b.verifier('rejeu', [
        { alerte: 'sigma.cookie_rejoue', entite: `compte:${JULIEN}`, gravite: 'haut', mode: 'bloquer' },
        { decision: 'revoquer_compte', cible: JULIEN },
      ]);
      const apres = await telephone.get('/admin');
      b.constat('réponse', 'le site applique la décision : la session du téléphone est fermée (renvoi à la connexion)', apres.status === 302 && /\/auth\/login/.test(apres.location || ''), `${apres.status} ${apres.location || ''}`);
    },
  },
  {
    nom: 'csrf-repetes',
    famille: 'sessions',
    titre: 'Formulaires de l’admin envoyés sans le bon jeton CSRF (page tierce)',
    cas: ['DS14'],
    resume: 'Trois envois d’un formulaire de réglages avec un jeton faux, sur la session de l’administrateur.',
    async jouer(b) {
      const statuts = [];
      for (let i = 0; i < 3; i++) statuts.push((await b.julien.post('/admin/reglages', { _csrf: `faux-${i}`, part: 'site', tagline: 'Accroche changée par une page tierce' })).status);
      b.constat('csrf', 'chaque envoi refusé (403), rien d’enregistré', statuts.every(s => s === 403) && !/page tierce/.test(b.banc.db.prepare("SELECT value FROM settings WHERE key = 'tagline'").pluck().get() || ''), statuts.join(' '));
      await b.verifier('csrf', [
        { signal: 'sigma.csrf_repetes', entite: `compte:${JULIEN}` },
        { pasAlerte: undefined, note: 'points sur le compte, une seule source : pas d’alerte' },
      ]);
    },
  },
  {
    nom: 'exploration-droits',
    famille: 'sessions',
    titre: 'Exploration des droits (IDOR) par un compte de photographe, puis écriture sur le billet d’un autre',
    cas: ['DS10'],
    resume: 'Sébastien (rôle photographe, portée « les miennes ») ouvre une à une les photos de Julien et des pages réservées à l’administrateur, puis tente d’enregistrer le billet de Julien.',
    async jouer(b) {
      const { db, app } = b.banc;
      const seb = b.equipe({ ip: '192.0.2.20', ua: b.UA.firefox });
      const r = await seb.connecter('sebastien');
      b.constat('connexion', 'Sébastien connecté (photographe)', r.status === 303, String(r.status));
      const julienId = db.prepare("SELECT id FROM authors WHERE slug = 'julien'").pluck().get();
      const photos = db.prepare('SELECT id FROM photos WHERE author_id = ? ORDER BY id').pluck().all(julienId);
      const statuts = [];
      for (const id of photos) for (const suite of ['', '/statistiques']) statuts.push((await seb.get(`/admin/photos/${id}${suite}`)).status);
      for (const p of ['/admin/comptes', '/admin/journal', '/admin/droits']) statuts.push((await seb.get(p)).status);
      b.constat('exploration', `${statuts.length} pages refusées (403 ou 404)`, statuts.every(s => s === 403 || s === 404), statuts.join(' '));
      await b.verifier('exploration', [
        { signal: 'sigma.exploration_droits', entite: `compte:${SEBASTIEN}` },
        { pasAlerte: 'sigma.ecriture_hors_portee', note: 'des lectures : exploration seulement (points)' },
      ]);
      // Billet de Julien (fait par l'équipe, hors du scénario), puis écriture de Sébastien dessus.
      const post = app.carnet.create({ title: 'Les quais au matin', rubrique: 'voyages', authors: [julienId], by: { sub: JULIEN, name: 'Julien' } });
      const w = await seb.ecrire(`/admin/carnet/${post}`, { langue: 'fr', title: 'Billet réécrit par un autre' });
      b.constat('écriture', 'écriture refusée (404 comme un billet inconnu)', w.status === 404, String(w.status));
      await b.verifier('écriture', [{ alerte: 'sigma.ecriture_hors_portee', entite: `compte:${SEBASTIEN}`, gravite: 'moyen', mode: 'alerter' }]);
    },
  },
];
