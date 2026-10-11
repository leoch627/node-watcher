// PNG reports for deep tests, in the style of the Koipy / FullTClash Telegram bots:
//  - latency / speed: one row per node with colour-scaled latency and speed cells, a per-second
//    speed sparkline and the UDP NAT type;
//  - topology: entry analysis (grouped by entry IP) and exit analysis (nodes clustered by exit IP).
const svg = require('./render/svg');
const { speedPasses, passResult } = require('./deepTest');
const scripts = require('../miaospeed/scripts');
const reportService = require('./report');
const {
  ROW, FONT, BORDER, MUTED, INK, FAILED_FILL, SPEED_SCALE, pick, protocolLabel, cell, nameCell, latencyCell,
  header, verticals, rowLine, title, footer, nameWidth, toPng, formatTime
} = require('./render/table');

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

// speedOf(row): the value "sort by speed" uses (the first speed pass's average).
function sortRows(rows, sort, speedOf = () => null) {
  const positive = v => (Number.isFinite(v) && v > 0 ? v : null);
  const value = (row, key) => positive(row.result?.[key]);
  if (sort === 'speed') return [...rows].sort((a, b) => (positive(speedOf(b)) ?? -1) - (positive(speedOf(a)) ?? -1));
  if (sort === 'rtt' || sort === 'http') return [...rows].sort((a, b) => (value(a, sort) ?? Infinity) - (value(b, sort) ?? Infinity));
  return rows;
}

const SORT_LABEL = { speed: '平均速度', rtt: '延迟RTT', http: 'HTTP延迟' };

function filterLabel(filter = {}) {
  return filter.include || filter.exclude ? `${filter.include || ''}<->${filter.exclude || ''}` : '<->';
}

function speedCell(x, y, w, value) {
  if (value == null) return cell(x, y, w, '-', { color: MUTED });
  return cell(x, y, w, formatSpeed(value), { fill: value > 0 ? pick(SPEED_SCALE, (value * 8) / 1e6) : FAILED_FILL, color: value > 0 ? INK : MUTED });
}

async function renderSpeed(job, { appVersion = '', sort = null } = {}) {
  const passes = speedPasses(job);
  const rows = sortRows(job.nodes.map((node, index) => ({ node, index, result: job.results[node.id] })), sort,
    row => passResult(row.result, passes[0])?.avg);
  // Per pass: average and maximum, plus the per-second sparkline while the table stays readable.
  const withSeries = passes.length <= 2;
  const labelWidth = label => Math.max(150, Math.ceil(svg.textWidth(label, FONT) + 28));
  const columns = [
    { key: 'index', label: '序号', width: 64 },
    { key: 'name', label: '节点名称', width: nameWidth(rows.map(row => row.node.name)) },
    { key: 'type', label: '类型', width: 150 },
    { key: 'rtt', label: '延迟RTT', width: 120 },
    { key: 'http', label: 'HTTP延迟', width: 120 },
    ...passes.flatMap(pass => {
      const prefix = passes.length > 1 ? pass.label : '';
      return [
        { key: 'avg', pass, label: `${prefix}${prefix ? '均速' : '平均速度'}` },
        { key: 'max', pass, label: `${prefix}${prefix ? '峰值' : '最大速度'}` },
        ...(withSeries ? [{ key: 'series', pass, label: `${prefix}${prefix ? '曲线' : '每秒速度'}` }] : [])
      ].map(column => ({ ...column, width: labelWidth(column.label) }));
    }),
    { key: 'udp', label: 'UDP类型', width: 210 }
  ];
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  const peaks = new Map(passes.map(pass => [pass.key, Math.max(0, ...rows.flatMap(row => passResult(row.result, pass)?.speeds || []))]));
  const heading = `Node Watcher ${passes.length ? `测速 - ${passes.map(pass => pass.label).join(' / ')}` : '延迟测试'} | ${job.backend.name}`;
  let body = title(width, heading) + header(columns, 44, width);
  let y = 44 + ROW;
  let x = 0;
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
        case 'http': body += latencyCell(x, y, w, result?.[column.key]); break;
        case 'avg':
        case 'max': body += speedCell(x, y, w, passResult(result, column.pass)?.[column.key] ?? null); break;
        case 'series': body += sparkline(x, y, w, passResult(result, column.pass)?.speeds, peaks.get(column.pass.key)); break;
        case 'udp': body += cell(x, y, w, result ? (result.udpType || 'Unknown') : '-', { color: result ? INK : MUTED }); break;
        default: break;
      }
      x += w;
    }
    body += rowLine(y + ROW, width);
    y += ROW;
  });
  body += verticals(columns, 44, y);
  const seconds = Math.round((job.durationMs || 0) / 1000);
  const backend = `${job.backend.name}${job.version ? `(${job.version})` : ''}`;
  const parts = [`版本=${appVersion}`, `后端=${backend}`];
  if (passes.length) {
    const threads = passes.map(pass => `${pass.direction === 'upload' ? '↑' : '↓'}${pass.threads}`).join('/');
    parts.push(`消耗流量=${formatBytes(job.trafficBytes)}`, `线程=${threads}`, `时长=${job.options.duration ?? job.options.downloadDuration}s`);
  }
  parts.push(`排序=${SORT_LABEL[sort] || '订阅原序'}`, `耗时=${seconds}s`, `Ping=${job.options.pingAverageOver}次`, `过滤器=${filterLabel(job.filter)}`);
  const status = job.status === 'completed' ? '' : ` [${job.status === 'cancelled' ? '已取消' : job.status === 'running' ? '进行中' : '未完成'} ${job.completed}/${job.total}]`;
  const lines = [parts.join('  '), `测试时间=${formatTime(job.startedAt)}  测试结果仅供参考，以实际情况为准${status}`];
  for (const warning of job.warnings || []) lines.push(`注意：${warning}`);
  const foot = footer(lines, y, width);
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
  const nodeNameWidth = nameWidth(job.nodes.map(node => node.name), { max: 420 });
  const entryColumns = [
    { label: '序号', width: 64 }, { label: '地区', width: 80 }, { label: 'AS编号', width: 120 },
    { label: '组织', width: Math.round(orgWidth) }, { label: '栈', width: 90 }, { label: '入口IP段', width: 170 }, { label: '出口数量', width: 120 }
  ];
  const exitColumns = [
    { label: '序号', width: 64 }, { label: '入口', width: 64 }, { label: '地区', width: 80 }, { label: 'AS编号', width: 120 },
    { label: '组织', width: Math.round(orgWidth) }, { label: '簇', width: 60 }, { label: '节点名称', width: nodeNameWidth }
  ];
  const width = Math.max(entryColumns.reduce((s, c) => s + c.width, 0), exitColumns.reduce((s, c) => s + c.width, 0));
  // Stretch the organisation column so both tables share the full width.
  const fit = columns => { const total = columns.reduce((s, c) => s + c.width, 0); columns.find(c => c.label === '组织').width += width - total; };
  fit(entryColumns);
  fit(exitColumns);

  let body = title(width, `Node Watcher - 节点拓扑分析 | ${job.backend.name}`);
  let y = 44;
  body += header(entryColumns, y, width);
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
    body += rowLine(y + ROW, width);
    y += ROW;
  }
  if (topo.entries.length === 0) {
    body += cell(0, y, width, '没有入口数据', { color: MUTED });
    y += ROW;
  }
  body += verticals(entryColumns, entryTop - ROW, y);

  body += svg.rect(0, y, width, ROW, '#f8fafc') + svg.text(width / 2, y + ROW / 2, '出口分析', { size: FONT, anchor: 'middle', weight: 600 });
  y += ROW;
  body += header(exitColumns, y, width);
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

