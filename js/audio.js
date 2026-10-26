/**
 * audio.js — Web Audio API notification sounds (no external files)
 * LemburNoMore
 */

let ctx = null;
let muted = false;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function beep({ freq = 440, type = 'sine', duration = 0.18, gain = 0.35, delay = 0 } = {}) {
  if (muted) return;
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const vol = ac.createGain();
    osc.connect(vol);
    vol.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime + delay);
    vol.gain.setValueAtTime(0, ac.currentTime + delay);
    vol.gain.linearRampToValueAtTime(gain, ac.currentTime + delay + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + duration + 0.01);
  } catch { /* audio unavailable */ }
}

/**
 * Focus-end bell: three ascending tones
 */
export function playFocusEnd() {
  beep({ freq: 520, type: 'sine',     duration: 0.25, gain: 0.3, delay: 0    });
  beep({ freq: 660, type: 'sine',     duration: 0.25, gain: 0.35, delay: 0.28 });
  beep({ freq: 880, type: 'triangle', duration: 0.5,  gain: 0.4,  delay: 0.56 });
}

/**
 * Break-end bell: two descending tones → cheerful up
 */
export function playBreakEnd() {
  beep({ freq: 880, type: 'sine', duration: 0.2, gain: 0.3, delay: 0    });
  beep({ freq: 660, type: 'sine', duration: 0.2, gain: 0.3, delay: 0.22 });
  beep({ freq: 784, type: 'sine', duration: 0.4, gain: 0.4, delay: 0.44 });
}

/**
 * Tick (soft click each second — optional)
 */
export function playTick() {
  beep({ freq: 1200, type: 'square', duration: 0.04, gain: 0.06, delay: 0 });
}

/**
 * Notification: single soft ping
 */
export function playPing() {
  beep({ freq: 1046, type: 'sine', duration: 0.35, gain: 0.25, delay: 0 });
}

/**
 * Toggle mute
 */
export function setMuted(val) {
  muted = val;
}
export function isMuted() {
  return muted;
}
export function toggleMute() {
  muted = !muted;
  return muted;
}

/**
 * Unlock audio context on first user gesture (call once on any click)
 */
export function unlockAudio() {
  try { getCtx(); } catch { /* ignore */ }
}
