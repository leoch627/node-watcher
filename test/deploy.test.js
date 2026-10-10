const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const yaml = require('js-yaml');

const script = path.resolve(__dirname, '../node-watcher.sh');

function createDeployment(context, options = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'node-watcher-deploy-'));
  context.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const binaries = path.join(temporary, 'bin');
  const directory = path.join(temporary, 'deployment with spaces');
  const callsFile = path.join(temporary, 'docker-calls.jsonl');
  fs.mkdirSync(binaries);
  fs.mkdirSync(directory);
  for (const command of ['bash', 'sh', 'awk', 'openssl', 'mktemp', 'mkdir', 'touch', 'chmod', 'mv', 'rm', 'cat', 'jq', 'cp', 'tail']) {
    const resolved = spawnSync('/bin/sh', ['-c', `command -v ${command}`], { encoding: 'utf8' }).stdout.trim();
    fs.symlinkSync(resolved, path.join(binaries, command));
  }
  const mock = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_SYSTEM_CALLS, JSON.stringify([command, ...args]) + '\\n');
const readyFile = path.join(process.env.MOCK_BIN, 'compose-ready');
const daemonFile = path.join(process.env.MOCK_BIN, 'daemon-ready');
const mirrorsFile = path.join(process.env.MOCK_BIN, 'mirrors-ready');
function installDocker() {
  fs.copyFileSync(process.env.MOCK_SOURCE, path.join(process.env.MOCK_BIN, 'docker'));
  fs.chmodSync(path.join(process.env.MOCK_BIN, 'docker'), 0o755);
}
if (command === 'uname') console.log(args[0] === '-m' ? (process.env.MOCK_ARCH || 'aarch64') : 'Linux');
if (command === 'id') console.log('0');
if (command === 'hostname') console.log(process.env.MOCK_IP || '192.168.1.20');
if (command === 'ss') {
  for (const port of (process.env.MOCK_BUSY_PORTS || '').split(',').filter(Boolean)) console.log('LISTEN 0 128 [::]:' + port + ' [::]:*');
  if (process.env.MOCK_ALL_PORTS_BUSY) for (let port = 1000; port <= 10000; port++) console.log('LISTEN 0 128 0.0.0.0:' + port + ' 0.0.0.0:*');
}
if (command === 'curl' || command === 'wget') {
  if (process.env.MOCK_DOWNLOAD_FAIL) process.exit(1);
  const url = args.at(-1);
  const destination = args[args.indexOf(command === 'curl' ? '-o' : '-O') + 1];
  const source = fs.readFileSync(process.env.MOCK_SOURCE);
  if (url === 'https://ghfast.top/https://raw.githubusercontent.com/docker/docker-install/master/install.sh') fs.writeFileSync(destination, '#!/bin/sh\\nmock-install\\n');
  else if (url.endsWith('.sha256')) fs.writeFileSync(destination, process.env.MOCK_BAD_CHECKSUM ? '0'.repeat(64) : crypto.createHash('sha256').update(source).digest('hex'));
  else fs.writeFileSync(destination, source);
}
if (['mock-install', 'apk', 'pacman', 'zypper'].includes(command)) installDocker();
if (command === 'install') fs.writeFileSync(readyFile, 'ready');
if (command === 'mock-install') fs.appendFileSync(process.env.MOCK_SYSTEM_CALLS, JSON.stringify(['installer-source', process.env.DOWNLOAD_URL]) + '\\n');
if (command === 'dockerd' && process.env.MOCK_DAEMON_CONFIG_INVALID) process.exit(1);
if (command === 'rc-service') {
  fs.writeFileSync(daemonFile, 'ready');
  if (args.includes('reload') && !process.env.MOCK_RELOAD_FAIL) fs.writeFileSync(mirrorsFile, 'ready');
  if (args.includes('reload') && process.env.MOCK_RELOAD_FAIL) process.exit(1);
}
if (command === 'docker-compose' && args.includes('version')) {
  console.log(process.env.MOCK_STANDALONE_VERSION || '2.20.0');
  process.exit(0);
}
if (command === 'docker') {
  fs.appendFileSync(process.env.MOCK_CALLS, JSON.stringify(args) + '\\n');
  if (args[0] === 'info') {
    if (process.env.MOCK_DAEMON_STOPPED && !fs.existsSync(daemonFile)) process.exit(1);
    if ((args[2] || '').includes('RegistryConfig')) {
      console.log(fs.existsSync(mirrorsFile) ? '["https://docker.1ms.run/"]' : '[]');
      process.exit(0);
    }
    console.log((args[2] || '').includes('SecurityOptions') ? (process.env.MOCK_SECURITY || '[]') : (process.env.MOCK_PLATFORM || 'linux/aarch64'));
  }
  if (args[0] === 'compose' && process.env.MOCK_NO_COMPOSE && !fs.existsSync(readyFile)) process.exit(1);
  if (args[0] === 'context') console.log('unix:///var/run/docker.sock');
  if (args[0] === 'ps') console.log(process.env.MOCK_PUBLISHED_PORTS || '');
  if (args[0] === 'inspect') {
    const format = args[args.indexOf('--format') + 1] || '';
    const key = String(args.at(-1)).replace(/[^A-Za-z0-9]/g, '_');
    if (format.includes('working_dir')) console.log(process.env['MOCK_WORKDIR_' + key] || '');
    else if (format.includes('com.docker.compose.project')) {
      if (process.env['MOCK_PROJECT_' + key] === undefined) process.exit(1);
      console.log(process.env['MOCK_PROJECT_' + key]);
    } else console.log(process.env.MOCK_HEALTH || 'running healthy');
  }
  if (args[0] === 'logs') console.log(process.env.MOCK_LOGS ?? 'MiaoSpeed Reverse | [m-1] session#1 link established, remote=203.0.113.7:443');
}
if (command === 'docker' || command === 'docker-compose') {
  if (args.includes('config') && process.env.TEST_COMPOSE_BINARY) {
    const result = require('node:child_process').spawnSync(process.env.TEST_COMPOSE_BINARY, args.slice(command === 'docker' ? 1 : 0), { encoding: 'utf8', env: process.env });
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }
  if (args.includes('pull') && args[args.length - 1] === 'pull' && process.env.MOCK_PULL_FAIL) {
    console.error('no matching manifest for linux/arm64/v8');
    process.exit(1);
  }
  if (args.includes('up') && process.env.MOCK_UP_FAIL) process.exit(1);
  if (args.includes('exec') && args.includes('acme.sh')) {
    if (args.includes('--issue')) process.exit(Number(process.env.MOCK_ACME_ISSUE_EXIT || 0));
    if (args.includes('--install-cert')) {
      const tls = path.join(path.dirname(args[args.indexOf('--env-file') + 1]), 'data', 'tls');
      fs.mkdirSync(tls, { recursive: true });
      fs.writeFileSync(path.join(tls, 'fullchain.pem'), 'cert');
      fs.writeFileSync(path.join(tls, 'key.pem'), 'key');
    }
  }
}
`;
  const source = path.join(temporary, 'mock-source');
  fs.writeFileSync(source, mock);
  const commands = ['docker', 'dockerd', 'uname', 'id', 'hostname', 'chown', 'ss', 'ip', 'curl', 'wget', 'install', 'rc-service', 'rc-update', 'mock-install', 'sleep'];
  if (options.packageManager) commands.push(options.packageManager);
  if (options.standalone) commands.push('docker-compose');
  for (const command of commands.filter(command => command !== options.missing)) {
    fs.writeFileSync(path.join(binaries, command), mock, { mode: 0o755 });
  }
  // Keep plugin installation inside the fixture even when testing its absolute destination.
  const realMkdir = fs.readlinkSync(path.join(binaries, 'mkdir'));
  fs.unlinkSync(path.join(binaries, 'mkdir'));
  fs.writeFileSync(path.join(binaries, 'mkdir'), `#!${process.execPath}\nconst fs = require('node:fs');\nlet args = process.argv.slice(2);\nfs.appendFileSync(process.env.MOCK_SYSTEM_CALLS, JSON.stringify(['mkdir', ...args]) + '\\n');\nif (process.env.MOCK_DEFAULT_DIR) args = args.map(value => value === '/opt/node-watcher' ? process.env.MOCK_DEFAULT_DIR : value);\nif (!args.includes('/usr/local/lib/docker/cli-plugins')) process.exit(require('node:child_process').spawnSync(${JSON.stringify(realMkdir)}, args).status);\n`, { mode: 0o755 });
  const bashEnvironment = path.join(temporary, 'bash-env');
  fs.writeFileSync(bashEnvironment, 'cd() { if [[ "$1" == /opt/node-watcher && -n "${MOCK_DEFAULT_DIR:-}" ]]; then builtin cd "$MOCK_DEFAULT_DIR"; else builtin cd "$@"; fi; }\n');
  return {
    directory,
    daemonConfig: path.join(temporary, 'daemon.json'),
    run(overrides = {}, args = [directory], inputScript = false, stdin = undefined) {
      return spawnSync('/bin/bash', inputScript ? ['-s', '--', ...args] : [script, ...args], {
        encoding: 'utf8',
        input: inputScript ? fs.readFileSync(script, 'utf8') : stdin,
        env: {
          ...process.env,
          PATH: binaries,
          DOCKER_HOST: '',
          MOCK_CALLS: callsFile,
          MOCK_SYSTEM_CALLS: path.join(temporary, 'system-calls.jsonl'),
          MOCK_BIN: binaries,
          MOCK_SOURCE: source,
          TMPDIR: temporary,
          BASH_ENV: bashEnvironment,
          NODE_WATCHER_DOCKER_CONFIG: path.join(temporary, 'daemon.json'),
          NODE_WATCHER_SHORTCUT: path.join(temporary, 'shortcut', 'nw'),
          ...(options.defaultDirectory ? { MOCK_DEFAULT_DIR: directory } : {}),
          ...overrides
        }
      });
    },
    shortcut: path.join(temporary, 'shortcut', 'nw'),
    // Drive the interactive menu with piped answers.
    menu(answers, overrides = {}) {
      return this.run({ NODE_WATCHER_FORCE_MENU: '1', ...overrides }, [], false, answers);
    },
    config() {
      return dotenv.parse(fs.readFileSync(path.join(directory, '.env')));
    },
    calls() {
      return fs.readFileSync(callsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    },
    systemCalls() {
      return fs.readFileSync(path.join(temporary, 'system-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
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
  assert.ok(Number(config.PORT) >= 1000 && Number(config.PORT) <= 10000);
  assert.ok(result.stdout.includes(config.AUTH_PASSWORD));
  assert.ok(result.stdout.includes(`http://192.168.1.20:${config.PORT}`));
  assert.equal(fs.statSync(path.join(deployment.directory, '.env')).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(deployment.directory, 'data')).mode & 0o777, 0o700);
  const compose = yaml.load(fs.readFileSync(path.join(deployment.directory, 'compose.deploy.yml'), 'utf8'));
  const service = compose.services['node-watcher'];
  assert.equal(service.image, '${NODE_WATCHER_IMAGE:-ghcr.1ms.run/leoch627/node-watcher:latest}');
  assert.equal(config.NODE_WATCHER_IMAGE, 'ghcr.1ms.run/leoch627/node-watcher:latest');
  assert.equal(service.platform, undefined);
  assert.equal(service.build, undefined);
  assert.deepEqual(service.volumes, ['./data:/app/data${NODE_WATCHER_VOLUME_LABEL:-}', './logs:/app/logs${NODE_WATCHER_VOLUME_LABEL:-}']);
  assert.deepEqual(service.ports, ['${PORT:?PORT must not be empty}:3000']);
  assert.deepEqual(Object.keys(compose.services), ['node-watcher'], 'no acme service without a domain');
  assert.equal(service.environment.HTTPS_PORT, undefined);
  assert.ok(deployment.calls().some(args => args.includes('up') && args.includes('--no-build') && !args.includes('--wait')));
  assert.ok(deployment.calls().some(args => args[0] === 'inspect'));
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

test('named and positional arguments configure directory, port and credentials', context => {
  for (const named of [true, false]) {
    const deployment = createDeployment(context);
    const password = 'safe $DOLLAR ${VARIABLE} # space "quote" \\path';
    const args = named
      ? ['install', '--dir', deployment.directory, '--port=08080', '-u', 'owner', '--password', password]
      : [deployment.directory, '8080', 'owner', password];
    const result = deployment.run({}, args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(deployment.config().PORT, '8080');
    assert.equal(deployment.config().AUTH_USERNAME, 'owner');
    // dotenv does not implement Compose's dollar interpolation or escaped quotes.
    const written = fs.readFileSync(path.join(deployment.directory, '.env'), 'utf8');
    assert.ok(written.includes('$$DOLLAR $${VARIABLE}'));
    assert.ok(!result.stdout.includes(password));
  }
});

test('explicit updates only replace requested values', context => {
  const deployment = createDeployment(context);
  assert.equal(deployment.run().status, 0);
  const before = deployment.config();
  const result = deployment.run({}, ['update', '-d', deployment.directory, '-p', '9876', '-P', 'new-password']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deployment.config(), { ...before, PORT: '9876', AUTH_PASSWORD: 'new-password' });
});

test('standalone stdin script runs without any checkout files', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({}, ['-d', deployment.directory, '-p', '8888'], true);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(deployment.config().PORT, '8888');
});

test('invalid arguments stop before touching the deployment directory', context => {
  const deployment = createDeployment(context);
  for (const args of [
    ['--port', '0'], ['--port', '65536'], ['--port', '-1'], ['--port', '1.5'], ['--port', 'abc'],
    ['--port', '1234567890123456789'], ['--port'], ['--unknown'], ['--password', ''],
    ['--password', 'first\nPORT=22'], ['--username', 'first\rsecond'],
    [deployment.directory, '--port', '8080'], ['--dir', deployment.directory, '8080']
  ]) {
    const result = deployment.run({}, args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.equal(fs.existsSync(path.join(deployment.directory, '.env')), false);
  }
});

test('explicit occupied host and Docker ports are rejected', context => {
  for (const overrides of [{ MOCK_BUSY_PORTS: '8080' }, { MOCK_PUBLISHED_PORTS: '0.0.0.0:8080->3000/tcp, [::]:8080->3000/tcp' }, { MOCK_PUBLISHED_PORTS: '0.0.0.0:8000-8100->8000-8100/tcp' }]) {
    const deployment = createDeployment(context);
    const result = deployment.run(overrides, ['-d', deployment.directory, '-p', '8080']);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('已被占用'));
    assert.ok(!deployment.calls().some(args => args.includes('up')));
  }
});

test('random port selection skips listeners and fails when range is exhausted', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_ALL_PORTS_BUSY: '1' });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('未找到 1000-10000'));
  assert.ok(!deployment.calls().some(args => args.includes('up')));
});

