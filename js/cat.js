/**
 * cat.js — Autonomous cat behavior state machine
 * LemburNoMore
 *
 * The cat runs independently via a setInterval loop.
 * It picks random behaviors weighted by the current timer phase.
 * State classes are toggled on #cat; speech bubble text set on #speech-bubble.
 */

import { isRunning, getMode, getRemaining, getTotal, getSessionCount, MODE } from './timer.js';

// ---- DOM REFS (resolved lazily) ----
let catEl      = null;
let bubbleEl   = null;
let catStageEl = null;

// ---- STATE ----
let currentBehavior = 'sit';
let behaviorTimer   = null;
let bubbleTimer     = null;
let loopInterval    = null;
let lastPhase       = null;
let visible         = true;

// ---- ALL CAT BEHAVIORS ----
// Each: { id, classes, minDur(ms), maxDur(ms), weight }
const BEHAVIORS = {
  // --- Focus Phase ---
  sit:          { id: 'sit',         classes: ['sit'],          minDur: 4000,  maxDur: 9000,  weight: 5 },
  groom:        { id: 'groom',       classes: ['groom'],        minDur: 3000,  maxDur: 7000,  weight: 3 },
  washFace:     { id: 'wash-face',   classes: ['wash-face'],    minDur: 3000,  maxDur: 6000,  weight: 2 },
  legShake:     { id: 'leg-shake',   classes: ['leg-shake'],    minDur: 1500,  maxDur: 3000,  weight: 1 },
  scratchEar:   { id: 'scratch-ear', classes: ['scratch-ear'],  minDur: 2000,  maxDur: 4000,  weight: 1 },
  stretch:      { id: 'stretch',     classes: ['stretch'],      minDur: 2500,  maxDur: 4000,  weight: 1 },
  yawn:         { id: 'yawn',        classes: ['yawn'],         minDur: 2500,  maxDur: 4000,  weight: 1 },
  lookAround:   { id: 'look-around', classes: ['look-around'],  minDur: 3000,  maxDur: 7000,  weight: 2 },
  tailPlay:     { id: 'tail-play',   classes: ['tail-play'],    minDur: 3000,  maxDur: 6000,  weight: 2 },
  knead:        { id: 'knead',       classes: ['knead'],        minDur: 3000,  maxDur: 6000,  weight: 1 },
  slowBlink:    { id: 'slow-blink',  classes: ['slow-blink'],   minDur: 4000,  maxDur: 9000,  weight: 3 },
  loaf:         { id: 'loaf',        classes: ['loaf'],         minDur: 5000,  maxDur: 12000, weight: 2 },
  nap:          { id: 'nap',         classes: ['nap'],          minDur: 6000,  maxDur: 15000, weight: 2 },
  // --- Break Phase ---
  breakActive:  { id: 'break-active',   classes: ['break-active'],  minDur: 3000, maxDur: 7000, weight: 3 },
  breakSleepy:  { id: 'break-sleepy',   classes: ['break-sleepy'],  minDur: 4000, maxDur: 9000, weight: 2 },
  workIdle:     { id: 'work-idle',      classes: ['work-idle'],     minDur: 4000, maxDur: 9000, weight: 1 },
  celebrateCal: { id: 'celebrate-calm', classes: ['celebrate-calm'], minDur: 3000, maxDur: 6000, weight: 2 },
};

// ---- PHASE BEHAVIOR POOLS ----
const FOCUS_POOL = [
  'sit', 'sit', 'sit',
  'groom', 'groom',
  'washFace',
  'legShake',
  'scratchEar',
  'lookAround', 'lookAround',
  'tailPlay',
  'slowBlink', 'slowBlink',
  'loaf',
  'nap',
  'knead',
  'yawn',
];

const FOCUS_RUNNING_POOL = [
  'sit', 'sit', 'sit', 'sit',
  'slowBlink', 'slowBlink',
  'lookAround',
  'loaf',
  'workIdle',
];

const SHORT_BREAK_POOL = [
  'breakActive', 'breakActive',
  'groom',
  'celebrateCal', 'celebrateCal',
  'lookAround',
  'stretch',
];

const LONG_BREAK_POOL = [
  'breakSleepy', 'breakSleepy',
  'nap', 'nap',
  'loaf',
  'breakActive',
  'yawn',
];

// ---- SPEECH BUBBLE LINES ----
const FOCUS_BUBBLES = [
  'Kucingmu sedang fokus... 👀',
  'Ssshh, jangan ganggu!',
  'Sedikit lagi, kucing gembulmu menunggumu.',
  'Fokus dulu, mainan nanti.',
  'Kamu bisa! Ayo terus!',
  'Produktif itu keren, nak.',
  'Timer masih jalan... 🐾',
  'Tetap di mejamu ya!',
];

const BREAK_BUBBLES = [
  'Waktunya istirahat! Minum air dulu 💧',
  'Regangkan badan, jangan sampai kaku!',
  'Kucing ini merekomendasikan tidur sebentar.',
  'Jauhkan mata dari layar sekarang!',
  'Istirahat itu bukan malas, itu strategi.',
  'Haam... zZz 😴',
  'Hei! Kamu masih lihat layar? Ayo istirahat!',
  'Kamu hebat! Ambil napas dulu 🌿',
];

