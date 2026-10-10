// HTTPS for the master. miaospeed only trusts publicly trusted certificates, so reverse links over
// wss:// need a real (Let's Encrypt) certificate. acme.sh runs in its own container: it answers
// HTTP-01 challenges through a webroot that we serve over plain HTTP and writes the certificate
// files, which are picked up here (also when they appear after start-up) and hot-reloaded on renewal.
const fs = require('fs');
const path = require('path');
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');
const defaultLogger = require('./logger');

const ACME_PREFIX = '/.well-known/acme-challenge/';
const REVERSE_PREFIX = '/miaospeed/reverse/';
const TOKEN_RE = /^[A-Za-z0-9_-]+$/;
// Key authorizations are ~90 bytes; anything much larger is not a challenge file.
const MAX_TOKEN_BYTES = 4096;
const POLL_INTERVAL_MS = 60 * 1000;
// While no certificate is loaded yet, look more often so HTTPS comes up soon after issuance.
const WAIT_INTERVAL_MS = 5 * 1000;
const HOST_CHARS_RE = /^[A-Za-z0-9.:[\]-]+$/;
const HOST_RE = /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?$/;
// Plain HTTP keeps working for these even with HTTPS_REDIRECT: the ACME challenge (Let's Encrypt
// starts on port 80), container health checks, and LAN probes that dial ws://<ip>/miaospeed/reverse/.
const REDIRECT_EXEMPT_PATHS = new Set(['/api/health', '/api/ready']);
const REDIRECT_EXEMPT_PREFIXES = [ACME_PREFIX, REVERSE_PREFIX];

const pathOf = req => String(req.url || '').split('?')[0];

function parsePort(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined;
}

// Settings from the environment. Relative paths resolve against the working directory, like ./data.
function httpsConfigFromEnv(env = process.env, cwd = process.cwd(), logger = defaultLogger) {
  const port = parsePort(env.HTTPS_PORT);
  const publicPort = parsePort(env.HTTPS_PUBLIC_PORT);
  if (port === undefined) logger.error(`Ignoring invalid HTTPS_PORT "${env.HTTPS_PORT}"; HTTPS stays off`);
  if (publicPort === undefined) logger.warn(`Ignoring invalid HTTPS_PUBLIC_PORT "${env.HTTPS_PUBLIC_PORT}"`);
  const redirect = /^(1|true|yes)$/i.test(String(env.HTTPS_REDIRECT || '').trim());
  if (redirect && !port) logger.warn('HTTPS_REDIRECT is set but HTTPS_PORT is not; plain HTTP is not redirected');
  return {
    port: port || null,
    publicPort: publicPort || null,
    redirect,
    certFile: path.resolve(cwd, env.TLS_CERT_FILE || path.join('data', 'tls', 'fullchain.pem')),
    keyFile: path.resolve(cwd, env.TLS_KEY_FILE || path.join('data', 'tls', 'key.pem')),
    webroot: path.resolve(cwd, env.ACME_WEBROOT || path.join('data', 'acme'))
  };
}

// ---- ACME HTTP-01 webroot ----

function sendText(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  return res;
}

// Opens without following a symlink and without blocking on a FIFO; only small regular files count.
async function readTokenFile(file) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  let handle = null;
  try {
    handle = await fs.promises.open(file, flags);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_TOKEN_BYTES) return null;
    return await handle.readFile();
  } catch (_) {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

// Serves <webroot>/.well-known/acme-challenge/<token> (acme.sh --webroot layout). Mounted first, so
// neither the redirect, the auth middleware nor the SPA fallback ever sees these paths.
function acmeChallenge({ webroot }) {
  const dir = path.join(path.resolve(webroot), '.well-known', 'acme-challenge');
  return function acmeChallengeHandler(req, res, next) {
    const pathname = pathOf(req);
    if (!pathname.startsWith(ACME_PREFIX)) return next();
    const token = pathname.slice(ACME_PREFIX.length);
    const notFound = () => sendText(res, 404, 'Not Found').end(req.method === 'HEAD' ? undefined : 'Not Found');
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !TOKEN_RE.test(token)) return notFound();
    readTokenFile(path.join(dir, token)).then(body => {
      if (!body) return notFound();
      sendText(res, 200, body).end(req.method === 'HEAD' ? undefined : body);
    }, notFound);
  };
}

// ---- HTTP -> HTTPS redirect ----

function isRedirectExempt(pathname) {
  let lower = String(pathname || '').toLowerCase();
  if (REDIRECT_EXEMPT_PREFIXES.some(prefix => lower.startsWith(prefix))) return true;
  if (lower.length > 1 && lower.endsWith('/')) lower = lower.slice(0, -1);
  return REDIRECT_EXEMPT_PATHS.has(lower);
}