test('existing standalone Compose v2 works without plugin installation', context => {
  const deployment = createDeployment(context, { standalone: true });
  const result = deployment.run({ MOCK_NO_COMPOSE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(deployment.systemCalls().some(args => args[0] === 'docker-compose' && args.includes('up')));
  assert.ok(!deployment.systemCalls().some(args => args[0] === 'curl'));
});

test('missing Compose installs the matching verified binary for both architectures', context => {
  for (const [arch, asset] of [['aarch64', 'aarch64'], ['x86_64', 'x86_64']]) {
    const deployment = createDeployment(context);
    const result = deployment.run({ MOCK_NO_COMPOSE: '1', MOCK_ARCH: arch });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(deployment.systemCalls().some(args => args[0] === 'curl' && args.at(-1) === `https://ghfast.top/https://github.com/docker/compose/releases/download/v5.5.0/docker-compose-linux-${asset}`));
    assert.ok(deployment.systemCalls().some(args => args[0] === 'curl' && args.at(-1) === `https://ghfast.top/https://github.com/docker/compose/releases/download/v5.5.0/docker-compose-linux-${asset}.sha256`));
    assert.ok(deployment.systemCalls().some(args => args[0] === 'install'));
  }
});

test('Compose installation rejects bad checksums and disabled installation', context => {
  for (const disabled of [true, false]) {
    const deployment = createDeployment(context);
    const result = deployment.run({ MOCK_NO_COMPOSE: '1', MOCK_BAD_CHECKSUM: '1' }, [deployment.directory, ...(disabled ? ['--no-install'] : [])]);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(disabled ? '需要 Compose' : 'SHA256'));
    assert.ok(!deployment.systemCalls().some(args => args[0] === 'install'));
    assert.equal(fs.existsSync(path.join(deployment.directory, '.env')), false);
  }
});

test('missing Docker is bootstrapped using official installer or native distro packages', context => {
  for (const packageManager of [undefined, 'apk', 'pacman', 'zypper']) {
    const deployment = createDeployment(context, { missing: 'docker', packageManager });
    const result = deployment.run({ MOCK_DAEMON_STOPPED: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(deployment.systemCalls().some(args => args[0] === (packageManager || 'mock-install')));
    if (!packageManager) {
      assert.ok(deployment.systemCalls().some(args => args[0] === 'installer-source' && args[1] === 'https://mirrors.tuna.tsinghua.edu.cn/docker-ce'));
      assert.ok(deployment.systemCalls().some(args => args[0] === 'curl' && args.at(-1) === 'https://ghfast.top/https://raw.githubusercontent.com/docker/docker-install/master/install.sh'));
    }
    assert.ok(deployment.systemCalls().some(args => args[0] === 'rc-service' && args.includes('start')));
  }
});

test('Docker installer download failure never executes a partial download', context => {
  const deployment = createDeployment(context, { missing: 'docker' });
  const result = deployment.run({ MOCK_DOWNLOAD_FAIL: '1' });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('下载失败'));
  assert.ok(!deployment.systemCalls().some(args => args[0] === 'mock-install'));
  assert.equal(fs.existsSync(path.join(deployment.directory, '.env')), false);
});

test('wget-only systems can install missing Compose', context => {
  const deployment = createDeployment(context, { missing: 'curl' });
  const result = deployment.run({ MOCK_NO_COMPOSE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(deployment.systemCalls().some(args => args[0] === 'wget'));
});

test('unhealthy containers do not report successful deployment', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_HEALTH: 'running unhealthy' });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('启动失败'));
  assert.ok(!result.stdout.includes('部署完成'));
});

