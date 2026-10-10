const express = require('express');
const registry = require('../probe/registry');
const { formatJoin } = require('../probe/protocol');

const router = express.Router();
const IMAGE = process.env.PROBE_IMAGE || 'ghcr.io/leoch627/node-watcher:latest';

function listener() {
  const hub = registry.hub;
  return {
    enabled: Boolean(hub),
    port: hub?.port || null,
    publicPort: Number(process.env.PROBE_PUBLIC_PORT) || hub?.port || null,
    fingerprint: hub?.fingerprint || null,
    publicHost: process.env.PROBE_PUBLIC_HOST || null
  };
}

// Everything a new probe needs: the join string plus ready-to-run commands.
function joinInfo(req, probe, token) {
  const info = listener();
  const host = info.publicHost || req.hostname;
  const join = formatJoin({ id: probe.id, token, host, port: info.publicPort, fingerprint: info.fingerprint });
  return {
    join,
    docker: `docker run -d --name node-watcher-probe --restart unless-stopped -e NODE_WATCHER_MODE=agent -e NODE_WATCHER_JOIN='${join}' ${IMAGE}`,
    node: `NODE_WATCHER_MODE=agent NODE_WATCHER_JOIN='${join}' npm start`
  };
}

router.get('/', (req, res) => {
  res.json({ success: true, probes: registry.describe(), listener: listener() });
});

router.post('/', (req, res) => {
  if (!registry.hub) {
    return res.status(409).json({ success: false, error: 'The probe listener is disabled (PROBE_PORT=0)' });
  }
  try {
    const { probe, token } = registry.create(req.body?.name);
    res.status(201).json({ success: true, probe: { id: probe.id, name: probe.name }, ...joinInfo(req, probe, token) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/:id/rotate', (req, res) => {
  const record = registry.find(req.params.id);
  if (!record) return res.status(404).json({ success: false, error: 'Probe not found' });
  const token = registry.rotateToken(record.id);
  res.json({ success: true, probe: { id: record.id, name: record.name }, ...joinInfo(req, record, token) });
});

router.patch('/:id', (req, res) => {
  const record = registry.update(req.params.id, {
    name: typeof req.body?.name === 'string' ? req.body.name : undefined,
    enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined
  });
  if (!record) return res.status(404).json({ success: false, error: 'Probe not found' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  if (!registry.remove(req.params.id)) return res.status(404).json({ success: false, error: 'Probe not found' });
  res.json({ success: true });
});

module.exports = router;
module.exports.joinInfo = joinInfo;
