// SVG building blocks for the PNG reports (rendered by sharp/librsvg). librsvg has no colour emoji,
// so flags are drawn from bundled Twemoji SVGs and other pictographs are dropped from text.
const FLAGS = require('../../assets/flags.json');

const FONT_FAMILY = "'Noto Sans CJK SC','Noto Sans SC','Source Han Sans SC','PingFang SC','Hiragino Sans GB','Microsoft YaHei','WenQuanYi Micro Hei',Arial,sans-serif";

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

// Rough advance width; good enough to size columns (CJK ≈ 1em, Latin ≈ 0.56em).
function textWidth(text, fontSize) {
  let em = 0;
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if (code >= 0x2e80) em += 1;
    else if (/[A-Z0-9MW@%]/.test(ch)) em += 0.64;
    else if (/[il.,:;|!'`]/.test(ch)) em += 0.3;
    else em += 0.55;
  }
  return em * fontSize;
}

function truncate(text, maxWidth, fontSize) {
  const value = String(text ?? '');
  if (textWidth(value, fontSize) <= maxWidth) return value;
  let out = '';
  for (const ch of value) {
    if (textWidth(`${out}${ch}…`, fontSize) > maxWidth) break;
    out += ch;
  }
  return `${out}…`;
}

const REGIONAL = /^\s*([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])\s*/u;

// "🇭🇰 Hong Kong 1" -> { flag: 'HK', text: 'Hong Kong 1' }; other emoji are removed from the text.
function splitFlag(name) {
  let text = String(name ?? '');
  let flag = null;
  const match = text.match(REGIONAL);
  if (match) {
    flag = String.fromCharCode(match[1].codePointAt(0) - 0x1f1e6 + 65, match[2].codePointAt(0) - 0x1f1e6 + 65);
    text = text.slice(match[0].length);
  }
  text = text.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .trim();
  return { flag, text };
}

const flagCache = new Map();

// Inline nested <svg> for a flag; ids are namespaced so several flags can share one document.
function flag(code, x, y, size) {
  const key = String(code || '').toUpperCase();
  const source = FLAGS[key];
  if (!source) return '';
  if (!flagCache.has(key)) {
    const body = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      .replace(/id="([^"]+)"/g, `id="f${key}-$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#f${key}-$1)`)
      .replace(/href="#([^"]+)"/g, `href="#f${key}-$1"`);
    flagCache.set(key, body);
  }
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 36 36">${flagCache.get(key)}</svg>`;
}

function hasFlag(code) {
  return Boolean(FLAGS[String(code || '').toUpperCase()]);
}

// y is the vertical centre of the text (baseline placed at ~0.35em below it).
function text(x, y, value, { size = 14, color = '#1f2937', anchor = 'start', weight = 400 } = {}) {
  const baseline = Math.round((y + size * 0.36) * 10) / 10;
  return `<text x="${x}" y="${baseline}" font-size="${size}" fill="${color}" text-anchor="${anchor}"${weight !== 400 ? ` font-weight="${weight}"` : ''}>${escapeXml(value)}</text>`;
}

function rect(x, y, width, height, fill, stroke = null) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1"` : ''}/>`;
}

function document(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<style>text{font-family:${FONT_FAMILY}}</style>
<rect width="100%" height="100%" fill="#ffffff"/>${body}</svg>`;
}

module.exports = { FONT_FAMILY, escapeXml, textWidth, truncate, splitFlag, flag, hasFlag, text, rect, document };
