// Famille « exploration » : ce qu'un robot ou un attaquant fait d'abord sur le site public (pièges, pages introuvables,
// saisies malveillantes, outils d'attaque), et le quorum avec la bordure Cloudflare (Worker simulé).
//
// À savoir pour lire les attentes : ces règles (vigie/regles/30-exploration.yml) déposent des POINTS sur l'adresse ; une
// alerte de score demande le seuil ET deux sources (quorum, décision D18 : vigie/moteur.js, score()). Le site seul ne
// fait donc jamais une alerte : on vérifie le signal noté et le score. Le scénario « quorum-bordure » ajoute la seconde
// source (rafale de pages vue par le Worker) et montre l'alerte, puis la réponse automatique une fois la règle en mode
// Bloquer (après le mois d'observation).

const PIEGES = ['/.env', '/.git/config', '/wp-login.php', '/wp-admin/setup-config.php', '/phpmyadmin/', '/xmlrpc.php', '/.aws/credentials', '/server-status'];
const SAISIES = [
  ['sql', "/recherche?q=' OR 1=1 --"],
  ['sql', '/recherche?q=1 UNION SELECT name FROM sqlite_master'],
  ['xss', '/recherche?q=<script>alert(document.cookie)</script>'],
  ['chemin', '/recherche?q=../../../../etc/passwd'],
  ['gabarit', '/recherche?q={{7*7}}'],
  ['commande', '/recherche?q=;cat /etc/hosts'],
];
const SQLMAP = 'sqlmap/1.8.2#stable (https://sqlmap.org)';

