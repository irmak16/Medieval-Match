// Tiny tween/timer system driven by the game ticker.
export type Ease = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inQuad: (t: number) => t * t,
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

interface TweenItem {
  target: any;
  from: Record<string, number>;
  to: Record<string, number>;
  dur: number;
  t: number;
  delay: number;
  ease: Ease;
  resolve: () => void;
  onUpdate?: (k: number) => void;
  dead: boolean;
}

interface Timer { t: number; fn: () => void; dead: boolean; group: string }

const tweens: TweenItem[] = [];
const timers: Timer[] = [];

function getPath(obj: any, key: string): [any, string] {
  const parts = key.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  return [o, parts[parts.length - 1]];
}

export function tween(
  target: any,
  to: Record<string, number>,
  dur: number,
  ease: Ease = Ease.outQuad,
  delay = 0,
  onUpdate?: (k: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    tweens.push({ target, from: {}, to, dur: Math.max(dur, 0.0001), t: 0, delay, ease, resolve, onUpdate, dead: false });
  });
}

export function killTweens(target: any): void {
  for (const tw of tweens) if (tw.target === target) tw.dead = true;
}

export function after(sec: number, fn: () => void, group = 'game'): Timer {
  const tm = { t: sec, fn, dead: false, group };
  timers.push(tm);
  return tm;
}

export function wait(sec: number, group = 'game'): Promise<void> {
  return new Promise((r) => after(sec, r, group));
}

export function clearTimers(group: string): void {
  for (const t of timers) if (t.group === group) t.dead = true;
}

export function pendingTimers(group: string): number {
  let n = 0;
  for (const t of timers) if (!t.dead && t.group === group) n++;
  return n;
}

export function updateTweens(dt: number): void {
  for (let i = 0; i < tweens.length; i++) {
    const tw = tweens[i];
    if (tw.dead) continue;
    if (tw.target && tw.target.destroyed) {
      tw.dead = true;
      tw.resolve();
      continue;
    }
    if (tw.delay > 0) {
      tw.delay -= dt;
      if (tw.delay > 0) continue;
    }
    if (tw.t === 0) {
      try {
        for (const k in tw.to) {
          const [o, p] = getPath(tw.target, k);
          tw.from[k] = o[p];
        }
      } catch {
        tw.dead = true;
        tw.resolve();
        continue;
      }
    }
    tw.t += dt;
    const k = Math.min(tw.t / tw.dur, 1);
    const e = tw.ease(k);
    try {
      for (const key in tw.to) {
        const [o, p] = getPath(tw.target, key);
        o[p] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      }
      tw.onUpdate?.(k);
    } catch {
      // target was destroyed mid-tween (e.g. scene change): drop it
      tw.dead = true;
      tw.resolve();
      continue;
    }
    if (k >= 1) {
      tw.dead = true;
      tw.resolve();
    }
  }
  for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].dead) tweens.splice(i, 1);

  for (let i = 0; i < timers.length; i++) {
    const tm = timers[i];
    if (tm.dead) continue;
    tm.t -= dt;
    if (tm.t <= 0) {
      tm.dead = true;
      try {
        tm.fn();
      } catch (err) {
        console.error(err);
      }
    }
  }
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].dead) timers.splice(i, 1);
}
