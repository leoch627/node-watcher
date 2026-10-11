// Minimal X.509 issuing (ECDSA P-256 / SHA-256) for miaospeed mTLS, without dependencies: a private
// CA, a server certificate for the backend (-serverpublickey / -serverprivatekey) and a client
// certificate for the dashboard, which the backend checks with -clientca.
const crypto = require('crypto');
const net = require('net');

// --- DER ---------------------------------------------------------------------------------------

function length(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
};

const seq = (...parts) => tlv(0x30, ...parts);
const set = (...parts) => tlv(0x31, ...parts);
const explicit = (n, ...parts) => tlv(0xa0 + n, ...parts);
const octets = buffer => tlv(0x04, buffer);
const bool = value => tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
const utf8 = text => tlv(0x0c, Buffer.from(String(text), 'utf8'));

function integer(buffer) {
  let bytes = Buffer.from(buffer);
  while (bytes.length > 1 && bytes[0] === 0 && !(bytes[1] & 0x80)) bytes = bytes.subarray(1);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return tlv(0x02, bytes);
}

function oid(text) {
  const [a, b, ...rest] = text.split('.').map(Number);
  const out = [40 * a + b];
  for (const value of rest) {
    const chunk = [value & 0x7f];
    for (let v = value >> 7; v > 0; v >>= 7) chunk.unshift(0x80 | (v & 0x7f));
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}

function bitString(buffer, unused = 0) {
  return tlv(0x03, Buffer.from([unused]), buffer);
}

// UTCTime until 2049, GeneralizedTime after (RFC 5280 4.1.2.5).
function time(date) {
  const iso = date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return date.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(`${iso.slice(2)}Z`)) : tlv(0x18, Buffer.from(`${iso}Z`));
}

const OID = {
  ecdsaSha256: '1.2.840.10045.4.3.2', commonName: '2.5.4.3', organization: '2.5.4.10',
  basicConstraints: '2.5.29.19', keyUsage: '2.5.29.15', extKeyUsage: '2.5.29.37', subjectAltName: '2.5.29.17',
  subjectKeyId: '2.5.29.14', authorityKeyId: '2.5.29.35', serverAuth: '1.3.6.1.5.5.7.3.1', clientAuth: '1.3.6.1.5.5.7.3.2'
};

const name = commonName => seq(
  set(seq(oid(OID.organization), utf8('Node Watcher'))),
  set(seq(oid(OID.commonName), utf8(commonName)))
);

const extension = (id, critical, value) => seq(oid(id), ...(critical ? [bool(true)] : []), octets(value));

// SHA-1 of the subjectPublicKey bits, the usual key identifier (RFC 5280 4.2.1.2 method 1).
function keyId(publicKey) {
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  // SubjectPublicKeyInfo ::= SEQUENCE { algorithm, BIT STRING }; for P-256 the BIT STRING is the last 66 bytes.
  return crypto.createHash('sha1').update(spki.subarray(spki.length - 65)).digest();
}

function subjectAltNames(hosts) {
  return seq(...hosts.map(host => {
    if (net.isIP(host) === 4) return tlv(0x87, Buffer.from(host.split('.').map(Number)));
    if (net.isIP(host) === 6) return tlv(0x87, ipv6Bytes(host));
    return tlv(0x82, Buffer.from(host, 'ascii'));
  }));
}

function ipv6Bytes(address) {
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return Buffer.from(groups.flatMap(group => { const v = parseInt(group || '0', 16); return [v >> 8, v & 0xff]; }));
}

// kind: 'ca' | 'server' | 'client'.
function issue({ kind, commonName, publicKey, issuer, signingKey, hosts = [], days }) {
  const now = Date.now();
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;
  const ca = kind === 'ca';
  const extensions = [
    extension(OID.basicConstraints, true, ca ? seq(bool(true), integer(Buffer.from([0]))) : seq()),
    // digitalSignature (+ keyCertSign, cRLSign for the CA).
    extension(OID.keyUsage, true, ca ? bitString(Buffer.from([0x86]), 1) : bitString(Buffer.from([0x80]), 7)),
    ...(ca ? [] : [extension(OID.extKeyUsage, false, seq(oid(kind === 'server' ? OID.serverAuth : OID.clientAuth)))]),
    ...(kind === 'server' ? [extension(OID.subjectAltName, false, subjectAltNames(hosts))] : []),
    extension(OID.subjectKeyId, false, octets(keyId(publicKey))),
    ...(issuer ? [extension(OID.authorityKeyId, false, seq(tlv(0x80, keyId(issuer.publicKey))))] : [])
  ];
  const algorithm = seq(oid(OID.ecdsaSha256));
  const tbs = seq(
    explicit(0, integer(Buffer.from([2]))),
    integer(serial),
    algorithm,
    name(issuer ? issuer.commonName : commonName),
    seq(time(new Date(now - 5 * 60 * 1000)), time(new Date(now + days * 86400 * 1000))),
    name(commonName),
    publicKey.export({ type: 'spki', format: 'der' }),
    explicit(3, seq(...extensions))
  );
  const signature = crypto.sign('sha256', tbs, signingKey);
  const der = seq(tbs, algorithm, bitString(signature));
  return `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
}

const pkcs8 = key => key.export({ type: 'pkcs8', format: 'pem' });
const newKey = () => crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// One private CA per backend. Its key is not returned: once both sides are installed nothing else
// needs signing, and to replace them a new set is generated.
// hosts: names / IPs the backend is reached at (server certificate SAN).
function generateMtlsBundle({ hosts = [], name: label = 'miaospeed', days = 3650 } = {}) {
  const clean = [...new Set(hosts.map(host => String(host || '').trim().replace(/^\[|\]$/g, '')).filter(Boolean))];
  if (!clean.length) throw new Error('需要后端的域名或 IP');
  for (const host of clean) {
    if (net.isIP(host) === 6 && host.includes('.')) throw new Error(`请用纯 IPv6 写法：${host}`);
    if (!net.isIP(host) && !/^[A-Za-z0-9*]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(host)) {
      throw new Error(`无效的域名或 IP：${host}`);
    }
  }
  const caKeys = newKey();
  const caName = `${label} CA`.slice(0, 64);
  const ca = issue({ kind: 'ca', commonName: caName, publicKey: caKeys.publicKey, signingKey: caKeys.privateKey, days });
  const issuer = { commonName: caName, publicKey: caKeys.publicKey };
  const serverKeys = newKey();
  const server = issue({ kind: 'server', commonName: clean[0], publicKey: serverKeys.publicKey, issuer, signingKey: caKeys.privateKey, hosts: clean, days });
  const clientKeys = newKey();
  const client = issue({ kind: 'client', commonName: 'node-watcher', publicKey: clientKeys.publicKey, issuer, signingKey: caKeys.privateKey, days });
  return {
    ca, serverCert: server, serverKey: pkcs8(serverKeys.privateKey),
    clientCert: client, clientKey: pkcs8(clientKeys.privateKey), hosts: clean
  };
}

module.exports = { generateMtlsBundle, issue };
