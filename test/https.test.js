require('../test-support/isolate');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const express = require('express');
const WebSocket = require('ws');
const {
  createHttpsListener, httpsConfigFromEnv, acmeChallenge, httpsRedirect, redirectLocation, isRedirectExempt
} = require('../src/utils/https');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-https-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(check, what, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(20);
  }
}

// Throwaway self-signed certificates (EC, or RSA where the openssl build lacks EC keygen).
let certCount = 0;
function makeCert() {
  const out = path.join(tmp, `gen-${certCount++}`);
  fs.mkdirSync(out);
  const files = ['-keyout', path.join(out, 'key.pem'), '-out', path.join(out, 'cert.pem')];
  const common = ['-nodes', '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', ...files];
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', ...common], { stdio: 'ignore' });
  } catch (_) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', ...common], { stdio: 'ignore' });
  }
  const cert = fs.readFileSync(path.join(out, 'cert.pem'));
  return { cert, key: fs.readFileSync(path.join(out, 'key.pem')), fingerprint: new crypto.X509Certificate(cert).fingerprint256 };
}

let opensslError = null;
let certA;
let certB;
try {
  certA = makeCert();
  certB = makeCert();
} catch (error) {
  opensslError = `openssl unavailable: ${error.message}`;
}
const needsOpenssl = opensslError ? { skip: opensslError } : {};

// Writes in place (like acme.sh install-cert) and moves mtime forward, so the change is seen even on
// file systems with coarse timestamps.
let stamp = Math.floor(Date.now() / 1000);
function writeFiles(dir, cert, key) {
  const certFile = path.join(dir, 'fullchain.pem');
  const keyFile = path.join(dir, 'key.pem');
  stamp += 10;
  if (cert !== undefined) {
    fs.writeFileSync(certFile, cert);
    fs.utimesSync(certFile, stamp, stamp);
  }
  if (key !== undefined) {
    fs.writeFileSync(keyFile, key);
    fs.utimesSync(keyFile, stamp, stamp);
  }
}

function captureLogger() {
  const lines = [];
  const log = level => message => lines.push({ level, message });
  return { lines, info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug') };
}

function servedFingerprint(port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: '127.0.0.1', port, servername: 'localhost', rejectUnauthorized: false }, () => {
      const fingerprint = socket.getPeerX509Certificate().fingerprint256;
      socket.destroy();
      resolve(fingerprint);
    });
    socket.once('error', reject);
  });
}

function request(port, pathname, { headers = {}, method = 'GET', secure = false } = {}) {
  return new Promise((resolve, reject) => {
    const client = secure ? https : http;
    const req = client.request({
      host: '127.0.0.1', port, path: pathname, method, headers, rejectUnauthorized: false, agent: false
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.once('error', reject);
    req.end();
  });
}

// The middleware order of src/server.js: challenge, redirect, then auth and the SPA fallback.
function buildApp({ webroot, redirect }) {
  const app = express();
  app.use(acmeChallenge({ webroot }));
  if (redirect) app.use(httpsRedirect(redirect));
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/ready', (req, res) => res.json({ ok: true }));
  app.use('/api', (req, res) => res.status(401).json({ error: 'auth' }));
  app.get('*', (req, res) => res.type('html').send('<html>spa</html>'));
  return app;
}

// Stand-in for miaospeedBackends.handleUpgrade: accepts reverse links and greets them.
function upgradeHandler() {
  const wss = new WebSocket.WebSocketServer({ noServer: true });
  return (req, socket, head) => {
    if (!req.url.startsWith('/miaospeed/reverse/')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, ws => ws.send(`hello ${req.url}`));
  };
}

function firstMessage(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    ws.once('message', data => { ws.close(); resolve(String(data)); });
    ws.once('error', reject);
  });
}

