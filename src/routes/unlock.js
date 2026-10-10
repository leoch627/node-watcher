const express = require('express');
const config = require('../utils/config');
const scripts = require('../miaospeed/scripts');
const schedulerService = require('../services/scheduler');

const router = express.Router();

// Script catalogue (miaospeed-scripts) and the current column selection.
router.get('/', (req, res) => {
  res.json({ success: true, scripts: scripts.list(), settings: schedulerService.unlockSettings(), defaults: scripts.DEFAULT_SCRIPTS });
});

router.put('/', (req, res) => {
  const body = req.body || {};
  const chosen = Array.isArray(body.scripts) ? [...new Set(body.scripts.map(String))] : null;
  if (chosen && chosen.some(id => !scripts.meta(id))) {
    return res.status(400).json({ success: false, error: 'Unknown script id' });
  }
  if (chosen && chosen.length > 30) return res.status(400).json({ success: false, error: 'Choose at most 30 scripts' });
  const cfg = config.getConfig();
  cfg.unlock = {
    ...(cfg.unlock || {}),
    ...(chosen ? { scripts: chosen } : {}),
    ...(typeof body.regional === 'boolean' ? { regional: body.regional } : {})
  };
  if (!config.updateConfig(cfg)) return res.status(500).json({ success: false, error: 'Could not save configuration' });
  res.json({ success: true, settings: schedulerService.unlockSettings() });
});

module.exports = router;