export default [
  {
    nom: 'scanner-pieges',
    famille: 'exploration',
    titre: 'Balayage de scanner : chemins pièges (/.env, /wp-admin…), puis trois adresses d’un même réseau',
    cas: ['DS15'],
    resume: 'Une adresse demande huit chemins que cherchent les scanners ; deux voisines du même /24 en demandent un. Le site répond sa 404 ordinaire.',
    async jouer(b) {
      const scan = b.nav({ ip: '203.0.113.66', ua: 'Mozilla/5.0 (compatible; Scanner/1.0)' });
      const statuts = [];
      for (const p of PIEGES) statuts.push((await scan.get(p)).status);
      b.constat('pièges', 'le site répond 404 à chaque piège (rien ne trahit le piège)', statuts.every(s => s === 404), statuts.join(' '));
      await b.verifier('pièges', [
        { signal: 'sigma.piege', entite: 'ip:203.0.113.66' },
        { score: 'ip:203.0.113.66', min: 2, sources: ['site'] },
        { pasAlerte: 'entite.score', note: 'site seul : une seule source, pas d’alerte de score (quorum D18)' },
      ]);
      for (const ip of ['203.0.113.67', '203.0.113.68']) await b.nav({ ip, ua: 'Mozilla/5.0 (compatible; Scanner/1.0)' }).get('/.env');
      await b.verifier('voisines', [
        { signal: 'sigma.aspiration_distribuee', entite: 'reseau:203.0.113.0' },
        { pasAlerte: undefined, note: 'points sur le réseau, sans seconde source' },
      ]);
    },
  },
  {
    nom: 'rafale-404',
    famille: 'exploration',
    titre: 'Rafale de pages introuvables depuis une adresse',
    cas: ['DS16'],
    resume: '25 adresses inventées en quelques secondes ; le site signale la rafale à la 20e (server/securite/site.js, NOT_FOUND_LIMIT).',
    async jouer(b) {
      const n = b.nav({ ip: '203.0.113.70', ua: 'python-requests/2.32' });
      for (let i = 0; i < 25; i++) await n.get(`/page-qui-n-existe-pas-${i}`);
      const r = await b.verifier('rafale', [
        { score: 'ip:203.0.113.70', min: 1.5, sources: ['site'] },
        { pasAlerte: undefined },
      ]);
      const ev = r.evenements('malicious_excess_404');
      b.constat('rafale', 'événement malicious_excess_404 reçu par la Vigie', ev.length === 1, `${ev.length} événement(s)`,
        { note: 'aucune règle Sigma ne lit malicious_excess_404 : seulement ses points de base (vigie/poids.js, 1,5) et le détecteur d’exploration lente (12 heures distinctes en 72 h) ; en bordure, bordure_erreurs ne compte qu’en contexte' });
    },
  },
  {
    nom: 'saisies-malveillantes',
    famille: 'exploration',
    titre: 'Saisies malveillantes dans la recherche (SQL, XSS, chemins, gabarits, commandes)',
    cas: ['DS11'],
    resume: 'Six recherches piégées depuis une adresse, sans session.',
    async jouer(b) {
      const n = b.nav({ ip: '203.0.113.80', ua: b.UA.linux });
      for (const [, url] of SAISIES) await n.get(url);
      const r = await b.verifier('saisies', [
        { signal: 'sigma.scanner', entite: 'ip:203.0.113.80' },
        { score: 'ip:203.0.113.80', min: 14, sources: ['site'] },
        { pasAlerte: 'entite.score', note: 'seuil franchi deux fois, une seule source : pas d’alerte (quorum D18)' },
        { pasAlerte: 'sigma.saisie_compte_admin', note: 'sans session : pas la preuve « saisie depuis un compte de l’admin »' },
      ]);
      const familles = new Set(r.evenements('malicious_input').flatMap(e => JSON.parse(e.detail || '{}').familles || []));
      const attendues = [...new Set(SAISIES.map(([f]) => f))];
      b.constat('saisies', `familles reconnues par le site : ${attendues.join(', ')}`, attendues.every(f => familles.has(f)), [...familles].join(', '));
    },
  },
  {
    nom: 'outil-attaque',
    famille: 'exploration',
    titre: 'Outil d’attaque reconnu à son agent (sqlmap)',
    cas: ['DS11'],
    resume: 'Cinq pages ordinaires demandées par sqlmap, sans aucune saisie piégée.',
    async jouer(b) {
      const n = b.nav({ ip: '203.0.113.90', ua: SQLMAP });
      for (const p of ['/', '/carnet', '/auteur/julien', '/droits', '/confidentialite']) await n.get(p);
      const r = await b.verifier('sqlmap', [
        { signal: 'sigma.scanner', entite: 'ip:203.0.113.90' },
        { score: 'ip:203.0.113.90', min: 10, sources: ['site'] },
      ]);
      const outils = r.evenements('malicious_input').filter(e => (JSON.parse(e.detail || '{}').familles || []).includes('outil'));
      b.constat('sqlmap', 'chaque requête de sqlmap signalée (famille « outil »)', outils.length === 5, `${outils.length} sur 5`);
    },
  },
  {
    nom: 'quorum-bordure',
    famille: 'exploration',
    titre: 'Saisies vues par le site et rafale vue par la bordure : alerte de score, puis blocage en mode Bloquer',
    cas: ['DS11', 'DS15'],
    bordure: true,
    resume: 'Le site signale les saisies ; le Worker Cloudflare (simulé : Analytics Engine factice) voit 150 pages en une minute de la même adresse. Puis la règle de score passe en Bloquer (fin du mois d’observation) et l’attaque continue.',
    async jouer(b) {
      const ip = '198.51.100.77';
      const n = b.nav({ ip, ua: b.UA.linux });
      for (const [, url] of SAISIES.slice(0, 5)) await n.get(url);
      b.banc.cf.ajouter({ ip, classe: 'page', statut: '200', n: 150 });
      await b.verifier('deux sources', [
        { signal: 'sigma.bordure_rafale', entite: `ip:${ip}` },
        { alerte: 'entite.score', entite: `ip:${ip}`, gravite: 'haut', mode: 'observer' },
        { pasDecision: undefined, note: 'mode Observer (mois d’observation) : aucune réponse' },
      ]);
      b.banc.vigie.engine.setMode('entite.score', 'bloquer', 'banc d’attaques');
      await n.get('/recherche?q=<script>alert(2)</script>');
      await b.verifier('mode bloquer', [
        { alerte: 'entite.score', entite: `ip:${ip}` },
        { decision: 'bloquer', cible: `${ip}/32` },
      ]);
      const bloque = await n.get('/');
      const autre = await b.nav({ ip: '198.51.100.78' }).get('/');
      b.constat('mode bloquer', `le site applique le blocage : 403 pour ${ip}, 200 pour sa voisine`, bloque.status === 403 && autre.status === 200, `${bloque.status} / ${autre.status}`);
    },
  },
];
