#!/usr/bin/env node
// Downloads the miaospeed release for this platform into ./bin (npm run setup:bin).
// Works on Linux (incl. Raspberry Pi armv6/armv7/arm64), macOS, FreeBSD and Windows; every archive
// is checked against the SHA-256 published with the GitHub release before it is unpacked.
//   GITHUB_MIRROR=https://ghfast.top/   prefix for github.com downloads (mainland China)
//   HTTPS_PROXY=http://127.0.0.1:7890   use a proxy
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MIAOSPEED_VERSION = '4.7.8';
// sha256 of miaospeed-<target>-<version>.(tar.gz|zip), from the release's asset digests.
const MIAOSPEED_SHA256 = {
  'linux-amd64': 'd41769a94deed8d5a52d52fb4f3c227bd5f397c481003f21225b8756e829767a',
  'linux-arm64': '8192b2a2dc3eac398cbafb595d376036c3a9dee699ce253596f50da1d3ebd92b',
  'linux-armv7': '11cf326c4109ff96c98070cfccfa93523ae563371759a40029f267175fc3ac44',
  'linux-armv6': '9514f88f0d119c8202dea4d44c2df5eb58ebce9579d2002c9d9e273fff7f2be5',
  'linux-386': '656ad934d145c8168dc1a4ec412bb765d4fc70c9fd099c1302c386c72dd5badf',
  'linux-riscv64': 'abfc0934e97b1563caf7b6649f9d494b9408f6814282c9d3ce8d57053462b30e',
  'darwin-amd64': 'ee57da0296a5493758dc80b38d95421d80d11d10d576d59595943d5658a4f585',
  'darwin-arm64': '8956053303bda9aeba9c6b0da1a695721f470dfdfd42033cc97c31033f00601c',
  'freebsd-amd64': '32eb62b67e7d6e3f2d24901325c560f0b93283c2fead2449afae83286472e84c',
  'freebsd-arm64': '8f8b39f017523c2c48847469837e868d7fbf8c6c3e75b757d0546f9e7b8ea0a6',
  'windows-amd64': '300d8c471caaf2eb5346b5dd8ebae54fb94ea90b31c1ba7d62d7db3ee2848496',
  'windows-arm64': 'dbac694ad67da11e499a9fc9f4094ef3f9a158858ed3d8c7676ba6c88a5ae9c5',
  'windows-386': '779557f1d08bf3e83c7164f50abcf6c3c7846e3c636541f3769870e9ee2eea5c'
};

function target(platform = process.platform, arch = process.arch, armVersion = process.config.variables.arm_version) {
  const osName = { linux: 'linux', darwin: 'darwin', win32: 'windows', freebsd: 'freebsd' }[platform];
  const archName = {
    x64: 'amd64', arm64: 'arm64', ia32: '386', riscv64: 'riscv64',
    arm: String(armVersion) === '6' ? 'armv6' : 'armv7'
  }[arch];
  const key = osName && archName ? `${osName}-${archName}` : null;
  if (!key || !MIAOSPEED_SHA256[key]) throw new Error(`No miaospeed build for ${platform}/${arch}`);
  return key;
}

async function download(url, file) {
  const axios = require('axios');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const agent = proxy ? new (require('https-proxy-agent').HttpsProxyAgent)(proxy) : undefined;
  const response = await axios.get(url, {
    responseType: 'arraybuffer', proxy: false, httpsAgent: agent, maxRedirects: 5, timeout: 10 * 60 * 1000,
    maxContentLength: 200 * 1024 * 1024
  });
  fs.writeFileSync(file, Buffer.from(response.data));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function setupMiaospeed({ binDir = path.join(__dirname, '..', 'bin'), force = false } = {}) {
  const key = target();
  const windows = key.startsWith('windows');
  const dest = path.join(binDir, windows ? 'miaospeed.exe' : 'miaospeed');
  const marker = `${dest}.version`;
  if (!force && fs.existsSync(dest) && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === `${MIAOSPEED_VERSION} ${key}`) {
    console.log(`miaospeed ${MIAOSPEED_VERSION} (${key}) already installed: ${dest}`);
    return dest;
  }
  const asset = `miaospeed-${key}-${MIAOSPEED_VERSION}.${windows ? 'zip' : 'tar.gz'}`;
  const mirror = String(process.env.GITHUB_MIRROR || '').replace(/\/?$/, process.env.GITHUB_MIRROR ? '/' : '');
  const url = `${mirror}https://github.com/AirportR/miaospeed/releases/download/${MIAOSPEED_VERSION}/${asset}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nw-miaospeed-'));
  try {
    const archive = path.join(work, asset);
    console.log(`Downloading ${url}`);
    await download(url, archive);
    const actual = sha256(archive);
    if (actual !== MIAOSPEED_SHA256[key]) throw new Error(`Checksum mismatch for ${asset} (got ${actual})`);
    // bsdtar on Windows 10+ and macOS reads zip as well as tar.gz.
    execFileSync('tar', ['-xf', archive, '-C', work], { stdio: 'inherit' });
    const binary = path.join(work, `miaospeed-${key}${windows ? '.exe' : ''}`);
    if (!fs.existsSync(binary)) throw new Error(`${asset} does not contain miaospeed-${key}`);
    fs.mkdirSync(binDir, { recursive: true });
    fs.copyFileSync(binary, dest);
    if (!windows) fs.chmodSync(dest, 0o755);
    fs.writeFileSync(marker, `${MIAOSPEED_VERSION} ${key}\n`);
    console.log(`Installed miaospeed ${MIAOSPEED_VERSION} (${key}) to ${dest}`);
    return dest;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (require.main === module) {
  setupMiaospeed({ force: process.argv.includes('--force') }).catch(error => {
    console.error(`setup:bin failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { MIAOSPEED_VERSION, MIAOSPEED_SHA256, target, setupMiaospeed };
