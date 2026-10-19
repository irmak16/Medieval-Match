// Procedural sound effects & music with the Web Audio API (no audio files needed).
import { getSave } from './storage';

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let reverb: ConvolverNode;
let noiseBuf: AudioBuffer;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.32;
  musicBus.connect(master);
  // small room reverb
  reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 1.6;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const revGain = ctx.createGain();
  revGain.gain.value = 0.25;
  reverb.connect(revGain).connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
  updateMusic();
}

function on(): boolean {
  return getSave().sound && !!ensure() && ctx!.state === 'running';
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slideTo?: number, wet = false) {
  if (!on()) return;
  const c = ctx!;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = c.createGain();
  env(g, t, 0.005, vol, dur);
  o.connect(g).connect(sfxBus);
  if (wet) g.connect(reverb);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, filter: BiquadFilterType, f0: number, f1: number, vol = 0.3, delay = 0, q = 1, wet = false) {
  if (!on()) return;
  const c = ctx!;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const bf = c.createBiquadFilter();
  bf.type = filter;
  bf.Q.value = q;
  bf.frequency.setValueAtTime(f0, t);
  bf.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  env(g, t, 0.004, vol, dur);
  s.connect(bf).connect(g).connect(sfxBus);
  if (wet) g.connect(reverb);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

const lastPlay: Record<string, number> = {};
function throttle(key: string, ms: number): boolean {
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < ms) return false;
  lastPlay[key] = now;
  return true;
}

export const sfx = {
  click() {
    tone(900, 0.05, 'triangle', 0.18);
    tone(1400, 0.04, 'sine', 0.08, 0.01);
  },
  swap() {
    noise(0.13, 'bandpass', 900, 2600, 0.18, 0, 1.4);
  },
  invalid() {
    tone(220, 0.09, 'triangle', 0.2);
    tone(180, 0.12, 'triangle', 0.2, 0.09);
  },
  match(cascade: number) {
    if (!throttle('match', 40)) return;
    const base = 520 * Math.pow(1.0595, Math.min(cascade, 12) * 2);
    tone(base, 0.16, 'sine', 0.26, 0, base * 1.5, true);
    tone(base * 2, 0.08, 'triangle', 0.08, 0.01);
    noise(0.05, 'highpass', 3000, 5000, 0.07);
  },
  land() {
    if (!throttle('land', 70)) return;
    tone(170, 0.05, 'sine', 0.05);
  },
  crate() {
    if (!throttle('crate', 50)) return;
    noise(0.12, 'bandpass', 1100, 500, 0.35, 0, 2);
    tone(150, 0.1, 'triangle', 0.25, 0, 90);
  },
  stone() {
    if (!throttle('stone', 50)) return;
    noise(0.18, 'bandpass', 2400, 700, 0.35, 0, 1.2);
    tone(110, 0.12, 'sine', 0.25, 0, 60);
  },
  chain() {
    if (!throttle('chain', 50)) return;
    tone(2300, 0.25, 'sine', 0.1, 0, undefined, true);
    tone(3170, 0.2, 'sine', 0.07, 0.01, undefined, true);
    noise(0.05, 'highpass', 5000, 7000, 0.12);
  },
  vines() {
    if (!throttle('vines', 50)) return;
    noise(0.2, 'bandpass', 3500, 1500, 0.25, 0, 0.8);
  },
  arrow() {
    noise(0.4, 'bandpass', 4000, 600, 0.3, 0, 2.5, true);
    tone(1200, 0.25, 'sawtooth', 0.04, 0, 300);
  },
  barrel() {
    noise(0.7, 'lowpass', 2500, 120, 0.6, 0, 0.7, true);
    tone(90, 0.45, 'sine', 0.6, 0, 35);
  },
  bigBoom() {
    noise(1.1, 'lowpass', 3000, 80, 0.75, 0, 0.7, true);
    tone(70, 0.8, 'sine', 0.7, 0, 28);
  },
  falcon() {
    tone(1700, 0.09, 'sine', 0.15, 0, 2600);
    tone(1900, 0.12, 'sine', 0.13, 0.11, 2900);
    noise(0.3, 'bandpass', 1500, 3000, 0.12, 0.05, 1.5);
  },
  orb() {
    const notes = [1047, 1319, 1568, 2093, 2637];
    notes.forEach((f, i) => tone(f, 0.35, 'sine', 0.12, i * 0.05, undefined, true));
    noise(0.6, 'highpass', 6000, 9000, 0.06, 0, 1, true);
  },
  zap() {
    if (!throttle('zap', 30)) return;
    tone(2000 + Math.random() * 800, 0.08, 'square', 0.04, 0, 900);
  },
  powerCreate() {
    tone(880, 0.12, 'triangle', 0.15, 0, undefined, true);
    tone(1320, 0.2, 'sine', 0.15, 0.07, undefined, true);
  },
  goal() {
    if (!throttle('goal', 45)) return;
    tone(1568, 0.12, 'sine', 0.08, 0, undefined, true);
  },
  shuffle() {
    noise(0.5, 'bandpass', 600, 3000, 0.2, 0, 1);
  },
  star() {
    [1319, 1760, 2637].forEach((f, i) => tone(f, 0.4, 'sine', 0.15, i * 0.06, undefined, true));
  },
  win() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => {
      tone(f, 0.3, 'sawtooth', 0.07, i * 0.11, undefined, true);
      tone(f, 0.35, 'triangle', 0.12, i * 0.11, undefined, true);
    });
  },
  lose() {
    [392, 349, 311, 262].forEach((f, i) => tone(f, 0.4, 'triangle', 0.15, i * 0.18, undefined, true));
  },
  coin() {
    tone(1976, 0.08, 'square', 0.05);
    tone(2637, 0.25, 'square', 0.05, 0.07, undefined, true);
  },
};

