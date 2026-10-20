import { Container, Sprite, Texture } from 'pixi.js';
let confTex: Texture | null = null;
function confettiTex(): Texture {
  if (!confTex) {
    const c = document.createElement('canvas');
    c.width = 14;
    c.height = 8;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 14, 8);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 5, 14, 3);
    confTex = Texture.from(c);
  }
  return confTex;
}
const CONFETTI = [0xff4a4a, 0xffd23a, 0x4ee04a, 0x3fa0ff, 0xc06aff, 0xffffff, 0xff9a3a];
import { tex, COLOR_TINT, COLOR_TEX } from './assets';

interface P {
  s: Sprite;
  vx: number; vy: number; g: number; drag: number;
  life: number; max: number;
  spin: number;
  s0: number; s1: number;
  a0: number; a1: number;
  fadeIn: number;
}

/** Fewer particles on low-end devices. */
function gfxSetting(): string {
  try {
    return JSON.parse(localStorage.getItem('medieval-match-save-v1') || '{}').gfx || 'auto';
  } catch {
    return 'auto';
  }
}
const GFX = gfxSetting();
export const LOW_END = GFX === 'low' ? true : GFX === 'high' ? false :
  typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency || 8) <= 4 || ((navigator as any).deviceMemory || 8) <= 3);
