import { Container, FederatedPointerEvent, Graphics, Rectangle, Sprite } from 'pixi.js';
import { tex } from '../assets';
import { label, Button } from '../ui';
import { getLevel } from '../levels';
import { getSave } from '../storage';
import { sfx, unlockAudio } from '../audio';
import type { App } from '../main';

const TINT = { normal: 0xffffff, hard: 0xff7a6a, superhard: 0xc58cff } as const;

/** Scrollable level select so finished levels can be replayed. */
export class LevelsScene extends Container {
  private list = new Container();
  private scrollY = 0;
  private minScroll = 0;
  private vel = 0;
  private drag: { y: number; start: number; moved: boolean; last: number } | null = null;

  constructor(private app: App, public W: number, public H: number) {
    super();
    const s = getSave();
    const top = 150;
    const header = new Graphics().roundRect(40, 30, W - 80, 96, 30).fill({ color: 0x2a1408, alpha: 0.9 }).stroke({ width: 5, color: 0xd9a53c });
    const title = label('Seviyeler', 54, { fill: 0xffe39a });
    title.position.set(W / 2, 76);
    const back = new Button('red', 140, 'Geri', () => this.app.showMenu(), 34);
    back.position.set(120, 78);
    back.setBaseScale(0.8);

    // list area
    const areaH = H - top - 30;
    const mask = new Graphics().rect(0, top, W, areaH).fill(0xffffff);
    this.addChild(mask);
    this.list.mask = mask;
    this.addChild(this.list);

    const cols = 4;
    const cell = (W - 80) / cols;
    const maxShown = Math.max(s.level + 12, 40);
    for (let n = 1; n <= maxShown; n++) {
      const diff = getLevel(n).diff ?? 'normal';
      const unlocked = n <= s.level;
      const done = n < s.level || n <= s.best;
      const b = new Container();
      const i = n - 1;
      b.position.set(40 + cell * ((i % cols) + 0.5), top + 80 + Math.floor(i / cols) * 150);
      const disc = new Sprite(tex('ui_btn_round'));
      disc.anchor.set(0.5);
      disc.scale.set(122 / disc.texture.width);
      disc.tint = unlocked ? TINT[diff] : 0x6b5a4a;
      b.addChild(disc);
      if (unlocked) {
        const t = label(String(n), 46, { stroke: diff === 'normal' ? 0x6a4200 : 0x4a0a2a });
        t.y = -4;
        b.addChild(t);
      } else {
        const lock = new Sprite(tex('ic_lock'));
        lock.anchor.set(0.5);
        lock.scale.set(0.42);
        lock.alpha = 0.85;
        b.addChild(lock);
      }
      if (done) {
        const st = new Sprite(tex('ui_star'));
        st.anchor.set(0.5);
        st.scale.set(0.2);
        st.y = 56;
        b.addChild(st);
      }
      if (diff !== 'normal' && unlocked) {
        const tag = label(diff === 'hard' ? 'Zor' : 'Çok Zor', 22, { fill: diff === 'hard' ? 0xffb0a0 : 0xe0c0ff });
        tag.y = -62;
        b.addChild(tag);
      }
      (b as any).levelNo = unlocked ? n : 0;
      this.list.addChild(b);
    }
    const rows = Math.ceil(maxShown / cols);
    this.minScroll = Math.min(0, areaH - (rows * 150 + 60));
    // start scrolled near the current level
    const curRow = Math.floor((s.level - 1) / cols);
    this.scrollY = Math.max(this.minScroll, Math.min(0, -(curRow * 150) + areaH / 2 - 150));
    this.list.y = this.scrollY;

    // input
    const hit = new Container();
    hit.eventMode = 'static';
    hit.hitArea = new Rectangle(0, top, W, areaH);
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
      this.scrollY = Math.max(this.minScroll - 80, Math.min(80, this.drag.start + dy));
    });
    const up = (e: FederatedPointerEvent) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      if (d.moved) return;
      const p = this.list.toLocal(e.global);
      for (const ch of this.list.children) {
        if (Math.hypot(ch.x - p.x, ch.y - p.y) < 62) {
          const n = (ch as any).levelNo as number;
          if (n > 0) {
            sfx.click();
            this.app.startLevel(n);
          } else sfx.invalid();
          return;
        }
      }
    };
    hit.on('pointerup', up);
    hit.on('pointerupoutside', up);
    this.addChild(hit, header, title, back);
  }

  update(dt: number) {
    if (!this.drag) {
      this.scrollY += this.vel;
      this.vel *= Math.pow(0.04, dt);
      if (Math.abs(this.vel) < 0.1) this.vel = 0;
      if (this.scrollY > 0) this.scrollY += (0 - this.scrollY) * Math.min(1, dt * 12);
      if (this.scrollY < this.minScroll) this.scrollY += (this.minScroll - this.scrollY) * Math.min(1, dt * 12);
    }
    this.list.y = this.scrollY;
  }

  destroyScene() {
    this.destroy({ children: true });
  }
}
