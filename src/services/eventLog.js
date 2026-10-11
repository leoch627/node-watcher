const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { writeFileAtomic } = require('../utils/atomicWrite');

const MAX_EVENTS = 2000;
const SAVE_DEBOUNCE_MS = 2000;
const CATEGORIES = ['unlock', 'node', 'subscription', 'probe'];

// Event log shown on the "日志" page, plus the unlock baselines that unlock changes are detected
// against (the last definite result per probe / node / service). Both survive restarts in one file.
class EventLog {
  constructor(options = {}) {
    this.file = options.file || process.env.EVENTS_FILE || path.join(process.cwd(), 'data', 'events.json');
    this.events = [];
    // probeId -> nodeId -> serviceId -> { status, region, lostSince?, lostRegion? }
    this.baselines = {};
    this.lastScheduledUnlockAt = null;
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.events = Array.isArray(data.events) ? data.events.slice(0, MAX_EVENTS) : [];
      this.baselines = data.baselines && typeof data.baselines === 'object' ? data.baselines : {};
      this.lastScheduledUnlockAt = data.lastScheduledUnlockAt || null;
    } catch (error) {
      logger.warn(`Could not load event log: ${error.message}`);
    }
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
    this.saveTimer.unref?.();
  }

  saveNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      writeFileAtomic(this.file, JSON.stringify({
        version: 1, events: this.events, baselines: this.baselines, lastScheduledUnlockAt: this.lastScheduledUnlockAt
      }));
    } catch (error) {
      logger.warn(`Could not save event log: ${error.message}`);
    }
  }

  flushSync() {
    if (this.saveTimer) this.saveNow();
  }

  // { category, level: info|warning|error, title, detail?, nodeId?, nodeName?, probeId?, probeName? }
  add(event) {
    const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), level: 'info', ...event };
    this.events.unshift(entry);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    this.scheduleSave();
    return entry;
  }

  list({ category = null, limit = 300 } = {}) {
    const filtered = category ? this.events.filter(item => item.category === category) : this.events;
    return filtered.slice(0, Math.max(1, Math.min(MAX_EVENTS, Number(limit) || 300)));
  }

  clear() {
    this.events = [];
    this.scheduleSave();
  }

  baseline(probeId, nodeId) {
    return this.baselines[probeId]?.[nodeId] || {};
  }

  setBaseline(probeId, nodeId, services) {
    if (!this.baselines[probeId]) this.baselines[probeId] = {};
    this.baselines[probeId][nodeId] = services;
    this.scheduleSave();
  }

  // Forget baselines of nodes that are gone (keeps the file from growing with every airport change).
  pruneBaselines(probeId, nodeIds) {
    const entries = this.baselines[probeId];
    if (!entries) return;
    for (const id of Object.keys(entries)) if (!nodeIds.has(id)) delete entries[id];
    this.scheduleSave();
  }

  markScheduledUnlock(at = new Date().toISOString()) {
    this.lastScheduledUnlockAt = at;
    this.scheduleSave();
  }
}

// Compares one fresh unlock result of a node with its baseline. Error results (the script could not
// decide) neither change the baseline nor produce events. Returns the next baseline, the events to log,
// and `lostSince` per service for the dashboard marker.
//   unlocked -> anything else           : 'lost'      (marker until the service is unlocked again)
//   lost -> unlocked                    : 'restored'
//   unlocked (JP) -> unlocked (US)      : 'region'
function diffUnlock(previous, services, now = new Date().toISOString()) {
  const next = { ...previous };
  const changes = [];
  for (const [id, value] of Object.entries(services)) {
    if (!value || value.status === 'error') continue;
    const before = previous[id];
    const current = { status: value.status, region: value.region || null };
    if (!before) {
      next[id] = current;
    } else if (before.status === 'unlocked' && value.status !== 'unlocked') {
      next[id] = { ...current, lostSince: now, lostRegion: before.region || null };
      changes.push({ kind: 'lost', id, before, after: current });
    } else if (before.status !== 'unlocked' && value.status === 'unlocked') {
      next[id] = current;
      if (before.lostSince) changes.push({ kind: 'restored', id, before, after: current });
    } else if (before.status === 'unlocked' && before.region && current.region && before.region !== current.region) {
      next[id] = current;
      changes.push({ kind: 'region', id, before, after: current });
    } else {
      next[id] = { ...current, ...(before.lostSince ? { lostSince: before.lostSince, lostRegion: before.lostRegion || null } : {}) };
    }
  }
  return { next, changes };
}

module.exports = new EventLog();
module.exports.EventLog = EventLog;
module.exports.diffUnlock = diffUnlock;
module.exports.CATEGORIES = CATEGORIES;
