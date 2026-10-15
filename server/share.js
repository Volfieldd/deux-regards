import QRCode from 'qrcode';

// Partager une photo : de simples liens vers chaque service (aucun script ni cookie de Facebook, X… sur le site), le
// lien à copier, un QR, et sur téléphone le menu de partage du téléphone (Instagram, Signal, Messages… y sont). On
// partage la page, jamais le fichier. Les partages sont comptés sans rien savoir du visiteur : un nombre par photo,
// par moyen et par jour.
export const NETWORKS = ['whatsapp', 'facebook', 'bluesky', 'x', 'pinterest', 'email'];
// Moyens comptés : les réseaux, plus le lien copié, le post Instagram ouvert, le menu du téléphone et le QR scanné.
export const VIAS = [...NETWORKS, 'copie', 'instagram', 'telephone', 'qr'];

const enc = encodeURIComponent;
// Liens de partage : url (adresse complète de la page), title (titre · site), image (adresse complète de l'image).
export function shareLinks({ url, title, image }) {
  const text = `${title} ${url}`;
  return [
    { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(text)}` },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { id: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${enc(text)}` },
    { id: 'x', label: 'X', href: `https://x.com/intent/post?text=${enc(title)}&url=${enc(url)}` },
    { id: 'pinterest', label: 'Pinterest', href: `https://www.pinterest.com/pin/create/button/?url=${enc(url)}${image ? `&media=${enc(image)}` : ''}&description=${enc(title)}` },
    { id: 'email', label: 'E-mail', href: `mailto:?subject=${enc(title)}&body=${enc(url)}` },
  ];
}

// QR de la page (SVG en ligne), marqué « partage=qr » pour compter les scans.
export const shareQr = url => QRCode.toString(`${url}${url.includes('?') ? '&' : '?'}partage=qr`, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });

export function createShares({ db, now = () => new Date() }) {
  const day = () => now().toISOString().slice(0, 10);
  const add = db.prepare('INSERT INTO photo_shares (photo_id, via, day, n) VALUES (?, ?, ?, 1) ON CONFLICT(photo_id, via, day) DO UPDATE SET n = n + 1');
  return {
    record(photoId, via) {
      if (!VIAS.includes(via)) return false;
      add.run(photoId, via, day());
      return true;
    },
    // Partages d'une période : par moyen, et les photos les plus partagées.
    byVia: (from, to) => db.prepare('SELECT via, SUM(n) AS n FROM photo_shares WHERE day BETWEEN ? AND ? GROUP BY via ORDER BY n DESC').all(from, to),
    topPhotos: (from, to, limit = 10) => db.prepare('SELECT photo_id AS id, SUM(n) AS n FROM photo_shares WHERE day BETWEEN ? AND ? GROUP BY photo_id ORDER BY n DESC LIMIT ?').all(from, to, limit),
    forPhoto: id => db.prepare('SELECT COALESCE(SUM(n), 0) FROM photo_shares WHERE photo_id = ?').pluck().get(id),
  };
}