const MAX_PARTICLES = LOW_END ? 420 : 900;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class FX {
  private ps: P[] = [];
  private pool: Sprite[] = [];
  shakeT = 0;
  shakeAmp = 0;
  constructor(public layer: Container, public addLayer: Container, public unit = 80) {}

  private spawn(texture: Texture, x: number, y: number, add: boolean): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = texture;
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = 0;
    s.tint = 0xffffff;
    s.alpha = 1;
    s.visible = true;
    s.blendMode = add ? 'add' : 'normal';
    (add ? this.addLayer : this.layer).addChild(s);
    return s;
  }

  emit(
    texture: Texture, x: number, y: number,
    o: { vx?: number; vy?: number; g?: number; drag?: number; life?: number; spin?: number; rot?: number; s0?: number; s1?: number; a0?: number; a1?: number; tint?: number; add?: boolean; fadeIn?: number },
  ): void {
    if (this.ps.length > MAX_PARTICLES) return;
    const s = this.spawn(texture, x, y, !!o.add);
    if (o.tint !== undefined) s.tint = o.tint;
    s.rotation = o.rot ?? 0;
    const p: P = {
      s, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? 0, drag: o.drag ?? 0,
      life: o.life ?? 0.5, max: o.life ?? 0.5, spin: o.spin ?? 0,
      s0: o.s0 ?? 1, s1: o.s1 ?? o.s0 ?? 1, a0: o.a0 ?? 1, a1: o.a1 ?? 0, fadeIn: o.fadeIn ?? 0,
    };
    s.scale.set(p.s0);
    s.alpha = p.fadeIn > 0 ? 0 : p.a0;
    this.ps.push(p);
  }

  update(dt: number): void {
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        p.s.removeFromParent();
        this.pool.push(p.s);
        this.ps.splice(i, 1);
        continue;
      }
      const k = 1 - p.life / p.max;
      p.vy += p.g * dt;
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.spin * dt;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      let a = p.a0 + (p.a1 - p.a0) * k;
      if (p.fadeIn > 0 && k < p.fadeIn) a *= k / p.fadeIn;
      p.s.alpha = a;
    }
    if (this.shakeT > 0) this.shakeT -= dt;
  }

  get shakeOffset(): { x: number; y: number } {
    if (this.shakeT <= 0) return { x: 0, y: 0 };
    const a = this.shakeAmp * Math.min(1, this.shakeT * 4);
    return { x: rnd(-a, a), y: rnd(-a, a) };
  }

  shake(amp: number, dur: number): void {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), amp);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  get count(): number {
    return this.ps.length;
  }

  // ------------------------------------------------------------------ presets
  /** Tile cleared by a match: colored flash, sparkles and tiny fragments. */
  tilePop(x: number, y: number, color: number): void {
    const u = this.unit;
    const tint = COLOR_TINT[color] ?? 0xffffff;
    this.emit(tex('p_glow'), x, y, { s0: u / 128 * 0.9, s1: u / 128 * 1.9, a0: 0.9, a1: 0, life: 0.28, tint, add: true });
    this.emit(tex('p_ring'), x, y, { s0: u / 128 * 0.5, s1: u / 128 * 1.5, a0: 0.8, a1: 0, life: 0.3, tint: 0xffffff, add: true });
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(2.2, 5.5) * u;
      this.emit(tex('p_sparkle'), x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5, life: rnd(0.3, 0.55), rot: rnd(0, 3),
        s0: u / 128 * rnd(0.25, 0.45), s1: 0, a0: 1, a1: 0.6, tint, add: true,
      });
    }
    const t = tex(COLOR_TEX[color] ?? 'p_star');
    for (let i = 0; i < 3; i++) {
      const a = rnd(-Math.PI, 0), sp = rnd(2, 4) * u;
      this.emit(t, x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - u, g: 22 * u, life: rnd(0.45, 0.65), spin: rnd(-12, 12),
        s0: (u / t.width) * 0.32, s1: (u / t.width) * 0.12, a0: 1, a1: 0.2,
      });
    }
  }

  /** Obstacle hit: physical debris rendered in Blender + dust. */
  debris(x: number, y: number, kind: 'wood' | 'stone' | 'leaf' | 'link', n = 7): void {
    const u = this.unit;
    const variants = kind === 'wood' || kind === 'stone' ? 4 : kind === 'leaf' ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t = tex(`fx_${kind}${1 + Math.floor(Math.random() * variants)}`);
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), sp = rnd(3, 7) * u;
      this.emit(t, x + rnd(-0.2, 0.2) * u, y + rnd(-0.2, 0.2) * u, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 26 * u, life: rnd(0.55, 0.85), spin: rnd(-14, 14), rot: rnd(0, 6),
        s0: (u / 128) * rnd(0.32, 0.5), s1: (u / 128) * rnd(0.22, 0.32), a0: 1, a1: 0.7,
      });
    }
    const dust = kind === 'leaf' ? 0x9fd27a : kind === 'stone' ? 0xc9c9c9 : kind === 'link' ? 0xdddddd : 0xc89a6a;
    for (let i = 0; i < 4; i++) {
      this.emit(tex('p_smoke'), x + rnd(-0.3, 0.3) * u, y + rnd(-0.3, 0.3) * u, {
        vx: rnd(-1, 1) * u, vy: rnd(-1.5, -0.3) * u, drag: 2, life: rnd(0.4, 0.7), rot: rnd(0, 6), spin: rnd(-1, 1),
        s0: (u / 128) * 0.5, s1: (u / 128) * 1.3, a0: 0.55, a1: 0, tint: dust,
      });
    }
  }

  explosion(x: number, y: number, radiusCells: number): void {
    const u = this.unit;
    const R = radiusCells * u;
    this.emit(tex('p_glow'), x, y, { s0: R / 64 * 0.6, s1: R / 64 * 1.4, a0: 1, a1: 0, life: 0.35, tint: 0xffd890, add: true });
    this.emit(tex('p_ring'), x, y, { s0: R / 64 * 0.2, s1: R / 64 * 1.3, a0: 1, a1: 0, life: 0.4, tint: 0xfff0c0, add: true });
    for (let i = 0; i < 14; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(0.5, 1.6) * R * 2;
      this.emit(tex('p_smoke'), x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4, life: rnd(0.6, 1.0), rot: rnd(0, 6), spin: rnd(-2, 2),
        s0: (u / 128) * 0.8, s1: (u / 128) * rnd(1.6, 2.4), a0: 0.75, a1: 0, tint: i % 3 === 0 ? 0x5a4a40 : 0xa08a78,
      });
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(4, 11) * u;
      this.emit(tex('p_sparkle'), x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, g: 6 * u, life: rnd(0.4, 0.8), rot: a,
        s0: (u / 128) * rnd(0.3, 0.5), s1: 0.02, a0: 1, a1: 0.8, tint: i % 2 ? 0xffb030 : 0xfff2a0, add: true,
      });
    }
    this.debris(x, y, 'wood', 6);
  }

  /** Short glowing trail puff (used behind flying arrows / falcons). */
  trail(x: number, y: number, rot: number, tint = 0xfff0b0): void {
    const u = this.unit;
    this.emit(tex('p_streak'), x, y, { rot, s0: (u / 128) * 1.1, s1: (u / 128) * 0.6, a0: 0.8, a1: 0, life: 0.22, tint, add: true });
    if (Math.random() < 0.6)
      this.emit(tex('p_sparkle'), x + rnd(-0.15, 0.15) * u, y + rnd(-0.15, 0.15) * u, {
        vx: rnd(-1, 1) * u, vy: rnd(-1, 1) * u, life: 0.35, s0: (u / 128) * 0.3, s1: 0, a0: 1, a1: 0, tint, add: true, rot: rnd(0, 3),
      });
  }

  sparkleBurst(x: number, y: number, n = 12, tint = 0xfff2a0, spread = 4): void {
    const u = this.unit;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), sp = rnd(1, spread) * u;
      this.emit(tex('p_sparkle'), x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: rnd(0.4, 0.8), rot: rnd(0, 3), spin: rnd(-3, 3),
        s0: (u / 128) * rnd(0.3, 0.55), s1: 0, a0: 1, a1: 0.7, tint, add: true,
      });
    }
  }

  flash(x: number, y: number, size: number, tint = 0xffffff, life = 0.25): void {
    this.emit(tex('p_glow'), x, y, { s0: size / 128, s1: (size / 128) * 1.5, a0: 1, a1: 0, life, tint, add: true });
  }

  /** Paper confetti shower (falls from y, spread across width w). */
  confetti(x: number, y: number, w: number, n = 80): void {
    for (let i = 0; i < n; i++) {
      const sx = x + rnd(-w / 2, w / 2);
      this.emit(confettiTex(), sx, y + rnd(-60, 20), {
        vx: rnd(-120, 120), vy: rnd(-420, -80), g: 520, drag: 1.4, life: rnd(1.6, 2.6), spin: rnd(-10, 10), rot: rnd(0, 6),
        s0: rnd(0.7, 1.1), s1: rnd(0.6, 1), a0: 1, a1: 0.9, tint: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  /** Burst of confetti from a point (e.g. a popping chest). */
  confettiBurst(x: number, y: number, n = 50): void {
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), sp = rnd(300, 800);
      this.emit(confettiTex(), x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 700, drag: 1.8, life: rnd(1.2, 2), spin: rnd(-12, 12), rot: rnd(0, 6),
        s0: rnd(0.6, 1), s1: 0.7, a0: 1, a1: 0.8, tint: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  iceShards(x: number, y: number): void {
    const u = this.unit;
    for (let i = 0; i < 7; i++) {
      const a = rnd(-Math.PI, 0), sp = rnd(2, 5) * u;
      this.emit(tex('p_sparkle'), x + rnd(-0.3, 0.3) * u, y + rnd(-0.3, 0.3) * u, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 18 * u, life: rnd(0.4, 0.7), rot: rnd(0, 3), spin: rnd(-8, 8),
        s0: (u / 128) * rnd(0.3, 0.5), s1: 0.05, a0: 1, a1: 0.6, tint: i % 2 ? 0xbfeaff : 0xffffff, add: true,
      });
    }
    this.emit(tex('p_ring'), x, y, { s0: u / 128 * 0.4, s1: u / 128 * 1.4, a0: 0.9, a1: 0, life: 0.3, tint: 0xbfeaff, add: true });
  }

  clear(): void {
    for (const p of this.ps) {
      p.s.removeFromParent();
      this.pool.push(p.s);
    }
    this.ps.length = 0;
  }
}
