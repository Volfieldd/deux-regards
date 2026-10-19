// Famille « réglages publics » (registre des briques BV-1, BV-2 ; vigie/regles/80-admin.yml) : un contact des droits
// remplacé sert à hameçonner les personnes photographiées ; un réglage changé juste après une session reprise depuis un
// autre appareil est le geste d'un compte volé.

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
    resume: 'Le cookie de Julien est utilisé depuis un téléphone Android au Brésil ; dans l’heure, l’accroche du site public change.',
    async jouer(b) {
      const vol = b.equipe({ ip: '203.0.113.45', ua: b.UA.android, pays: 'BR' }).copierCookies(b.julien);
      await vol.lireCsrf();
      await b.verifier('reprise', [{ alerte: 'sigma.session_autre_appareil', entite: `compte:${JULIEN}`, gravite: 'critique' },
        { pasDecision: undefined, note: 'mode Observer par défaut : la réponse prévue (revoquer_compte) n’est pas prise' }]);
      const r = await vol.ecrire('/admin/reglages', { part: 'site', tagline: 'Tirages offerts : écrivez à offre@hameconnage.example' });
      b.constat('réglage', 'accroche enregistrée par la session volée', r.status === 303, String(r.status));
      await b.verifier('réglage', [{ alerte: 'sigma.reglage_apres_session_reprise', entite: `compte:${JULIEN}`, gravite: 'haut', mode: 'alerter' }]);
    },
  },
];