test('IPv6 addresses are bracketed in the deployment URL', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_IP: '2001:db8::1' }, [deployment.directory, '8080']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('http://[2001:db8::1]:8080'));
});

test('credentials round-trip through real Compose interpolation', { skip: !process.env.TEST_COMPOSE_BINARY }, context => {
  for (const password of ["single'quote", 'trailing\\', "slash\\'quote $VAR ${VAR} # space", 'two\\\\slashes', '$(touch /tmp/node-watcher-must-not-exist)']) {
    const deployment = createDeployment(context);
    const result = deployment.run({}, ['-d', deployment.directory, '-P', password]);
    assert.equal(result.status, 0, result.stderr);
    const config = spawnSync(process.env.TEST_COMPOSE_BINARY, ['--env-file', path.join(deployment.directory, '.env'), '-f', path.join(deployment.directory, 'compose.deploy.yml'), 'config', '--environment'], { encoding: 'utf8' });
    assert.equal(config.status, 0, config.stderr);
    const passwordLine = config.stdout.split('\n').find(line => line.startsWith('AUTH_PASSWORD='));
    assert.equal(passwordLine, `AUTH_PASSWORD=${password}`);
  }
});

test('SELinux Docker hosts receive private bind mount labels', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_SECURITY: '["name=selinux"]' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(deployment.config().NODE_WATCHER_VOLUME_LABEL, ':Z');
});