async function listenHttp(app, onUpgrade) {
  const server = http.createServer(app);
  if (onUpgrade) server.on('upgrade', onUpgrade);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

function newListener(dir, extra = {}) {
  const logger = captureLogger();
  const listener = createHttpsListener({
    handler: extra.handler || ((req, res) => res.end('secure ok')),
    onUpgrade: extra.onUpgrade || null,
    port: 0,
    host: '127.0.0.1',
    certFile: path.join(dir, 'fullchain.pem'),
    keyFile: path.join(dir, 'key.pem'),
    pollIntervalMs: 40,
    waitIntervalMs: 30,
    logger
  });
  return { listener, logger };
}

// ---- configuration ----

test('configuration from the environment: defaults and overrides', () => {
  const quiet = captureLogger();
  const defaults = httpsConfigFromEnv({}, '/srv/app', quiet);
  assert.deepEqual(defaults, {
    port: null,
    publicPort: null,
    redirect: false,
    certFile: '/srv/app/data/tls/fullchain.pem',
    keyFile: '/srv/app/data/tls/key.pem',
    webroot: '/srv/app/data/acme'
  });
  const custom = httpsConfigFromEnv({
    HTTPS_PORT: '3443', HTTPS_PUBLIC_PORT: '8443', HTTPS_REDIRECT: 'true',
    TLS_CERT_FILE: 'certs/a.pem', TLS_KEY_FILE: '/etc/k.pem', ACME_WEBROOT: '/var/acme'
  }, '/srv/app', quiet);
  assert.equal(custom.port, 3443);
  assert.equal(custom.publicPort, 8443);
  assert.equal(custom.redirect, true);
  assert.equal(custom.certFile, '/srv/app/certs/a.pem');
  assert.equal(custom.keyFile, '/etc/k.pem');
  assert.equal(custom.webroot, '/var/acme');
  assert.equal(httpsConfigFromEnv({ HTTPS_REDIRECT: 'false', HTTPS_PORT: '' }, '/x', quiet).redirect, false);

  const invalid = httpsConfigFromEnv({ HTTPS_PORT: '99999', HTTPS_PUBLIC_PORT: 'abc' }, '/x', quiet);
  assert.equal(invalid.port, null);
  assert.equal(invalid.publicPort, null);
  assert.ok(quiet.lines.some(line => line.level === 'error' && /HTTPS_PORT/.test(line.message)));
});

test('without HTTPS_PORT the listener is disabled and does nothing', async () => {
  const listener = createHttpsListener({ port: null, certFile: '/nonexistent/a', keyFile: '/nonexistent/b', logger: captureLogger() });
  await listener.start();
  assert.deepEqual(listener.status(), { enabled: false, active: false });
  assert.equal(listener.active, false);
  await listener.close();
});

// ---- ACME webroot ----

test('ACME webroot serves challenge tokens and nothing else', async () => {
  const webroot = path.join(tmp, 'acme');
  const challenges = path.join(webroot, '.well-known', 'acme-challenge');
  fs.mkdirSync(challenges, { recursive: true });
  fs.writeFileSync(path.join(challenges, 'Tok_en-123'), 'Tok_en-123.thumbprint');
  fs.writeFileSync(path.join(challenges, 'with.dot'), 'nope');
  fs.mkdirSync(path.join(challenges, 'subdir'));
  fs.writeFileSync(path.join(challenges, 'subdir', 'inner'), 'nope');
  fs.writeFileSync(path.join(challenges, 'big'), 'x'.repeat(10000));
  fs.writeFileSync(path.join(webroot, 'secret'), 'top secret');
  fs.symlinkSync(path.join(webroot, 'secret'), path.join(challenges, 'link'));

  // HTTPS is not running at all: the challenge must still work over plain HTTP.
  const { port, close } = await listenHttp(buildApp({ webroot }));
  try {
    const ok = await request(port, '/.well-known/acme-challenge/Tok_en-123?x=1');
    assert.equal(ok.status, 200);
    assert.equal(ok.body, 'Tok_en-123.thumbprint');
    assert.equal(ok.headers['content-type'], 'text/plain');
    assert.equal(ok.headers['content-security-policy'], undefined);
    const head = await request(port, '/.well-known/acme-challenge/Tok_en-123', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');

    for (const bad of [
      '/.well-known/acme-challenge/',
      '/.well-known/acme-challenge/missing',
      '/.well-known/acme-challenge/with.dot',
      '/.well-known/acme-challenge/subdir',
      '/.well-known/acme-challenge/subdir/inner',
      '/.well-known/acme-challenge/big',
      '/.well-known/acme-challenge/link',
      '/.well-known/acme-challenge/../secret',
      '/.well-known/acme-challenge/../../secret',
      '/.well-known/acme-challenge/..%2Fsecret',
      '/.well-known/acme-challenge/%2e%2e%2fsecret',
      '/.well-known/acme-challenge/Tok_en-123%00'
    ]) {
      const response = await request(port, bad);
      assert.equal(response.status, 404, bad);
      assert.doesNotMatch(response.body, /secret|spa|nope/, bad);
      assert.equal(response.headers['content-type'], 'text/plain', bad);
    }
    const post = await request(port, '/.well-known/acme-challenge/Tok_en-123', { method: 'POST' });
    assert.equal(post.status, 404);
    // Other paths still reach the app.
    assert.equal((await request(port, '/dashboard')).body, '<html>spa</html>');
    assert.equal((await request(port, '/api/nodes')).status, 401);
  } finally {
    await close();
  }
});

test('a missing webroot answers 404 instead of falling through', async () => {
  const { port, close } = await listenHttp(buildApp({ webroot: path.join(tmp, 'no-such-webroot') }));
  try {
    const response = await request(port, '/.well-known/acme-challenge/abc');
    assert.equal(response.status, 404);
    assert.equal(response.body, 'Not Found');
  } finally {
    await close();
  }
});

// ---- HTTPS listener ----

test('HTTPS waits for the certificate files and starts once they appear', needsOpenssl, async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'wait-'));
  const onUpgrade = upgradeHandler();
  const { listener, logger } = newListener(dir, { onUpgrade });
  try {
    await listener.start();
    let status = listener.status();
    assert.equal(status.enabled, true);
    assert.equal(status.active, false);
    assert.equal(status.certificate, null);
    assert.match(status.error, /waiting for the certificate/);
    assert.ok(!status.error.includes(dir), 'file paths stay out of the public status');

    // Several polls go by: the wait is logged once, and a key alone is not enough.
    writeFiles(dir, undefined, certA.key);
    await delay(150);
    assert.equal(listener.active, false);
    assert.equal(logger.lines.filter(line => /waiting for the certificate/.test(line.message)).length, 1);

    writeFiles(dir, certA.cert, certA.key);
    await waitFor(() => listener.active, 'the HTTPS listener');
    status = listener.status();
    assert.equal(status.error, null);
    assert.ok(status.port > 0);
    assert.equal(status.certificate.subject, 'localhost');
    assert.deepEqual(status.certificate.names, ['localhost']);
    assert.equal(status.certificate.fingerprint256, certA.fingerprint);
    assert.ok(Date.parse(status.certificate.notAfter) > Date.now());
    assert.ok(!JSON.stringify(status).includes('PRIVATE KEY'));
    assert.ok(logger.lines.some(line => /HTTPS certificate loaded: localhost/.test(line.message)));

    assert.equal(await servedFingerprint(status.port), certA.fingerprint);
    const response = await request(status.port, '/', { secure: true });
    assert.equal(response.body, 'secure ok');
    // Reverse links are accepted over wss:// by the same upgrade handler.
    assert.equal(await firstMessage(`wss://127.0.0.1:${status.port}/miaospeed/reverse/abc`), 'hello /miaospeed/reverse/abc');
  } finally {
    await listener.close();
  }
  assert.equal(listener.active, false);
});

