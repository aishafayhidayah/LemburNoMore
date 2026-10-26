/**
 * app.js — Main application entry point
 * LemburNoMore
 *
 * Connects timer.js, cat.js, audio.js, storage.js.
 * Handles all UI interactions and DOM updates.
 */

import {
  initTimer, startTimer, pauseTimer, toggleTimer, resetTimer,
  skipToNextPhase, setMode, applyNewSettings,
  onTimerTick, onTimerPhaseEnd, onTimerStateChange,
  getMode, isRunning, getSessionCount,
  getRemaining, getTotal, MODE,
} from './timer.js';

import {
  initCat, setCatVisible, triggerCatPhaseTransition,
  showCatBubble, hideCatBubble, getHealthTip,
} from './cat.js';

import {
  unlockAudio, toggleMute, isMuted, setMuted,
} from './audio.js';

import {
  getSettings, saveSettings,
  getTodayStats, getWeekStats, getStreak, getLast7Days, clearStats,
} from './storage.js';

// ================================================================
//  DOM ELEMENT CACHE
// ================================================================
const $ = id => document.getElementById(id);

const dom = {
  timerTime:       $('timer-time'),
  timerTimeInput:  $('timer-time-input'),
  timerEditHint:   $('timer-edit-hint'),
  timerLabel:      $('timer-label'),
  progressRing:    document.querySelector('[role="progressbar"]'),
  progressCircle:  $('progress-circle'),
  btnStart:        $('btn-start'),
  btnReset:        $('btn-reset'),
  btnSkip:         $('btn-skip'),
  btnSettings:     $('btn-settings'),
  btnStats:        $('btn-stats'),
  btnTheme:        $('btn-theme'),
  modeTabs:        $('mode-tabs'),
  sessionCounter:  $('session-counter'),
  pomodorosUntil:  $('pomodoros-until-long'),
  breakOverlay:    $('break-overlay'),
  breakTitle:      $('break-title'),
  breakMessage:    $('break-message'),
  breakTimerDisp:  $('break-timer-display'),
  btnSkipBreak:    $('btn-skip-break'),
  skipRingFill:    $('skip-ring-fill'),
  headerSessionBadge: $('header-session-badge'),
  settingsPanel:   $('settings-panel'),
  statsPanel:      $('stats-panel'),
  panelBackdrop:   $('panel-backdrop'),
  dailyTip:        $('daily-tip'),
  // settings inputs
  setFocus:        $('set-focus'),
  setShort:        $('set-short'),
  setLong:         $('set-long'),
  setLongInterval: $('set-long-interval'),
  setAutoStart:    $('set-auto-start'),
  setNotifications:$('set-notifications'),
  setSound:        $('set-sound'),
  setFullscreen:   $('set-fullscreen'),
  setShowCat:      $('set-show-cat'),
  setJamPulang:    $('set-jam-pulang'),
  setDailyLimit:   $('set-daily-limit'),
  btnSaveSettings: $('btn-save-settings'),
  btnClearStats:   $('btn-clear-stats'),
  // stats
  statTodaySessions: $('stat-today-sessions'),
  statTodayFocus:    $('stat-today-focus'),
  statWeekSessions:  $('stat-week-sessions'),
  statStreak:        $('stat-streak'),
  statsChart:        $('stats-chart'),
};

// ---- SVG CIRCLE ----
const CIRCUMFERENCE = 2 * Math.PI * 54; // r=54