// https://<Host without port>[:publicPort]<url>, or null when the Host header cannot be trusted to
// build a URL from (missing, odd characters, not host[:port]).
function redirectLocation(req, { publicPort = null } = {}) {
  const host = req.headers && req.headers.host;
  if (typeof host !== 'string' || !HOST_CHARS_RE.test(host)) return null;
  const match = HOST_RE.exec(host);
  if (!match) return null;
  const port = publicPort && Number(publicPort) !== 443 ? `:${Number(publicPort)}` : '';
  let target = String(req.originalUrl || req.url || '/');
  if (!target.startsWith('/')) target = '/';
  return `https://${match[1]}${port}${target}`;
}

// The socket check comes first so a request on the TLS port is never redirected; req.secure covers a
// TLS-terminating proxy in front of the HTTP port (with TRUST_PROXY).
const isSecure = req => Boolean((req.socket && req.socket.encrypted) || req.secure === true);

// 308 keeps the method and body. Websocket upgrades never reach Express (the server's 'upgrade'
// event handles them), so reverse links on plain HTTP keep working regardless.
function httpsRedirect({ enabled = true, isActive, publicPort = null }) {
  return function httpsRedirectHandler(req, res, next) {
    if (!enabled || isSecure(req) || !isActive() || isRedirectExempt(pathOf(req))) return next();
    const location = redirectLocation(req, { publicPort });
    if (!location) return next();
    try {
      res.setHeader('Location', location);
    } catch (_) {
      return next(); // characters Node refuses in a header value
    }
    // Not cached: the redirect only holds while the HTTPS listener is up.
    sendText(res, 308, `Redirecting to ${location}`).end(req.method === 'HEAD' ? undefined : `Redirecting to ${location}`);
  };
}

// ---- Certificates ----

const commonName = dn => {
  const line = String(dn || '').split('\n').find(part => part.startsWith('CN='));
  return line ? line.slice(3) : String(dn || '').replace(/\n/g, ', ');
};

const altNames = san => String(san || '')
  .split(/,\s*/)
  .map(entry => entry.slice(entry.indexOf(':') + 1).trim())
  .filter(Boolean);

const toIso = (date, text) => {
  const value = date instanceof Date ? date : new Date(text);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
};

function describeCertificate(x509) {
  return {
    subject: commonName(x509.subject),
    names: altNames(x509.subjectAltName),
    issuer: commonName(x509.issuer),
    notBefore: toIso(x509.validFromDate, x509.validFrom),
    notAfter: toIso(x509.validToDate, x509.validTo),
    fingerprint256: x509.fingerprint256
  };
}

