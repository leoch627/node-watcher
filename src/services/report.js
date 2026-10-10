// PNG matrix of the current node status on one probe: latency, unlock results (miaospeed-scripts,
// coloured like the scripts colour them in Koipy) and the exit region.
const svg = require('./render/svg');
const scripts = require('../miaospeed/scripts');
const {
  ROW, MUTED, INK, cell, nameCell, latencyCell, header, verticals, rowLine, title, footer, nameWidth, toPng, formatTime
} = require('./render/table');

const STATUS_FILL = {
  unlocked: '#bae67e', limited: '#fd9a5c', blocked: '#ef6b73', na: '#d4d3d4', error: '#9ee3f1'
};

function serviceCell(x, y, width, value) {
  if (!value) return cell(x, y, width, '-', { color: MUTED });
  const label = svg.truncate(value.text || value.status, width - 16, 14);
  return cell(x, y, width, label, { fill: STATUS_FILL[value.status] || '#f3f4f6', color: INK, size: 14 });
}

function regionLabel(status) {
  const claimed = status.node?.region;
  const actual = status.media?.exit?.region;
  if (!claimed && !actual) return '-';
  if (claimed && actual && claimed !== actual) return `${claimed}≠${actual}`;
  return claimed || actual;
}

class ReportService {
  // columns: script ids to show (defaults to the configured unlock columns).
  async render(statuses, { probeName = null, columns = scripts.DEFAULT_SCRIPTS, appVersion = '' } = {}) {
    const services = columns.map(id => ({ id, label: scripts.meta(id)?.name || id }));
    const regionalIds = [...new Set(statuses.flatMap(status => Object.entries(status.media?.services || {})
      .filter(([id, value]) => value?.regional && !columns.includes(id)).map(([id]) => id)))];
    const table = [
      { key: 'index', label: '序号', width: 64 },
      { key: 'name', label: '节点名称', width: nameWidth(statuses.map(status => status.node?.name || '')) },
      { key: 'type', label: '类型', width: 130 },
      { key: 'http', label: 'HTTP延迟', width: 110 },
      { key: 'rtt', label: '延迟RTT', width: 110 },
      ...services.map(service => ({ key: `s:${service.id}`, label: service.label, width: Math.max(120, Math.round(svg.textWidth(service.label, 16) + 32)) })),
      ...(regionalIds.length ? [{ key: 'regional', label: '区域服务', width: 320 }] : []),
      { key: 'region', label: '地区', width: 100 }
    ];
    const width = table.reduce((sum, column) => sum + column.width, 0);
    const rows = statuses.length ? statuses : [];
    let body = title(width, `Node Watcher 检测报告${probeName ? ` | ${probeName}` : ''}`) + header(table, 44, width);
    let y = 44 + ROW;
    rows.forEach((status, position) => {
      let x = 0;
      for (const column of table) {
        const w = column.width;
        if (column.key === 'index') body += cell(x, y, w, String(position + 1), { color: MUTED });
        else if (column.key === 'name') body += nameCell(x, y, w, status.node?.name || '', { region: status.node?.region });
        else if (column.key === 'type') body += cell(x, y, w, (status.node?.protocol || '-').toUpperCase());
        else if (column.key === 'http') body += status.online === false ? cell(x, y, w, '离线', { color: '#b91c1c' }) : latencyCell(x, y, w, status.responseTime ?? null);
        else if (column.key === 'rtt') body += latencyCell(x, y, w, status.online === false ? null : status.rtt ?? null);
        else if (column.key === 'region') body += cell(x, y, w, regionLabel(status));
        else if (column.key === 'regional') {
          const text = Object.values(status.media?.services || {}).filter(value => value?.regional)
            .map(value => `${value.label} ${value.text || value.status}`).join(' · ');
          body += cell(x, y, w, svg.truncate(text || '-', w - 24, 14), { anchor: 'start', size: 14, color: text ? INK : MUTED });
        } else body += serviceCell(x, y, w, status.media?.services?.[column.key.slice(2)]);
        x += w;
      }
      body += rowLine(y + ROW, width);
      y += ROW;
    });
    if (rows.length === 0) {
      body += cell(0, y, width, '暂无检测结果', { color: MUTED });
      y += ROW;
    }
    body += verticals(table, 44, y);
    const foot = footer([
      `版本=${appVersion}  节点=${statuses.length}  在线=${statuses.filter(item => item.online === true).length}  离线=${statuses.filter(item => item.online === false).length}`,
      `生成时间=${formatTime(new Date().toISOString())}  解锁结果来自 miaospeed-scripts，受目标平台策略与网络波动影响，仅供参考`
    ], y, width);
    body += foot.body;
    const height = y + foot.height;
    return toPng(svg.document(width, height, body), width, height);
  }
}

module.exports = new ReportService();
module.exports.STATUS_FILL = STATUS_FILL;
