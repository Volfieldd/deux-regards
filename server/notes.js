// Remarques adressées au photographe d'une photo par un modérateur ou un administrateur (permission
// « taches.adresser ») : elles remontent dans son « Aujourd'hui » jusqu'à ce qu'il les marque faites. Elles parlent
// de la photo (texte à corriger, série, cadrage…), jamais des personnes photographiées.
export class NoteError extends Error {}

export function createNotes({ db, now = Date.now }) {
  const open = db.prepare(`SELECT n.*, p.title, p.author_id FROM photo_notes n JOIN photos p ON p.id = n.photo_id
    WHERE n.done_at IS NULL AND (@photo IS NULL OR n.photo_id = @photo) AND (@author IS NULL OR p.author_id = @author) ORDER BY n.created_at, n.id`);
  return {
    add(photoId, message, { sub = null, name = '' } = {}) {
      const text = String(message || '').trim().slice(0, 1000);
      if (!text) throw new NoteError('Écrivez la remarque.');
      return db.prepare('INSERT INTO photo_notes (photo_id, message, from_sub, from_name, created_at) VALUES (?, ?, ?, ?, ?)').run(photoId, text, sub, name, now()).lastInsertRowid;
    },
    // Remarques en attente : d'une photo, ou d'un photographe (null : toutes).
    open: ({ photoId = null, authorId = null } = {}) => open.all({ photo: photoId, author: authorId }),
    get: id => db.prepare('SELECT n.*, p.author_id FROM photo_notes n JOIN photos p ON p.id = n.photo_id WHERE n.id = ?').get(id),
    done: (id, by = '') => db.prepare('UPDATE photo_notes SET done_at = ?, done_by = ? WHERE id = ? AND done_at IS NULL').run(now(), by, id).changes > 0,
  };
}
