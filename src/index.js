// Entry point: the master (web UI, subscriptions, alerts, miaospeed backends).
require('dotenv').config();

if (process.env.NODE_WATCHER_MODE === 'agent') {
  // Probes used to run this app in agent mode; they are plain miaospeed backends now.
  // eslint-disable-next-line no-console
  console.error('NODE_WATCHER_MODE=agent is no longer supported: probes are miaospeed backends now.\n'
    + 'Add a reverse backend in the dashboard (Settings → miaospeed 后端) and run the command it shows, e.g.\n'
    + "  docker run -d --name miaospeed --restart unless-stopped airportr/miaospeed:4.7.8 server -connect 'wss://<master>/miaospeed/reverse/<id>' -token '<token>'");
  process.exit(1);
} else {
  module.exports = require('./server');
}
