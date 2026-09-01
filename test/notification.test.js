const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationService, escapeHtml } = require('../src/services/notification');
const { sanitizeSettings, validateSettings } = require('../src/routes/notifications');

function createService() {
  const calls = { get: [], post: [], mail: [] };
  const notifications = {
    bark: { enabled: true, url: 'https://api.day.app/test-key' },
    email: {
      enabled: true, host: 'smtp.example.com', port: 587, secure: false,
      auth: { user: 'sender@example.com', pass: 'secret' },
      from: 'sender@example.com', to: 'owner@example.com'
    },
    telegram: { enabled: true, botToken: 'bot-token', chatId: '12345' }
  };
  const service = new NotificationService({
    config: { getConfig: () => ({ notifications }) },
    http: {
      get: async (...args) => { calls.get.push(args); },
      post: async (...args) => { calls.post.push(args); }
    },
    mailer: { createTransport: () => ({ sendMail: async value => { calls.mail.push(value); } }) }
  });
  return { service, calls };
}

test('sends offline and recovery alerts to every enabled channel', async () => {
  const { service, calls } = createService();
  const node = { name: 'HK <Primary>', protocol: 'vless', server: 'hk.example.com', port: 443 };

  const offline = await service.sendNotification(node, {
    online: false, statusChanged: true, lastCheck: '2026-09-01T08:00:00.000Z', error: 'timeout <10s>'
  });
  assert.equal(offline.length, 3);
  assert.equal(calls.get.length, 1);
  assert.match(decodeURIComponent(calls.get[0][0]), /hk\.example\.com:443/);
  assert.match(calls.mail[0].subject, /节点离线告警/);
  assert.match(calls.post[0][1].text, /HK &lt;Primary&gt;/);
  assert.equal(calls.post[0][1].parse_mode, 'HTML');

  await service.sendNotification(node, {
    online: true, statusChanged: true, lastCheck: '2026-09-01T08:05:00.000Z'
  });
  assert.equal(calls.get.length, 2);
  assert.match(calls.mail[1].subject, /节点恢复通知/);
  assert.match(calls.post[1][1].text, /已恢复/);
});

test('does not notify when node status has not changed', async () => {
  const { service, calls } = createService();
  const results = await service.sendNotification({ name: 'Stable' }, { online: false, statusChanged: false });
  assert.deepEqual(results, []);
  assert.deepEqual(calls, { get: [], post: [], mail: [] });
});

test('preserves stored secrets when omitted from notification updates', () => {
  const current = {
    enabled: true, host: 'smtp.old.test', port: 587, secure: false,
    auth: { user: 'old-user', pass: 'stored-password' }, from: 'old@test', to: 'owner@test'
  };
  const settings = sanitizeSettings('email', {
    enabled: true, host: 'smtp.new.test', port: 465, secure: true,
    auth: { user: 'new-user' }, from: 'new@test', to: 'owner@test'
  }, current);
  assert.equal(settings.auth.pass, 'stored-password');
  assert.equal(settings.auth.user, 'new-user');
  assert.equal(settings.host, 'smtp.new.test');
  assert.equal(validateSettings('email', settings), null);
});

test('validates enabled channels and escapes message markup', () => {
  assert.match(validateSettings('bark', { enabled: true, url: 'not-a-url' }), /Bark/);
  assert.match(validateSettings('telegram', { enabled: true, botToken: '', chatId: '' }), /Telegram/);
  assert.equal(escapeHtml('<node & "test">'), '&lt;node &amp; &quot;test&quot;&gt;');
});