test('no arguments deploy to the default path with a random port and password', context => {
  const deployment = createDeployment(context, { defaultDirectory: true });
  const result = deployment.run({}, []);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(deployment.systemCalls().some(args => args[0] === 'mkdir' && args.includes('/opt/node-watcher')));
  assert.ok(Number(deployment.config().PORT) >= 1000 && Number(deployment.config().PORT) <= 10000);
  assert.match(deployment.config().AUTH_PASSWORD, /^[a-f0-9]{36}$/);
});

test('Docker mirror configuration merges existing settings and reloads once', context => {
  const deployment = createDeployment(context);
  const before = {
    'data-root': '/srv/docker',
    'log-driver': 'json-file',
    'log-opts': { 'max-size': '10m' },
    'registry-mirrors': ['https://existing.example', 'https://docker.1ms.run/'],
    'insecure-registries': ['registry.local:5000']
  };
  const original = JSON.stringify(before);
  fs.writeFileSync(deployment.daemonConfig, original);
  const result = deployment.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(deployment.daemonConfig)), {
    ...before, 'registry-mirrors': ['https://docker.1ms.run', 'https://existing.example']
  });
  const backups = () => fs.readdirSync(path.dirname(deployment.daemonConfig)).filter(file => file.startsWith('daemon.json.node-watcher-backup.'));
  assert.equal(backups().length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(deployment.daemonConfig), backups()[0]), 'utf8'), original);
  const second = deployment.run();
  assert.equal(second.status, 0, second.stderr);
  assert.equal(backups().length, 1);
  assert.equal(deployment.systemCalls().filter(args => args[0] === 'rc-service' && args.includes('reload')).length, 1);
  assert.ok(!deployment.systemCalls().some(args => args.includes('restart')));
});

