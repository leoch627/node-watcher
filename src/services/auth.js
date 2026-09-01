const crypto = require('crypto');
const fs = require('fs');

const COOKIE_NAME = 'node_watcher_session';

function readSecret(path) {
  if (!path) return '';
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch (error) {
    throw new Error(`Could not read authentication secret file: ${error.message}`);
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map(part => {
    const separator = part.indexOf('=');
    if (separator < 0) return [part.trim(), ''];
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try { return [key, decodeURIComponent(value)]; } catch { return [key, value]; }
  }).filter(([key]) => key));
}

class AuthService {
  constructor(options = {}) {
    this.username = options.username ?? process.env.AUTH_USERNAME ?? 'admin';
    if (options.password !== undefined) {
      this.password = options.password;
    } else if (process.env.AUTH_PASSWORD_FILE) {
      this.password = readSecret(process.env.AUTH_PASSWORD_FILE);
    } else {
      this.password = process.env.AUTH_PASSWORD || '';
    }
    this.enabled = Boolean(this.password);
    this.production = options.production ?? process.env.NODE_ENV === 'production';
    if (this.production && !this.enabled) {
      throw new Error('AUTH_PASSWORD or AUTH_PASSWORD_FILE is required in production');
    }
    this.ttlSeconds = Math.max(300, Number(options.ttlSeconds ?? process.env.AUTH_SESSION_TTL_HOURS * 3600) || 86400);
    this.cookieSecure = options.cookieSecure ?? process.env.AUTH_COOKIE_SECURE === 'true';
    const sessionSecret = options.sessionSecret || process.env.AUTH_SESSION_SECRET || this.password || crypto.randomBytes(32).toString('hex');
    this.sessionKey = crypto.scryptSync(sessionSecret || 'development-only', 'node-watcher-session', 32);
    this.passwordHash = this.enabled ? this.hashPassword(this.password) : null;
    this.attempts = new Map();
    this.maxAttempts = Number(options.maxAttempts ?? 5);
    this.attemptWindowMs = Number(options.attemptWindowMs ?? 15 * 60 * 1000);
  }

  hashPassword(value) {
    return crypto.scryptSync(String(value), `node-watcher:${this.username}`, 32);
  }

  isBlocked(ip, now = Date.now()) {
    const attempt = this.attempts.get(ip);
    if (!attempt || now - attempt.startedAt >= this.attemptWindowMs) {
      if (attempt) this.attempts.delete(ip);
      return false;
    }
    return attempt.count >= this.maxAttempts;
  }

  authenticate(username, password, ip = 'unknown') {
    const now = Date.now();
    if (!this.enabled) return { ok: true, disabled: true };
    if (this.isBlocked(ip, now)) return { ok: false, blocked: true };
    const usernameMatches = crypto.timingSafeEqual(
      crypto.createHash('sha256').update(String(username)).digest(),
      crypto.createHash('sha256').update(this.username).digest()
    );
    const passwordMatches = crypto.timingSafeEqual(this.hashPassword(password), this.passwordHash);
    if (usernameMatches && passwordMatches) {
      this.attempts.delete(ip);
      return { ok: true };
    }
    const current = this.attempts.get(ip);
    this.attempts.set(ip, current && now - current.startedAt < this.attemptWindowMs
      ? { ...current, count: current.count + 1 }
      : { count: 1, startedAt: now });
    return { ok: false, blocked: this.isBlocked(ip, now) };
  }

  createToken(now = Date.now()) {
    const payload = Buffer.from(JSON.stringify({
      sub: this.username,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + this.ttlSeconds,
      nonce: crypto.randomBytes(12).toString('base64url')
    })).toString('base64url');
    const signature = crypto.createHmac('sha256', this.sessionKey).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  verifyToken(token, now = Date.now()) {
    if (!this.enabled) return true;
    if (!token || !token.includes('.')) return false;
    const [payload, signature] = token.split('.', 2);
    const expected = crypto.createHmac('sha256', this.sessionKey).update(payload).digest();
    let actual;
    try { actual = Buffer.from(signature, 'base64url'); } catch { return false; }
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return data.sub === this.username && Number(data.exp) > Math.floor(now / 1000);
    } catch {
      return false;
    }
  }

  getToken(req) {
    return parseCookies(req.headers.cookie)[COOKIE_NAME];
  }

  isAuthenticated(req) {
    return !this.enabled || this.verifyToken(this.getToken(req));
  }

  requireAuth() {
    return (req, res, next) => {
      if (this.isAuthenticated(req)) return next();
      return res.status(401).json({ success: false, error: 'Authentication required' });
    };
  }

  setSessionCookie(res, token, secure = this.cookieSecure) {
    const parts = [
      `${COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${this.ttlSeconds}`
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  clearSessionCookie(res, secure = this.cookieSecure) {
    const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }
}

const authService = new AuthService();
module.exports = authService;
module.exports.AuthService = AuthService;
module.exports.COOKIE_NAME = COOKIE_NAME;
module.exports.parseCookies = parseCookies;