test('a renewed certificate is served without a restart', needsOpenssl, async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'reload-'));
  writeFiles(dir, certA.cert, certA.key);
  const { listener, logger } = newListener(dir);
  try {
    await listener.start();
    assert.equal(listener.active, true);
    const { port } = listener.status();
    assert.equal(await servedFingerprint(port), certA.fingerprint);

    writeFiles(dir, certB.cert, certB.key);
    await waitFor(() => listener.status().certificate.fingerprint256 === certB.fingerprint, 'the reload');
    assert.equal(await servedFingerprint(port), certB.fingerprint);
    assert.equal(listener.status().port, port);
    assert.equal(listener.status().error, null);
    assert.ok(logger.lines.some(line => /HTTPS certificate reloaded/.test(line.message)));
  } finally {
    await listener.close();
  }
});

test('broken or half-written certificate files keep the current certificate', needsOpenssl, async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'broken-'));
  writeFiles(dir, certA.cert, certA.key);
  const { listener, logger } = newListener(dir);
  try {
    await listener.start();
    const { port } = listener.status();
    assert.equal(await servedFingerprint(port), certA.fingerprint);

    const half = certB.cert.subarray(0, Math.floor(certB.cert.length / 2));
    const cases = [
      [Buffer.from('garbage'), certA.key, /no certificate found/],
      [half, certA.key, /incomplete/],
      [Buffer.concat([certA.cert, half]), certA.key, /incomplete/], // fullchain cut off mid-way
      [certB.cert, certA.key, /does not match the private key/], // cert renewed, key not yet written
      [certA.cert, Buffer.from('-----BEGIN PRIVATE KEY-----\nAAAA'), /private key does not parse/]
    ];
    for (const [cert, key, expected] of cases) {
      writeFiles(dir, cert, key);
      await waitFor(() => expected.test(listener.status().error || ''), `error ${expected}`);
      const status = listener.status();
      assert.equal(status.active, true);
      assert.match(status.error, /keeping the current certificate/);
      assert.equal(status.certificate.fingerprint256, certA.fingerprint);
      assert.equal(await servedFingerprint(port), certA.fingerprint);
    }
    assert.ok(logger.lines.some(line => line.level === 'warn' && /cannot use the certificate files/.test(line.message)));

    // The files disappear: keep serving.
    fs.rmSync(path.join(dir, 'fullchain.pem'));
    await waitFor(() => /missing/.test(listener.status().error || ''), 'the missing-files error');
    assert.equal(await servedFingerprint(port), certA.fingerprint);

    // A complete, valid pair recovers.
    writeFiles(dir, certB.cert, certB.key);
    await waitFor(() => listener.status().certificate.fingerprint256 === certB.fingerprint, 'the recovery');
    assert.equal(listener.status().error, null);
    assert.equal(await servedFingerprint(port), certB.fingerprint);
  } finally {
    await listener.close();
  }
});

