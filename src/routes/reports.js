const express = require('express');
const registry = require('../services/probes');
const reportService = require('../services/report');
const schedulerService = require('../services/scheduler');
const { version } = require('../../package.json');

const router = express.Router();

router.get('/latest.png', async (req, res, next) => {
  try {
    const id = String(req.query.probe || registry.defaultProbeId());
    const monitor = registry.monitorFor(id);
    if (!monitor) return res.status(404).json({ success: false, error: 'Probe not found' });
    const probeName = registry.list().length > 1 ? registry.list().find(item => item.id === id)?.name : null;
    const png = await reportService.render(monitor.getPublicStats(), {
      probeName, columns: schedulerService.unlockSettings().scripts, appVersion: version
    });
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="node-watcher-report.png"',
      'Cache-Control': 'no-store'
    });
    res.send(png);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