const IDLE_BUBBLES = [
  'Kucing siap membantu kamu fokus! 😼',
  'Mulai sesi baru yuk?',
  'Klik Mulai, aku akan menemanimu.',
  'Istirahat cukup? Ayo kerja lagi!',
  'Pemanasan dulu... 🐱',
];

const HEALTH_TIPS_ID = [
  'Tegakkan punggung saat duduk! 🪑',
  'Minum air putih setiap 30 menit.',
  'Jauhkan mata dari layar, lihatlah ke kejauhan.',
  'Regangkan leher pelan-pelan ke kiri dan kanan.',
  'Tarik napas dalam, hembuskan perlahan.',
  'Berdiri dan berjalan sebentar setiap satu jam.',
  'Peregangan tangan: buka-tutup kepalan tangan.',
  'Posisi monitor harus sejajar mata.',
  'Istirahat mata: tutup mata 20 detik.',
  'Kurangi kafein setelah pukul 15.00.',
  'Gerakkan bahu memutar untuk mengurangi ketegangan.',
  'Pastikan ruangan cukup cahaya.',
  'Hindari makan sambil bekerja di depan layar.',
  'Cobalah teknik pernapasan 4-7-8 untuk relaksasi.',
  'Rapikan meja kerjamu sebelum mulai sesi baru.',
];

// ---- RANDOMIZERS ----
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function weightedPick(pool) {
  const name = pick(pool);
  return BEHAVIORS[name] || BEHAVIORS.sit;
}

function getBehaviorPool() {
  const mode    = getMode();
  const running = isRunning();
  if (mode === MODE.FOCUS) {
    return running ? FOCUS_RUNNING_POOL : FOCUS_POOL;
  }
  if (mode === MODE.SHORT) return SHORT_BREAK_POOL;
  if (mode === MODE.LONG)  return LONG_BREAK_POOL;
  return FOCUS_POOL;
}

// ---- APPLY BEHAVIOR ----
function applyBehavior(behavior) {
  if (!catEl) return;
  // Remove all known behavior classes
  const allClasses = Object.values(BEHAVIORS).flatMap(b => b.classes);
  catEl.classList.remove(...allClasses, 'fade-out', 'fade-in');

  currentBehavior = behavior.id;
  behavior.classes.forEach(c => catEl.classList.add(c));
}

function scheduleSpeechBubble() {
  if (!bubbleEl) return;
  // Show bubble ~30% of the time
  if (Math.random() > 0.3) {
    hideBubble();
    return;
  }
  const mode    = getMode();
  const running = isRunning();
  let pool;
  if (!running) {
    pool = IDLE_BUBBLES;
  } else if (mode === MODE.FOCUS) {
    pool = FOCUS_BUBBLES;
  } else {
    pool = BREAK_BUBBLES;
  }
  showBubble(pick(pool));
}

function showBubble(text) {
  if (!bubbleEl) return;
  bubbleEl.textContent = text;
  bubbleEl.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, rand(3000, 7000));
}

function hideBubble() {
  if (!bubbleEl) return;
  bubbleEl.classList.add('hidden');
}

// ---- MAIN BEHAVIOR LOOP ----
function pickNextBehavior() {
  if (!visible) return;

  const pool     = getBehaviorPool();
  const behavior = weightedPick(pool);
  applyBehavior(behavior);
  scheduleSpeechBubble();

  const dur = rand(behavior.minDur, behavior.maxDur);
  clearTimeout(behaviorTimer);
  behaviorTimer = setTimeout(pickNextBehavior, dur);
}

// ---- PUBLIC API ----

export function initCat() {
  catEl      = document.getElementById('cat');
  bubbleEl   = document.getElementById('speech-bubble');
  catStageEl = document.getElementById('cat-stage');
  if (!catEl) return;

  // Start the loop every 1-3 min randomly, but behavior changes are driven by pickNextBehavior timeout
  pickNextBehavior();

  // Every ~20 seconds, maybe show a health tip in the daily-tip div
  loopInterval = setInterval(() => {
    _maybeUpdateDailyTip();
  }, 20_000);

  _maybeUpdateDailyTip();
}

export function setCatVisible(show) {
  visible = show;
  if (!catStageEl) return;
  catStageEl.style.display = show ? '' : 'none';
}

export function triggerCatPhaseTransition(phase) {
  // Called by app.js when timer phase changes
  if (!catEl) return;
  clearTimeout(behaviorTimer);

  if (phase === 'focus-end') {
    // Squash & stretch, then break behavior
    applyBehavior(BEHAVIORS.sit);
    catEl.classList.add('squash-stretch');
    setTimeout(() => {
      catEl.classList.remove('squash-stretch');
      pickNextBehavior();
    }, 700);
    showBubble(pick(BREAK_BUBBLES));
  } else if (phase === 'break-end') {
    applyBehavior(BEHAVIORS.sit);
    catEl.classList.add('squash-stretch');
    setTimeout(() => {
      catEl.classList.remove('squash-stretch');
      pickNextBehavior();
    }, 700);
    showBubble(pick(FOCUS_BUBBLES));
  } else {
    pickNextBehavior();
  }
}

export function showCatBubble(text) {
  showBubble(text);
}

export function hideCatBubble() {
  hideBubble();
}

export function getHealthTip() {
  return pick(HEALTH_TIPS_ID);
}

function _maybeUpdateDailyTip() {
  const el = document.getElementById('daily-tip');
  if (!el) return;
  if (Math.random() < 0.5) {
    el.textContent = getHealthTip();
  }
}