test('invalid Docker configuration is never overwritten or reloaded', context => {
  for (const contents of ['{bad json', '[]', '{} {}', '{"registry-mirrors":"bad"}', '{"registry-mirrors":[5]}', '']) {
    const deployment = createDeployment(context);
    fs.writeFileSync(deployment.daemonConfig, contents);
    const result = deployment.run();
    assert.notEqual(result.status, 0, contents);
    assert.equal(fs.readFileSync(deployment.daemonConfig, 'utf8'), contents);
    assert.ok(!deployment.systemCalls().some(args => args[0] === 'rc-service' && args.includes('reload')));
  }
});

test('dockerd validation failure preserves the original configuration', context => {
  const deployment = createDeployment(context);
  fs.writeFileSync(deployment.daemonConfig, '{"unknown-setting":true}');
  const result = deployment.run({ MOCK_DAEMON_CONFIG_INVALID: '1' });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('Docker 配置校验失败'));
  assert.equal(fs.readFileSync(deployment.daemonConfig, 'utf8'), '{"unknown-setting":true}');
});

test('mirror reload failure is reported while GHCR proxy deployment can continue', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_RELOAD_FAIL: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stderr.includes('守护进程尚未加载'));
  assert.ok(!result.stdout.includes('Docker Hub 镜像加速已启用'));
  assert.deepEqual(JSON.parse(fs.readFileSync(deployment.daemonConfig)), { 'registry-mirrors': ['https://docker.1ms.run'] });
  assert.equal(deployment.config().NODE_WATCHER_IMAGE, 'ghcr.1ms.run/leoch627/node-watcher:latest');
});

