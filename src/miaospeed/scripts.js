// Unlock checks: CloudPassenger/miaospeed-scripts (vendored in src/assets/miaospeed-scripts), run by
// miaospeed as TEST_SCRIPT matrices inside its goja sandbox.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets', 'miaospeed-scripts');
const SCRIPT_TIMEOUT_MS = 15000;

// Columns shown when the user has not chosen any.
const DEFAULT_SCRIPTS = ['netflix', 'disneyplus', 'youtube', 'primevideo', 'hbomax', 'chatgpt', 'claude', 'gemini', 'tiktok'];
// Region-specific services added automatically for nodes in that region (when enabled).
const REGIONAL_LIMIT = 4;

// Background colours the scripts use (src/lib/constants/colors.ts upstream).
const STATUS_BY_COLOR = {
  '186,230,126': 'unlocked',
  '239,107,115': 'blocked',
  '253,109,20': 'limited',
  '142,140,142': 'na',
  '92,207,230': 'error'
};

let catalogue = null;

function load() {
  if (catalogue) return catalogue;
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  catalogue = new Map(index.map(item => [item.id, {
    id: item.id, name: item.name, description: item.description || '', category: item.category,
    regions: item.regions || [], tags: item.tags || [], priority: item.priority ?? 100, path: item.path
  }]));
  return catalogue;
}

function list() {
  return [...load().values()].map(({ path: _path, ...meta }) => meta);
}

function meta(id) {
  return load().get(id) || null;
}

const contentCache = new Map();

// Script objects for a miaospeed request. Unknown ids are skipped.
function forRequest(ids) {
  const out = [];
  for (const id of ids) {
    const item = meta(id);
    if (!item) continue;
    if (!contentCache.has(id)) contentCache.set(id, fs.readFileSync(path.join(DIR, item.path), 'utf8'));
    out.push({ id, type: 'media', content: contentCache.get(id), timeout: SCRIPT_TIMEOUT_MS });
  }
  return out;
}

// Media scripts dedicated to a region (e.g. "hk" -> mytvsuper, viutv, ...), best first.
function regional(region, exclude = []) {
  const code = String(region || '').toLowerCase();
  if (!code) return [];
  const skip = new Set(exclude);
  return [...load().values()]
    .filter(item => item.category === 'media' && item.regions.includes(code) && !item.regions.includes('global') && !skip.has(item.id))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, REGIONAL_LIMIT)
    .map(item => item.id);
}

// { text, background } from a script -> { status, region, text }.
function classify(result) {
  if (!result) return { status: 'error', region: null, text: '' };
  const text = String(result.text || '').trim();
  let status = STATUS_BY_COLOR[String(result.background || '').replace(/\s/g, '')];
  if (!status) {
    if (/^解锁|^允许|^通过/.test(text)) status = 'unlocked';
    else if (/^失败|^拒绝|^阻止/.test(text)) status = 'blocked';
    else if (/^N\/A/.test(text)) status = 'na';
    else status = text ? 'limited' : 'error';
  }
  const inner = text.match(/\(([^()]*)\)\s*$/);
  const region = inner && /^[a-z]{2}$/i.test(inner[1]) ? inner[1].toUpperCase() : null;
  return { status, region, text };
}

module.exports = { DEFAULT_SCRIPTS, list, meta, forRequest, regional, classify };