test('invalid files at start-up leave HTTPS off until they are fixed', needsOpenssl, async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'startup-'));
  writeFiles(dir, certB.cert, certA.key);
  const { listener } = newListener(dir);
  try {
    await listener.start();
    assert.equal(listener.active, false);
    assert.match(listener.status().error, /does not match/);
    writeFiles(dir, undefined, certB.key);
    await waitFor(() => listener.active, 'the HTTPS listener');
    assert.equal(await servedFingerprint(listener.status().port), certB.fingerprint);
  } finally {
    await listener.close();
  }
});

test('a busy port is retried until the listener can bind', needsOpenssl, async () => {
  const blocker = http.createServer();
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const busyPort = blocker.address().port;
  const dir = fs.mkdtempSync(path.join(tmp, 'busy-'));
  writeFiles(dir, certA.cert, certA.key);
  const logger = captureLogger();
  const listener = createHttpsListener({
    handler: (req, res) => res.end('ok'), port: busyPort, host: '127.0.0.1',
    certFile: path.join(dir, 'fullchain.pem'), keyFile: path.join(dir, 'key.pem'),
    pollIntervalMs: 40, waitIntervalMs: 30, logger
  });
  try {
    await listener.start();
    assert.equal(listener.active, false);
    assert.match(listener.status().error, /cannot listen on port \d+: EADDRINUSE/);
    assert.equal(listener.status().certificate.fingerprint256, certA.fingerprint);
    await delay(120);
    assert.equal(logger.lines.filter(line => /cannot listen/.test(line.message)).length, 1);
    await new Promise(resolve => blocker.close(resolve));
    await waitFor(() => listener.active, 'the retry');
    assert.equal(listener.status().error, null);
    assert.equal(await servedFingerprint(busyPort), certA.fingerprint);
  } finally {
    await listener.close();
    if (blocker.listening) blocker.close();
  }
});

test('close stops the certificate poll', needsOpenssl, async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'close-'));
  const { listener } = newListener(dir);
  await listener.start();
  await listener.close();
  writeFiles(dir, certA.cert, certA.key);
  await delay(150);
  assert.equal(listener.active, false);
  assert.equal(listener.timer, null);
});

// ---- redirect ----

