// Table cells shared by the PNG reports (40 px rows, 16 px text).
const sharp = require('sharp');
const svg = require('./svg');

const ROW = 40;
const FONT = 16;
const BORDER = '#e5e7eb';
const HEAD_FILL = '#f3f4f6';
const MUTED = '#6b7280';
const INK = '#1f2937';
const FAILED_FILL = '#f6f8fa';

// Latency (ms): pale for fast, deep teal for slow; 0 means the test failed.
const LATENCY_SCALE = [[50, '#d5f8ef'], [100, '#b4f2e2'], [200, '#94ebd6'], [300, '#72e0c8'], [500, '#4fd3b8'], [800, '#33c3a6'], [Infinity, '#1fae92']];
// Speed (Mbps): pale blue for slow, through blue to cyan for fast.
const SPEED_SCALE = [[1, '#eef3fb'], [10, '#e2ecfb'], [50, '#c7dbf8'], [100, '#a9c8f6'], [200, '#86b1f3'], [300, '#6aa3f2'], [500, '#4f9df0'], [800, '#38b7ee'], [Infinity, '#22d0ea']];

const pick = (scale, value) => scale.find(([limit]) => value <= limit)[1];

const PROTOCOLS = {
  ss: 'Shadowsocks', ssr: 'ShadowsocksR', vmess: 'VMess', vless: 'VLESS', trojan: 'Trojan',
  hysteria: 'Hysteria', hysteria2: 'Hysteria2', tuic: 'TUIC', wireguard: 'WireGuard', anytls: 'AnyTLS',
  socks5: 'SOCKS5', http: 'HTTP', snell: 'Snell', ssh: 'SSH', mieru: 'Mieru'
};
const protocolLabel = value => PROTOCOLS[String(value || '').toLowerCase()] || String(value || '-').toUpperCase();

function cell(x, y, width, value, { fill = null, color = INK, anchor = 'middle', size = FONT } = {}) {
  const tx = anchor === 'middle' ? x + width / 2 : x + 12;
  return `${fill ? svg.rect(x, y, width, ROW, fill) : ''}${svg.text(tx, y + ROW / 2, value, { size, color, anchor })}`;
}

// Node name with its flag drawn as an image; falls back to the region's flag.
function nameCell(x, y, width, name, { region = null } = {}) {
  const { flag, text } = svg.splitFlag(name);
  const code = flag && svg.hasFlag(flag) ? flag : (!flag && region && svg.hasFlag(region) ? region : null);
  const iconSize = 22;
  let out = '';
  let tx = x + 12;
  if (code) {
    out += svg.flag(code, tx, y + (ROW - iconSize) / 2, iconSize);
    tx += iconSize + 8;
  }
  out += svg.text(tx, y + ROW / 2, svg.truncate(text || name, x + width - tx - 10, FONT), { size: FONT, color: INK });
  return out;
}

function latencyCell(x, y, width, value) {
  if (value == null) return cell(x, y, width, '-', { color: MUTED });
  return cell(x, y, width, `${value}ms`, { fill: value > 0 ? pick(LATENCY_SCALE, value) : FAILED_FILL, color: value > 0 ? INK : MUTED });
}

function header(columns, y, width) {
  let out = svg.rect(0, y, width, ROW, HEAD_FILL);
  let x = 0;
  for (const column of columns) {
    out += svg.text(x + column.width / 2, y + ROW / 2, column.label, { size: FONT, anchor: 'middle', color: INK, weight: 600 });
    x += column.width;
  }
  return out;
}

function verticals(columns, top, bottom) {
  let out = '';
  let x = 0;
  for (const column of columns.slice(0, -1)) {
    x += column.width;
    out += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${BORDER}"/>`;
  }
  return out;
}

const rowLine = (y, width) => `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${BORDER}"/>`;

function title(width, value) {
  return svg.rect(0, 0, width, 44, '#f8fafc') + svg.text(width / 2, 22, value, { size: 18, anchor: 'middle', color: INK, weight: 600 });
}

function footer(lines, y, width) {
  let out = svg.rect(0, y, width, lines.length * 30 + 12, '#f8fafc');
  lines.forEach((line, index) => {
    out += svg.text(16, y + 21 + index * 30, svg.truncate(line, width - 32, 15), { size: 15, color: '#374151' });
  });
  return { body: out, height: lines.length * 30 + 12 };
}

function nameWidth(names, { min = 240, max = 460 } = {}) {
  return Math.round(Math.min(max, Math.max(min, ...names.map(name => svg.textWidth(svg.splitFlag(name).text, FONT) + 64))));
}

async function toPng(document, width, height) {
  // 2x for crisp text unless the image would exceed librsvg's size limits.
  const density = height * 2 < 30000 && width * 2 < 30000 ? 144 : 72;
  return sharp(Buffer.from(document), { density, limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
}

const formatTime = iso => new Date(iso).toLocaleString('zh-CN', { hour12: false });

module.exports = {
  ROW, FONT, BORDER, HEAD_FILL, MUTED, INK, FAILED_FILL, LATENCY_SCALE, SPEED_SCALE,
  pick, protocolLabel, cell, nameCell, latencyCell, header, verticals, rowLine, title, footer, nameWidth, toPng, formatTime
};
