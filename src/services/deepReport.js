// PNG reports for deep tests, in the style of the Koipy / FullTClash Telegram bots:
//  - latency / speed: one row per node with colour-scaled latency and speed cells, a per-second
//    speed sparkline and the UDP NAT type;
//  - topology: entry analysis (grouped by entry IP) and exit analysis (nodes clustered by exit IP).
const sharp = require('sharp');
const svg = require('./render/svg');

const ROW = 40;
const FONT = 16;
const BORDER = '#e5e7eb';
const HEAD_FILL = '#f3f4f6';
const MUTED = '#6b7280';
const INK = '#1f2937';

const PROTOCOLS = {
  ss: 'Shadowsocks', ssr: 'ShadowsocksR', vmess: 'VMess', vless: 'VLESS', trojan: 'Trojan',
  hysteria: 'Hysteria', hysteria2: 'Hysteria2', tuic: 'TUIC', wireguard: 'WireGuard', anytls: 'AnyTLS',
  socks5: 'SOCKS5', http: 'HTTP', snell: 'Snell', ssh: 'SSH', mieru: 'Mieru'
};

// Latency (ms): pale for fast, deep teal for slow; 0 means the test failed.
const LATENCY_SCALE = [[50, '#d5f8ef'], [100, '#b4f2e2'], [200, '#94ebd6'], [300, '#72e0c8'], [500, '#4fd3b8'], [800, '#33c3a6'], [Infinity, '#1fae92']];
// Speed (Mbps): pale blue for slow, through blue to cyan for fast.
const SPEED_SCALE = [[1, '#eef3fb'], [10, '#e2ecfb'], [50, '#c7dbf8'], [100, '#a9c8f6'], [200, '#86b1f3'], [300, '#6aa3f2'], [500, '#4f9df0'], [800, '#38b7ee'], [Infinity, '#22d0ea']];
const FAILED_FILL = '#f6f8fa';

const pick = (scale, value) => scale.find(([limit]) => value <= limit)[1];