// Rejects anything TLS would refuse, plus a fullchain that is still being written (a certificate
// block without its END line). Returns what /api/health shows about the certificate.
function inspectPair(cert, key, minVersion = 'TLSv1.2') {
  const pem = cert.toString('utf8');
  const begins = (pem.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
  if (!begins) throw new Error('no certificate found in the certificate file');
  if (blocks.length !== begins) throw new Error('the certificate file is incomplete');
  let leaf;
  try {
    [leaf] = blocks.map(block => new crypto.X509Certificate(block));
  } catch (error) {
    throw new Error(`the certificate does not parse (${error.message})`);
  }
  let privateKey;
  try {
    privateKey = crypto.createPrivateKey(key);
  } catch (error) {
    throw new Error(`the private key does not parse (${error.message})`);
  }
  if (!leaf.checkPrivateKey(privateKey)) throw new Error('the certificate does not match the private key');
  tls.createSecureContext({ cert, key, minVersion });
  return describeCertificate(leaf);
}

const describe = info => `${info.subject} [${info.names.join(', ')}], issuer ${info.issuer}, expires ${info.notAfter}`;

class HttpsListener {
  constructor({
    handler, onUpgrade = null, port = null, host, certFile, keyFile,
    pollIntervalMs = POLL_INTERVAL_MS, waitIntervalMs = WAIT_INTERVAL_MS,
    minVersion = 'TLSv1.2', logger = defaultLogger
  } = {}) {
    this.enabled = port !== null && port !== undefined;
    Object.assign(this, { handler, onUpgrade, port, host, certFile, keyFile, pollIntervalMs, waitIntervalMs, minVersion, logger });
    this.server = null;
    this.pair = null; // { cert, key, info } currently served
    this.attempted = null; // stat signature of the files last tried, so broken files are not re-read every poll
    this.loadError = null;
    this.listenError = null;
    this.error = null;
    this.timer = null;
    this.started = false;
    this.checking = false;
    this.closed = false;
  }

  get active() {
    return Boolean(this.server && this.server.listening);
  }

  status() {
    if (!this.enabled) return { enabled: false, active: false };
    const address = this.active ? this.server.address() : null;
    return {
      enabled: true,
      active: this.active,
      port: address && typeof address === 'object' ? address.port : this.port,
      certificate: this.pair ? { ...this.pair.info } : null,
      error: this.error
    };
  }

  async start() {
    if (!this.enabled || this.started || this.closed) return;
    this.started = true;
    this.logger.info(`HTTPS enabled on port ${this.port} (certificate ${this.certFile}, key ${this.keyFile})`);
    await this.check();
  }

  // Logs each distinct problem once instead of on every poll. The message also goes into the public
  // /api/health, so file paths only go to the log (detail).
  setError(message, level = 'warn', detail = '') {
    if (message && message !== this.error) this.logger[level](`HTTPS: ${message}${detail ? ` (${detail})` : ''}`);
    this.error = message || null;
  }

  async readSignature() {
    const stats = await Promise.all([fs.promises.stat(this.certFile), fs.promises.stat(this.keyFile)]);
    if (!stats.every(stat => stat.isFile())) throw Object.assign(new Error('not a regular file'), { code: 'ENOENT' });
    return stats.map(stat => `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`).join('|');
  }

  async check() {
    if (this.closed || this.checking) return;
    this.checking = true;
    try {
      const files = `${this.certFile}, ${this.keyFile}`;
      let signature;
      try {
        signature = await this.readSignature();
      } catch (error) {
        if (error.code !== 'ENOENT') this.setError(`cannot read the certificate files (${error.code || error.message})`, 'warn', files);
        else if (this.pair) this.setError('the certificate files are missing; keeping the loaded certificate', 'warn', files);
        else this.setError('waiting for the certificate files; HTTPS starts once they exist', 'info', files);
        return;
      }
      if (signature !== this.attempted) {
        this.attempted = signature;
        await this.load();
      }
      if (this.pair && !this.server) await this.listen();
      this.setError(this.loadError || this.listenError, 'warn', this.loadError ? files : '');
    } catch (error) {
      this.setError(error.message, 'error');
    } finally {
      this.checking = false;
      this.schedule();
    }
  }

  async load() {
    try {
      const [cert, key] = await Promise.all([fs.promises.readFile(this.certFile), fs.promises.readFile(this.keyFile)]);
      const info = inspectPair(cert, key, this.minVersion);
      const previous = this.pair && this.pair.info;
      if (this.server) this.server.setSecureContext({ cert, key });
      this.pair = { cert, key, info };
      this.loadError = null;
      if (!previous || previous.fingerprint256 !== info.fingerprint256) {
        this.logger.info(`HTTPS certificate ${previous ? 'reloaded' : 'loaded'}: ${describe(info)}`);
      }
      if (info.notAfter && Date.parse(info.notAfter) < Date.now()) {
        this.logger.warn(`HTTPS certificate expired on ${info.notAfter}; is renewal running?`);
      }
    } catch (error) {
      // Half-written renewal or a bad file: keep serving the current certificate; the next change
      // to the files triggers another attempt. fs errors carry the path, so only their code is kept.
      const reason = error.code ? `cannot read them (${error.code})` : error.message;
      this.loadError = `cannot use the certificate files: ${reason}${this.pair ? '; keeping the current certificate' : ''}`;
    }
  }

  listen() {
    return new Promise(resolve => {
      const server = https.createServer({ cert: this.pair.cert, key: this.pair.key, minVersion: this.minVersion }, this.handler);
      if (this.onUpgrade) server.on('upgrade', this.onUpgrade);
      const onError = error => {
        server.removeListener('listening', onListening);
        this.listenError = `cannot listen on port ${this.port}: ${error.code || error.message}`;
        resolve();
      };
      const onListening = () => {
        server.removeListener('error', onError);
        server.on('error', error => this.logger.error(`HTTPS server error: ${error.message}`));
        if (this.closed) {
          server.close();
          return resolve();
        }
        this.server = server;
        this.listenError = null;
        this.logger.info(`HTTPS listening on port ${server.address().port}`);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.port, this.host);
    });
  }

  schedule() {
    if (this.closed || !this.started) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), this.active ? this.pollIntervalMs : this.waitIntervalMs);
    this.timer.unref();
  }

  // Stops the certificate poll and accepting connections; resolves once open connections are gone.
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = null;
    const server = this.server;
    this.server = null;
    if (!server) return Promise.resolve();
    return new Promise(resolve => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
  }
}

const createHttpsListener = options => new HttpsListener(options);

module.exports = {
  ACME_PREFIX,
  HttpsListener,
  createHttpsListener,
  httpsConfigFromEnv,
  acmeChallenge,
  httpsRedirect,
  redirectLocation,
  isRedirectExempt,
  inspectPair
};
