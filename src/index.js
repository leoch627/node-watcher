// Entry point: the master (web UI, subscriptions, alerts, probe listener) by default, or a remote
// probe when NODE_WATCHER_MODE=agent.
require('dotenv').config();

if (process.env.NODE_WATCHER_MODE === 'agent') {
  require('./agent').main().catch(error => {
    // eslint-disable-next-line no-console
    console.error(`Node Watcher probe failed to start: ${error.message}`);
    process.exit(1);
  });
} else {
  module.exports = require('./server');
}