test('previous default GHCR image switches to 1ms while custom tags stay pinned', context => {
  for (const image of ['ghcr.io/leoch627/node-watcher:latest', 'ghcr.io/leoch627/node-watcher:v2.0.0', 'registry.example/custom:stable']) {
    const deployment = createDeployment(context);
    fs.writeFileSync(path.join(deployment.directory, '.env'), `NODE_WATCHER_IMAGE=${image}\n`);
    const result = deployment.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(deployment.config().NODE_WATCHER_IMAGE, image.endsWith(':latest') ? 'ghcr.1ms.run/leoch627/node-watcher:latest' : image);
  }
});


// ---- domain / HTTPS (acme.sh) ----------------------------------------------------------------
const loadCompose = deployment => yaml.load(fs.readFileSync(path.join(deployment.directory, 'compose.deploy.yml'), 'utf8'));
const acmeCalls = deployment => deployment.calls().filter(args => args.includes('exec') && args.includes('acme.sh'));

test('domain mode publishes 80/443, enables HTTPS and issues a certificate over HTTP-01', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({}, ['-d', deployment.directory, '--domain', 'Monitor.Example.com', '--acme-email', 'ops@example.com']);
  assert.equal(result.status, 0, result.stderr);
  const config = deployment.config();
  assert.equal(config.NODE_WATCHER_DOMAIN, 'monitor.example.com');
  assert.equal(config.ACME_MODE, 'http');
  assert.equal(config.MIAOSPEED_PUBLIC_URL, 'wss://monitor.example.com');
  assert.equal(config.AUTH_COOKIE_SECURE, 'true', 'secure cookies once the certificate is installed');
  const compose = loadCompose(deployment);
  const service = compose.services['node-watcher'];
  assert.deepEqual(service.ports, ['${HTTP_HOST_PORT:-80}:3000', '${HTTPS_HOST_PORT:-443}:3443']);
  assert.equal(service.environment.HTTPS_PORT, 3443);
  assert.equal(service.environment.HTTPS_REDIRECT, 'true');
  assert.equal(service.environment.ACME_WEBROOT, '/app/data/acme');
  assert.equal(service.environment.TLS_CERT_FILE, '/app/data/tls/fullchain.pem');
  assert.equal(service.environment.MIAOSPEED_PUBLIC_URL, '${MIAOSPEED_PUBLIC_URL:-}');
  assert.equal(service.env_file, undefined);
  const acme = compose.services.acme;
  assert.equal(acme.image, '${ACME_IMAGE:-neilpang/acme.sh:3.1.5}');
  assert.equal(acme.command, 'daemon');
  assert.equal(acme.restart, 'unless-stopped');
  assert.equal(acme.env_file, undefined, 'HTTP mode needs no credentials');
  assert.deepEqual(acme.volumes, ['./data/acme:/webroot${NODE_WATCHER_VOLUME_LABEL:-}', './data/tls:/tls${NODE_WATCHER_VOLUME_LABEL:-}', './acme:/acme.sh${NODE_WATCHER_VOLUME_LABEL:-}']);
  const issue = acmeCalls(deployment).find(args => args.includes('--issue'));
  for (const expected of ['--server', 'letsencrypt', '-d', 'monitor.example.com', '--webroot', '/webroot', '--accountemail', 'ops@example.com']) assert.ok(issue.includes(expected), expected);
  const install = acmeCalls(deployment).find(args => args.includes('--install-cert'));
  assert.ok(install.includes('/tls/key.pem') && install.includes('/tls/fullchain.pem'));
  assert.match(install[install.indexOf('--reloadcmd') + 1], /chown 1000:1000 .*chmod 600 \/tls\/key\.pem/);
  assert.match(result.stdout, /访问地址：https:\/\/monitor\.example\.com/);
  assert.match(result.stdout, /wss:\/\/monitor\.example\.com\/miaospeed\/reverse\//);

  // Repeat deployment: acme.sh exits 2 ("Skipping") while the certificate is valid.
  const again = deployment.run({ MOCK_ACME_ISSUE_EXIT: '2' }, ['-d', deployment.directory]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(deployment.config().NODE_WATCHER_DOMAIN, 'monitor.example.com', 'domain kept on update');
});

test('certificate failures keep the HTTP panel running and explain how to retry', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({ MOCK_ACME_ISSUE_EXIT: '1' }, ['-d', deployment.directory, '--domain', 'monitor.example.com']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /证书申请失败/);
  assert.match(result.stderr, /A \/ AAAA 记录/);
  assert.equal(deployment.config().AUTH_COOKIE_SECURE, 'false');
  assert.ok(!acmeCalls(deployment).some(args => args.includes('--install-cert')));
  assert.match(result.stdout, /部署完成/);
});

