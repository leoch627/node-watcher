const express = require('express');
const monitorService = require('../services/monitor');
const reportService = require('../services/report');

const router = express.Router();

router.get('/latest.png', async (req, res, next) => {
  try {
    const png = await reportService.render(monitorService.getPublicStats());
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
