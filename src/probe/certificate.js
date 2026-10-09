const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { normalizeFingerprint } = require('./protocol');

function fingerprintOf(certPem) {
  return normalizeFingerprint(new crypto.X509Certificate(certPem).fingerprint256);
}

function generateSelfSigned(certFile, keyFile) {
  fs.mkdirSync(path.dirname(certFile), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-cert-'));
  const tmpCert = path.join(tmp, 'cert.pem');
  const tmpKey = path.join(tmp, 'key.pem');
  const base = ['req', '-x509', '-nodes', '-days', '3650', '-subj', '/CN=node-watcher-master', '-keyout', tmpKey, '-out', tmpCert];
  try {
    try {
      execFileSync('openssl', [...base, '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1'], { stdio: 'pipe' });
    } catch (_) {
      // LibreSSL (macOS) and older OpenSSL builds: fall back to RSA.
      execFileSync('openssl', [...base, '-newkey', 'rsa:2048'], { stdio: 'pipe' });
    }
    fs.copyFileSync(tmpKey, keyFile);
    fs.chmodSync(keyFile, 0o600);
    fs.copyFileSync(tmpCert, certFile);
  } catch (error) {
    throw new Error(`Could not generate the probe TLS certificate with openssl (${error.message}). `
      + 'Install openssl or set PROBE_TLS_CERT_FILE / PROBE_TLS_KEY_FILE.');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Certificate for the probe listener: explicit files from the environment, otherwise a self-signed
// certificate created once and kept in the data directory. Probes pin its SHA-256 fingerprint.
function loadOrCreateCertificate(dataDir = path.join(process.cwd(), 'data')) {
  const certFile = process.env.PROBE_TLS_CERT_FILE || path.join(dataDir, 'probe-tls', 'cert.pem');
  const keyFile = process.env.PROBE_TLS_KEY_FILE || path.join(dataDir, 'probe-tls', 'key.pem');
  const explicit = Boolean(process.env.PROBE_TLS_CERT_FILE || process.env.PROBE_TLS_KEY_FILE);
  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
    if (explicit) throw new Error('PROBE_TLS_CERT_FILE / PROBE_TLS_KEY_FILE point to missing files');
    generateSelfSigned(certFile, keyFile);
  }
  const cert = fs.readFileSync(certFile, 'utf8');
  const key = fs.readFileSync(keyFile, 'utf8');
  return { cert, key, fingerprint: fingerprintOf(cert), selfSigned: !explicit };
}

module.exports = { loadOrCreateCertificate, generateSelfSigned, fingerprintOf };
