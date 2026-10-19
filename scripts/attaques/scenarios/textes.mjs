// Famille « textes publiés » (registre des briques BV-20, BV-21 ; vigie/regles/80-admin.yml) : titres, légendes, textes
// de remplacement des photos publiées, séries, photographes, billets. Un texte qui gagne un lien sert à hameçonner ; des
// textes réécrits en masse, c'est un défacement.

const JULIEN = 'local:julien';
const publiees = b => b.banc.db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id").pluck().all();

export default [
  {
    nom: 'texte-lien-externe',
    famille: 'textes',
    titre: 'Une légende publiée gagne un lien vers un autre site',
    cas: ['DS9'],
    resume: 'La légende d’une photo en ligne reçoit « Tirages sur https://tirages-nicephos.example/commande ».',
    async jouer(b) {
      const [id] = publiees(b);
      const r = await b.julien.ecrire(`/admin/photos/${id}/textes`, { legend: 'Tirages numérotés sur https://tirages-nicephos.example/commande' });
      b.constat('lien', 'légende enregistrée (303)', r.status === 303, String(r.status));
      await b.verifier('lien', [{ alerte: 'sigma.texte_public_contact', entite: `compte:${JULIEN}`, gravite: 'moyen', mode: 'alerter' }]);
      // Un lien vers le site lui-même ne compte pas.
      const [, id2] = publiees(b);
      await b.julien.ecrire(`/admin/photos/${id2}/textes`, { legend: `Voir aussi ${b.banc.base}/carnet` });
      await b.verifier('lien du site', [{ pasAlerte: 'sigma.texte_public_contact', note: 'lien vers le site lui-même (PUBLIC_URL) : rien' }]);
    },
  },
  {
    nom: 'textes-reecrits-en-serie',
    famille: 'textes',
    titre: 'Textes publiés réécrits en série (20 envois en quelques secondes)',
    cas: ['DS9'],
    resume: 'Vingt envois du formulaire d’une photo publiée, chacun remplaçant un titre allemand ; vérifié à dix (rien attendu) puis à vingt.',
    async jouer(b) {
      const ids = publiees(b);
      const statuts = [];
      const envoi = async i => statuts.push((await b.julien.ecrire(`/admin/photos/${ids[i % ids.length]}/textes`, { title_de: `Gehackt ${i}` })).status);
      for (let i = 0; i < 10; i++) await envoi(i);
      await b.verifier('10 envois', [{ pasAlerte: 'sigma.textes_publics_en_serie', note: 'dix gestes d’un texte chacun : sous le seuil de 20' }]);
      for (let i = 10; i < 20; i++) await envoi(i);
      b.constat('20 envois', '20 envois enregistrés', statuts.every(s => s === 303), statuts.join(' '));
      await b.verifier('20 envois', [{ alerte: 'sigma.textes_publics_en_serie', entite: `compte:${JULIEN}`, gravite: 'moyen', mode: 'alerter' }]);
    },
  },
  {
    nom: 'textes-geste-massif',
    famille: 'textes',
    titre: 'Textes publiés réécrits en masse d’un seul geste (tableau des titres)',
    cas: ['DS9'],
    resume: 'Le tableau des titres (/admin/photos/lot) remplace le titre et le texte de remplacement de 26 photos publiées en un envoi (52 textes ; seuil 50).',
    // La démonstration n'a que 12 photos publiées (24 textes au plus par envoi du tableau) : 14 copies publiées sont
    // ajoutées à la base avant le démarrage du site (données de départ, pas une attaque).
    preparerBase(db) {
      const cols = db.prepare('PRAGMA table_info(photos)').all().map(c => c.name).filter(c => !['id', 'slug', 'inventory', 'file'].includes(c));
      const ids = db.prepare("SELECT id FROM photos WHERE status = 'published' ORDER BY id").pluck().all();
      const ins = db.prepare(`INSERT INTO photos (slug, file, ${cols.join(', ')}) SELECT slug || @suffixe, @prefixe || file, ${cols.join(', ')} FROM photos WHERE id = @id`);
      for (let n = 0; n < 14; n++) ins.run({ id: ids[n % ids.length], suffixe: `-copie-${n}`, prefixe: `copie-${n}-` });
    },
    async jouer(b) {
      const ids = publiees(b);
      const corps = { ids: ids.join(',') };
      for (const id of ids) { corps[`title_${id}`] = `Site défiguré ${id}`; corps[`alt_text_${id}`] = `Texte remplacé ${id}`; }
      const r = await b.julien.ecrire('/admin/photos/lot', corps);
      b.constat('geste', `${ids.length} photos publiées, ${ids.length * 2} textes envoyés d’un coup`, r.status === 303 && ids.length >= 25, `${r.status}${r.status === 422 ? ` : ${[...new Set([...r.texte.matchAll(/class="[^"]*(?:error|erreur)[^"]*"[^>]*>([^<]{3,160})</g)].map(m => m[1].trim()))].slice(0, 3).join(' | ')}` : ''}`);
      await b.verifier('geste', [{ alerte: 'sigma.textes_publics_geste_massif', entite: `compte:${JULIEN}`, gravite: 'moyen', mode: 'alerter' },
        { pasAlerte: 'sigma.textes_publics_en_serie', note: 'un seul geste n’est pas une série (20 gestes en 10 minutes)' }]);
    },
  },
];
