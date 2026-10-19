// Level map: a winding road of level nodes (Royal Match style), scrollable, with castle milestones.
import { Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { tex, hasTex } from '../assets';
import { label, Button } from '../ui';
import { getLevel } from '../levels';
import { getSave } from '../storage';
import { sfx, unlockAudio } from '../audio';
import { Pip, hasPip } from '../mascot';
import { AREAS } from './castle';
import type { App } from '../main';

const GAP = 150; // vertical distance between nodes
const COLORS = { normal: 0x3f9a2e, hard: 0xb02626, superhard: 0x7a2ab0 } as const;

export class LevelsScene extends Container {
  private world = new Container();
  private scrollY = 0;
  private minScroll = 0;
  private maxScroll = 0;
  private vel = 0;
  private drag: { y: number; start: number; moved: boolean; last: number } | null = null;
  private nodes: { n: number; x: number; y: number; unlocked: boolean }[] = [];
  private pip: Pip | null = null;
  private t = 0;
  private current!: Container;

  constructor(private app: App, public W: number, public H: number) {
    super();
    const s = getSave();
    const total = Math.max(s.level + 15, 60);
    const top = 140;
    const viewH = H - top;
    // nodes from bottom (level 1) to top
    const worldH = total * GAP + 300;
    const yOf = (n: number) => worldH - 150 - (n - 1) * GAP;
    const xOf = (n: number) => W / 2 + Math.sin(n * 0.75) * (W * 0.28);

    // road
    const road = new Graphics();
    for (let n = 1; n < total; n++) {
      const x0 = xOf(n), y0 = yOf(n), x1 = xOf(n + 1), y1 = yOf(n + 1);
      const steps = 6;
      for (let k = 1; k < steps; k++) {
        const f = k / steps;
        // follow the same sine path between the nodes
        const nn = n + f;
        const x = W / 2 + Math.sin(nn * 0.75) * (W * 0.28);
        const y = y0 + (y1 - y0) * f;
        road.circle(x, y, 7).fill({ color: n < s.level ? 0xffe39a : 0x8a7058, alpha: 0.9 });
      }
      void x0; void x1;
    }
    this.world.addChild(road);

    // castle milestones every 10 levels
    for (let m = 1; m * 10 <= total; m++) {
      const area = AREAS[(m - 1) % AREAS.length];
      const y = yOf(m * 10) - GAP / 2;
      const side = xOf(m * 10) > W / 2 ? 0.2 : 0.8;
      const sign = new Container();
      sign.position.set(W * side, y);
      const pic = new Sprite(tex(hasTex(area.art) ? area.art : 'bg_game'));
      pic.anchor.set(0.5);
      pic.scale.set(150 / pic.texture.width);
      const mask = new Graphics().roundRect(-75, -56, 150, 112, 18).fill(0xffffff);
      pic.mask = mask;
      const frame = new Graphics().roundRect(-75, -56, 150, 112, 18).stroke({ width: 5, color: 0xd9a53c });
      const t = label(area.name, 18);
      t.y = 74;
      sign.addChild(pic, mask, frame, t);
      sign.alpha = s.level > m * 10 ? 1 : 0.55;
      this.world.addChild(sign);
    }

    // nodes
    for (let n = 1; n <= total; n++) {
      const diff = getLevel(n).diff ?? 'normal';
      const unlocked = n <= s.level;
      const done = n < s.level;
      const x = xOf(n), y = yOf(n);
      const node = new Container();
      node.position.set(x, y);
      const r = diff === 'normal' ? 44 : 52;
      const shadow = new Graphics().ellipse(0, r * 0.75, r * 0.9, r * 0.3).fill({ color: 0x000000, alpha: 0.3 });
      const base = new Graphics().circle(0, 6, r).fill({ color: unlocked ? 0x2a1608 : 0x2a2420 });
      const disc = new Graphics()
        .circle(0, 0, r).fill({ color: unlocked ? COLORS[diff] : 0x5a4a3e })
        .stroke({ width: 5, color: unlocked ? 0xffe39a : 0x8a7a6a });
      const gloss = new Graphics().ellipse(0, -r * 0.45, r * 0.65, r * 0.3).fill({ color: 0xffffff, alpha: unlocked ? 0.25 : 0.1 });
      node.addChild(shadow, base, disc, gloss);
      if (unlocked) {
        const txt = label(String(n), diff === 'normal' ? 36 : 40);
        txt.y = -2;
        node.addChild(txt);
      } else {
        const lock = new Sprite(tex('ic_lock'));
        lock.anchor.set(0.5);
        lock.scale.set(0.36);
        node.addChild(lock);
      }
      if (done) {
        const st = new Sprite(tex('ui_star'));
        st.anchor.set(0.5);
        st.scale.set(0.17);
        st.position.set(r * 0.75, -r * 0.7);
        node.addChild(st);
      }
      if (diff !== 'normal') {
        const sk = label(diff === 'hard' ? 'Zor' : 'Çok Zor', 18, { fill: diff === 'hard' ? 0xffb0a0 : 0xe0c0ff });
        sk.y = r + 20;
        node.addChild(sk);
      }
      if (n === s.level) this.current = node;
      this.world.addChild(node);
      this.nodes.push({ n, x, y, unlocked });
    }

    // Pip stands next to the current level
    const cur = this.nodes.find((q) => q.n === s.level)!;
    if (hasPip('wave')) {
      this.pip = new Pip('wave', 130);
      this.pip.position.set(cur.x + (cur.x > W / 2 ? -95 : 95), cur.y + 40);
      this.world.addChild(this.pip);
    }

    // view & scroll
    const mask = new Graphics().rect(0, top, W, viewH).fill(0xffffff);
    this.addChild(mask);
    this.world.mask = mask;
    this.addChild(this.world);
    this.maxScroll = top - 0;
    this.minScroll = top + viewH - worldH;
    this.scrollY = Math.max(this.minScroll, Math.min(this.maxScroll, top + viewH * 0.6 - cur.y));
    this.world.y = this.scrollY;

    const hb = new Graphics().roundRect(30, 26, W - 60, 100, 30).fill({ color: 0x2a1408, alpha: 0.92 }).stroke({ width: 5, color: 0xd9a53c });
    const title = label('Seviye Haritası', 42, { fill: 0xffe39a });
    title.position.set(W / 2 + 40, 76);
    const back = new Button('red', 140, 'Geri', () => this.app.showMenu(), 34);
    back.position.set(115, 77);
    back.setBaseScale(0.8);
    this.addChild(hb, title, back);

    // input (drag to scroll, tap a node to play it)
    const hit = new Container();
    hit.eventMode = 'static';
    hit.hitArea = new Rectangle(0, top, W, viewH);
    hit.on('pointerdown', (e: FederatedPointerEvent) => {
      unlockAudio();
      this.drag = { y: e.global.y, start: this.scrollY, moved: false, last: e.global.y };
      this.vel = 0;
    });
    hit.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.drag) return;
      const k = this.parent ? this.parent.scale.y : 1;
      const dy = (e.global.y - this.drag.y) / k;
      if (Math.abs(dy) > 12) this.drag.moved = true;
      this.vel = (e.global.y - this.drag.last) / k;
      this.drag.last = e.global.y;
      this.scrollY = Math.max(this.minScroll - 80, Math.min(this.maxScroll + 80, this.drag.start + dy));
    });
    const up = (e: FederatedPointerEvent) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      if (d.moved) return;
      const p = this.world.toLocal(e.global);
      for (const nd of this.nodes) {
        if (Math.hypot(nd.x - p.x, nd.y - p.y) < 56) {
          if (nd.unlocked) {
            sfx.click();
            this.app.startLevel(nd.n);
          } else sfx.invalid();
          return;
        }
      }
    };
    hit.on('pointerup', up);
    hit.on('pointerupoutside', up);
    this.addChildAt(hit, this.getChildIndex(this.world) + 1);
    void Text;
  }

  update(dt: number) {
    this.t += dt;
    if (!this.drag) {
      this.scrollY += this.vel;
      this.vel *= Math.pow(0.04, dt);
      if (Math.abs(this.vel) < 0.1) this.vel = 0;
      if (this.scrollY > this.maxScroll) this.scrollY += (this.maxScroll - this.scrollY) * Math.min(1, dt * 12);
      if (this.scrollY < this.minScroll) this.scrollY += (this.minScroll - this.scrollY) * Math.min(1, dt * 12);
    }
    this.world.y = this.scrollY;
    if (this.current) this.current.scale.set(1 + Math.sin(this.t * 4) * 0.06);
    this.pip?.update(dt);
  }

  destroyScene() {
    this.destroy({ children: true });
  }
}
