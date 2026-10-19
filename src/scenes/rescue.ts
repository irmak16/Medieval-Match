// "Pip'i Kurtar" — pull-the-pin mini game. Pull the golden pins in the right order so the gold
// (not the lava!) falls into Pip's room. Water + lava turns into harmless stone; lava melts gold.
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { tex, hasTex } from '../assets';
import { label, Button } from '../ui';
import { tween, Ease, wait } from '../tween';
import { sfx } from '../audio';
import { getSave, save } from '../storage';
import { grant } from '../liveops';
import { Pip } from '../mascot';
import { FX } from '../fx';
import { popup } from './panels';
import type { App } from '../main';

type Stuff = 'lava' | 'water' | 'gold' | 'stone';
interface Room { col: number; row: number; span: number; items: Stuff[] }
interface Pin { from: string; to: string; pulled: boolean }
interface Puzzle { rooms: Record<string, Room>; pins: Pin[]; hint: string }

const PIP = 'pip';

function P(rooms: [string, number, number, number, Stuff[]][], pins: [string, string][], hint: string): Puzzle {
  const r: Record<string, Room> = {};
  for (const [k, col, row, span, items] of rooms) r[k] = { col, row, span, items };
  r[PIP] = { col: 0, row: 2, span: 2, items: [] };
  return { rooms: r, pins: pins.map(([from, to]) => ({ from, to, pulled: false })), hint };
}

/** Puzzle library (rows 0-1 are two columns; row 2 is Pip's room). */
const PUZZLES: (() => Puzzle)[] = [
  // 1 · intro: pick the gold, not the lava
  () => P([['A', 0, 0, 1, ['gold']], ['B', 1, 0, 1, ['lava']], ['A2', 0, 1, 1, []], ['B2', 1, 1, 1, []]],
    [['A', 'A2'], ['B', 'B2'], ['A2', PIP], ['B2', PIP]], 'Altını Pip\'e indir, lav ona değmesin!'),
  // 2 · water is harmless
  () => P([['A', 0, 0, 1, ['gold']], ['B', 1, 0, 1, ['lava']], ['A2', 0, 1, 1, ['water']], ['B2', 1, 1, 1, []]],
    [['A', 'A2'], ['A2', PIP], ['B', 'B2'], ['B2', PIP]], 'Su zararsızdır, lav ise tehlikeli!'),
  // 3 · order matters: cool the lava first
  () => P([['A', 0, 0, 1, ['gold']], ['B', 1, 0, 1, ['water']], ['A2', 0, 1, 1, ['lava']], ['B2', 1, 1, 1, []]],
    [['A', 'A2'], ['A2', PIP], ['B', 'B2'], ['B2', 'A2']], 'Su ve lav birleşince taşa dönüşür.'),
  // 4 · mirrored
  () => P([['A', 0, 0, 1, ['water']], ['B', 1, 0, 1, ['gold']], ['A2', 0, 1, 1, []], ['B2', 1, 1, 1, ['lava']]],
    [['B', 'B2'], ['B2', PIP], ['A', 'A2'], ['A2', 'B2']], 'Önce tehlikeyi etkisiz hâle getir.'),
  // 5 · drop the lava onto the water before the gold goes through
  () => P([['A', 0, 0, 1, ['gold']], ['B', 1, 0, 1, ['lava']], ['A2', 0, 1, 1, []], ['B2', 1, 1, 1, ['water']]],
    [['A', 'A2'], ['A2', 'B2'], ['B', 'B2'], ['B2', PIP]], 'Lav altını eritir. Sıra çok önemli!'),
  // 6 · mirrored
  () => P([['A', 0, 0, 1, ['lava']], ['B', 1, 0, 1, ['gold']], ['A2', 0, 1, 1, ['water']], ['B2', 1, 1, 1, []]],
    [['B', 'B2'], ['B2', 'A2'], ['A', 'A2'], ['A2', PIP]], 'Hangisi önce? İyi düşün!'),
];

export function rescueAvailable(): boolean {
  const s = getSave();
  return s.level - 1 >= s.rescue.nextAt;
}

const COLOR: Record<Stuff, number> = { lava: 0xff6a1a, water: 0x3aa0ff, gold: 0xffd23a, stone: 0x8a8a90 };

