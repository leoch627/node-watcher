const express = require('express');
const eventLog = require('../services/eventLog');
const { CATEGORIES } = require('../services/eventLog');

const router = express.Router();

// Newest first; ?category=unlock|node|subscription|probe, ?limit=N
router.get('/', (req, res) => {
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  res.json({ success: true, events: eventLog.list({ category, limit: req.query.limit }) });
});

router.delete('/', (req, res) => {
  eventLog.clear();
  res.json({ success: true });
});

module.exports = router;
