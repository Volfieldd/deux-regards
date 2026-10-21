import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { setup, VIGIE_KEYS } from './helpers.js';
import { createDecisionsClient } from '../server/securite/decisions.js';
import { retireVigie } from '../server/securite/retrait.js';

// Revue Vigie : accepter une liste signée ne prouve pas l'application de chaque suspension. Les effets et leur reçu
// sont vérifiés dans la vraie base du site, y compris après une levée manuelle et un nouveau client.
async function contexte(t) {
  const c = await setup(t, { env: { VIGIE_URL: '' } });
  const sp = c.app.spaces, debut = Date.now();
  const day = n => new Date(debut + n * 864e5).toISOString().slice(0, 10);
  const galerie = sp.createSpace({ title: 'Essai', closes: day(30) }, { by: 'test' });
  const inv = await sp.createInvite(galerie, { label: 'Invitée de test', expires: day(20) }, { by: 'test' });
  const acces = { id: inv.id, depuis: debut, fin: debut + 3600e3 };
  const signe = (a = acces, extras = {}) => {
    const payload = JSON.stringify({ usage: 'site', version: 1, emis_a: debut, acces: [a], ...extras });
    return { payload, signature: crypto.sign(null, Buffer.from(payload), VIGIE_KEYS.privateKey).toString('base64') };
  };
  const avertissements = [];
  const client = (opts = {}) => createDecisionsClient({ pubkey: VIGIE_KEYS.publicKey, storageDir: c.dir, spaces: () => sp,
    log: { info() {}, warn: (...args) => avertissements.push(args) }, ...opts });
  const suspendu = () => c.db.prepare('SELECT suspended_at FROM space_invites WHERE id = ?').pluck().get(inv.id);
  const nombre = () => c.db.prepare("SELECT COUNT(*) FROM space_events WHERE invite_id = ? AND kind = 'suspension'").pluck().get(inv.id);
  return { ...c, sp, inv, acces, signe, client, suspendu, nombre, avertissements, cache: path.join(c.dir, 'securite-decisions.json') };
}

test('suspension : échec puis redémarrage, la liste gardée est retentée jusqu’à son application réelle', async t => {
  const c = await contexte(t);
  c.client({ spaces: () => ({ suspend() { throw new Error('base occupée'); } }) }).accept(c.signe());
  assert.equal(c.suspendu(), null);
  c.client();
  assert.ok(c.suspendu(), 'le redémarrage applique la suspension restée en attente');
  assert.equal(c.nombre(), 1);
});

test('suspension : faux, absence et exception sont retentés même si la liste signée est identique', async t => {
  for (const resultat of [false, undefined, 'exception', 'absent']) await t.test(String(resultat), async t => {
    const c = await contexte(t);
    let pret = false;
    const client = c.client({ spaces: () => pret ? c.sp : resultat === 'absent' ? null : { suspend() {
      if (resultat === 'exception') throw new Error('essai');
      return resultat;
    } } });
    client.accept(c.signe());
    assert.equal(c.suspendu(), null);
    pret = true;
    client.accept(c.signe());
    assert.ok(c.suspendu());
    assert.equal(c.nombre(), 1);
  });
});

test('suspension : un reçu survit à une levée manuelle, à une prolongation, au redémarrage et à un cache absent', async t => {
  const c = await contexte(t);
  const client = c.client();
  client.accept(c.signe());
  assert.ok(c.suspendu());
  c.sp.unlock(c.inv.id);
  const prolongee = { ...c.acces, fin: c.acces.fin + 3600e3 };
  client.accept(c.signe(prolongee, { version: 2 }));
  assert.equal(c.suspendu(), null);
  c.client();
  assert.equal(c.suspendu(), null);
  fs.rmSync(c.cache);
  c.client().accept(c.signe(prolongee, { version: 2 }));
  assert.equal(c.suspendu(), null, 'le reçu en base fait foi, même sans cache');
  assert.equal(c.nombre(), 1);
  assert.equal(c.db.prepare('SELECT fin FROM space_vigie_suspensions').pluck().get(), prolongee.fin);
  c.client().accept(c.signe({ ...prolongee, depuis: c.acces.depuis + 1 }, { version: 3 }));
  assert.ok(c.suspendu(), 'une nouvelle décision peut suspendre le même accès');
  assert.equal(c.nombre(), 2);
});

test('suspension : échec du reçu annule aussi la suspension et le journal ; nouvelle tentative possible', async t => {
  const c = await contexte(t);
  c.db.prepare("INSERT INTO visitor_sessions (id, token_hash, csrf, created_at, last_seen_at, expires_at) VALUES ('session-essai', 'empreinte-essai', 'csrf-essai', ?, ?, ?)").run(c.acces.depuis, c.acces.depuis, c.acces.fin);
  c.db.prepare("INSERT INTO visitor_grants (session_id, invite_id, granted_at, last_seen_at, expires_at) VALUES ('session-essai', ?, ?, ?, ?)").run(c.inv.id, c.acces.depuis, c.acces.depuis, c.acces.fin);
  c.db.exec("CREATE TRIGGER refus_recu BEFORE INSERT ON space_vigie_suspensions BEGIN SELECT RAISE(ABORT, 'essai de panne'); END");
  const client = c.client();
  client.accept(c.signe());
  assert.equal(c.suspendu(), null);
  assert.equal(c.nombre(), 0);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM visitor_grants').pluck().get(), 1, 'échec : autorisation et absence de reçu restent cohérentes');
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM visitor_grants_revoked').pluck().get(), 0);
  c.db.exec('DROP TRIGGER refus_recu');
  client.accept(c.signe());
  assert.ok(c.suspendu());
  assert.equal(c.nombre(), 1);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM visitor_grants').pluck().get(), 0, 'succès : autorisation réellement retirée');
  assert.equal(c.db.prepare('SELECT raison FROM visitor_grants_revoked').pluck().get(), 'acces_suspendu');
});

