import crypto from 'node:crypto';

// Horodatage RFC 3161 : requête, analyse et vérification d'un jeton, sans dépendance.
// Seul le sous-ensemble DER utile ici est implémenté.

const OID = {
  sha256: '2.16.840.1.101.3.4.2.1',
  sha384: '2.16.840.1.101.3.4.2.2',
  sha512: '2.16.840.1.101.3.4.2.3',
  sha1: '1.3.14.3.2.26',
  signedData: '1.2.840.113549.1.7.2',
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  messageDigest: '1.2.840.113549.1.9.4',
  contentType: '1.2.840.113549.1.9.3',
  signingCertificate: '1.2.840.113549.1.9.16.2.12',     // ESSCertID (empreinte SHA-1 du certificat)
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',   // ESSCertIDv2
  timeStamping: '1.3.6.1.5.5.7.3.8',
};
const MAX_REPLY = 64 * 1024;          // un jeton fait quelques ko
const MAX_DEPTH = 32;
const MAX_CHAIN = 5;                  // AC intermédiaires au plus entre la TSA et le certificat de confiance
const HASHES = { [OID.sha256]: 'sha256', [OID.sha384]: 'sha384', [OID.sha512]: 'sha512', [OID.sha1]: 'sha1' };

export class TimestampError extends Error {}

// ---------- DER ----------

function len(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
function oid(dotted) {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const out = [40 * a + b];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let v = n >> 7; v > 0; v >>= 7) chunk.unshift((v & 0x7f) | 0x80);
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}
const int = buf => tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf);

// Lit un élément DER à `pos` : { tag, start (contenu), end, header, children? }.
export function readDer(buf, pos = 0, depth = 0) {
  if (depth > MAX_DEPTH) throw new TimestampError('DER trop imbriqué');
  if (pos + 2 > buf.length) throw new TimestampError('DER tronqué');
  const tag = buf[pos];
  let length = buf[pos + 1];
  let header = 2;
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n === 0 || n > 4 || pos + 2 + n > buf.length) throw new TimestampError('longueur DER non prise en charge');
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + buf[pos + 2 + i];
    header += n;
  }
  const start = pos + header;
  const end = start + length;
  if (end > buf.length) throw new TimestampError('DER tronqué');
  const node = { tag, pos, start, end, raw: buf.subarray(pos, end), value: buf.subarray(start, end) };
  if (tag & 0x20) {
    node.children = [];
    for (let p = start; p < end;) {
      const child = readDer(buf, p, depth + 1);
      node.children.push(child);
      p = child.end;
    }
  }
  return node;
}
function readOid(node) {
  const b = node.value;
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let v = 0;
  for (let i = 1; i < b.length; i++) {
    v = v * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join('.');
}
const readInt = node => BigInt(`0x${node.value.toString('hex') || '0'}`);
function readTime(node) {
  // GeneralizedTime : AAAAMMJJhhmmss[.fff]Z
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(node.value.toString('latin1'));
  const d = m && new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}Z`);
  if (!d || Number.isNaN(d.getTime())) throw new TimestampError('date du jeton illisible');
  return d;
}

// ---------- requête ----------

// Nonce de 64 bits en DER minimal : premier octet entre 1 et 127 (ni zéro de tête, ni signe).
function randomNonce() {
  const n = crypto.randomBytes(8);
  n[0] = (n[0] % 127) + 1;
  return n;
}

// TimeStampReq : version 1, empreinte SHA-256, nonce aléatoire, certificat de la TSA demandé.
export function buildRequest(sha256Hex, nonce = randomNonce()) {
  const hash = Buffer.from(sha256Hex, 'hex');
  if (hash.length !== 32) throw new TimestampError('empreinte SHA-256 invalide');
  const der = seq(
    int(Buffer.from([1])),
    seq(seq(oid(OID.sha256), Buffer.from([0x05, 0x00])), tlv(0x04, hash)),
    int(nonce),
    tlv(0x01, Buffer.from([0xff])),
  );
  return { der, nonce: BigInt(`0x${nonce.toString('hex')}`) };
}

// Envoie la requête à la TSA ; renvoie la réponse DER brute et son analyse.
// Pas de redirection suivie, réponse bornée à 64 ko, délai de 20 s, annulable (arrêt du serveur).
export async function requestTimestamp(url, sha256Hex, { fetchImpl = fetch, timeoutMs = 20_000, nonce: fixedNonce, signal } = {}) {
  const { der, nonce } = buildRequest(sha256Hex, fixedNonce);
  const timeout = AbortSignal.timeout(timeoutMs);
  const res = await fetchImpl(url, {
    method: 'POST', body: der, headers: { 'content-type': 'application/timestamp-query' },
    redirect: 'error', signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (!res.ok) throw new TimestampError(`la TSA a répondu ${res.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_REPLY) throw new TimestampError('réponse de la TSA trop volumineuse');
    chunks.push(chunk);
  }
  const reply = Buffer.concat(chunks);
  const parsed = parseReply(reply);
  if (parsed.hashAlgorithm !== 'sha256') throw new TimestampError('le jeton n’utilise pas SHA-256');
  if (parsed.nonce !== nonce) throw new TimestampError('nonce différent de celui demandé');
  if (parsed.hashedMessage !== sha256Hex) throw new TimestampError('le jeton ne porte pas sur cette empreinte');
  return { reply, ...parsed };
}

