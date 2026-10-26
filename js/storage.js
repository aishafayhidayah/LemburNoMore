/**
 * storage.js — localStorage helper
 * LemburNoMore
 */

const STORAGE_KEY = 'lemburnomore';

const DEFAULT_SETTINGS = {
  focusDuration:    25,
  shortBreak:       5,
  longBreak:        15,
  longBreakInterval: 4,
  autoStart:        false,
  notifications:    false,
  sound:            true,
  fullscreenBreak:  false,
  showCat:          true,
  jamPulang:        '',
  dailyLimit:       0,
  theme:            'light',
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

export function getSettings() {
  const d = loadData();
  return { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
}

export function saveSettings(settings) {
  const d = loadData();
  d.settings = { ...(d.settings || {}), ...settings };
  saveData(d);
}

// ---- STATS ----

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function getStats() {
  const d = loadData();
  return d.stats || {};
}

export function recordSession(focusMinutes) {
  const d = loadData();
  if (!d.stats) d.stats = {};
  const key = todayKey();
  if (!d.stats[key]) d.stats[key] = { sessions: 0, focusMinutes: 0 };
  d.stats[key].sessions += 1;
  d.stats[key].focusMinutes += focusMinutes;
  // Keep only 30 days
  const keys = Object.keys(d.stats).sort();
  if (keys.length > 30) {
    const toRemove = keys.slice(0, keys.length - 30);
    toRemove.forEach(k => delete d.stats[k]);
  }
  saveData(d);
}

export function clearStats() {
  const d = loadData();
  delete d.stats;
  saveData(d);
}

export function getTodayStats() {
  const stats = getStats();
  const key = todayKey();
  return stats[key] || { sessions: 0, focusMinutes: 0 };
}

export function getWeekStats() {
  const stats = getStats();
  const today = new Date();
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (stats[key]) total += stats[key].sessions;
  }
  return total;
}

export function getStreak() {
  const stats = getStats();
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (stats[key] && stats[key].sessions > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function getLast7Days() {
  const stats = getStats();
  const result = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      label: d.toLocaleDateString('id-ID', { weekday: 'short' }),
      sessions: stats[key]?.sessions || 0,
    });
  }
  return result;
}
