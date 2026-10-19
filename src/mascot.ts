// Pip the knight — the game's mascot. Poses are optional art; when missing, nothing is shown.
import { Container, Sprite } from 'pixi.js';
import { tex, hasTex } from './assets';
import { tween, Ease } from './tween';

export type Pose = 'wave' | 'happy' | 'sad' | 'scared' | 'build';

export function hasPip(pose: Pose = 'wave'): boolean {
  return hasTex(`pip_${pose}`);
}

/** A mascot sprite with a gentle idle "breathing" animation. */
export class Pip extends Container {
  spr: Sprite;
  private t = Math.random() * 10;
  private base = 1;
  constructor(pose: Pose, public size: number) {
    super();
    this.spr = new Sprite(tex(hasPip(pose) ? `pip_${pose}` : 'pw_falcon'));
    this.spr.anchor.set(0.5, 1);
    this.base = size / this.spr.texture.height;
    this.spr.scale.set(this.base);
    this.addChild(this.spr);
  }
  setPose(pose: Pose) {
    if (!hasPip(pose) || this.destroyed) return;
    this.spr.texture = tex(`pip_${pose}`);
    this.base = this.size / this.spr.texture.height;
    this.spr.scale.set(this.base * 1.15, this.base * 0.85);
    tween(this.spr.scale, { x: this.base, y: this.base }, 0.4, Ease.outElastic);
  }
  /** Pop in from below with a bounce. */
  popIn(delay = 0) {
    this.spr.scale.set(0);
    return tween(this.spr.scale, { x: this.base, y: this.base }, 0.45, Ease.outBack, delay);
  }
  update(dt: number) {
    if (this.destroyed) return;
    this.t += dt;
    const k = Math.sin(this.t * 2.6);
    this.spr.scale.y = this.base * (1 + k * 0.025);
    this.spr.scale.x = this.base * (1 - k * 0.015);
  }
}