// Toute anomalie de structure devient une TimestampError lisible (jamais une TypeError brute).
function structured(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      if (err instanceof TimestampError) throw err;
      throw new TimestampError('jeton mal formé');
    }
  };
}

// ---------- analyse ----------

// TimeStampResp → informations utiles, le jeton (ContentInfo) et les pièces de la signature.
export const parseReply = structured(buf => {
  const resp = readDer(buf);
  if (resp.end !== buf.length) throw new TimestampError('octets en trop après la réponse');
  const [statusInfo, token] = resp.children || [];
  const status = Number(readInt(statusInfo.children[0]));
  if (status !== 0 && status !== 1) throw new TimestampError(`horodatage refusé par la TSA (statut ${status})`);
  if (!token) throw new TimestampError('réponse sans jeton');

  const [contentType, explicit] = token.children;
  if (readOid(contentType) !== OID.signedData) throw new TimestampError('jeton qui n’est pas un SignedData');
  const signedData = explicit.children[0];
  const parts = signedData.children;
  const encap = parts[2];
  if (readOid(encap.children[0]) !== OID.tstInfo) throw new TimestampError('contenu qui n’est pas un TSTInfo');
  const tstDer = encap.children[1].children[0].value;           // [0] EXPLICIT OCTET STRING
  const tst = readDer(tstDer).children;

  const imprint = tst[2].children;
  const hashOid = readOid(imprint[0].children[0]);
  let i = 5;
  if (tst[i]?.tag === 0x30) i++;                                 // accuracy
  if (tst[i]?.tag === 0x01) i++;                                 // ordering
  const nonce = tst[i]?.tag === 0x02 ? readInt(tst[i]) : null;

  const certs = parts.filter(p => p.tag === 0xa0).flatMap(p => p.children.map(c => c.raw));
  const signerInfos = parts.at(-1);
  return {
    token: token.raw,
    tstDer,
    hashAlgorithm: HASHES[hashOid] || hashOid,
    hashedMessage: imprint[1].value.toString('hex'),
    serial: readInt(tst[3]).toString(16),
    genTime: readTime(tst[4]),
    nonce,
    certs,
    signerInfo: signerInfos.children[0],
  };
});

// ---------- vérification ----------

