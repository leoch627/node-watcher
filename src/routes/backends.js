const express = require('express');
const backends = require('../miaospeed/backends');
const registry = require('../services/probes');
const { peekCertificate } = require('../miaospeed/session');
const { generateMtlsBundle } = require('../utils/certs');

const router = express.Router();
const SAFE_IMAGE = /^[A-Za-z0-9._\/:@-]+$/;
const MIAOSPEED_IMAGE = SAFE_IMAGE.test(process.env.MIAOSPEED_IMAGE || '') ? process.env.MIAOSPEED_IMAGE : 'airportr/miaospeed:4.7.8';
// One-click installer (same mirror as the README's master install command).
const SCRIPT_URL = process.env.PROBE_SCRIPT_URL
  || 'https://ghfast.top/https://raw.githubusercontent.com/leoch627/node-watcher/main/node-watcher.sh';

// POSIX single-quoting: the commands below are pasted into a root shell.
const sq = value => `'${String(value).replace(/'/g, "'\\''")}'`;

// Base URL miaospeed backends dial for reverse links. Behind an HTTPS reverse proxy this is
// wss://<domain>; MIAOSPEED_PUBLIC_URL overrides what the request suggests. The Host header is
// client-controlled, so it is parsed and only a plain host[:port] is accepted.
function reverseBase(req) {
  const configured = String(process.env.MIAOSPEED_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const candidate = configured ? configured.replace(/^http/, 'ws') : `${req.protocol === 'https' ? 'wss' : 'ws'}://${req.get('host') || ''}`;
  try {
    const url = new URL(candidate);
    if (['ws:', 'wss:'].includes(url.protocol) && /^[A-Za-z0-9.:[\]-]+$/.test(url.host)) {
      return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
    }
  } catch (_) { /* fall through */ }
  return 'ws://localhost';
}

// Everything a new reverse backend needs: its URL plus ready-to-run commands per platform.
function connectInfo(req, record) {
  const url = `${reverseBase(req)}${backends.REVERSE_PREFIX}${encodeURIComponent(record.id)}`;
  // -upload: miaospeed refuses upload speed tests unless it is started with it.
  const args = `server -connect ${sq(url)} -token ${sq(record.token)} -upload`;
  const probe = mode => `wget -N ${sq(SCRIPT_URL)} && bash node-watcher.sh probe${mode ? ` --mode ${mode}` : ''} --connect ${sq(url)} --token ${sq(record.token)}`;
  return {
    url,
    token: record.token,
    secure: url.startsWith('wss://'),
    script: probe(null),
    scriptBinary: probe('binary'),
    docker: `docker run -d --name miaospeed --restart unless-stopped ${MIAOSPEED_IMAGE} ${args}`,
    binary: `./miaospeed ${args}`,
    // url (validated above) and token (base64url) contain no characters cmd.exe treats specially.
    windows: `miaospeed.exe server -connect "${url}" -token "${record.token}" -upload`
  };
}

const publicRecord = record => ({ id: record.id, name: record.name, type: record.type });

router.get('/', (req, res) => {
  res.json({ success: true, backends: backends.list(), reverseBase: reverseBase(req) });
});

router.post('/', (req, res) => {
  try {
    const record = backends.create(req.body || {});
    res.status(201).json({ success: true, backend: publicRecord(record), ...(record.type === 'reverse' ? connectInfo(req, record) : {}) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// A matching set for one forward backend: CA + server pair to install on the backend, client pair
// for the dashboard. Nothing is stored here; the form saves the CA and client pair with the backend.
router.post('/mtls', (req, res) => {
  try {
    const { url, hosts, name } = req.body || {};
    const list = Array.isArray(hosts) ? hosts.map(String) : [];
    if (!list.length && url) {
      try { list.push(new URL(String(url)).hostname); } catch (_) { /* reported below */ }
    }
    res.json({ success: true, ...generateMtlsBundle({ hosts: list, name: String(name || 'miaospeed').slice(0, 40) }) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// The certificate a wss:// backend serves, so it can be pinned (trust on first use, confirmed by the admin).
router.post('/peek-cert', async (req, res) => {
  try {
    const { url, servername } = req.body || {};
    res.json({ success: true, certificate: await peekCertificate(url, { servername: servername ? String(servername) : null }) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const record = backends.update(req.params.id, req.body || {});
    if (!record) return res.status(404).json({ success: false, error: 'Backend not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/:id/rotate', (req, res) => {
  const record = backends.rotateToken(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'Backend not found' });
  res.json({ success: true, backend: publicRecord(record), ...connectInfo(req, record) });
});

router.post('/:id/check', async (req, res) => {
  const record = backends.find(req.params.id);
  if (!record || record.type !== 'forward') return res.status(404).json({ success: false, error: 'Backend not found' });
  const state = await backends.checkForward(record);
  res.json({ success: state.online, ...state, error: state.error || undefined });
});

router.delete('/:id', (req, res) => {
  if (!backends.remove(req.params.id)) return res.status(404).json({ success: false, error: 'Backend not found' });
  registry.forget(req.params.id);
  res.json({ success: true });
});

module.exports = router;
module.exports.connectInfo = connectInfo;