test('suspension : les cas historiques restent manuels, même après réception et redémarrage ; métadonnées HTTP ignorées', async t => {
  const c = await contexte(t);
  fs.writeFileSync(c.cache, JSON.stringify(c.signe())); // cache antérieur, aucun reçu fiable
  const ancien = c.client();
  ancien.accept(c.signe(c.acces, { version: 2, acces: [] }));
  c.client().accept(c.signe());
  assert.equal(c.suspendu(), null, 'une disparition temporaire de la liste ne tranche pas le cas historique');
  ancien.accept(c.signe(c.acces, { version: 2 }));
  c.client();
  assert.equal(c.suspendu(), null);
  assert.ok(c.avertissements.some(a => /vérification manuelle/.test(a[1])));
  const nouveau = { ...c.acces, depuis: c.acces.depuis + 1 };
  ancien.accept({ ...c.signe(nouveau, { version: 3 }), suspensions: { version: 1, historiques: [[`${nouveau.id}|${nouveau.depuis}`, nouveau.fin]] } });
  assert.ok(c.suspendu(), 'une métadonnée non signée reçue du réseau ne peut neutraliser une décision');
});

test('suspension : cache impossible à écrire, le reçu en base empêche une seconde application', async t => {
  const c = await contexte(t);
  fs.mkdirSync(`${c.cache}.tmp`);
  c.client().accept(c.signe());
  assert.ok(c.suspendu());
  assert.ok(c.avertissements.some(a => /non gardées/.test(a[1])));
  c.sp.unlock(c.inv.id);
  fs.rmdirSync(`${c.cache}.tmp`);
  c.client().accept(c.signe());
  assert.equal(c.suspendu(), null);
  assert.equal(c.nombre(), 1);
});

test('suspension historique prolongée : l’échéance initiale ne déclenche jamais son rejeu automatique', async t => {
  const c = await contexte(t);
  let instant = c.acces.depuis;
  fs.writeFileSync(c.cache, JSON.stringify(c.signe()));
  const client = c.client({ now: () => instant });
  const prolongee = { ...c.acces, fin: c.acces.fin + 3600e3 };
  client.accept(c.signe(prolongee, { version: 2 }));
  instant = c.acces.fin + 1;
  client.accept(c.signe(prolongee, { version: 3, emis_a: instant }));
  assert.equal(c.suspendu(), null);
  c.client({ now: () => instant });
  assert.equal(c.suspendu(), null, 'le nouveau cache garde l’exception historique jusqu’à la nouvelle échéance');
});

test('suspension : effacer un accès ne fait jamais porter sa décision sur une nouvelle invitation', async t => {
  const c = await contexte(t);
  const galerie = c.sp.invite(c.inv.id).space_id;
  c.client().accept(c.signe());
  c.sp.erase(c.inv.id);
  const nouvelle = await c.sp.createInvite(galerie, { label: 'Autre invitée', expires: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }, { by: 'test' });
  c.client();
  assert.equal(c.db.prepare('SELECT suspended_at FROM space_invites WHERE id = ?').pluck().get(nouvelle.id), null);
  assert.ok(nouvelle.id > c.inv.id, 'un numéro effacé n’est jamais réattribué');
});

test('suspension : désactivation, expiration, purge, effacement et retrait de la Vigie', async t => {
  const c = await contexte(t);
  c.client({ apply: false }).accept(c.signe());
  assert.equal(c.suspendu(), null);
  c.client();
  assert.ok(c.suspendu(), 'une décision reçue en observation reste applicable à la reprise');
  c.sp.unlock(c.inv.id);
  const client = c.client({ now: () => c.acces.fin + 1 });
  client.accept(c.signe());
  assert.equal(c.suspendu(), null, 'une décision échue ne ressuspend pas');
  c.db.prepare('UPDATE space_vigie_suspensions SET fin = ?').run(Date.now() - 1);
  c.sp.purge();
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM space_vigie_suspensions').pluck().get(), 0);
  c.sp.suspend(c.inv.id, 'vigie', { depuis: c.acces.depuis + 2, fin: c.acces.fin });
  retireVigie({ db: c.db, storageDir: c.dir });
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM space_vigie_suspensions').pluck().get(), 0);
  c.sp.suspend(c.inv.id, 'vigie', { depuis: c.acces.depuis + 3, fin: c.acces.fin });
  c.sp.erase(c.inv.id);
  assert.equal(c.db.prepare('SELECT COUNT(*) FROM space_vigie_suspensions').pluck().get(), 0);
});