// Vérifie le jeton : contenu signé, signature, certificat de la TSA (usage « horodatage », lié au jeton par
// l'attribut SigningCertificate, valide à la date du jeton) et, si une autorité est fournie, la chaîne jusqu'à elle.
// Renvoie { signer, validFrom, validTo, chained } ou lève TimestampError.
export const verifyToken = structured((parsed, { caPem = null } = {}) => {
  const si = parsed.signerInfo.children;
  const digestAlg = HASHES[readOid(si[2].children[0])];
  const signedAttrs = si.find(n => n.tag === 0xa0);
  const signature = si.find((n, k) => k > 3 && n.tag === 0x04)?.value;
  if (!digestAlg || !signedAttrs || !signature) throw new TimestampError('signature du jeton illisible');
  if (digestAlg === 'sha1') throw new TimestampError('signature SHA-1 refusée');
  const attr = oid => signedAttrs.children.find(a => readOid(a.children[0]) === oid)?.children[1].children[0];

  // Les attributs signés doivent désigner un TSTInfo et en porter l'empreinte.
  const ct = attr(OID.contentType);
  if (!ct || readOid(ct) !== OID.tstInfo) throw new TimestampError('le contenu signé n’est pas un jeton d’horodatage');
  const md = attr(OID.messageDigest);
  const expected = crypto.createHash(digestAlg).update(parsed.tstDer).digest('hex');
  if (!md || md.value.toString('hex') !== expected) throw new TimestampError('le contenu signé ne correspond pas au jeton');

  // La signature porte sur les attributs signés, réencodés en SET (0x31).
  const attrs = Buffer.concat([Buffer.from([0x31]), signedAttrs.raw.subarray(1)]);
  const certs = parsed.certs.map(der => new crypto.X509Certificate(der));
  const signer = certs.find(c => {
    try { return crypto.verify(digestAlg, attrs, c.publicKey, signature); } catch { return false; }
  });
  if (!signer) throw new TimestampError('signature invalide (ou certificat de la TSA absent du jeton)');

  // Le certificat signataire doit être celui que le jeton désigne (ESSCertID / ESSCertIDv2).
  const v2 = attr(OID.signingCertificateV2);
  const v1 = attr(OID.signingCertificate);
  const essId = (v2 || v1)?.children[0]?.children[0];           // certs → premier ESSCertID(v2)
  if (!essId) throw new TimestampError('certificat de la TSA non désigné par le jeton');
  let certHashAlg = v2 ? 'sha256' : 'sha1';
  let certHash = essId.children[0];
  if (v2 && certHash.tag === 0x30) {                            // hashAlgorithm présent
    certHashAlg = HASHES[readOid(certHash.children[0])];
    certHash = essId.children[1];
  }
  if (!certHashAlg || certHash.value.toString('hex') !== crypto.createHash(certHashAlg).update(signer.raw).digest('hex')) {
    throw new TimestampError('le certificat signataire n’est pas celui désigné par le jeton');
  }
  if (!signer.keyUsage?.includes(OID.timeStamping)) throw new TimestampError('le certificat signataire n’est pas un certificat d’horodatage');

  const at = parsed.genTime;
  if (at < new Date(signer.validFrom) || at > new Date(signer.validTo)) throw new TimestampError('certificat de la TSA hors validité à la date du jeton');

  // Chaîne : du certificat de la TSA jusqu'à un certificat du fichier fourni (la racine, ou un intermédiaire qu'on y a
  // mis), en passant au besoin par les certificats d'AC intermédiaire joints au jeton, valides à la date du jeton.
  // Les autorités qualifiées signent presque toutes avec un certificat émis par une AC intermédiaire.
  let chained = false;
  if (caPem) {
    const anchors = [...caPem.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)].map(m => new crypto.X509Certificate(m[0]));
    const issued = (child, ca) => { try { return child.checkIssued(ca) && child.verify(ca.publicKey); } catch { return false; } };
    const validAt = c => at >= new Date(c.validFrom) && at <= new Date(c.validTo);
    let cur = signer;
    for (let depth = 0; depth <= MAX_CHAIN && !chained; depth++) {
      chained = anchors.some(ca => issued(cur, ca));
      if (chained) break;
      const next = certs.find(c => c !== cur && c !== signer && c.ca && validAt(c) && issued(cur, c));
      if (!next) break;
      cur = next;
    }
    if (!chained) throw new TimestampError('certificat de la TSA non émis par l’autorité attendue');
  }
  return { signer: signer.subject.replace(/\n/g, ', '), validFrom: signer.validFrom, validTo: signer.validTo, chained };
});
