const express = require('express');
const deepTest = require('../services/deepTest');
const { PRESETS, DOWNLOAD_URLS } = require('../services/deepTest');
const deepReport = require('../services/deepReport');
const backends = require('../miaospeed/backends');
const { version } = require('../../package.json');

const router = express.Router();

router.get('/', (req, res) => {
  const current = deepTest.current;
  res.json({
    success: true,
    current: current ? deepTest.summary(current) : null,
    history: deepTest.list(),
    presets: Object.fromEntries(Object.entries(PRESETS).map(([key, value]) => [key, value.label])),
    downloadSources: Object.keys(DOWNLOAD_URLS),
    backends: backends.list()
  });
});

router.post('/', (req, res) => {
  try {
    const job = deepTest.start(req.body || {});
    res.status(202).json({ success: true, job: deepTest.summary(job) });
  } catch (error) {
    res.status(error.status || 400).json({ success: false, error: error.message });
  }
});

router.get('/:id', (req, res) => {
  const job = deepTest.get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Test not found' });
  res.json({ success: true, job });
});

router.post('/:id/cancel', (req, res) => {
  if (!deepTest.cancel(req.params.id)) return res.status(409).json({ success: false, error: 'Test is not running' });
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  if (!deepTest.remove(req.params.id)) return res.status(404).json({ success: false, error: 'Test not found' });
  res.json({ success: true });
});

router.get('/:id/report.png', async (req, res, next) => {
  try {
    const job = deepTest.get(req.params.id);
    if (!job) return res.status(404).json({ success: false, error: 'Test not found' });
    const sort = ['speed', 'rtt', 'http'].includes(req.query.sort) ? req.query.sort : null;
    const png = await deepReport.render(job, { appVersion: version, sort });
    const name = `node-watcher-${job.preset}-${job.startedAt.slice(0, 19).replace(/[:T]/g, '')}.png`;
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'no-store'
    });
    res.send(png);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