// ================================================================
//  TIMER UI UPDATES
// ================================================================
function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Format for Focus mode: HH:MM:SS
function formatTimeFocus(seconds) {
  const h  = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m  = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s  = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Returns format string based on mode
function formatTimeForMode(seconds, mode) {
  return mode === MODE.FOCUS ? formatTimeFocus(seconds) : formatTime(seconds);
}

function updateProgressRing(remaining, total) {
  const pct    = total > 0 ? remaining / total : 1;
  const offset = CIRCUMFERENCE * (1 - pct);
  dom.progressCircle.style.strokeDashoffset = offset;
  // Color: focus = accent orange, break = green
  const mode = getMode();
  if (mode === MODE.FOCUS) {
    dom.progressCircle.style.stroke = 'var(--color-accent)';
  } else {
    dom.progressCircle.style.stroke = 'var(--color-green)';
  }
  // aria
  dom.progressRing?.setAttribute('aria-valuenow', Math.round(pct * 100));
}

// Tracks whether the user is currently editing the timer inline
let _timerEditing = false;

function updateTimerDisplay(remaining, total, mode) {
  // Don't overwrite the text while the user is typing a new duration
  if (!_timerEditing) {
    dom.timerTime.textContent = formatTimeForMode(remaining, mode);
  }
  // Toggle compact font class for HH:MM:SS format in focus mode
  dom.timerTime.classList.toggle('hms-format', mode === MODE.FOCUS);
  const labels = { focus: 'Fokus', short: 'Istirahat Pendek', long: 'Istirahat Panjang' };
  dom.timerLabel.textContent = labels[mode] || 'Fokus';
  updateProgressRing(remaining, total);
  // Update break overlay timer if visible
  if (!dom.breakOverlay.classList.contains('hidden')) {
    dom.breakTimerDisp.textContent = formatTime(remaining);
  }
}

// ================================================================
//  INLINE TIMER EDIT
// ================================================================
// Parse "HH:MM:SS" or "H:MM:SS" etc. into total minutes (for focus, stored as minutes)
function _parseHMSToMinutes(str) {
  const parts = str.trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  let totalSeconds = 0;
  if (parts.length === 3) {
    totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    totalSeconds = parts[0] * 3600 + parts[1] * 60;
  } else if (parts.length === 1) {
    totalSeconds = parts[0] * 60; // treat as hours
  }
  return totalSeconds > 0 ? Math.round(totalSeconds / 60) : null;
}

function _openTimerEdit() {
  if (isRunning()) return;           // only allow edit when paused/stopped
  if (_timerEditing) return;
  _timerEditing = true;

  const mode = getMode();
  const settings = getSettings();

  dom.timerTime.style.display = 'none';
  dom.timerTimeInput.classList.remove('hidden');
  dom.timerEditHint.classList.remove('hidden');

  if (mode === MODE.FOCUS) {
    const totalMinutes = settings.focusDuration || 25;
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    dom.timerTimeInput.value = `${h}:${m}:00`;
    dom.timerTimeInput.setAttribute('placeholder', 'HH:MM:SS');
    dom.timerTimeInput.setAttribute('aria-label', 'Durasi fokus dalam format Jam:Menit:Detik');
    dom.timerTimeInput.classList.add('focus-mode');
    dom.timerEditHint.textContent = 'Format HH:MM:SS · Enter=Simpan · Esc=Batal';
  } else {
    const currentMinutes = mode === MODE.SHORT
      ? (settings.shortBreak || 5)
      : (settings.longBreak || 15);
    dom.timerTimeInput.value = currentMinutes;
    dom.timerTimeInput.setAttribute('placeholder', 'Menit');
    dom.timerTimeInput.setAttribute('aria-label', 'Durasi dalam menit');
    dom.timerTimeInput.classList.remove('focus-mode');
    dom.timerEditHint.textContent = 'Enter=Simpan · Esc=Batal';
  }

  dom.timerTimeInput.focus();
  dom.timerTimeInput.select();
}

function _commitTimerEdit() {
  if (!_timerEditing) return;
  const mode = getMode();
  let minutes = null;

  if (mode === MODE.FOCUS) {
    minutes = _parseHMSToMinutes(dom.timerTimeInput.value);
    if (minutes !== null) minutes = Math.max(1, minutes); // no upper cap for focus
  } else {
    const raw = parseInt(dom.timerTimeInput.value, 10);
    minutes = isNaN(raw) ? null : Math.min(120, Math.max(1, raw));
  }

  if (minutes !== null) {
    const settingKey = mode === MODE.FOCUS ? 'focusDuration'
                     : mode === MODE.SHORT  ? 'shortBreak'
                     :                        'longBreak';
    saveSettings({ [settingKey]: minutes });
    applyNewSettings();   // resets timer to new duration
  }

  _cancelTimerEdit();
}

function _cancelTimerEdit() {
  _timerEditing = false;
  dom.timerTimeInput.classList.add('hidden');
  dom.timerTimeInput.classList.remove('focus-mode');
  dom.timerEditHint.textContent = 'Enter=Simpan · Esc=Batal';
  dom.timerEditHint.classList.add('hidden');
  dom.timerTime.style.display = '';
  // Force display refresh so the correct time shows after edit (normal or committed)
  dom.timerTime.textContent = formatTimeForMode(getRemaining(), getMode());
}

function updateStartButton(running) {
  dom.btnStart.textContent = running ? 'Jeda' : 'Mulai';
  dom.btnStart.setAttribute('aria-label', running ? 'Jeda timer' : 'Mulai timer');
}

function updateSessionInfo() {
  const count = getSessionCount();
  const settings = getSettings();
  const interval = settings.longBreakInterval || 4;
  dom.sessionCounter.innerHTML = `Sesi ke-<strong>${count + 1}</strong>`;
  const remaining = interval - (count % interval);
  dom.pomodorosUntil.textContent =
    remaining === interval
      ? `${interval} sesi menuju istirahat panjang`
      : `${remaining} sesi lagi menuju istirahat panjang`;
}

function updateTabs(mode) {
  dom.modeTabs.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

// ================================================================
//  BREAK OVERLAY
// ================================================================
function showBreakOverlay(mode) {
  const settings = getSettings();
  dom.breakTitle.textContent = mode === MODE.LONG
    ? 'Istirahat Panjang! 🛋️'
    : 'Waktunya Istirahat! 🐱';
  dom.breakMessage.textContent = mode === MODE.LONG
    ? 'Tinggalkan meja, regangkan badan, minum banyak air!'
    : 'Jauhkan mata dari layar, regangkan badan, minum air.';
  dom.breakOverlay.classList.remove('hidden');
  dom.breakOverlay.setAttribute('aria-hidden', 'false');
  dom.breakTimerDisp.textContent = formatTime(getRemaining());

  if (settings.fullscreenBreak && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function hideBreakOverlay() {
  dom.breakOverlay.classList.add('hidden');
  dom.breakOverlay.setAttribute('aria-hidden', 'true');
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

// ================================================================
//  BALLOON POPUP
// ================================================================
function showBalloon(html, autoHide = 4000) {
  const el = document.createElement('div');
  el.className = 'balloon-popup';
  el.innerHTML = html;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('balloon-out');
    setTimeout(() => el.remove(), 400);
  }, autoHide);
  return el;
}

// ================================================================
//  JAM PULANG
// ================================================================
let _jamPulangShown = false;
function checkJamPulang() {
  const settings = getSettings();
  if (!settings.jamPulang || _jamPulangShown) return;
  const now     = new Date();
  const [hh, mm] = settings.jamPulang.split(':').map(Number);
  const target  = new Date();
  target.setHours(hh, mm, 0, 0);
  if (Math.abs(now - target) < 60_000) {
    _jamPulangShown = true;
    showBalloon('🏠 Jam pulang! Saatnya istirahat total. Pulang dulu ya!', 8000);
    showCatBubble('Jam pulang! Jangan lembur ya! 🐾');
  }
}

// ================================================================
//  DAILY LIMIT
// ================================================================
function checkDailyLimit() {
  const settings = getSettings();
  if (!settings.dailyLimit) return;
  const today   = getTodayStats();
  if (today.sessions >= settings.dailyLimit) {
    showBalloon(`🎉 Kamu sudah menyelesaikan ${settings.dailyLimit} sesi hari ini! Sudah cukup, istirahat total sekarang ya!`, 8000);
  }
}

// ================================================================
//  PANEL HELPERS
// ================================================================
function openPanel(id) {
  dom.panelBackdrop.classList.remove('hidden');
  $(`${id}-panel`).classList.remove('hidden');
  if (id === 'stats') refreshStats();
  if (id === 'settings') populateSettings();
}

function closePanel(id) {
  $(`${id}-panel`).classList.add('hidden');
  const anyOpen = ['settings', 'stats'].some(n => !$(`${n}-panel`).classList.contains('hidden'));
  if (!anyOpen) dom.panelBackdrop.classList.add('hidden');
}

// ================================================================
//  SETTINGS
// ================================================================
function populateSettings() {
  const s = getSettings();
  dom.setFocus.value        = s.focusDuration;
  dom.setShort.value        = s.shortBreak;
  dom.setLong.value         = s.longBreak;
  dom.setLongInterval.value = s.longBreakInterval;
  dom.setAutoStart.checked  = s.autoStart;
  dom.setNotifications.checked = s.notifications;
  dom.setSound.checked      = s.sound;
  dom.setFullscreen.checked = s.fullscreenBreak;
  dom.setShowCat.checked    = s.showCat;
  dom.setJamPulang.value    = s.jamPulang || '';
  dom.setDailyLimit.value   = s.dailyLimit || 0;
  // Sync preset active state
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active',
      parseInt(btn.dataset.focus) === s.focusDuration &&
      parseInt(btn.dataset.short) === s.shortBreak &&
      parseInt(btn.dataset.long)  === s.longBreak
    );
  });
}

