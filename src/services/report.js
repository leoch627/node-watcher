const sharp = require('sharp');

const SERVICES = [
  ['netflix', 'Netflix'], ['disney', 'Disney+'], ['youtube', 'YouTube'],
  ['primeVideo', 'Prime Video'], ['chatgpt', 'ChatGPT']
];

const STATUS_STYLE = {
  unlocked: ['#dcfce7', '#166534'], limited: ['#fef3c7', '#92400e'],
  blocked: ['#fee2e2', '#991b1b'], error: ['#f1f5f9', '#64748b'],
  pending: ['#f8fafc', '#94a3b8']
};

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[char]));
}

function shorten(value, length) {
  const text = String(value || '');
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function cell(x, y, width, text, fill = '#ffffff', color = '#334155', align = 'left') {
  const textX = align === 'center' ? x + width / 2 : x + 12;
  return `<rect x="${x}" y="${y}" width="${width}" height="44" fill="${fill}" stroke="#e2e8f0"/>
    <text x="${textX}" y="${y + 28}" fill="${color}" font-size="13" text-anchor="${align === 'center' ? 'middle' : 'start'}">${escapeXml(text)}</text>`;
}

class ReportService {
  async render(statuses) {
    const widths = [250, 160, 100, 90, 130, 130, 130, 130, 130];
    const width = widths.reduce((sum, value) => sum + value, 0) + 48;
    const height = 126 + Math.max(1, statuses.length) * 44 + 58;
    const headers = ['节点', '来源', '协议', '延迟', ...SERVICES.map(([, label]) => label)];
    let rows = '';
    let x = 24;
    headers.forEach((header, index) => {
      rows += cell(x, 82, widths[index], header, '#0f172a', '#ffffff', index > 1 ? 'center' : 'left');
      x += widths[index];
    });
    const data = statuses.length ? statuses : [{ node: { name: '暂无检测结果', subscription: '-', protocol: '-' } }];
    data.forEach((status, rowIndex) => {
      const y = 126 + rowIndex * 44;
      x = 24;
      const baseFill = rowIndex % 2 ? '#f8fafc' : '#ffffff';
      const values = [
        shorten(status.node?.name, 28), shorten(status.node?.subscription, 18),
        String(status.node?.protocol || '-').toUpperCase(),
        status.online ? `${status.responseTime} ms` : status.online === false ? '离线' : '-'
      ];
      values.forEach((value, index) => {
        const color = index === 3 && status.online === false ? '#b91c1c' : '#334155';
        rows += cell(x, y, widths[index], value, baseFill, color, index > 1 ? 'center' : 'left');
        x += widths[index];
      });
      SERVICES.forEach(([key], serviceIndex) => {
        const service = status.media?.services?.[key];
        const state = service?.status || 'pending';
        const [fill, color] = STATUS_STYLE[state] || STATUS_STYLE.pending;
        const label = state === 'unlocked' ? (service.region || '可用')
          : state === 'limited' ? '受限' : state === 'blocked' ? '不可用' : state === 'error' ? '错误' : '-';
        rows += cell(x, y, widths[4 + serviceIndex], label, fill, color, 'center');
        x += widths[4 + serviceIndex];
      });
    });
    const checkedAt = new Date().toLocaleString('zh-CN', { hour12: false });
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <style>text { font-family: "Noto Sans CJK SC", "PingFang SC", Arial, sans-serif; letter-spacing: 0; }</style>
      <text x="24" y="39" fill="#0f172a" font-size="24" font-weight="700">Node Watcher 检测报告</text>
      <text x="24" y="64" fill="#64748b" font-size="13">${escapeXml(statuses.length)} 个节点 · ${escapeXml(checkedAt)}</text>
      ${rows}
      <text x="24" y="${height - 23}" fill="#64748b" font-size="12">结果受目标平台策略与网络波动影响，仅供参考</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}

module.exports = new ReportService();