// Unlock tests reuse the node-matrix renderer (FullTClash "连通性测试" layout): HTTP delay, one
// column per script coloured by the script itself, and a "解锁占比" row.
async function renderUnlock(job, { appVersion = '', sort = null } = {}) {
  const rows = sortRows(job.nodes.map((node, index) => ({ node, index, result: job.results[node.id] })), sort);
  const statuses = rows.map(({ node, result }) => ({
    node: { name: node.name, protocol: node.protocol, region: node.region },
    online: null, responseTime: result ? result.http ?? 0 : null, rtt: result ? result.rtt ?? 0 : null,
    media: result ? {
      exit: { region: result.outbound?.main?.countryCode || null },
      services: Object.fromEntries(Object.entries(result.scripts || {}).map(([id, value]) => [id, {
        ...scripts.classify(value), background: value.background || '', label: scripts.meta(id)?.name || id
      }]))
    } : null
  }));
  const seconds = Math.round((job.durationMs || 0) / 1000);
  const backend = `${job.backend.name}${job.version ? `(${job.version})` : ''}`;
  const status = job.status === 'completed' ? '' : ` [${job.status === 'cancelled' ? '已取消' : job.status === 'running' ? '进行中' : '未完成'} ${job.completed}/${job.total}]`;
  return reportService.render(statuses, {
    columns: job.options.scripts || [], ratioRow: true, appVersion,
    title: `Node Watcher - 连通性测试 | ${job.backend.name}`,
    footerLines: [
      `版本=${appVersion}  后端=${backend}  排序=${SORT_LABEL[sort] || '订阅原序'}  过滤器=${filterLabel(job.filter)}`,
      `测试时间=${formatTime(job.startedAt)}  总共耗时=${seconds}s  测试结果仅供参考，以实际情况为准${status}`
    ]
  });
}

function render(job, options = {}) {
  if (job.preset === 'topology') return renderTopology(job, options);
  if (job.preset === 'unlock') return renderUnlock(job, options);
  return renderSpeed(job, options);
}

module.exports = { render, renderSpeed, renderTopology, renderUnlock, buildTopology, formatSpeed, maskIp };
