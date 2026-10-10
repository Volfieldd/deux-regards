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
};
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
export function readDer(buf, pos = 0) {
  if (pos + 2 > buf.length) throw new TimestampError('DER tronqué');
  const tag = buf[pos];
  let length = buf[pos + 1];
  let header = 2;
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n === 0 || n > 4) throw new TimestampError('longueur DER non prise en charge');
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
      const child = readDer(buf, p);
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
  if (!m) throw new TimestampError('date du jeton illisible');
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}Z`);
}

// ---------- requête ----------

// TimeStampReq : version 1, empreinte SHA-256, nonce aléatoire, certificat de la TSA demandé.
export function buildRequest(sha256Hex, nonce = crypto.randomBytes(8)) {
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

// Envoie la requête à la TSA ; renvoie la réponse DER brute.
export async function requestTimestamp(url, sha256Hex, { fetchImpl = fetch, timeoutMs = 20_000, nonce: fixedNonce } = {}) {
  const { der, nonce } = buildRequest(sha256Hex, fixedNonce);
  const res = await fetchImpl(url, {
    method: 'POST', body: der, headers: { 'content-type': 'application/timestamp-query' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new TimestampError(`la TSA a répondu ${res.status}`);
  const reply = Buffer.from(await res.arrayBuffer());
  const parsed = parseReply(reply);
  if (parsed.nonce !== nonce) throw new TimestampError('nonce différent de celui demandé');
  if (parsed.hashedMessage !== sha256Hex) throw new TimestampError('le jeton ne porte pas sur cette empreinte');
  return { reply, ...parsed };
}

// ---------- analyse ----------

// TimeStampResp → informations utiles, le jeton (ContentInfo) et les pièces de la signature.
export function parseReply(buf) {
  const resp = readDer(buf);
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
}

// ---------- vérification ----------

// Vérifie la signature du jeton (et, si un certificat racine est fourni, la chaîne jusqu'à lui).
// Renvoie { signer, validFrom, validTo, chained } ou lève TimestampError.
export function verifyToken(parsed, { caPem = null } = {}) {
  const si = parsed.signerInfo.children;
  const digestAlg = HASHES[readOid(si[2].children[0])];
  const signedAttrs = si.find(n => n.tag === 0xa0);
  const signature = si.find((n, k) => k > 3 && n.tag === 0x04)?.value;
  if (!digestAlg || !signedAttrs || !signature) throw new TimestampError('signature du jeton illisible');

  // L'attribut messageDigest doit être l'empreinte du TSTInfo signé.
  const md = signedAttrs.children.find(a => readOid(a.children[0]) === OID.messageDigest);
  const expected = crypto.createHash(digestAlg).update(parsed.tstDer).digest('hex');
  if (!md || md.children[1].children[0].value.toString('hex') !== expected) throw new TimestampError('le contenu signé ne correspond pas au jeton');

  // La signature porte sur les attributs signés, réencodés en SET (0x31).
  const attrs = Buffer.concat([Buffer.from([0x31]), signedAttrs.raw.subarray(1)]);
  const certs = parsed.certs.map(der => new crypto.X509Certificate(der));
  const signer = certs.find(c => {
    try { return crypto.verify(digestAlg, attrs, c.publicKey, signature); } catch { return false; }
  });
  if (!signer) throw new TimestampError('signature invalide (ou certificat de la TSA absent du jeton)');
  const at = parsed.genTime;
  if (at < new Date(signer.validFrom) || at > new Date(signer.validTo)) throw new TimestampError('certificat de la TSA hors validité à la date du jeton');

  let chained = false;
  if (caPem) {
    const roots = [...caPem.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)].map(m => new crypto.X509Certificate(m[0]));
    chained = roots.some(ca => signer.checkIssued(ca) && signer.verify(ca.publicKey));
    if (!chained) throw new TimestampError('certificat de la TSA non émis par l’autorité attendue');
  }
  return { signer: signer.subject.replace(/\n/g, ', '), validFrom: signer.validFrom, validTo: signer.validTo, chained };
}
