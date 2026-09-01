const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthService, COOKIE_NAME, parseCookies } = require('../src/services/auth');

function service(overrides = {}) {
  return new AuthService({
    username: 'admin',
    password: 'correct horse battery staple',
    sessionSecret: 'test-session-secret',
    production: false,
    ttlSeconds: 3600,
    ...overrides
  });
}

test('authenticates credentials and verifies signed sessions', () => {
  const auth = service();
  assert.equal(auth.authenticate('admin', 'correct horse battery staple', '127.0.0.1').ok, true);
  assert.equal(auth.authenticate('admin', 'wrong', '127.0.0.2').ok, false);

  const token = auth.createToken(1000);
  assert.equal(auth.verifyToken(token, 2000), true);
  assert.equal(auth.verifyToken(`${token}x`, 2000), false);
  assert.equal(auth.verifyToken(token, 3602 * 1000), false);
});

test('limits repeated failed login attempts by address', () => {
  const auth = service({ maxAttempts: 3 });
  assert.equal(auth.authenticate('admin', 'bad', 'client').blocked, false);
  assert.equal(auth.authenticate('admin', 'bad', 'client').blocked, false);
  assert.equal(auth.authenticate('admin', 'bad', 'client').blocked, true);
  assert.equal(auth.authenticate('admin', 'correct horse battery staple', 'client').blocked, true);
});

test('sets an HttpOnly same-site session cookie', () => {
  const auth = service();
  const headers = {};
  auth.setSessionCookie({ setHeader: (name, value) => { headers[name] = value; } }, 'signed-token', true);
  assert.match(headers['Set-Cookie'], new RegExp(`^${COOKIE_NAME}=`));
  assert.match(headers['Set-Cookie'], /HttpOnly/);
  assert.match(headers['Set-Cookie'], /SameSite=Strict/);
  assert.match(headers['Set-Cookie'], /Secure/);
  assert.equal(parseCookies(`${COOKIE_NAME}=signed-token; theme=dark`)[COOKIE_NAME], 'signed-token');
});

test('requires a password in production', () => {
  assert.throws(() => new AuthService({ password: '', production: true }), /AUTH_PASSWORD/);
});
