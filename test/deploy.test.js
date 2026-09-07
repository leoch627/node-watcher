const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const yaml = require('js-yaml');

const script = path.resolve(__dirname, '../deploy.sh');

function createDeployment(context) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-deploy-'));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const binaries = path.join(temporary, 'bin');
  const directory = path.join(temporary, 'deployment with spaces');
  const callsFile = path.join(temporary, 'docker-calls.jsonl');
  fs.mkdirSync(binaries);
  fs.mkdirSync(directory);
  const mock = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
if (command === 'uname') console.log('Linux');
if (command === 'id') console.log('0');
if (command === 'hostname') console.log('192.168.1.20');
if (command === 'docker') {
  fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify(args) + '\\n');
  if (args[0] === 'info') {
    console.log(args[2].includes('SecurityOptions') ? (process.env.MOCK_SECURITY || '[]') : (process.env.MOCK_PLATFORM || 'linux/aarch64'));
  }
  if (args[0] === 'context') console.log('unix:///var/run/docker.sock');
  if (args.includes('pull') && args[args.length - 1] === 'pull' && process.env.MOCK_PULL_FAIL) {
    console.error('no matching manifest for linux/arm64/v8');
    process.exit(1);
  }
  if (args.includes('up') && process.env.MOCK_UP_FAIL) process.exit(1);
}
`;
  for (const command of ['docker', 'uname', 'id', 'hostname', 'chown']) {
    fs.writeFileSync(path.join(binaries, command), mock, { mode: 0o755 });
  }
  return {
    directory,
    run(overrides = {}) {
      return spawnSync('bash', [script, directory], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binaries}${path.delimiter}${process.env.PATH}`,
          DOCKER_HOST: '',
          MOCK_CALLS: callsFile,
          ...overrides
        }
      });
    },
    config() {
      return dotenv.parse(fs.readFileSync(path.join(directory, '.env')));
    },
    calls() {
      return fs.readFileSync(callsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    }
  };
}

test('deploy script creates secure credentials and uses the prebuilt image on ARM64', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ AUTH_PASSWORD: 'must-not-override-file' });
  assert.equal(result.status, 0, result.stderr);
  const config = deployment.config();
  assert.equal(config.AUTH_USERNAME, 'admin');
  assert.match(config.AUTH_PASSWORD, /^[a-f0-9]{36}$/);
  assert.match(config.AUTH_SESSION_SECRET, /^[a-f0-9]{64}$/);
  assert.match(config.MIHOMO_SECRET, /^[a-f0-9]{64}$/);
  assert.notEqual(config.AUTH_SESSION_SECRET, config.MIHOMO_SECRET);
  assert.equal(config.PORT, '3000');
  assert.ok(result.stdout.includes(config.AUTH_PASSWORD));
  assert.ok(result.stdout.includes('http://192.168.1.20:3000'));
  assert.equal(fs.statSync(path.join(deployment.directory, '.env')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(deployment.directory, 'data')).mode & 0o777, 0o700);
  const compose = yaml.load(fs.readFileSync(path.join(deployment.directory, 'compose.deploy.yml'), 'utf8'));
  const service = compose.services['node-watcher'];
  assert.equal(service.image, '${NODE_WATCHER_IMAGE:-ghcr.io/leoch627/node-watcher:latest}');
  assert.equal(service.platform, undefined);
  assert.equal(service.build, undefined);
  assert.deepEqual(service.volumes, ['./data:/app/data', './logs:/app/logs']);
  assert.ok(deployment.calls().some(args => args.includes('--wait') && args.includes('--no-build')));
});

test('repeat deployments preserve passwords, custom configuration, compose files and data', context => {
  const deployment = createDeployment(context);
  assert.equal(deployment.run().status, 0);
  const before = deployment.config();
  const envFile = path.join(deployment.directory, '.env');
  fs.appendFileSync(envFile, 'CUSTOM_SETTING=keep-me\n');
  fs.writeFileSync(path.join(deployment.directory, 'docker-compose.yml'), 'existing compose');
  fs.writeFileSync(path.join(deployment.directory, 'data/history.json'), '{"keep":true}');
  const result = deployment.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deployment.config(), { ...before, CUSTOM_SETTING: 'keep-me' });
  assert.ok(result.stdout.includes('保留已有密码'));
  assert.ok(!result.stdout.includes(before.AUTH_PASSWORD));
  assert.equal(fs.readFileSync(path.join(deployment.directory, 'docker-compose.yml'), 'utf8'), 'existing compose');
  assert.equal(fs.readFileSync(path.join(deployment.directory, 'data/history.json'), 'utf8'), '{"keep":true}');
});

test('empty dotenv values are filled without evaluating shell content', context => {
  const deployment = createDeployment(context);
  const marker = path.join(deployment.directory, 'should-not-exist');
  fs.writeFileSync(path.join(deployment.directory, '.env'), [
    'AUTH_PASSWORD=""',
    'export AUTH_SESSION_SECRET= # generate one',
    'PORT=8080',
    'AUTH_USERNAME=owner',
    `UNRELATED=$(touch "${marker}")`,
    ''
  ].join('\n'));
  const result = deployment.run();
  assert.equal(result.status, 0, result.stderr);
  const config = deployment.config();
  assert.match(config.AUTH_PASSWORD, /^[a-f0-9]{36}$/);
  assert.match(config.AUTH_SESSION_SECRET, /^[a-f0-9]{64}$/);
  assert.equal(config.PORT, '8080');
  assert.equal(config.AUTH_USERNAME, 'owner');
  assert.equal(fs.existsSync(marker), false);
});

test('failed ARM64 image pull does not start containers and keeps generated credentials for retry', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_PULL_FAIL: '1' });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('ARM64'));
  assert.ok(!result.stdout.includes('部署完成'));
  assert.ok(!deployment.calls().some(args => args.includes('up')));
  const before = deployment.config();
  assert.equal(deployment.run().status, 0);
  assert.deepEqual(deployment.config(), before);
});

test('startup failure prints diagnostics without reporting success', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_UP_FAIL: '1' });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('启动失败'));
  assert.ok(!result.stdout.includes('部署完成'));
  assert.ok(deployment.calls().some(args => args.includes('logs')));
});

test('unsupported platforms and remapped Docker users stop before creating configuration', context => {
  for (const overrides of [{ MOCK_PLATFORM: 'linux/armv7l' }, { MOCK_SECURITY: '["name=rootless"]' }, { DOCKER_HOST: 'ssh://remote' }]) {
    const deployment = createDeployment(context);
    const result = deployment.run(overrides);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(deployment.directory, '.env')), false);
  }
});

test('symlinked env files are rejected without touching their target', context => {
  const deployment = createDeployment(context);
  const target = path.join(deployment.directory, 'protected');
  fs.writeFileSync(target, 'keep-me');
  fs.symlinkSync(target, path.join(deployment.directory, '.env'));
  const result = deployment.run();
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep-me');
});