test('DNS-01 credentials are read from the environment into acme.env only', context => {
  const deployment = createDeployment(context);
  const secret = "cf-secret-$token'x";
  const result = deployment.run({ CF_Token: secret, CF_Account_ID: 'acct', UNRELATED_SECRET: 'nope' },
    ['-d', deployment.directory, '--domain', 'monitor.example.com', '--acme', 'dns', '--dns-provider', 'cf']);
  assert.equal(result.status, 0, result.stderr);
  const acmeEnv = path.join(deployment.directory, 'acme.env');
  assert.equal(fs.statSync(acmeEnv).mode & 0o777, 0o600);
  const written = fs.readFileSync(acmeEnv, 'utf8');
  assert.ok(written.includes('CF_Account_ID=') && written.includes('CF_Token=') && !written.includes('UNRELATED_SECRET'));
  for (const file of ['compose.deploy.yml', '.env']) {
    assert.ok(!fs.readFileSync(path.join(deployment.directory, file), 'utf8').includes('cf-secret'), file);
  }
  const compose = loadCompose(deployment);
  assert.equal(compose.services.acme.env_file, 'acme.env');
  assert.equal(compose.services['node-watcher'].env_file, undefined);
  const issue = acmeCalls(deployment).find(args => args.includes('--issue'));
  assert.ok(issue.includes('--dns') && issue.includes('dns_cf'));
  assert.ok(!deployment.calls().some(args => args.some(value => String(value).includes('cf-secret'))), 'secret never on a docker command line');
});

test('DNS mode without credentials and invalid domain options stop before touching the directory', context => {
  const deployment = createDeployment(context);
  let result = deployment.run({}, ['-d', deployment.directory, '--domain', 'monitor.example.com', '--acme', 'dns', '--dns-provider', 'ali']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DNS API 凭据/);
  for (const args of [
    ['--domain', 'http://example.com'], ['--domain', 'example.com:8443'], ['--domain', '1.2.3.4'], ['--domain', 'localhost'],
    ['--acme', 'tls'], ['--dns-provider', 'Bad-Name'], ['--acme-email', 'nope'], ['--acme', 'dns'],
    ['--domain', 'monitor.example.com', '--port', '8080'], ['--domain', 'monitor.example.com', '--acme', 'dns'],
    ['--join', 'nwp://x'], ['--probe-port', '7443']
  ]) {
    result = deployment.run({}, ['-d', deployment.directory, ...args]);
    assert.notEqual(result.status, 0, JSON.stringify(args));
  }
  assert.equal(fs.existsSync(path.join(deployment.directory, '.env')), false);
});

// ---- miaospeed probes -------------------------------------------------------------------------
const sampleConnect = 'wss://monitor.example.com/miaospeed/reverse/m-1a2b3c4d';
const sampleToken = 'Tok3n_-abcdefghijklmnopqrstuvwxyz';

