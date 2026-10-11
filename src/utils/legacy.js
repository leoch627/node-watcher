// One-time cleanup of what earlier versions left behind: the TLS probe protocol (probe records with
// token hashes, per-probe history files, the listener's certificate) and the mihomo working
// directory. None of it is read any more.
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function cleanupLegacy({ store, dataDir }) {
  const removed = [];
  const cfg = store.getConfig();
  if (Array.isArray(cfg.probes)) {
    delete cfg.probes;
    if (store.saveConfig()) removed.push('config.probes');
  }
  let entries = [];
  try { entries = fs.readdirSync(dataDir); } catch (_) { /* no data dir yet */ }
  for (const name of entries) {
    // history-p-xxxxxxxx.json belonged to old TLS probes; miaospeed backends use history-m-*.json.
    if (/^history-p-[0-9a-f]+\.json(\.v1\.bak)?$/.test(name)) {
      fs.rmSync(path.join(dataDir, name), { force: true });
      removed.push(name);
    }
  }
  for (const dir of ['probe-tls', 'mihomo']) {
    const target = path.join(dataDir, dir);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(`${dir}/`);
    }
  }
  if (removed.length) logger.info(`Removed leftovers of earlier versions: ${removed.join(', ')}`);
  return removed;
}

module.exports = { cleanupLegacy };
