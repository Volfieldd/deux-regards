// Famille « réglages publics » (registre des briques BV-1, BV-2 ; vigie/regles/80-admin.yml) : un contact des droits
// remplacé sert à hameçonner les personnes photographiées ; un réglage changé juste après une session reprise depuis un
// autre appareil est le geste d'un compte volé.

import { JETON_TEST } from '../banc.mjs';

const JULIEN = 'local:julien';

export default [
  {
    nom: 'contact-droits-change',
    famille: 'reglages',
    titre: 'Adresse de contact des droits remplacée',
    cas: ['DS9'],
    resume: 'Dans « Droits et confidentialité », l’adresse à laquelle écrivent les personnes photographiées est remplacée.',
    async jouer(b) {
      const r = await b.julien.ecrire('/admin/reglages', { part: 'droits', rights_contact: 'droits@hameconnage.example', privacy_contact: 'droits@hameconnage.example' });
      const v = b.banc.db.prepare("SELECT value FROM settings WHERE key = 'rights_contact'").pluck().get();
      b.constat('contact', 'réglage enregistré', r.status === 303 && /hameconnage/.test(v || ''), `${r.status}, ${v}`);
      await b.verifier('contact', [{ alerte: 'sigma.contact_public_change', entite: `compte:${JULIEN}`, gravite: 'moyen', mode: 'alerter' }]);
    },
  },
  {
    nom: 'reglage-apres-session-reprise',
    famille: 'reglages',
    titre: 'Session reprise depuis un autre appareil, puis accroche du site changée',
    cas: ['DS2', 'DS23'],
    resume: 'Le cookie de Julien est utilisé depuis un téléphone Android au Brésil ; la Vigie redemande l’identité du compte : '
      + 'l’accroche n’est pas changée, les écritures suivantes non plus ; Julien confirme son identité et reprend la main.',
    async jouer(b) {
      const vol = b.equipe({ ip: '203.0.113.45', ua: b.UA.android, pays: 'BR' }).copierCookies(b.julien);
      await vol.lireCsrf();
      // Réponse douce (décision du propriétaire du 19 octobre 2026) : mode « bloquer », vérification d'identité 24 h.
      await b.verifier('reprise', [{ alerte: 'sigma.session_autre_appareil', entite: `compte:${JULIEN}`, gravite: 'critique', mode: 'bloquer' },
        { decision: 'verifier_identite', cible: JULIEN }, { pasDecision: 'revoquer_compte' }]);
      const accroche = () => b.banc.db.prepare("SELECT value FROM settings WHERE key = 'tagline'").pluck().get() || '';
      const r = await vol.ecrire('/admin/reglages', { part: 'site', tagline: 'Tirages offerts : écrivez à offre@hameconnage.example' });
      b.constat('réglage', 'écriture de la session volée arrêtée : nouvelle connexion demandée', r.status === 303 && /^\/auth\/verifier\?/.test(r.location || '') && !/hameconnage/.test(accroche()), `${r.status} → ${r.location}`);
      // Le voleur n'a ni la clé d'accès ni le jeton : la vérification lui est refusée ; il essaie ailleurs.
      const v = await vol.post('/auth/local', { token: 'pas-le-bon-jeton', author: 'julien', verifier: '1', next: '/admin' });
      b.constat('réglage', 'vérification d’identité refusée au voleur', v.status === 401, String(v.status));
      for (const chemin of ['/admin/comptes/test-email', '/admin/carnet/reglages', '/admin/instagram/reglages', '/admin/carnet']) {
        const x = await vol.ecrire(chemin, {});
        b.constat('réglage', `écriture arrêtée : ${chemin}`, x.status === 303 && /^\/auth\/verifier\?/.test(x.location || ''), `${x.status} → ${x.location}`);
      }
      await b.verifier('réglage', [{ pasAlerte: 'sigma.reglage_apres_session_reprise' },
        { alerte: 'sigma.ecritures_sans_identite', entite: `compte:${JULIEN}`, gravite: 'haut', mode: 'alerter' }]);
      // Julien confirme son identité (connexion de test : même compte, jeton redemandé), puis change l'accroche.
      const ok = await b.julien.post('/auth/local', { token: JETON_TEST, author: 'julien', verifier: '1', next: '/admin/reglages' });
      await b.julien.lireCsrf();
      const w = await b.julien.ecrire('/admin/reglages', { part: 'site', tagline: 'Photographies de rue' });
      b.constat('confirmation', 'identité confirmée, réglage enregistré', ok.status === 303 && w.status === 303 && !/^\/auth\//.test(w.location || '') && /Photographies de rue/.test(accroche()), `${ok.status}, ${w.status} → ${w.location}`);
      // L'écriture faite après la confirmation ouvre la corrélation (alerte gardée pour qu'on la regarde), sans nouvelle
      // vérification : l'identité a été confirmée après la dernière session reprise.
      await b.verifier('confirmation', [{ alerte: 'sigma.reglage_apres_session_reprise', entite: `compte:${JULIEN}`, gravite: 'haut', mode: 'bloquer' },
        { pasDecision: 'verifier_identite' }]);
    },
  },
];