export class RescueScene extends Container {
  private pz: Puzzle;
  private fx: FX;
  private layer = new Container();
  private fxLayer = new Container();
  private fxAdd = new Container();
  private roomGfx: Record<string, Container> = {};
  private pinViews: { pin: Pin; view: Container }[] = [];
  private pip: Pip;
  private tower = { x: 0, y: 0, cw: 0, rh: 0, pipH: 0 };
  private over = false;
  private hintTxt: Text;
  private t = 0;

  constructor(private app: App, public W: number, public H: number) {
    super();
    const idx = getSave().rescue.done % PUZZLES.length;
    this.pz = PUZZLES[idx]();
    this.fx = new FX(this.fxLayer, this.fxAdd, 80);
    if (hasTex('dungeon')) {
      const bg = new Sprite(tex('dungeon'));
      bg.anchor.set(0.5);
      bg.scale.set(Math.max(W / bg.texture.width, H / bg.texture.height));
      bg.position.set(W / 2, H / 2);
      bg.alpha = 0.55;
      this.addChild(bg);
    }
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x120a05, alpha: 0.45 });
    this.addChild(shade);
    const hb = new Graphics().roundRect(30, 26, W - 60, 100, 30).fill({ color: 0x2a1408, alpha: 0.92 }).stroke({ width: 5, color: 0xd9a53c });
    const title = label("Pip'i Kurtar!", 46, { fill: 0xffe39a });
    title.position.set(W / 2 + 30, 76);
    const back = new Button('red', 140, 'Geri', () => this.app.showMenu(), 34);
    back.position.set(115, 77);
    back.setBaseScale(0.8);
    this.hintTxt = label(this.pz.hint, 24, { fill: 0xffffff });
    this.hintTxt.position.set(W / 2, 165);
    this.addChild(hb, title, back, this.hintTxt, this.layer, this.fxLayer, this.fxAdd);

    const tw = Math.min(560, W - 150);
    const rh = Math.min(240, (H - 290) / 3.4);
    const pipH = rh * 1.4;
    const totalH = rh * 2 + pipH;
    const y0 = 215 + Math.max(0, (H - 215 - 40 - totalH) / 2);
    this.tower = { x: (W - tw) / 2, y: y0, cw: tw / 2, rh, pipH };
    this.drawTower();
    this.pip = new Pip('scared', this.tower.pipH * 0.85);
    this.pip.position.set(W / 2, this.tower.y + this.tower.rh * 2 + this.tower.pipH - 12);
    this.layer.addChild(this.pip);
    this.drawContents();
  }

  private roomRect(r: Room) {
    const { x, y, cw, rh, pipH } = this.tower;
    const h = r.row === 2 ? pipH : rh;
    return { x: x + r.col * cw, y: y + r.row * rh, w: cw * r.span, h };
  }

  private drawTower() {
    const { x, y, cw, rh, pipH } = this.tower;
    const outer = new Graphics()
      .roundRect(x - 26, y - 26, cw * 2 + 52, rh * 2 + pipH + 52, 30)
      .fill({ color: 0x6a5a4a })
      .stroke({ width: 6, color: 0x2a1d14 });
    // brick lines
    for (let yy = y - 20; yy < y + rh * 2 + pipH + 20; yy += 34) outer.moveTo(x - 24, yy).lineTo(x + cw * 2 + 24, yy).stroke({ width: 2, color: 0x4a3d30, alpha: 0.7 });
    this.layer.addChild(outer);
    for (const [k, r] of Object.entries(this.pz.rooms)) {
      const rr = this.roomRect(r);
      const g = new Graphics().roundRect(rr.x + 8, rr.y + 8, rr.w - 16, rr.h - 16, 16).fill({ color: k === PIP ? 0x3a2a1c : 0x241810 }).stroke({ width: 4, color: 0x1a110a });
      this.layer.addChild(g);
      const c = new Container();
      this.roomGfx[k] = c;
      this.layer.addChild(c);
    }
    // torches on the tower edges
    for (const tx of [x - 24, x + cw * 2 + 24]) {
      const fl = new Sprite(tex('p_glow'));
      fl.anchor.set(0.5);
      fl.tint = 0xffa040;
      fl.blendMode = 'add';
      fl.scale.set(1.2);
      fl.position.set(tx, y + rh * 2 + 20);
      this.layer.addChild(fl);
    }
    // pins
    for (const pin of this.pz.pins) {
      const a = this.roomRect(this.pz.rooms[pin.from]);
      const to = this.roomRect(this.pz.rooms[pin.to]);
      const side = this.pz.rooms[pin.from].row === this.pz.rooms[pin.to].row;
      const v = new Container();
      const len = side ? a.h - 24 : a.w - 20;
      const rod = new Graphics().roundRect(-len / 2, -9, len, 18, 9).fill({ color: 0xffd04a }).stroke({ width: 3, color: 0x7a5000 });
      const shine = new Graphics().roundRect(-len / 2 + 8, -6, len - 16, 5, 3).fill({ color: 0xfff4c0, alpha: 0.8 });
      let dir: number;
      if (side) {
        // vertical pin in the wall between two rooms, knob on top
        v.rotation = Math.PI / 2;
        v.position.set(Math.max(a.x, to.x), a.y + a.h / 2);
        dir = -1;
      } else {
        v.position.set(a.x + a.w / 2, a.y + a.h - 8);
        const fr = this.pz.rooms[pin.from];
        dir = fr.col === 0 && fr.span === 1 ? -1 : 1;
      }
      const knobX = dir * (len / 2 + 26);
      const knob = new Graphics().circle(knobX, 0, 24).fill({ color: 0xffd04a }).stroke({ width: 4, color: 0x7a5000 });
      const ring = new Graphics().circle(knobX, 0, 11).fill({ color: 0x7a5000 });
      v.addChild(rod, shine, knob, ring);
      v.eventMode = 'static';
      v.cursor = 'pointer';
      v.on('pointertap', () => this.pull(pin, v, dir, side));
      this.layer.addChild(v);
      this.pinViews.push({ pin, view: v });
    }
  }

  private drawContents() {
    for (const [k, r] of Object.entries(this.pz.rooms)) {
      const c = this.roomGfx[k];
      c.removeChildren().forEach((ch) => ch.destroy({ children: true }));
      if (k === PIP) continue;
      const rr = this.roomRect(r);
      let level = 0;
      for (const it of r.items) {
        const h = (rr.h - 30) * (it === 'gold' ? 0.4 : 0.55);
        const top = rr.y + rr.h - 14 - level - h;
        if (it === 'gold') {
          for (let i = 0; i < 9; i++) {
            const coin = new Sprite(tex('ic_coin'));
            coin.anchor.set(0.5);
            coin.scale.set(0.38);
            coin.position.set(rr.x + 40 + ((i * 37) % (rr.w - 80)), top + h - 18 - Math.floor(i / 3) * 18);
            c.addChild(coin);
          }
        } else {
          const g = new Graphics().roundRect(rr.x + 14, top, rr.w - 28, h, 10).fill({ color: COLOR[it] });
          if (it !== 'stone') g.roundRect(rr.x + 20, top + 4, rr.w - 40, 8, 4).fill({ color: 0xffffff, alpha: 0.35 });
          c.addChild(g);
          if (it === 'lava') {
            const glow = new Sprite(tex('p_glow'));
            glow.anchor.set(0.5);
            glow.tint = 0xff7a20;
            glow.blendMode = 'add';
            glow.scale.set((rr.w * 1.3) / 128, (h * 1.5) / 128);
            glow.position.set(rr.x + rr.w / 2, top + h / 2);
            glow.alpha = 0.6;
            c.addChild(glow);
          }
        }
        level += h;
      }
    }
  }

  private async pull(pin: Pin, view: Container, dir: number, side: boolean) {
    if (pin.pulled || this.over) return;
    pin.pulled = true;
    sfx.swap();
    if (side) await tween(view, { y: view.y - this.H * 0.6, alpha: 0 }, 0.35, Ease.inQuad);
    else await tween(view, { x: view.x + dir * (this.W * 0.8), alpha: 0 }, 0.35, Ease.inQuad);
    view.destroy({ children: true });
    await this.flow(pin.from);
  }

  /** Move contents of a room down through any pulled pin, resolving mixes on the way. */
  private async flow(from: string) {
    const pin = this.pz.pins.find((p) => p.from === from && p.pulled);
    if (!pin) return;
    const src = this.pz.rooms[from];
    const moving = src.items.filter((i) => i !== 'stone');
    if (!moving.length) return;
    src.items = src.items.filter((i) => i === 'stone');
    const dst = this.pz.rooms[pin.to];
    // falling animation: a blob of the first moving stuff
    const a = this.roomRect(src), b = this.roomRect(dst);
    this.drawContents();
    const blob = new Graphics().roundRect(-a.w / 2 + 20, -30, a.w - 40, 60, 20).fill({ color: COLOR[moving[0]] });
    blob.position.set(a.x + a.w / 2, a.y + a.h - 20);
    this.layer.addChild(blob);
    sfx.vines();
    await tween(blob, { y: b.y + b.h - 40, x: b.x + b.w / 2 }, 0.35, Ease.inQuad);
    blob.destroy();
    dst.items.push(...moving);
    this.resolve(pin.to);
    this.drawContents();
    if (pin.to === PIP) {
      await this.checkPip();
      return;
    }
    await wait(0.1, 'rescue');
    await this.flow(pin.to);
  }

  private resolve(key: string) {
    const r = this.pz.rooms[key];
    const rr = this.roomRect(r);
    const has = (s: Stuff) => r.items.includes(s);
    if (has('lava') && has('water')) {
      r.items = r.items.filter((i) => i !== 'lava' && i !== 'water');
      r.items.unshift('stone');
      sfx.stone();
      this.fx.debris(rr.x + rr.w / 2, rr.y + rr.h - 40, 'stone', 10);
      for (let i = 0; i < 6; i++) this.fx.emit(tex('p_smoke'), rr.x + rr.w / 2, rr.y + rr.h - 40, { vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 80, life: 1, s0: 0.6, s1: 1.6, a0: 0.7, a1: 0, tint: 0xdddddd });
    }
    if (has('lava') && has('gold')) {
      r.items = r.items.filter((i) => i !== 'gold');
      this.fx.sparkleBurst(rr.x + rr.w / 2, rr.y + rr.h - 40, 20, 0xff8a30, 5);
      this.lose('Lav altını eritti!');
    }
  }

  private async checkPip() {
    const r = this.pz.rooms[PIP];
    const rr = this.roomRect(r);
    if (r.items.includes('lava')) {
      this.fx.sparkleBurst(rr.x + rr.w / 2, rr.y + rr.h - 40, 30, 0xff6a1a, 6);
      sfx.barrel();
      this.lose('Eyvah! Lav Pip\'e ulaştı.');
      return;
    }
    if (r.items.includes('water') && !r.items.includes('gold')) {
      this.fx.sparkleBurst(rr.x + rr.w / 2, rr.y + rr.h - 40, 16, 0x3aa0ff, 4);
      this.pip.setPose('scared');
    }
    if (r.items.includes('gold')) this.win();
  }

  private async win() {
    if (this.over) return;
    this.over = true;
    this.pip.setPose('happy');
    sfx.win();
    this.fx.confetti(this.W / 2, 150, this.W, 120);
    const s = getSave();
    s.rescue.done += 1;
    s.rescue.nextAt = s.level - 1 + 6;
    save();
    grant({ coins: 150, packs: 1 });
    await wait(1.2, 'rescue');
    const { panel, ph } = popup(this, this.W, this.H, 'Pip Kurtuldu!', () => this.app.showMenu());
    const t = label('Hazine de Pip\'in oldu!', 32, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    t.y = -ph * 0.08;
    const r = label('Ödül: 150 altın + 1 kart paketi', 26, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    r.y = ph * 0.05;
    const b = new Button('green', 260, 'Harika!', () => this.app.showMenu(), 38);
    b.y = ph * 0.3;
    panel.addChild(t, r, b);
  }

  private async lose(why: string) {
    if (this.over) return;
    this.over = true;
    this.pip.setPose('sad');
    sfx.lose();
    await wait(1.0, 'rescue');
    const { panel, ph } = popup(this, this.W, this.H, 'Olmadı!', () => this.app.showMenu());
    const t = label(why, 30, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    t.y = -ph * 0.08;
    const b = new Button('green', 260, 'Tekrar Dene', () => this.app.showRescue(), 36);
    b.y = ph * 0.15;
    const q = new Button('red', 240, 'Menü', () => this.app.showMenu(), 34);
    q.y = ph * 0.31;
    panel.addChild(t, b, q);
  }

  update(dt: number) {
    this.t += dt;
    this.fx.update(dt);
    this.pip.update(dt);
    if (!this.over && Math.floor(this.t * 3) % 7 === 0) this.hintTxt.alpha = 0.75 + Math.sin(this.t * 4) * 0.25;
  }

  destroyScene() {
    this.fx.clear();
    this.destroy({ children: true });
  }
}
