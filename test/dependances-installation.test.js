import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

// Dépendance de l’installateur ONNX : les archives ambiguës ou les liens de destination ne doivent pas permettre
// d’écrire un autre contenu que celui contrôlé. Ces petits ZIP exercent deux avis corrigés par adm-zip 0.6.1.
const temporaire = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependances-installation-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('archive d’installation : une entrée ordinaire est lisible et extraite', t => {
  const dir = temporaire(t), zip = new AdmZip();
  zip.addFile('modele/fichier.txt', Buffer.from('contenu attendu'));
  const relue = new AdmZip(zip.toBuffer());
  assert.equal(relue.getEntry('modele/fichier.txt').getData().toString(), 'contenu attendu');
  relue.extractAllTo(dir, true);
  assert.equal(fs.readFileSync(path.join(dir, 'modele/fichier.txt'), 'utf8'), 'contenu attendu');
});

test('archive d’installation : deux entrées de même nom sont refusées avant extraction', () => {
  const zip = new AdmZip();
  zip.addFile('a.txt', Buffer.from('contenu contrôlé'));
  zip.addFile('b.txt', Buffer.from('contenu substitué'));
  const bytes = zip.toBuffer(), nom = Buffer.from('b.txt');
  let modifications = 0;
  // Même longueur : seul le nom change, dans l’en-tête local puis le répertoire central.
  for (let i = bytes.indexOf(nom); i !== -1; i = bytes.indexOf(nom, i + nom.length)) {
    bytes.write('a.txt', i, 'ascii');
    modifications++;
  }
  assert.equal(modifications, 2);
  assert.throws(() => new AdmZip(bytes).getEntries(), /duplicate/i);
});

test('archive d’installation : un lien symbolique ne permet pas de sortir de la destination', t => {
  const dir = temporaire(t), destination = path.join(dir, 'destination'), ailleurs = path.join(dir, 'ailleurs.txt');
  fs.mkdirSync(destination);
  fs.writeFileSync(ailleurs, 'contenu préservé');
  fs.symlinkSync(ailleurs, path.join(destination, 'fichier.txt'));
  const zip = new AdmZip();
  zip.addFile('fichier.txt', Buffer.from('contenu imposé'));
  assert.throws(() => new AdmZip(zip.toBuffer()).extractAllTo(destination, true));
  assert.equal(fs.readFileSync(ailleurs, 'utf8'), 'contenu préservé');
});
