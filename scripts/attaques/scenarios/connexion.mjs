// Famille « connexion » : force brute de la connexion de l'admin (vigie/regles/20-connexion.yml).
//
// Jouable : la connexion de test du site (LOCAL_AUTH_TOKEN, même chemin d'émission que l'échec OIDC : authn_login_fail,
// composant « site · connexion »). Les échecs du site ne portent pas de compte (sub) : la connexion OIDC ne sait pas qui
// essaie (le fournisseur garde le mot de passe), et la connexion de test ne l'envoie pas non plus (server/auth.js:354).
// Les règles qui regroupent par compte (cible_commune, DS31 ; détecteur pivot_identifiants, DS25) se nourrissent donc des
// échecs de Zitadel (zitadel_echec, avec le compte visé), que ce banc ne simule pas.

const JULIEN = 'local:julien';

export default [
  {
    nom: 'force-brute-admin',
    famille: 'connexion',
    titre: 'Force brute de la connexion de l’admin depuis une adresse',
    cas: ['DS5'],
    resume: 'Six jetons faux pour le compte de Julien, depuis une adresse, en quelques secondes.',
    async jouer(b) {
      const n = b.equipe({ ip: '203.0.113.30', ua: b.UA.linux, pays: 'RU' });
      const statuts = [];
      for (let i = 0; i < 6; i++) statuts.push((await n.connecter('julien', { jeton: `faux-jeton-${i}-0123456789abcdef` })).status);
      b.constat('essais', 'chaque essai refusé (401)', statuts.every(s => s === 401), statuts.join(' '));
      await b.verifier('essais', [
        { signal: 'sigma.oidc_echecs_repetes', entite: 'ip:203.0.113.30' },
        { score: 'ip:203.0.113.30', min: 7, sources: ['site'] },
        { pasAlerte: 'entite.score', note: 'une seule source (site) : pas d’alerte de score ; Zitadel ou la bordure feraient le quorum' },
        { pasSignal: 'detecteur.pivot_identifiants', note: 'les échecs du site ne portent pas de compte : le pivot (3 échecs puis une connexion d’un même compte) ne se nourrit que de Zitadel' },
      ]);
    },
  },
  {
    nom: 'force-brute-repartie',
    famille: 'connexion',
    titre: 'Essais répartis sur trois adresses contre le compte de l’administrateur',
    cas: ['DS31'],
    resume: 'Deux essais par adresse (sous le seuil de l’adresse), trois adresses, un seul compte visé.',
    async jouer(b) {
      for (const ip of ['203.0.113.31', '198.51.100.31', '192.0.2.131']) {
        const n = b.equipe({ ip, ua: b.UA.linux });
        for (let i = 0; i < 2; i++) await n.connecter('julien', { jeton: `faux-${ip}-${i}-0123456789abcdef` });
      }
      await b.verifier('essais répartis', [
        { pasSignal: 'sigma.oidc_echecs_repetes', note: 'deux essais par adresse : sous le seuil de trois par adresse (voulu)' },
        { pasSignal: 'sigma.cible_commune', entite: `compte:${JULIEN}`,
          note: 'non jouable par le site seul : authn_login_fail sans sub (server/auth.js:274, 283, 354) ; cible_commune groupe par sub (20-connexion.yml) et se nourrit des échecs de Zitadel (zitadel_echec) ; la connexion de test connaît pourtant le compte visé (champ author)' },
        { aucuneAlerte: true },
      ]);
    },
  },
];
