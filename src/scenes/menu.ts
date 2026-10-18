import { Container, Graphics, Sprite } from 'pixi.js';
import { getLevel } from '../levels';
import { tex, COLOR_TEX } from '../assets';
import { label, Button, iconButton, Counter, overlay } from '../ui';
import { tween, Ease } from '../tween';
import { getSave, save } from '../storage';
import { updateMusic } from '../audio';
import type { App } from '../main';

export class MenuScene extends Container {
  private floaters: { s: Container; base: number; ph: number; amp: number }[] = [];
  private t = 0;
  private playBtn: Button;

  constructor(private app: App, public W: number, public H: number) {
    super();
    const s = getSave();

    // floating decorative tiles
    const deco = [
      { t: COLOR_TEX[0], x: 0.14, y: 0.42, s: 120, r: -0.25 },
      { t: COLOR_TEX[1], x: 0.86, y: 0.45, s: 115, r: 0.2 },
      { t: COLOR_TEX[2], x: 0.18, y: 0.63, s: 100, r: 0.3 },
      { t: COLOR_TEX[4], x: 0.82, y: 0.64, s: 105, r: -0.2 },
      { t: 'pw_barrel', x: 0.16, y: 0.8, s: 95, r: 0.1 },
      { t: 'pw_orb', x: 0.84, y: 0.8, s: 100, r: -0.05 },
    ];
    for (const d of deco) {
      const sp = new Sprite(tex(d.t));
      sp.anchor.set(0.5);
      sp.scale.set(d.s / sp.texture.width);
      sp.rotation = d.r;
      sp.position.set(d.x * W, d.y * H);
      this.addChild(sp);
      this.floaters.push({ s: sp, base: sp.y, ph: Math.random() * 6, amp: 10 + Math.random() * 8 });
    }

    // title
    const crown = new Sprite(tex('tile_yellow'));
    crown.anchor.set(0.5);
    crown.scale.set(190 / crown.texture.width);
    crown.position.set(W / 2, H * 0.17);
    this.addChild(crown);
    this.floaters.push({ s: crown, base: crown.y, ph: 0, amp: 8 });
    const t1 = label('Medieval', 104, { fill: 0xffd84a, stroke: 0x4a1e05, strokeW: 16 });
    t1.position.set(W / 2, H * 0.29);
    const t2 = label('Match', 124, { fill: 0xffffff, stroke: 0x8e1d1d, strokeW: 18 });
    t2.position.set(W / 2, H * 0.29 + 108);
    this.addChild(t1, t2);

    const falcon = new Sprite(tex('pw_falcon'));
    falcon.anchor.set(0.5);
    falcon.scale.set(170 / falcon.texture.width);
    falcon.position.set(W / 2, H * 0.56);
    this.addChild(falcon);
    this.floaters.push({ s: falcon, base: falcon.y, ph: 1.3, amp: 14 });

    // counters + settings
    const stars = new Counter('ui_star', s.stars, 160);
    stars.position.set(110, 60);
    const coins = new Counter('ic_coin', s.coins, 190);
    coins.position.set(320, 60);
    const gear = iconButton('ic_gear', 84, () => this.openSettings());
    gear.position.set(W - 64, 60);
    this.addChild(stars, coins, gear);
    const lv = iconButton('ui_star', 84, () => this.app.showLevels());
    lv.position.set(W - 64, 170);
    const lvT = label('Seviyeler', 22);
    lvT.position.set(W - 64, 226);
    this.addChild(lv, lvT);

    // play
    const diff = getLevel(s.level).diff ?? 'normal';
    this.playBtn = new Button(diff === 'normal' ? 'green' : 'red', 440, `Seviye ${s.level}`, () => this.app.startLevel(getSave().level), 58);
    this.playBtn.position.set(W / 2, H * 0.89);
    this.addChild(this.playBtn);
    if (diff !== 'normal') {
      // Royal Match style "hard level" tag above the play button
      const tag = new Graphics().roundRect(-140, -24, 280, 48, 24).fill({ color: diff === 'hard' ? 0xa01e1e : 0x6a1fa0 }).stroke({ width: 4, color: 0xd9a53c });
      tag.position.set(W / 2, H * 0.89 - 128);
      const tt = label(diff === 'hard' ? 'Zor Seviye' : 'Çok Zor Seviye', 32);
      tt.position.copyFrom(tag.position);
      tt.y -= 2;
      this.addChild(tag, tt);
      this.floaters.push({ s: tag, base: tag.y, ph: 0.5, amp: 4 });
      this.floaters.push({ s: tt, base: tt.y, ph: 0.5, amp: 4 });
    }
  }

  update(dt: number) {
    this.t += dt;
    for (const f of this.floaters) f.s.y = f.base + Math.sin(this.t * 1.6 + f.ph) * f.amp;
    const k = 1 + Math.sin(this.t * 4) * 0.035;
    this.playBtn.setBaseScale(k);
  }

  private openSettings() {
    const s = getSave();
    const root = new Container();
    root.addChild(overlay(this.W, this.H));
    const panel = new Container();
    const p = new Sprite(tex('ui_popup'));
    p.anchor.set(0.5);
    p.scale.set(Math.min(600, this.W - 60) / p.texture.width);
    const ph = p.height;
    panel.addChild(p);
    const title = label('Ayarlar', 46, { fill: 0xfff2c8, stroke: 0x5a0a0a });
    title.y = -ph / 2 + ph * 0.073;
    panel.addChild(title);
    const mk = (y: number, text: () => string, fn: () => void) => {
      const b: Button = new Button('green', 280, text(), () => {
        fn();
        panel.removeChild(b);
        b.destroy({ children: true });
        panel.addChild(mk(y, text, fn));
      }, 32);
      b.y = y;
      return b;
    };
    panel.addChild(
      mk(-ph * 0.2, () => `Ses: ${s.sound ? 'Açık' : 'Kapalı'}`, () => { s.sound = !s.sound; save(); }),
      mk(-ph * 0.02, () => `Müzik: ${s.music ? 'Açık' : 'Kapalı'}`, () => { s.music = !s.music; save(); updateMusic(); }),
    );
    const close = new Button('red', 260, 'Kapat', () => root.destroy({ children: true }), 34);
    close.y = ph * 0.25;
    panel.addChild(close);
    panel.position.set(this.W / 2, this.H / 2);
    root.addChild(panel);
    this.addChild(root);
    panel.scale.set(0.5);
    tween(panel.scale, { x: 1, y: 1 }, 0.35, Ease.outBack);
  }

  destroyScene() {
    this.destroy({ children: true });
  }
}
