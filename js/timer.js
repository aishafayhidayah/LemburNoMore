/**
 * timer.js — Pomodoro timer logic using timestamps
 * LemburNoMore
 */

import { getSettings, recordSession } from './storage.js';
import { playFocusEnd, playBreakEnd } from './audio.js';

// ---- MODES ----
export const MODE = {
  FOCUS: 'focus',
  SHORT: 'short',
  LONG:  'long',
};

// ---- STATE ----
let state = {
  mode:          MODE.FOCUS,
  running:       false,
  remaining:     0,        // live seconds remaining (updated every tick)
  sessionCount:  0,        // completed focus sessions this run
  startedAt:     null,     // Date.now() at the moment of the last startTimer()/resume
  remainingAtResume: 0,    // remaining value captured at the moment of last startTimer()/resume
  tickInterval:  null,
};

// ---- EVENT CALLBACKS ----
// Registered by app.js
let onTick        = null;   // (remaining, total, mode) => void
let onPhaseEnd    = null;   // (completedMode) => void
let onStateChange = null;   // (running, mode) => void

export function onTimerTick(fn)        { onTick = fn; }
export function onTimerPhaseEnd(fn)    { onPhaseEnd = fn; }
export function onTimerStateChange(fn) { onStateChange = fn; }

// ---- HELPERS ----
function getDuration(mode, settings) {
  switch (mode) {
    case MODE.FOCUS: return (settings.focusDuration || 25) * 60;
    case MODE.SHORT: return (settings.shortBreak    || 5)  * 60;
    case MODE.LONG:  return (settings.longBreak     || 15) * 60;
  }
}

export function getSessionCount() { return state.sessionCount; }
export function getMode()         { return state.mode; }
export function isRunning()       { return state.running; }
export function getRemaining()    { return state.remaining; }

export function getTotal() {
  return getDuration(state.mode, getSettings());
}

// ---- INIT ----
export function initTimer() {
  const settings = getSettings();
  state.mode      = MODE.FOCUS;
  state.running   = false;
  state.remaining = getDuration(MODE.FOCUS, settings);
  state.remainingAtResume = state.remaining;
  state.sessionCount = 0;
  _notifyState();
  _notifyTick();
}

// ---- START / PAUSE ----
export function startTimer() {
  if (state.running) return;
  state.running          = true;
  state.startedAt        = Date.now();
  state.remainingAtResume = state.remaining; // anchor = current remaining at resume
  _tick();
  state.tickInterval = setInterval(_tick, 500);
  _notifyState();
}

export function pauseTimer() {
  if (!state.running) return;
  _clearInterval();
  // state.remaining is already kept live by _tick, so it's correct here
  state.running = false;
  _notifyState();
}

export function toggleTimer() {
  state.running ? pauseTimer() : startTimer();
}

// ---- RESET ----
export function resetTimer() {
  _clearInterval();
  const settings = getSettings();
  state.running   = false;
  state.remaining = getDuration(state.mode, settings);
  state.remainingAtResume = state.remaining;
  state.startedAt = null;
  _notifyState();
  _notifyTick();
}

// ---- SKIP ----
export function skipToNextPhase() {
  _clearInterval();
  state.running = false;
  _advancePhase(false);
}

// ---- SET MODE (manual tab switch) ----
export function setMode(mode) {
  if (state.running) pauseTimer();
  const settings = getSettings();
  state.mode      = mode;
  state.remaining = getDuration(mode, settings);
  state.remainingAtResume = state.remaining;
  state.startedAt = null;
  _notifyState();
  _notifyTick();
}

// ---- INTERNAL TICK ----
function _tick() {
  if (!state.running) return;
  // Compute elapsed since last resume, then subtract from the anchor
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const rem     = Math.max(0, state.remainingAtResume - elapsed);

  // Keep state.remaining live so getRemaining() / pauseTimer() / _notifyTick() see it correctly
  state.remaining = rem;

  // Update tab title
  _updateTitle(rem, state.mode);
  _notifyTick();

  if (rem === 0) {
    _clearInterval();
    state.running = false;
    _onPhaseComplete();
  }
}

function _onPhaseComplete() {
  const completedMode = state.mode;
  if (completedMode === MODE.FOCUS) {
    state.sessionCount++;
    const settings = getSettings();
    recordSession(settings.focusDuration || 25);
    if (settings.sound) playFocusEnd();
    _sendNotification('Fokus selesai! 🐱', 'Waktunya istirahat, kucing gembulmu menunggumu!');
  } else {
    const settings = getSettings();
    if (settings.sound) playBreakEnd();
    _sendNotification('Istirahat selesai! ☕', 'Ayo fokus lagi, kamu bisa!');
  }

  if (onPhaseEnd) onPhaseEnd(completedMode);

  const settings = getSettings();
  if (settings.autoStart) {
    setTimeout(() => {
      _advancePhase(true);
      startTimer();
    }, 1200);
  } else {
    _advancePhase(false);
  }
}

function _advancePhase(keepRunning) {
  const settings  = getSettings();
  const interval  = settings.longBreakInterval || 4;

  let nextMode;
  if (state.mode === MODE.FOCUS) {
    nextMode = (state.sessionCount % interval === 0) ? MODE.LONG : MODE.SHORT;
  } else {
    nextMode = MODE.FOCUS;
  }

  state.mode      = nextMode;
  state.remaining = getDuration(nextMode, settings);
  state.remainingAtResume = state.remaining;
  state.startedAt = null;
  state.running   = keepRunning;
  if (keepRunning) state.startedAt = Date.now();

  _notifyState();
  _notifyTick();
}

// ---- NOTIFICATIONS ----
function _sendNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: '' }); } catch { /* ignore */ }
  }
}

// ---- TITLE UPDATE ----
function _updateTitle(rem, mode) {
  let timeStr;
  if (mode === MODE.FOCUS) {
    const hh = String(Math.floor(rem / 3600)).padStart(2, '0');
    const mm = String(Math.floor((rem % 3600) / 60)).padStart(2, '0');
    const ss = String(rem % 60).padStart(2, '0');
    timeStr = `${hh}:${mm}:${ss}`;
  } else {
    const mm = String(Math.floor(rem / 60)).padStart(2, '0');
    const ss = String(rem % 60).padStart(2, '0');
    timeStr = `${mm}:${ss}`;
  }
  const label = mode === MODE.FOCUS ? 'Fokus' : 'Istirahat';
  document.title = `${timeStr} – ${label} | LemburNoMore`;
}

// ---- NOTIFY HELPERS ----
function _notifyTick() {
  if (onTick) {
    const settings = getSettings();
    onTick(state.remaining, getDuration(state.mode, settings), state.mode);
  }
}

function _notifyState() {
  if (onStateChange) onStateChange(state.running, state.mode);
}

function _clearInterval() {
  if (state.tickInterval) {
    clearInterval(state.tickInterval);
    state.tickInterval = null;
  }
}

// ---- APPLY NEW SETTINGS (called after settings save) ----
export function applyNewSettings() {
  if (!state.running) {
    resetTimer();
  }
}