function formatSpeed(bytesPerSecond) {
  const bits = Number(bytesPerSecond || 0) * 8;
  if (bits >= 1e9) return `${(bits / 1e9).toFixed(2)}Gbps`;
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(2)}Mbps`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(2)}Kbps`;
  return `${Math.round(bits)}bps`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)}GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)}MB`;
  return `${Math.round(value / 1024)}KB`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

const protocolLabel = value => PROTOCOLS[String(value || '').toLowerCase()] || String(value || '-').toUpperCase();

// Background + centred text for one cell.
function cell(x, y, width, value, { fill = null, color = INK, anchor = 'middle', size = FONT } = {}) {
  const tx = anchor === 'middle' ? x + width / 2 : x + 12;
  return `${fill ? svg.rect(x, y, width, ROW, fill) : ''}${svg.text(tx, y + ROW / 2, value, { size, color, anchor })}`;
}

// Node name with its flag drawn as an image (names keep any flag they carry in the subscription).
function nameCell(x, y, width, name, { region = null } = {}) {
  const { flag, text } = svg.splitFlag(name);
  const code = flag || null;
  const iconSize = 22;
  let out = '';
  let tx = x + 12;
  if (code && svg.hasFlag(code)) {
    out += svg.flag(code, tx, y + (ROW - iconSize) / 2, iconSize);
    tx += iconSize + 8;
  } else if (!flag && region && svg.hasFlag(region)) {
    out += svg.flag(region, tx, y + (ROW - iconSize) / 2, iconSize);
    tx += iconSize + 8;
  }
  out += svg.text(tx, y + ROW / 2, svg.truncate(text || name, x + width - tx - 10, FONT), { size: FONT, color: INK });
  return out;
}

function sparkline(x, y, width, speeds, globalMax) {
  if (!speeds?.length || !globalMax) return '';
  const pad = 6;
  const barWidth = (width - pad * 2) / speeds.length;
  const usable = ROW - pad * 2;
  let out = '';
  speeds.forEach((value, index) => {
    if (!value) return;
    const height = Math.max(1.5, (value / globalMax) * usable);
    const mbps = (value * 8) / 1e6;
    out += svg.rect(Math.round((x + pad + index * barWidth) * 10) / 10, Math.round((y + ROW - pad - height) * 10) / 10,
      Math.max(1, Math.round((barWidth - 0.6) * 10) / 10), Math.round(height * 10) / 10, pick(SPEED_SCALE, mbps));
  });
  return out;
}

function footer(lines, y, width) {
  let out = svg.rect(0, y, width, lines.length * 30 + 12, '#f8fafc');
  lines.forEach((line, index) => {
    out += svg.text(16, y + 21 + index * 30, svg.truncate(line, width - 32, 15), { size: 15, color: '#374151' });
  });
  return { body: out, height: lines.length * 30 + 12 };
}

async function toPng(document, width, height) {
  // 2x for crisp text unless the image would exceed librsvg's size limits.
  const density = height * 2 < 30000 && width * 2 < 30000 ? 144 : 72;
  return sharp(Buffer.from(document), { density, limitInputPixels: false }).png({ compressionLevel: 9 }).toBuffer();
}

function sortRows(rows, sort) {
  const value = (row, key) => {
    const v = row.result?.[key];
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  if (sort === 'speed') return [...rows].sort((a, b) => (value(b, 'avgSpeed') ?? -1) - (value(a, 'avgSpeed') ?? -1));
  if (sort === 'rtt' || sort === 'http') return [...rows].sort((a, b) => (value(a, sort) ?? Infinity) - (value(b, sort) ?? Infinity));
  return rows;
}

const SORT_LABEL = { speed: '平均速度', rtt: '延迟RTT', http: 'HTTP延迟' };

function filterLabel(filter = {}) {
  return filter.include || filter.exclude ? `${filter.include || ''}<->${filter.exclude || ''}` : '<->';
}

async function renderSpeed(job, { appVersion = '', sort = null } = {}) {
  const speed = job.preset === 'speed';
  const rows = sortRows(job.nodes.map((node, index) => ({ node, index, result: job.results[node.id] })), sort);
  const nameWidth = Math.min(460, Math.max(240, ...rows.map(row => svg.textWidth(svg.splitFlag(row.node.name).text, FONT) + 64)));
  const columns = [
    { key: 'index', label: '序号', width: 64 },
    { key: 'name', label: '节点名称', width: Math.round(nameWidth) },
    { key: 'type', label: '类型', width: 150 },
    { key: 'rtt', label: '延迟RTT', width: 120 },
    { key: 'http', label: 'HTTP延迟', width: 120 },
    ...(speed ? [
      { key: 'avg', label: '平均速度', width: 160 },
      { key: 'max', label: '最大速度', width: 160 },
      { key: 'series', label: '每秒速度', width: 150 }
    ] : []),
    { key: 'udp', label: 'UDP类型', width: 210 }
  ];
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  const globalMax = Math.max(0, ...rows.flatMap(row => row.result?.speeds || []));
  const title = `Node Watcher ${speed ? '测速' : '延迟测试'}${speed ? ` - ${job.options.downloadThreading > 1 ? `${job.options.downloadThreading}线程` : '单线程'}测速` : ''} | ${job.backend.name}`;
  let body = svg.rect(0, 0, width, 44, '#f8fafc') + svg.text(width / 2, 22, title, { size: 18, anchor: 'middle', color: INK, weight: 600 });
  let y = 44;
  let x = 0;
  body += svg.rect(0, y, width, ROW, HEAD_FILL);
  for (const column of columns) {
    body += svg.text(x + column.width / 2, y + ROW / 2, column.label, { size: FONT, anchor: 'middle', color: INK, weight: 600 });
    x += column.width;
  }
  y += ROW;
  rows.forEach((row, position) => {
    const result = row.result;
    x = 0;
    for (const column of columns) {
      const w = column.width;
      switch (column.key) {
        case 'index': body += cell(x, y, w, String(position + 1), { color: MUTED }); break;
        case 'name': body += nameCell(x, y, w, row.node.name, { region: row.node.region }); break;
        case 'type': body += cell(x, y, w, protocolLabel(row.node.protocol)); break;
        case 'rtt':
        case 'http': {
          const value = result?.[column.key];
          if (value == null) body += cell(x, y, w, '-', { color: MUTED });
          else body += cell(x, y, w, `${value}ms`, { fill: value > 0 ? pick(LATENCY_SCALE, value) : FAILED_FILL, color: value > 0 ? INK : MUTED });
          break;
        }
        case 'avg':
        case 'max': {
          const value = result?.[column.key === 'avg' ? 'avgSpeed' : 'maxSpeed'];
          if (value == null) body += cell(x, y, w, '-', { color: MUTED });
          else body += cell(x, y, w, formatSpeed(value), { fill: value > 0 ? pick(SPEED_SCALE, (value * 8) / 1e6) : FAILED_FILL, color: value > 0 ? INK : MUTED });
          break;
        }
        case 'series': body += sparkline(x, y, w, result?.speeds, globalMax); break;
        case 'udp': body += cell(x, y, w, result ? (result.udpType || 'Unknown') : '-', { color: result ? INK : MUTED }); break;
        default: break;
      }
      x += w;
    }
    body += `<line x1="0" y1="${y + ROW}" x2="${width}" y2="${y + ROW}" stroke="${BORDER}"/>`;
    y += ROW;
  });
  // Vertical separators
  x = 0;
  for (const column of columns.slice(0, -1)) {
    x += column.width;
    body += `<line x1="${x}" y1="44" x2="${x}" y2="${y}" stroke="${BORDER}"/>`;
  }
  const seconds = Math.round((job.durationMs || 0) / 1000);
  const backend = `${job.backend.name}${job.version ? `(${job.version})` : ''}`;
  const parts = [`版本=${appVersion}`, `后端=${backend}`];
  if (speed) parts.push(`消耗流量=${formatBytes(job.trafficBytes)}`, `线程=↓${job.options.downloadThreading}`, `时长=${job.options.downloadDuration}s`);
  parts.push(`排序=${SORT_LABEL[sort] || '订阅原序'}`, `耗时=${seconds}s`, `Ping=${job.options.pingAverageOver}次`, `过滤器=${filterLabel(job.filter)}`);
  const status = job.status === 'completed' ? '' : ` [${job.status === 'cancelled' ? '已取消' : job.status === 'running' ? '进行中' : '未完成'} ${job.completed}/${job.total}]`;
  const foot = footer([parts.join('  '), `测试时间=${formatTime(job.startedAt)}  测试结果仅供参考，以实际情况为准${status}`], y, width);
  body += foot.body;
  const height = y + foot.height;
  return toPng(svg.document(width, height, body), width, height);
}

// --- topology --------------------------------------------------------------------------------

function maskIp(ip) {
  const value = String(ip || '');
  if (!value) return '';
  if (value.includes(':')) return `${value.split(':').slice(0, 2).join(':')}:*`;
  return `${value.split('.').slice(0, 2).join('.')}.*.*`;
}

const stackLabel = stack => ({ 4: 'IPv4', 6: 'IPv6', 46: 'IPv4/6' }[stack] || '-');

function buildTopology(job) {
  const entries = new Map();
  const rows = job.nodes.map(node => ({ node, result: job.results[node.id] || {} }));
  for (const row of rows) {
    const inbound = row.result.inbound?.main;
    const key = inbound?.ip || `?${row.node.id}`;
    if (!inbound) { row.entry = null; continue; }
    if (!entries.has(key)) entries.set(key, { index: entries.size + 1, info: inbound, stack: row.result.inbound.stack, exits: new Set() });
    row.entry = entries.get(key);
    const exit = row.result.outbound?.main?.ip;
    if (exit) row.entry.exits.add(exit);
  }
  // Exit clusters: nodes sharing the same exit IP; nodes without an exit result form the last cluster.
  const clusters = new Map();
  for (const row of rows) {
    const exit = row.result.outbound?.main;
    const key = exit?.ip || '￿';
    if (!clusters.has(key)) clusters.set(key, { info: exit || null, rows: [] });
    clusters.get(key).rows.push(row);
  }
  const ordered = [...clusters.entries()].sort(([a], [b]) => (a === '￿') - (b === '￿')).map(([, value]) => value);
  return { entries: [...entries.values()], clusters: ordered, exitCount: [...clusters.keys()].filter(key => key !== '￿').length };
}

// A cell spanning `span` rows; returns the svg.
function spanCell(x, y, width, span, value, options = {}) {
  const height = ROW * span;
  const tx = options.anchor === 'start' ? x + 12 : x + width / 2;
  return `${svg.rect(x, y, width, height, '#ffffff')}${svg.text(tx, y + height / 2, value, { size: FONT, color: options.color || INK, anchor: options.anchor || 'middle' })}<line x1="${x}" y1="${y + height}" x2="${x + width}" y2="${y + height}" stroke="${BORDER}"/>`;
}

async function renderTopology(job, { appVersion = '' } = {}) {
  const topo = buildTopology(job);
  const orgWidth = Math.min(520, Math.max(260, ...topo.entries.map(entry => svg.textWidth(entry.info.org, FONT) + 30),
    ...topo.clusters.map(cluster => svg.textWidth(cluster.info?.org || '', FONT) + 30)));
  const nameWidth = Math.min(420, Math.max(240, ...job.nodes.map(node => svg.textWidth(svg.splitFlag(node.name).text, FONT) + 64)));
  const entryColumns = [
    { label: '序号', width: 64 }, { label: '地区', width: 80 }, { label: 'AS编号', width: 120 },
    { label: '组织', width: Math.round(orgWidth) }, { label: '栈', width: 90 }, { label: '入口IP段', width: 170 }, { label: '出口数量', width: 120 }
  ];
  const exitColumns = [
    { label: '序号', width: 64 }, { label: '入口', width: 64 }, { label: '地区', width: 80 }, { label: 'AS编号', width: 120 },
    { label: '组织', width: Math.round(orgWidth) }, { label: '簇', width: 60 }, { label: '节点名称', width: Math.round(nameWidth) }
  ];
  const width = Math.max(entryColumns.reduce((s, c) => s + c.width, 0), exitColumns.reduce((s, c) => s + c.width, 0));
  // Stretch the organisation column so both tables share the full width.
  const fit = columns => { const total = columns.reduce((s, c) => s + c.width, 0); columns.find(c => c.label === '组织').width += width - total; };
  fit(entryColumns);
  fit(exitColumns);

  const header = (columns, y) => {
    let out = svg.rect(0, y, width, ROW, HEAD_FILL);
    let x = 0;
    for (const column of columns) {
      out += svg.text(x + column.width / 2, y + ROW / 2, column.label, { size: FONT, anchor: 'middle', color: INK, weight: 600 });
      x += column.width;
    }
    return out;
  };
  const verticals = (columns, top, bottom) => {
    let out = '';
    let x = 0;
    for (const column of columns.slice(0, -1)) {
      x += column.width;
      out += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${BORDER}"/>`;
    }
    return out;
  };

  let body = svg.rect(0, 0, width, 44, '#f8fafc') + svg.text(width / 2, 22, `Node Watcher - 节点拓扑分析 | ${job.backend.name}`, { size: 18, anchor: 'middle', weight: 600 });
  let y = 44;
  body += header(entryColumns, y);
  y += ROW;
  const entryTop = y;
  for (const entry of topo.entries) {
    let x = 0;
    const values = [String(entry.index), entry.info.countryCode || '-', entry.info.asn ? `AS${entry.info.asn}` : '-',
      entry.info.org || '-', stackLabel(entry.stack), maskIp(entry.info.ip), String(entry.exits.size)];
    values.forEach((value, index) => {
      const column = entryColumns[index];
      body += index === 3
        ? cell(x, y, column.width, svg.truncate(value, column.width - 24, FONT), { anchor: 'start' })
        : cell(x, y, column.width, value, { color: index === 0 ? MUTED : INK });
      x += column.width;
    });
    body += `<line x1="0" y1="${y + ROW}" x2="${width}" y2="${y + ROW}" stroke="${BORDER}"/>`;
    y += ROW;
  }
  if (topo.entries.length === 0) {
    body += cell(0, y, width, '没有入口数据', { color: MUTED });
    y += ROW;
  }
  body += verticals(entryColumns, entryTop - ROW, y);

  body += svg.rect(0, y, width, ROW, '#f8fafc') + svg.text(width / 2, y + ROW / 2, '出口分析', { size: FONT, anchor: 'middle', weight: 600 });
  y += ROW;
  body += header(exitColumns, y);
  y += ROW;
  const exitTop = y;
  const xs = [];
  exitColumns.reduce((left, column) => { xs.push(left); return left + column.width; }, 0);
  // The entry column is merged across equal neighbours, also across cluster boundaries.
  const ordered = topo.clusters.flatMap(cluster => cluster.rows);
  let runStart = 0;
  ordered.forEach((row, index) => {
    const rowY = exitTop + index * ROW;
    body += cell(xs[0], rowY, exitColumns[0].width, String(index + 1), { color: MUTED });
    body += nameCell(xs[6], rowY, exitColumns[6].width, row.node.name, { region: row.node.region });
    body += `<line x1="${xs[0]}" y1="${rowY + ROW}" x2="${xs[1]}" y2="${rowY + ROW}" stroke="${BORDER}"/><line x1="${xs[6]}" y1="${rowY + ROW}" x2="${width}" y2="${rowY + ROW}" stroke="${BORDER}"/>`;
    const next = ordered[index + 1];
    if (!next || next.entry !== row.entry) {
      body += spanCell(xs[1], exitTop + runStart * ROW, exitColumns[1].width, index - runStart + 1, row.entry ? String(row.entry.index) : '-');
      runStart = index + 1;
    }
  });
  for (const cluster of topo.clusters) {
    const span = cluster.rows.length;
    const clusterTop = y;
    const info = cluster.info;
    body += spanCell(xs[2], clusterTop, exitColumns[2].width, span, info?.countryCode || '');
    body += spanCell(xs[3], clusterTop, exitColumns[3].width, span, info?.asn ? `AS${info.asn}` : '');
    body += spanCell(xs[4], clusterTop, exitColumns[4].width, span, svg.truncate(info?.org || '', exitColumns[4].width - 24, FONT), { anchor: 'start' });
    body += spanCell(xs[5], clusterTop, exitColumns[5].width, span, info ? String(span) : String(span), { color: info ? INK : MUTED });
    y += span * ROW;
  }
  body += verticals(exitColumns, exitTop - ROW, y);

  const seconds = Math.round((job.durationMs || 0) / 1000);
  const backend = `${job.backend.name}${job.version ? `(${job.version})` : ''}`;
  const status = job.status === 'completed' ? '' : ` [${job.status === 'cancelled' ? '已取消' : '未完成'} ${job.completed}/${job.total}]`;
  const foot = footer([
    `版本=${appVersion}  后端=${backend}  概要=${topo.entries.length}->${topo.exitCount}  节点=${job.nodes.length}  过滤器=${filterLabel(job.filter)}`,
    `测试时间=${formatTime(job.startedAt)}  总共耗时=${seconds}s  测试结果仅供参考，以实际情况为准，簇代表落地复用${status}`
  ], y, width);
  body += foot.body;
  const height = y + foot.height;
  return toPng(svg.document(width, height, body), width, height);
}

function render(job, options = {}) {
  return job.preset === 'topology' ? renderTopology(job, options) : renderSpeed(job, options);
}

module.exports = { render, renderSpeed, renderTopology, buildTopology, formatSpeed, maskIp };
