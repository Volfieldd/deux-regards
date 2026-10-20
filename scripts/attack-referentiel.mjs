// Génère vigie/attack-enterprise.json, le référentiel MITRE ATT&CK Enterprise de la Vigie (tactiques dans l'ordre de la
// matrice, techniques et sous-techniques en vigueur, techniques révoquées et leur remplaçante), depuis le jeu de données
// STIX publié par MITRE. À relancer à chaque nouvelle version d'ATT&CK (deux par an), puis npm run test:vigie : le test
// de cohérence dit quelles règles portent une étiquette devenue fausse.
//   curl -L -o /tmp/enterprise-attack.json https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json
//   node scripts/attack-referentiel.mjs /tmp/enterprise-attack.json
// Conditions d'utilisation d'ATT&CK : https://attack.mitre.org/resources/legal-and-branding/terms-of-use/ (mention reprise
// dans le fichier produit).
import fs from 'node:fs';

const source = process.argv[2];
if (!source) { console.error('usage : node scripts/attack-referentiel.mjs <enterprise-attack.json>'); process.exit(1); }
const { objects } = JSON.parse(fs.readFileSync(source, 'utf8'));
const idOf = o => o.external_references?.find(r => r.source_name === 'mitre-attack')?.external_id;
const vivant = o => !o.revoked && !o.x_mitre_deprecated;
const collection = objects.find(o => o.type === 'x-mitre-collection');
const matrice = objects.find(o => o.type === 'x-mitre-matrix' && vivant(o));
const tactiquesParRef = new Map(objects.filter(o => o.type === 'x-mitre-tactic' && vivant(o)).map(o => [o.id, o]));
// Clé d'une tactique : celle des étiquettes Sigma (« attack.initial_access »), soit le nom court de MITRE, tirets en soulignés.
const cle = court => court.replaceAll('-', '_');
const tactiques = matrice.tactic_refs.map(r => tactiquesParRef.get(r)).map(t => ({ id: idOf(t), cle: cle(t.x_mitre_shortname), nom: t.name }));
const motifs = objects.filter(o => o.type === 'attack-pattern');
const tactiquesDe = o => (o.kill_chain_phases || []).filter(k => k.kill_chain_name === 'mitre-attack').map(k => cle(k.phase_name));
const techniques = motifs.filter(o => vivant(o) && idOf(o)).map(o => ({ id: idOf(o), nom: o.name, tactiques: tactiquesDe(o) }))
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
// Révoquées : l'identifiant remplaçant (relation « revoked-by »), pour dire quoi écrire à la place.
const parRef = new Map(motifs.map(o => [o.id, o]));
const revoquees = Object.fromEntries(objects.filter(o => o.type === 'relationship' && o.relationship_type === 'revoked-by' && parRef.has(o.source_ref))
  .map(o => [idOf(parRef.get(o.source_ref)), idOf(parRef.get(o.target_ref))]).filter(([a, b]) => a && b).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
const sortie = {
  source: 'MITRE ATT&CK Enterprise, jeu de données STIX (mitre-attack/attack-stix-data)',
  version: collection?.x_mitre_version ?? null,
  publiee: collection?.modified?.slice(0, 10) ?? null,
  licence: '© The MITRE Corporation. This work is reproduced and distributed with the permission of The MITRE Corporation. https://attack.mitre.org/resources/legal-and-branding/terms-of-use/',
  tactiques,
  techniques: techniques.map(t => [t.id, t.nom, t.tactiques.join(' ')]),
  revoquees,
};
fs.writeFileSync(new URL('../vigie/attack-enterprise.json', import.meta.url), `${JSON.stringify(sortie, null, 0).replace(/\],\[/g, '],\n[')}\n`);
console.log(`ATT&CK ${sortie.version} (${sortie.publiee}) : ${tactiques.length} tactiques, ${techniques.length} techniques, ${Object.keys(revoquees).length} révoquées`);
