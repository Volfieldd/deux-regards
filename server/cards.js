import QRCode from 'qrcode';

// Cartes de rencontre à imprimer : paires « pour nous » (accord signé, on la garde) / « pour eux » (merci, référence
// et QR vers /bonjour), au format carte de visite (85 × 55 mm), cinq paires par feuille A4, d'un seul côté.
//   - « numérotées » : référence et QR propres à chaque paire, avec le code de contrôle (carte vérifiée) ;
//   - « génériques » : sans numéro, QR vers /bonjour, pour un imprimeur (numéro ajouté au tampon numéroteur).
// Les textes sont ici, en un seul endroit, pour être retouchés facilement.

export const PER_SHEET = 5;
export const MAX_PAIRS = 200;

export const TEXTS = {
  consentLabel: 'Autorisation · Consent · Einwilligung',
  consent: name => `J’autorise l’usage artistique et la publication des photos que ${name} a prises de moi aujourd’hui. Révocable à tout moment.`,
  consentTr: 'EN I agree to the artistic use & publication of today’s photos of me. Revocable at any time. · DE Ich willige in die künstlerische Nutzung & Veröffentlichung der heutigen Fotos von mir ein. Jederzeit widerrufbar.',
  scopes: ['site nicephos.art', 'Instagram', 'expo · tirages / prints', 'avec mon prénom / name'],
  fields: ['Nom · Name', 'Date', 'Lieu · Place', 'E-mail (facultatif)'],
  signature: 'Signature',
  thanks: 'Merci !',
  thanksText: name => `Merci de m’avoir laissé saisir ce moment. Je vais soigner ces images et vous en envoyer une, rien que pour vous. — ${name}`,
  thanksTr: 'EN Thank you for letting me capture this moment: I’ll send you a photo. · DE Danke für diesen Moment: Ich schicke Ihnen ein Foto.',
  qrText: 'Votre photo, votre accord, vos données · Your photo · Ihr Foto',
};

const qr = url => QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'Q', margin: 0 });

// Paires d'une planche : { ref, code, qr (SVG) } ; génériques : sans référence.
export async function buildPairs({ publicUrl, prefix, from, count, generic, codeOf }) {
  const host = publicUrl.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (generic) {
    const svg = await qr(`${publicUrl}/bonjour`);
    return { host, pairs: Array.from({ length: count }, () => ({ ref: null, label: '', qr: svg })) };
  }
  const pairs = [];
  for (let i = 0; i < count; i++) {
    const ref = `${prefix}-${String(from + i).padStart(4, '0')}`;
    const code = codeOf(ref);
    pairs.push({ ref, code, label: `${ref}-${code}`, qr: await qr(`${publicUrl}/bonjour/${ref}-${code}`) });
  }
  return { host, pairs };
}

// Planches : les paires par feuilles de cinq.
export const sheets = pairs => Array.from({ length: Math.ceil(pairs.length / PER_SHEET) }, (_, i) => pairs.slice(i * PER_SHEET, (i + 1) * PER_SHEET));
