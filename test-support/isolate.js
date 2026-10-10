// Keep tests away from the real data directory and configuration: modules that load at require-time
// (the monitor and config singletons) would otherwise read, migrate and re-save ./data and config.json.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-test-'));
if (!process.env.HISTORY_FILE) process.env.HISTORY_FILE = path.join(dir, 'history.json');
if (!process.env.CONFIG_FILE) process.env.CONFIG_FILE = path.join(dir, 'config.json');
module.exports = { dir };
