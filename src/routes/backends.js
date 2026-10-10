const express = require('express');
const backends = require('../miaospeed/backends');
const registry = require('../services/probes');

const router = express.Router();
const MIAOSPEED_IMAGE = process.env.MIAOSPEED_IMAGE || 'airportr/miaospeed:4.7.8';

// Base URL miaospeed backends dial for reverse links. Behind an HTTPS reverse proxy this is
// wss://<domain>; MIAOSPEED_PUBLIC_URL overrides what the request suggests.
function reverseBase(req) {
  const configured = String(process.env.MIAOSPEED_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured.replace(/^http/, 'ws');
  return `${req.protocol === 'https' ? 'wss' : 'ws'}://${req.get('host')}`;
}

// Everything a new reverse backend needs: its URL plus ready-to-run commands per platform.
function connectInfo(req, record) {
  const url = `${reverseBase(req)}${backends.REVERSE_PREFIX}${encodeURIComponent(record.id)}`;
  const args = `server -connect '${url}' -token '${record.token}'`;
  return {
    url,
    token: record.token,
    secure: url.startsWith('wss://'),
    docker: `docker run -d --name miaospeed --restart unless-stopped ${MIAOSPEED_IMAGE} ${args}`,
    binary: `./miaospeed ${args}`,
    windows: `miaospeed.exe server -connect "${url}" -token "${record.token}"`
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
