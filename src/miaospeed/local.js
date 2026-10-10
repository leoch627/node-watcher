// The master's own miaospeed: a child process bound to loopback with a per-start random token and
// websocket path, restarted with backoff when it exits.
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../utils/logger');

const MAX_RESTART_DELAY_MS = 60000;
const EXE = process.platform === 'win32' ? '.exe' : '';

function onPath(name) {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, name + EXE))) return path.join(dir, name + EXE);
  }
  return null;
}

// MIAOSPEED_BIN, then ./bin/miaospeed[.exe] (npm run setup:bin), then the image's
// /usr/local/bin/miaospeed, then PATH.
function resolveBinary(env = process.env, cwd = process.cwd()) {
  if (env.MIAOSPEED_BIN) return fs.existsSync(env.MIAOSPEED_BIN) ? env.MIAOSPEED_BIN : null;
  const candidates = [path.join(cwd, 'bin', `miaospeed${EXE}`), '/usr/local/bin/miaospeed'];
  return candidates.find(file => fs.existsSync(file)) || onPath('miaospeed');
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`miaospeed did not listen on 127.0.0.1:${port}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

class LocalMiaospeed {
  constructor(options = {}) {
    this.enabled = options.enabled ?? process.env.MIAOSPEED_LOCAL !== 'false';
    this.port = Number(options.port ?? process.env.MIAOSPEED_PORT ?? 23380);
    this.extraArgs = options.extraArgs ?? (process.env.MIAOSPEED_MMDB ? ['-mmdb', process.env.MIAOSPEED_MMDB] : []);
    this.binary = null;
    this.process = null;
    this.ready = false;
    this.stopping = false;
    this.restartTimer = null;
    this.restartAttempts = 0;
    this.token = null;
    this.wsPath = null;
    this.version = null;
    this.error = null;
  }

  get url() {
    return `ws://127.0.0.1:${this.port}${this.wsPath}`;
  }

  async start() {
    if (!this.enabled) {
      this.error = 'disabled (MIAOSPEED_LOCAL=false)';
      return;
    }
    this.binary = resolveBinary();
    if (!this.binary) {
      this.error = 'miaospeed binary not found (run "npm run setup:bin" or set MIAOSPEED_BIN)';
      logger.warn(`Local miaospeed unavailable: ${this.error}`);
      return;
    }
    this.stopping = false;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.kill();
    this.token = crypto.randomBytes(24).toString('base64url');
    this.wsPath = `/${crypto.randomBytes(12).toString('hex')}`;
    const args = ['server', '-bind', `127.0.0.1:${this.port}`, '-path', this.wsPath, '-token', this.token, ...this.extraArgs];
    logger.info(`Starting local miaospeed: ${this.binary} (127.0.0.1:${this.port})`);
    const child = spawn(this.binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.process = child;
    this.ready = false;
    const relay = data => {
      const text = data.toString();
      const version = text.match(/MiaoSpeed version: ([^\s,]+)/);
      if (version) this.version = version[1];
      for (const line of text.split('\n')) {
        // "Task receiving error ... close 100x" is logged every time a client closes its connection.
        if (/^\s*(ERRO|WARN)/.test(line) && !/Allow ip range|custom websocket path|Start Listening|MiaoSpeed version|Task receiving error/.test(line)) {
          logger.warn(`[miaospeed] ${line.trim()}`);
        }
      }
    };
    child.stdout.on('data', relay);
    child.stderr.on('data', relay);
    child.on('error', error => {
      if (this.process !== child) return;
      this.ready = false;
      this.error = error.message;
      this.scheduleRestart(error.message);
    });
    child.on('close', code => {
      if (this.process !== child) return;
      this.process = null;
      this.ready = false;
      if (!this.stopping) {
        this.error = `exited with code ${code}`;
        this.scheduleRestart(this.error);
      }
    });
    try {
      await waitForPort(this.port, 15000);
    } catch (error) {
      this.error = error.message;
      if (this.process === child) this.scheduleRestart(error.message);
      throw error;
    }
    this.ready = true;
    this.error = null;
    this.restartAttempts = 0;
    logger.info(`Local miaospeed is ready${this.version ? ` (${this.version})` : ''}`);
  }

  scheduleRestart(reason) {
    if (this.stopping || this.restartTimer) return;
    this.restartAttempts += 1;
    const delay = Math.min(MAX_RESTART_DELAY_MS, 1000 * 2 ** (this.restartAttempts - 1));
    logger.warn(`Restarting local miaospeed in ${delay} ms (${reason})`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start().catch(error => logger.error(`Local miaospeed restart failed: ${error.message}`));
    }, delay);
    this.restartTimer.unref?.();
  }

  kill() {
    const child = this.process;
    this.process = null;
    this.ready = false;
    if (!child) return;
    child.kill('SIGTERM');
    setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) { /* gone */ } }, 2000).unref?.();
  }

  async shutdown(timeoutMs = 3000) {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.process;
    this.process = null;
    this.ready = false;
    if (!child) return;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, timeoutMs);
      timer.unref?.();
      child.once('close', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  }

  status() {
    return { enabled: this.enabled, ready: this.ready, binary: this.binary, version: this.version, error: this.error };
  }
}

module.exports = { LocalMiaospeed, resolveBinary };