test('redirect target uses the Host name only, plus the public HTTPS port', () => {
  const req = (host, url = '/a/b?c=1') => ({ headers: host === undefined ? {} : { host }, url, originalUrl: url });
  assert.equal(redirectLocation(req('example.com:3000')), 'https://example.com/a/b?c=1');
  assert.equal(redirectLocation(req('example.com')), 'https://example.com/a/b?c=1');
  assert.equal(redirectLocation(req('example.com:80'), { publicPort: 443 }), 'https://example.com/a/b?c=1');
  assert.equal(redirectLocation(req('example.com:3000'), { publicPort: 8443 }), 'https://example.com:8443/a/b?c=1');
  assert.equal(redirectLocation(req('[2001:db8::1]:3000')), 'https://[2001:db8::1]/a/b?c=1');
  assert.equal(redirectLocation(req('10.0.0.5:3000', '//evil.example/')), 'https://10.0.0.5//evil.example/');
  assert.equal(redirectLocation(req('example.com', 'http://evil.example/')), 'https://example.com/');
  for (const host of [undefined, '', 'evil.com/x', 'a b', 'example.com@evil.com', 'host:port', '1:2:3', 'example.com:80:81', '[::1', 'ex%61mple.com']) {
    assert.equal(redirectLocation(req(host)), null, String(host));
  }
});

test('redirect exemptions', () => {
  for (const exempt of ['/api/health', '/api/health/', '/api/ready', '/API/Health', '/.well-known/acme-challenge/x', '/miaospeed/reverse/abc']) {
    assert.equal(isRedirectExempt(exempt), true, exempt);
  }
  for (const redirected of ['/', '/api/nodes', '/api/healthz', '/api/health/x', '/miaospeed', '/.well-known/other']) {
    assert.equal(isRedirectExempt(redirected), false, redirected);
  }
});

test('plain HTTP is redirected with 308 only while HTTPS is active', async () => {
  let active = true;
  const webroot = path.join(tmp, 'acme-redirect');
  fs.mkdirSync(path.join(webroot, '.well-known', 'acme-challenge'), { recursive: true });
  fs.writeFileSync(path.join(webroot, '.well-known', 'acme-challenge', 'tok'), 'tok.key');
  const app = buildApp({ webroot, redirect: { publicPort: 8443, isActive: () => active } });
  const { port, close } = await listenHttp(app, upgradeHandler());
  try {
    const host = { host: 'dash.example.com:3000' };
    const redirected = await request(port, '/settings?tab=1', { headers: host });
    assert.equal(redirected.status, 308);
    assert.equal(redirected.headers.location, 'https://dash.example.com:8443/settings?tab=1');
    const post = await request(port, '/api/nodes', { headers: host, method: 'POST' });
    assert.equal(post.status, 308);

    assert.equal((await request(port, '/api/health', { headers: host })).status, 200);
    assert.equal((await request(port, '/api/ready', { headers: host })).status, 200);
    const challenge = await request(port, '/.well-known/acme-challenge/tok', { headers: host });
    assert.equal(challenge.status, 200);
    assert.equal(challenge.body, 'tok.key');
    assert.equal((await request(port, '/miaospeed/reverse/abc', { headers: host })).status, 200);
    // A websocket upgrade to the reverse path is never redirected.
    assert.equal(await firstMessage(`ws://127.0.0.1:${port}/miaospeed/reverse/xyz`), 'hello /miaospeed/reverse/xyz');
    // An odd Host header is served as is rather than redirected somewhere unexpected.
    assert.equal((await request(port, '/settings', { headers: { host: 'evil.com/x' } })).status, 200);

    active = false;
    assert.equal((await request(port, '/settings', { headers: host })).status, 200);
  } finally {
    await close();
  }
});

test('requests on the HTTPS listener are never redirected', needsOpenssl, async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'secure-'));
  writeFiles(dir, certA.cert, certA.key);
  const app = buildApp({ webroot: tmp, redirect: { isActive: () => true } });
  const { listener } = newListener(dir, { handler: app });
  try {
    await listener.start();
    const response = await request(listener.status().port, '/settings', { secure: true, headers: { host: 'localhost' } });
    assert.equal(response.status, 200);
    assert.equal(response.body, '<html>spa</html>');
  } finally {
    await listener.close();
  }
});