test('probe: deploys miaospeed with the token kept in .env (mode 600)', context => {
  const deployment = createDeployment(context);
  let result = deployment.run({}, ['probe', '--connect', sampleConnect, '--token', sampleToken, '-d', deployment.directory]);
  assert.equal(result.status, 0, result.stderr);
  const config = deployment.config();
  assert.equal(config.MIAOSPEED_CONNECT, sampleConnect);
  assert.equal(config.MIAOSPEED_TOKEN, sampleToken);
  assert.equal(config.AUTH_PASSWORD, undefined, 'a probe has no login');
  assert.equal(fs.statSync(path.join(deployment.directory, '.env')).mode & 0o777, 0o600);
  const compose = loadCompose(deployment);
  assert.deepEqual(Object.keys(compose.services), ['miaospeed']);
  const service = compose.services.miaospeed;
  assert.equal(service.image, '${MIAOSPEED_IMAGE:-airportr/miaospeed:4.7.8}');
  assert.deepEqual(service.command, ['server', '-connect', '${MIAOSPEED_CONNECT:?MIAOSPEED_CONNECT must not be empty}', '-token', '${MIAOSPEED_TOKEN:?MIAOSPEED_TOKEN must not be empty}']);
  assert.equal(service.ports, undefined, 'a probe publishes no ports');
  assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
  assert.equal(service.restart, 'unless-stopped');
  assert.ok(!fs.readFileSync(path.join(deployment.directory, 'compose.deploy.yml'), 'utf8').includes(sampleToken));
  assert.ok(!deployment.calls().some(args => args.includes(sampleToken)), 'token never on a docker command line');
  assert.ok(deployment.calls().some(args => args[0] === 'compose' && args.includes('miaospeed') && args.includes('up')));
  assert.match(result.stdout, /已连接主控 monitor\.example\.com/);
  assert.match(result.stdout, /设置 → miaospeed 后端/);

  // Update with a new token replaces it; omitting both keeps the saved values.
  result = deployment.run({}, ['probe', '--token', 'new-token-value', '-d', deployment.directory]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(deployment.config().MIAOSPEED_TOKEN, 'new-token-value');
  assert.equal(deployment.config().MIAOSPEED_CONNECT, sampleConnect);

  // Invalid URLs are rejected; public ws:// warns loudly; handshake errors are explained.
  for (const url of ['https://monitor.example.com/miaospeed/reverse/m-1', 'wss://monitor.example.com/other/m-1', 'nwp://p-1:t@h:7443']) {
    result = deployment.run({}, ['probe', '--connect', url, '--token', sampleToken, '-d', deployment.directory]);
    assert.notEqual(result.status, 0, url);
    assert.match(result.stderr, /连接地址格式不正确/, url);
  }
  result = deployment.run({}, ['probe', '--connect', 'ws://203.0.113.7:3000/miaospeed/reverse/m-1', '-d', deployment.directory]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /警告：连接地址使用未加密的 ws:\/\//);
  result = deployment.run({ MOCK_LOGS: 'connection lost, error=handshake signature mismatch, check the token on both sides' }, ['probe', '-d', deployment.directory]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /token 不正确/);
});

test('probe: first deployment needs --connect and --token', context => {
  const deployment = createDeployment(context);
  const result = deployment.run({}, ['probe', '--connect', sampleConnect, '-d', deployment.directory]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /首次部署探针需要连接地址和 token/);
  assert.equal(fs.existsSync(path.join(deployment.directory, '.env')), false);
});

// ---- interactive menu -------------------------------------------------------------------------
test('menu: guided master install with a domain, then reuse of the saved configuration', context => {
  const deployment = createDeployment(context);
  // 1 install → directory → use a domain → domain → HTTP-01 → email → username → generated password → install shortcut
  let result = deployment.menu(['1', deployment.directory, 'y', 'monitor.example.com', '1', '', 'owner', '', 'y', ''].join('\n'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1\. 安装 \/ 重新安装主控（面板）/);
  assert.match(result.stdout, /主控（面板）：未安装/);
  const config = deployment.config();
  assert.equal(config.NODE_WATCHER_DOMAIN, 'monitor.example.com');
  assert.equal(config.AUTH_USERNAME, 'owner');
  assert.match(config.AUTH_PASSWORD, /^[a-f0-9]{36}$/);
  assert.ok(result.stdout.includes(config.AUTH_PASSWORD), 'generated password is shown once');
  assert.ok(acmeCalls(deployment).some(args => args.includes('--issue') && args.includes('--webroot')));
  assert.ok(fs.statSync(deployment.shortcut).mode & 0o100, 'nw shortcut installed');
  assert.match(result.stdout, /输入 nw/);

  // Re-run: the previous configuration is offered and kept.
  result = deployment.menu(['1', deployment.directory, 'y', ''].join('\n'), { MOCK_WORKDIR_node_watcher: deployment.directory });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /读取到上次安装的配置/);
  assert.match(result.stdout, /主控（面板）：已安装/);
  assert.deepEqual(deployment.config(), config);
});

test('menu: guided probe deployment and exit', context => {
  const deployment = createDeployment(context);
  let result = deployment.menu(['2', deployment.directory, sampleConnect, sampleToken, 'n', ''].join('\n'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(deployment.config().MIAOSPEED_TOKEN, sampleToken);
  assert.ok(!result.stdout.includes(sampleToken), 'token is masked');
  assert.equal(fs.existsSync(deployment.shortcut), false);
  result = deployment.menu('0\n');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已退出/);
});
