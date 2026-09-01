const express = require('express');
const config = require('../utils/config');
const subscriptionService = require('../services/subscription');
const schedulerService = require('../services/scheduler');

const router = express.Router();

router.get('/', (req, res) => {
  const imports = (config.getConfig().imports || []).map(({ content, ...item }) => item);
  res.json({ success: true, imports });
});

router.post('/preview', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Node links or Clash YAML are required' });
  }
  const parsed = subscriptionService.parseContent(content);
  return res.json({
    success: true,
    format: parsed.format,
    nodeCount: parsed.proxies.length,
    nodes: parsed.proxies.slice(0, 20).map(item => ({ name: item.name, type: item.type, server: item.server })),
    errors: parsed.errors.slice(0, 20)
  });
});

router.post('/', async (req, res) => {
  const { name, content } = req.body;
  if (!name || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ success: false, error: 'Name and node content are required' });
  }
  const parsed = subscriptionService.parseContent(content);
  if (parsed.proxies.length === 0) {
    return res.status(400).json({ success: false, error: parsed.errors[0]?.error || 'No supported nodes found' });
  }
  const item = config.addImport({ name: String(name).trim(), content, nodeCount: parsed.proxies.length });
  await schedulerService.reloadSubscriptions();
  return res.status(201).json({ success: true, import: { ...item, content: undefined }, errors: parsed.errors });
});

router.delete('/:id', async (req, res) => {
  if (!config.removeImport(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Import not found' });
  }
  await schedulerService.reloadSubscriptions();
  return res.json({ success: true });
});

module.exports = router;
