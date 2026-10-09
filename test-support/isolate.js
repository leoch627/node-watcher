// Keep tests away from the real data directory: modules that load at require-time (the monitor singleton)
// would otherwise read, migrate and re-save ./data/history.json.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.env.HISTORY_FILE) {
  process.env.HISTORY_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-test-')), 'history.json');
}
