// Famille « normal » : ce que font tous les jours les visiteurs et l'équipe. Aucune alerte attendue : la Vigie doit se
// taire (pas de fatigue de la vigilance, recadrage du 17 octobre 2026).

export default [
  {
    nom: 'parcours-normal',
    famille: 'normal',
    titre: 'Parcours normal : un visiteur navigue ; l’administrateur se connecte, publie un billet, traduit trois titres',
    cas: ['DS4', 'DS9', 'DS11', 'DS18'],
    resume: 'Pages publiques, recherche ordinaire (avec apostrophe), photo, carnet ; connexion de l’administrateur depuis son poste habituel, billet écrit et publié, titres traduits en anglais et en allemand.',
    async jouer(b) {
      const v = b.nav({ ip: '198.51.100.20', ua: b.UA.iphone });
      const accueil = await v.get('/');
      const photos = [...new Set([...accueil.texte.matchAll(/href="(\/photo\/[a-z0-9-]+)"/g)].map(m => m[1]))].slice(0, 3);
      const pages = ['/auteur/julien', '/auteur/sebastien', '/recherche?q=l%27aube sur la Loire', ...photos, '/droits', '/confidentialite', '/mentions-legales'];
      const statuts = [accueil.status];
      for (const p of pages) statuts.push((await v.get(p)).status);
      b.constat('visiteur', 'pages publiques servies (200)', statuts.every(s => s === 200), statuts.join(' '));

      // L'administrateur revient, depuis son bureau.
      const julien = b.equipe(b.BUREAU);
      const r = await julien.connecter('julien');
      b.constat('équipe', 'connexion de l’administrateur', r.status === 303 && Boolean(julien.csrf), String(r.status));
      // Un billet : créé, écrit, publié.
      const cree = await julien.ecrire('/admin/carnet', { title: 'Brume sur la Loire', rubrique: 'voyages' });
      const id = /\/admin\/carnet\/(\d+)/.exec(cree.location || '')?.[1];
      b.constat('équipe', 'billet créé', Boolean(id), `${cree.status} ${cree.location || ''}`);
      if (id) {
        const photo = b.banc.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 1").pluck().get();
        const ecrit = await julien.ecrire(`/admin/carnet/${id}`, { langue: 'fr', title: 'Brume sur la Loire', dek: 'Un matin d’octobre au bord du fleuve.', body: `Le fleuve sort de la nuit.\n\nphoto:${photo}\n\nPuis la lumière.` });
        const publie = await julien.ecrire(`/admin/carnet/${id}/publier`, { langue: 'fr' });
        const etat = b.banc.db.prepare('SELECT state FROM posts WHERE id = ?').pluck().get(Number(id));
        b.constat('équipe', 'billet écrit puis publié', etat === 'publie', `${ecrit.status}, ${publie.status}, état ${etat}`);
      }
      // Trois titres traduits.
      const ids = b.banc.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 3").pluck().all();
      const trad = [];
      for (const [i, pid] of ids.entries()) trad.push((await julien.ecrire(`/admin/photos/${pid}/textes`, { title_en: `Morning mist ${i + 1}`, title_de: `Morgennebel ${i + 1}` })).status);
      b.constat('équipe', 'titres traduits', trad.every(s => s === 303), trad.join(' '));
      await b.verifier('journée ordinaire', [{ aucuneAlerte: true }]);
    },
  },
  {
    nom: 'parcours-traduction',
    famille: 'normal',
    titre: 'Journée de traduction : six photos publiées traduites (titre et légende, en anglais et en allemand)',
    cas: ['DS9'],
    resume: 'L’administrateur traduit, photo par photo, le titre et la légende de six photos en ligne : six envois, quatre textes chacun.',
    async jouer(b) {
      const ids = b.banc.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 6").pluck().all();
      const statuts = [];
      for (const [i, id] of ids.entries()) {
        statuts.push((await b.julien.ecrire(`/admin/photos/${id}/textes`, { title_en: `Morning light ${i + 1}`, title_de: `Morgenlicht ${i + 1}`,
          legend_en: 'The river comes out of the night.', legend_de: 'Der Fluss tritt aus der Nacht.' })).status);
      }
      b.constat('traduction', 'six envois enregistrés', statuts.every(s => s === 303), statuts.join(' '));
      await b.verifier('traduction', [{ aucuneAlerte: true }]);
    },
  },
];