// ---------------- generative background music (lute-like plucks over a drone) ----------------
let musicTimer: number | null = null;
let musicStep = 0;
let intense = false;

function drum(t: number, low: boolean, vol: number) {
  const c = ctx!;
  if (low) {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.25);
  } else {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 1.5;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f).connect(g).connect(musicBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.1);
  }
}

/** Faster music with a frame drum when the player is running out of moves. */
export function setMusicIntensity(on: boolean): void {
  if (intense === on) return;
  intense = on;
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
    updateMusic();
  }
}
function pluck(freq: number, t: number, vol: number) {
  const c = ctx!;
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  o.type = 'triangle';
  o2.type = 'sawtooth';
  o.frequency.value = freq;
  o2.frequency.value = freq * 1.003;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 6, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.5);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
  const g2 = c.createGain();
  g2.gain.value = 0.25;
  o.connect(g);
  o2.connect(g2).connect(g);
  g.connect(lp).connect(musicBus);
  lp.connect(reverb);
  o.start(t);
  o2.start(t);
  o.stop(t + 1.2);
  o2.stop(t + 1.2);
}
// D dorian progression: Dm - C - Bb - C  (arpeggiated)
const CHORDS = [
  [146.83, 220.0, 293.66, 349.23, 440.0],
  [130.81, 196.0, 261.63, 329.63, 392.0],
  [116.54, 174.61, 233.08, 293.66, 349.23],
  [130.81, 196.0, 261.63, 329.63, 392.0],
];
const PATTERN = [0, 2, 3, 4, 3, 2, 1, 2];
function musicTick() {
  if (!ctx || ctx.state !== 'running') return;
  const beat = intense ? 0.18 : 0.24;
  const t = ctx.currentTime + 0.05;
  for (let i = 0; i < 4; i++) {
    const st = musicStep + i;
    // soft frame drum: on beats 1 & 3 always, busier when intense
    if (st % 4 === 0) drum(t + i * beat, true, intense ? 0.35 : 0.18);
    if (intense && st % 2 === 1) drum(t + i * beat, false, 0.12);
    const step = musicStep + i;
    const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
    const p = PATTERN[step % PATTERN.length];
    const melodic = step % 16 === 14 ? chord[4] * 1.122 : chord[p];
    pluck(melodic, t + i * beat, step % 4 === 0 ? 0.22 : 0.13);
    if (step % 16 === 0) pluck(chord[0] / 2, t + i * beat, 0.25);
  }
  musicStep += 4;
}

export function updateMusic(): void {
  const want = getSave().music && !!ctx;
  if (want && musicTimer === null) {
    musicTick();
    musicTimer = window.setInterval(musicTick, intense ? 720 : 960);
  } else if (!want && musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}