function saveAndApplySettings() {
  const s = {
    focusDuration:    parseInt(dom.setFocus.value) || 25,
    shortBreak:       parseInt(dom.setShort.value) || 5,
    longBreak:        parseInt(dom.setLong.value) || 15,
    longBreakInterval: parseInt(dom.setLongInterval.value) || 4,
    autoStart:        dom.setAutoStart.checked,
    notifications:    dom.setNotifications.checked,
    sound:            dom.setSound.checked,
    fullscreenBreak:  dom.setFullscreen.checked,
    showCat:          dom.setShowCat.checked,
    jamPulang:        dom.setJamPulang.value,
    dailyLimit:       parseInt(dom.setDailyLimit.value) || 0,
  };
  saveSettings(s);
  setMuted(!s.sound);
  setCatVisible(s.showCat);
  applyNewSettings();

  // Request notification permission
  if (s.notifications && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  closePanel('settings');
  updateSessionInfo();
}

// ================================================================
//  SESSION BADGE (header)
// ================================================================
function updateSessionBadge() {
  const today = getTodayStats();
  const count = today.sessions;
  const badge = dom.headerSessionBadge;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ================================================================
//  STATS
// ================================================================
function refreshStats() {
  const today = getTodayStats();
  dom.statTodaySessions.textContent = today.sessions;
  dom.statTodayFocus.textContent    = today.focusMinutes;
  dom.statWeekSessions.textContent  = getWeekStats();
  dom.statStreak.textContent        = getStreak();
  renderMiniChart();
}

function renderMiniChart() {
  const data = getLast7Days();
  const max  = Math.max(...data.map(d => d.sessions), 1);
  const W    = 280;
  const H    = 80;
  const barW = 28;
  const gap  = 12;
  const total = data.length;
  const svgW  = total * (barW + gap) - gap;

  const bars = data.map((d, i) => {
    const h  = Math.round((d.sessions / max) * H);
    const x  = i * (barW + gap);
    const y  = H - h;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="5"
        fill="var(--color-accent)" opacity="${d.sessions > 0 ? 0.85 : 0.2}"/>
      <text x="${x + barW/2}" y="${H + 14}" text-anchor="middle"
        font-size="9" fill="var(--color-muted)" font-family="Nunito,system-ui">${d.label}</text>
      ${d.sessions > 0 ? `<text x="${x + barW/2}" y="${y - 4}" text-anchor="middle"
        font-size="9" fill="var(--color-accent)" font-family="Nunito,system-ui" font-weight="700">${d.sessions}</text>` : ''}
    `;
  }).join('');

  dom.statsChart.innerHTML = `
    <svg viewBox="0 0 ${svgW} ${H + 20}" xmlns="http://www.w3.org/2000/svg">
      ${bars}
    </svg>
    <p style="font-size:.75rem;color:var(--color-muted);text-align:center;margin-top:.5rem;">Sesi 7 hari terakhir</p>
  `;
}

// ================================================================
//  THEME
// ================================================================
function toggleTheme() {
  const body = document.body;
  const dark  = body.classList.toggle('theme-dark');
  body.classList.toggle('theme-light', !dark);
  dom.btnTheme.textContent = dark ? '☀️' : '🌙';
  saveSettings({ theme: dark ? 'dark' : 'light' });
}

function applyStoredTheme() {
  const s = getSettings();
  if (s.theme === 'dark') {
    document.body.classList.add('theme-dark');
    document.body.classList.remove('theme-light');
    dom.btnTheme.textContent = '☀️';
  }
}

// ================================================================
//  KEYBOARD SHORTCUTS
// ================================================================
function handleKeyboard(e) {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  switch (e.key) {
    case ' ':
      e.preventDefault();
      unlockAudio();
      toggleTimer();
      break;
    case 'r': case 'R':
      resetTimer();
      break;
    case 'm': case 'M': {
      const muted = toggleMute();
      showCatBubble(muted ? 'Suara dimatikan 🔇' : 'Suara dinyalakan 🔔');
      break;
    }
  }
}

// ================================================================
//  TIMER EVENT HANDLERS
// ================================================================
function handleTick(remaining, total, mode) {
  updateTimerDisplay(remaining, total, mode);
  updateSessionInfo();
  // Break overlay timer sync
  if (!dom.breakOverlay.classList.contains('hidden')) {
    dom.breakTimerDisp.textContent = formatTime(remaining);
  }
  // Jam pulang check every minute
  if (remaining % 60 === 0) checkJamPulang();
}

function handlePhaseEnd(completedMode) {
  if (completedMode === MODE.FOCUS) {
    updateSessionBadge();
    // Show break overlay and always start the break countdown
    setTimeout(() => {
      const nextMode = getMode();
      showBreakOverlay(nextMode);
      triggerCatPhaseTransition('focus-end');
      updateTabs(nextMode);
      checkDailyLimit();
      // Start break timer so the countdown runs in the overlay.
      // Skip if autoStart is on — timer.js already schedules startTimer() at 1200ms.
      const s = getSettings();
      if (!isRunning() && !s.autoStart) startTimer();
    }, 500);
  } else {
    // Break ended
    hideBreakOverlay();
    triggerCatPhaseTransition('break-end');
    updateTabs(MODE.FOCUS);
    showBalloon('🐱 Kembali fokus! Kamu bisa!', 3500);
  }
}

function handleStateChange(running, mode) {
  updateStartButton(running);
  updateTabs(mode);
  updateSessionInfo();
}

// ================================================================
//  INIT
// ================================================================
export function init() {
  // Apply stored theme first
  applyStoredTheme();

  // Init modules
  initTimer();
  initCat();

  // Apply saved settings to audio/cat
  const settings = getSettings();
  setMuted(!settings.sound);
  setCatVisible(settings.showCat);

  // Register timer callbacks
  onTimerTick(handleTick);
  onTimerPhaseEnd(handlePhaseEnd);
  onTimerStateChange(handleStateChange);

  // Initial UI state
  const rem   = getRemaining();
  const total = getTotal();
  updateTimerDisplay(rem, total, getMode());
  updateStartButton(false);
  updateTabs(getMode());
  updateSessionInfo();
  dom.dailyTip.textContent = getHealthTip();

  // ---- EVENT LISTENERS ----

  // Inline timer edit — click or Enter on the timer time display
  dom.timerTime.addEventListener('click', _openTimerEdit);
  dom.timerTime.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openTimerEdit(); }
  });
  dom.timerTimeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); _commitTimerEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); _cancelTimerEdit(); }
  });
  dom.timerTimeInput.addEventListener('blur', () => {
    // Commit on blur (click outside)
    if (_timerEditing) _commitTimerEdit();
  });

  // Timer buttons
  dom.btnStart.addEventListener('click', () => {
    unlockAudio();
    toggleTimer();
  });
  dom.btnReset.addEventListener('click', () => {
    resetTimer();
  });
  dom.btnSkip.addEventListener('click', () => {
    skipToNextPhase();
  });

  // Mode tabs — manual switch only changes the timer mode, never shows the break overlay
  dom.modeTabs.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    setMode(mode);
    // Always hide the break overlay when the user manually picks a tab
    hideBreakOverlay();
  });

  // Break overlay skip — long-press (2 seconds)
  const SKIP_HOLD_MS = 2000;
  const RING_CIRCUM  = 119.38; // 2π × r=19
  let _skipTimer  = null;
  let _skipAt     = 0;
  let _skipRafId  = null;

  function _skipRingProgress(pct) {
    dom.skipRingFill.style.strokeDashoffset = RING_CIRCUM * (1 - pct);
  }

  function _skipTick() {
    const elapsed = Date.now() - _skipAt;
    const pct = Math.min(elapsed / SKIP_HOLD_MS, 1);
    _skipRingProgress(pct);
    if (pct < 1) {
      _skipRafId = requestAnimationFrame(_skipTick);
    }
  }

  function _skipBegin() {
    dom.btnSkipBreak.classList.add('pressing');
    _skipAt    = Date.now();
    _skipRafId = requestAnimationFrame(_skipTick);
    _skipTimer = setTimeout(() => {
      cancelAnimationFrame(_skipRafId);
      dom.btnSkipBreak.classList.remove('pressing');
      dom.btnSkipBreak.classList.add('done');
      _skipRingProgress(1);
      setTimeout(() => {
        dom.btnSkipBreak.classList.remove('done');
        _skipRingProgress(0);
        hideBreakOverlay();
        skipToNextPhase();
        triggerCatPhaseTransition('break-end');
      }, 250);
    }, SKIP_HOLD_MS);
  }

  function _skipCancel() {
    if (_skipTimer) {
      clearTimeout(_skipTimer);
      _skipTimer = null;
    }
    cancelAnimationFrame(_skipRafId);
    dom.btnSkipBreak.classList.remove('pressing', 'done');
    _skipRingProgress(0);
  }

  dom.btnSkipBreak.addEventListener('mousedown',  _skipBegin);
  dom.btnSkipBreak.addEventListener('touchstart', e => { e.preventDefault(); _skipBegin(); }, { passive: false });
  dom.btnSkipBreak.addEventListener('mouseup',    _skipCancel);
  dom.btnSkipBreak.addEventListener('mouseleave', _skipCancel);
  dom.btnSkipBreak.addEventListener('touchend',   _skipCancel);
  dom.btnSkipBreak.addEventListener('touchcancel',_skipCancel);

  // Header controls
  dom.btnSettings.addEventListener('click', () => openPanel('settings'));
  dom.btnStats.addEventListener('click',    () => openPanel('stats'));
  dom.btnTheme.addEventListener('click',    () => toggleTheme());

  // Panel close buttons
  document.querySelectorAll('.panel-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      if (panel) closePanel(panel);
    });
  });

  // Backdrop close
  dom.panelBackdrop.addEventListener('click', () => {
    ['settings', 'stats'].forEach(closePanel);
  });

  // Settings save
  dom.btnSaveSettings.addEventListener('click', saveAndApplySettings);

  // Quick preset buttons (settings panel)
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const focus = parseInt(btn.dataset.focus);
      const short = parseInt(btn.dataset.short);
      const long  = parseInt(btn.dataset.long);
      dom.setFocus.value = focus;
      dom.setShort.value = short;
      dom.setLong.value  = long;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Clear stats
  dom.btnClearStats.addEventListener('click', () => {
    if (confirm('Hapus semua data statistik?')) {
      clearStats();
      refreshStats();
      updateSessionBadge();
    }
  });

  // Keyboard
  document.addEventListener('keydown', handleKeyboard);

  // Unlock audio on first interaction
  document.addEventListener('click', () => unlockAudio(), { once: true });

  // Jam pulang check every 30 seconds
  setInterval(checkJamPulang, 30_000);

  // Resize handler (tablet layout)
  window.addEventListener('resize', () => {
    // nothing heavy, just ensuring layout is fine
  });

  // Init session badge from localStorage
  updateSessionBadge();
}

// ---- BOOT ----
document.addEventListener('DOMContentLoaded', init);
