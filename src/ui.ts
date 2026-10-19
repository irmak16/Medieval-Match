import { Container, NineSliceSprite, Sprite, Text, TextStyleOptions, Graphics } from 'pixi.js';
import { tex } from './assets';
import { tween, Ease } from './tween';
import { sfx, unlockAudio } from './audio';

// Titan One is a chunky mobile-game face with Turkish ş/ğ; Baloo 2 covers the few glyphs it lacks (İ).
export const FONT = '"Titan One", "Baloo 2", "Arial Rounded MT Bold", sans-serif';

export function label(
  text: string,
  size: number,
  opts: { fill?: number | string; stroke?: number; strokeW?: number; shadow?: boolean; align?: 'left' | 'center' | 'right' } = {},
): Text {
  const style: TextStyleOptions = {
    fontFamily: FONT,
    fontSize: size,
    fill: opts.fill ?? 0xffffff,
    align: opts.align ?? 'center',
    stroke: { color: opts.stroke ?? 0x3a1e0c, width: opts.strokeW ?? Math.max(3, size * 0.16), join: 'round' },
    letterSpacing: size * 0.02,
  };
  if (opts.shadow !== false) {
    style.dropShadow = { color: 0x1a0c04, alpha: 0.55, blur: 2, distance: Math.max(2, size * 0.07), angle: Math.PI / 2 };
  }
  const t = new Text({ text, style, resolution: Math.min(window.devicePixelRatio || 1, 2.5) });
  t.anchor.set(0.5);
  return t;
}

/** Panel made from the wooden UI panel texture with 9-slice scaling. */
export function woodPanel(w: number, h: number, scale = 0.45): Container {
  const c = new Container();
  const ns = new NineSliceSprite({ texture: tex('ui_panel'), leftWidth: 70, rightWidth: 70, topHeight: 70, bottomHeight: 70 });
  ns.scale.set(scale);
  ns.width = w / scale;
  ns.height = h / scale;
  ns.x = -w / 2;
  ns.y = -h / 2;
  c.addChild(ns);
  return c;
}

export class Button extends Container {
  private bg: Sprite;
  private baseScale = 1;
  enabled = true;
  constructor(
    kind: 'green' | 'red' | 'round',
    width: number,
    text: string | null,
    private onTap: () => void,
    textSize = 0,
  ) {
    super();
    this.bg = new Sprite(tex(kind === 'round' ? 'ui_btn_round' : kind === 'green' ? 'ui_btn_green' : 'ui_btn_red'));
    this.bg.anchor.set(0.5);
    const s = width / this.bg.texture.width;
    this.bg.scale.set(s);
    this.addChild(this.bg);
    if (text) {
      const t = label(text, textSize || this.bg.height * 0.42, { stroke: kind === 'green' ? 0x0d4a12 : kind === 'red' ? 0x5a0a0a : 0x6a4200 });
      t.y = -this.bg.height * 0.03;
      this.addChild(t);
    }
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      unlockAudio();
      tween(this.scale, { x: this.baseScale * 0.9, y: this.baseScale * 0.9 }, 0.07);
    });
    const release = () => tween(this.scale, { x: this.baseScale, y: this.baseScale }, 0.25, Ease.outBack);
    this.on('pointerupoutside', release);
    this.on('pointerup', () => {
      release();
      if (!this.enabled) return;
      sfx.click();
      this.onTap();
    });
  }
  get h(): number {
    return this.bg.height;
  }
  setBaseScale(s: number) {
    this.baseScale = s;
    this.scale.set(s);
  }
}

export function iconButton(icon: string, size: number, onTap: () => void): Button {
  const b = new Button('round', size, null, onTap);
  const ic = new Sprite(tex(icon));
  ic.anchor.set(0.5);
  ic.scale.set((size * 0.55) / ic.texture.width);
  ic.y = -size * 0.02;
  b.addChild(ic);
  return b;
}

/** Dark translucent full-screen overlay that swallows input. */
export function overlay(w: number, h: number, alpha = 0.55): Graphics {
  const g = new Graphics().rect(0, 0, w, h).fill({ color: 0x0d0703, alpha });
  g.eventMode = 'static';
  return g;
}

/** Counter pill: icon + number on a dark rounded background. */
export class Counter extends Container {
  txt: Text;
  constructor(icon: string, value: number, w = 150) {
    super();
    const bg = new Graphics().roundRect(-w / 2 + 18, -24, w - 18, 48, 24).fill({ color: 0x2a160a, alpha: 0.82 }).stroke({ width: 3, color: 0xc89a3c });
    this.addChild(bg);
    const ic = new Sprite(tex(icon));
    ic.anchor.set(0.5);
    ic.scale.set(64 / ic.texture.width);
    ic.x = -w / 2 + 18;
    this.addChild(ic);
    this.txt = label(String(value), 30);
    this.txt.x = 18;
    this.addChild(this.txt);
    this.target = this.shown = value;
  }
  private shown = 0;
  private target = 0;
  set value(v: number) {
    this.target = v;
    this.shown = v;
    this.txt.text = String(v);
  }
  /** Roll the number up/down to v with a little pop. */
  rollTo(v: number, dur = 0.8) {
    const from = this.target;
    this.target = v;
    const h = { k: 0 };
    tween(h, { k: 1 }, dur, Ease.outCubic, 0, () => {
      this.shown = Math.round(from + (v - from) * h.k);
      this.txt.text = String(this.shown);
    });
    this.txt.scale.set(1.25);
    tween(this.txt.scale, { x: 1, y: 1 }, 0.35, Ease.outBack);
  }
}
