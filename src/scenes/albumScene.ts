import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { tex, hasTex } from '../assets';
import { label, Button, overlay } from '../ui';
import { tween, Ease, wait } from '../tween';
import { sfx } from '../audio';
import { getSave } from '../storage';
import { SETS, SetDef, cardDef, owned, setProgress, openPack, pendingSetRewards } from '../album';
import { rewardText } from '../liveops';
import { popup } from './panels';
import { FX } from '../fx';
import type { App } from '../main';

const RARITY = { 1: { frame: 0xc89a3c, name: '' }, 2: { frame: 0x8fd3ff, name: 'Nadir' }, 3: { frame: 0xff9a2a, name: 'Efsanevi' } } as const;
const SET_BG = { a: 0x3f6a2a, b: 0x5a2a2a, c: 0x3a2a6a } as Record<string, number>;

/** Draws a single card (front). */
export function cardView(id: string, w: number, hidden = false): Container {
  const def = cardDef(id);
  const h = w * 1.36;
  const c = new Container();
  const frame = RARITY[def.rarity].frame;
  const bg = new Graphics().roundRect(-w / 2, -h / 2, w, h, w * 0.1).fill({ color: hidden ? 0x2a1d14 : SET_BG[id[0]] }).stroke({ width: Math.max(3, w * 0.05), color: hidden ? 0x5a4636 : frame });
  c.addChild(bg);
  const artName = `card_${id}`;
  const set = SETS.find((s) => s.id === id[0])!;
  const art = new Sprite(tex(hasTex(artName) ? artName : set.icon));
  art.anchor.set(0.5);
  art.y = -h / 2 + w * 0.5;
  if (hasTex(artName)) {
    art.scale.set((w * 0.88) / Math.min(art.texture.width, art.texture.height));
    const m = new Graphics().roundRect(-w * 0.44, -h / 2 + w * 0.06, w * 0.88, w * 0.88, w * 0.08).fill(0xffffff);
    art.mask = m;
    c.addChild(m);
  } else {
    art.scale.set((w * 0.62) / Math.max(art.texture.width, art.texture.height));
  }
  if (hidden) {
    art.tint = 0x000000;
    art.alpha = 0.55;
  }
  c.addChild(art);
  const nm = label(hidden ? '?' : def.name, Math.max(14, w * 0.13));
  nm.y = h * 0.37;
  if (nm.width > w * 0.92) nm.scale.set((w * 0.92) / nm.width);
  c.addChild(nm);
  if (!hidden && def.rarity > 1) {
    const tag = label(RARITY[def.rarity].name, Math.max(11, w * 0.1), { fill: frame });
    tag.y = -h * 0.43;
    c.addChild(tag);
  }
  return c;
}

export class AlbumScene extends Container {
  private setIdx = 0;
  private body = new Container();
  private fx: FX;
  private fxLayer = new Container();
  private fxAdd = new Container();
  private packBtn!: Button;
  private packTxt!: Text;

  constructor(private app: App, public W: number, public H: number) {
    super();
    this.fx = new FX(this.fxLayer, this.fxAdd, 80);
    const hb = new Graphics().roundRect(30, 26, W - 60, 100, 30).fill({ color: 0x2a1408, alpha: 0.9 }).stroke({ width: 5, color: 0xd9a53c });
    const title = label('Kart Albümü', 46, { fill: 0xffe39a });
    title.position.set(W / 2 + 20, 76);
    const back = new Button('red', 140, 'Geri', () => this.app.showMenu(), 34);
    back.position.set(115, 77);
    back.setBaseScale(0.8);
    this.addChild(hb, title, back, this.body, this.fxLayer, this.fxAdd);
    this.draw();
  }

  private draw() {
    this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const W = this.W, H = this.H;
    // set tabs
    SETS.forEach((set, i) => {
      const tw = (W - 80) / 3;
      const tab = new Container();
      tab.position.set(40 + tw * (i + 0.5), 170);
      const active = i === this.setIdx;
      const bg = new Graphics().roundRect(-tw / 2 + 4, -34, tw - 8, 68, 22).fill({ color: active ? 0x8e1d1d : 0x2a1408, alpha: 0.92 }).stroke({ width: 4, color: 0xd9a53c });
      const t = label(set.name, 21);
      t.y = -6;
      if (t.width > tw - 20) t.scale.set((tw - 20) / t.width);
      const p = label(`${setProgress(set)}/9`, 18, { fill: setProgress(set) === 9 ? 0x9fe08a : 0xffe39a });
      p.y = 18;
      tab.addChild(bg, t, p);
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.on('pointertap', () => {
        sfx.click();
        this.setIdx = i;
        this.draw();
      });
      this.body.addChild(tab);
    });
    const set: SetDef = SETS[this.setIdx];
    // grid
    const cw = Math.min(190, (W - 100) / 3, ((H - 230 - 230) / 3 - 16) / 1.36);
    const ch = cw * 1.36;
    const top = 225;
    set.cards.forEach((c, i) => {
      const has = owned(c.id) > 0;
      const v = cardView(c.id, cw, !has);
      v.position.set(W / 2 + (i % 3 - 1) * (cw + 20), top + ch / 2 + Math.floor(i / 3) * (ch + 16));
      if (owned(c.id) > 1) {
        const b = new Graphics().circle(cw / 2 - 6, -ch / 2 + 6, 18).fill({ color: 0x8e1d1d }).stroke({ width: 3, color: 0xffffff });
        const n = label(`x${owned(c.id)}`, 16);
        n.position.set(cw / 2 - 6, -ch / 2 + 6);
        v.addChild(b, n);
      }
      this.body.addChild(v);
    });
    const gridBottom = top + 3 * (ch + 16);
    const rw = label(
      getSave().album.sets.includes(set.id) ? 'Set tamamlandı!' : `Set ödülü: ${rewardText(set.reward)}`,
      22, { fill: 0xffe39a },
    );
    rw.position.set(W / 2, gridBottom + 14);
    this.body.addChild(rw);
    // open pack button
    const packs = getSave().album.packs;
    this.packBtn = new Button(packs > 0 ? 'green' : 'red', 360, packs > 0 ? `Paket Aç (${packs})` : 'Paket yok', () => this.open(), 34);
    this.packBtn.position.set(W / 2, Math.min(H - 90, gridBottom + 100));
    this.body.addChild(this.packBtn);
    const hint = label('Paketler: seviye kazan, kale bölgesi bitir, Pip\'i kurtar', 18);
    hint.position.set(W / 2, Math.min(H - 90, gridBottom + 100) + 62);
    hint.alpha = 0.85;
    this.body.addChild(hint);
    void this.packTxt;
  }

  private async open() {
    if (getSave().album.packs <= 0) {
      sfx.invalid();
      return;
    }
    const cards = openPack();
    const root = new Container();
    root.addChild(overlay(this.W, this.H, 0.75));
    this.addChild(root);
    this.removeChild(this.fxLayer, this.fxAdd);
    this.addChild(this.fxLayer, this.fxAdd);
    const pack = new Sprite(tex(hasTex('card_pack') ? 'card_pack' : 'it_chest'));
    pack.anchor.set(0.5);
    const ps = 300 / pack.texture.width;
    pack.scale.set(0);
    pack.position.set(this.W / 2, this.H * 0.45);
    root.addChild(pack);
    await tween(pack.scale, { x: ps, y: ps }, 0.45, Ease.outBack);
    // shake
    for (let i = 0; i < 6; i++) {
      sfx.swap();
      await tween(pack, { rotation: i % 2 ? 0.12 : -0.12 }, 0.07);
    }
    pack.rotation = 0;
    sfx.bigBoom();
    this.fx.flash(pack.x, pack.y, 700, 0xfff4c0, 0.5);
    this.fx.confettiBurst(pack.x, pack.y, 70);
    this.fx.sparkleBurst(pack.x, pack.y, 40, 0xffe070, 10);
    pack.destroy();
    const cw = Math.min(200, (this.W - 80) / 3);
    const views: Container[] = [];
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const v = cardView(c.id, cw);
      v.position.set(this.W / 2, this.H * 0.45);
      v.scale.set(0, 1);
      root.addChild(v);
      views.push(v);
      const tx = this.W / 2 + (i - 1) * (cw + 20);
      tween(v, { x: tx, y: this.H * 0.42 }, 0.4, Ease.outCubic);
      await tween(v.scale, { x: 1, y: 1 }, 0.35, Ease.outBack);
      const def = cardDef(c.id);
      if (def.rarity === 3) {
        sfx.orb();
        this.fx.sparkleBurst(tx, this.H * 0.42, 30, 0xffa030, 8);
      } else sfx.star();
      if (c.isNew) {
        const n = label('YENİ!', 30, { fill: 0x9fff7a, stroke: 0x1a4a0a, strokeW: 6 });
        n.position.set(0, -cw * 0.75);
        n.scale.set(0);
        v.addChild(n);
        tween(n.scale, { x: 1, y: 1 }, 0.3, Ease.outBack);
      } else {
        const n = label('+15 altın', 22, { fill: 0xffe066 });
        n.position.set(0, -cw * 0.75);
        v.addChild(n);
      }
      await wait(0.15, 'album');
    }
    const ok = new Button('green', 260, 'Tamam', async () => {
      root.destroy({ children: true });
      const done = pendingSetRewards();
      for (const d of done) await this.setComplete(d.name, rewardText(d.reward));
      this.draw();
    }, 38);
    ok.position.set(this.W / 2, this.H * 0.42 + cw * 1.1);
    root.addChild(ok);
  }

  private setComplete(name: string, reward: string): Promise<void> {
    sfx.win();
    this.fx.confetti(this.W / 2, 0, this.W, 140);
    return new Promise((resolve) => {
      const { panel, ph, close } = popup(this, this.W, this.H, 'Set Tamamlandı!', resolve);
      const t = label(`${name}`, 38, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      t.y = -ph * 0.08;
      const r = label(`Ödül: ${reward}`, 26, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      r.y = ph * 0.05;
      const b = new Button('green', 260, 'Harika!', () => close(), 38);
      b.y = ph * 0.3;
      panel.addChild(t, r, b);
    });
  }

  update(dt: number) {
    this.fx.update(dt);
  }

  destroyScene() {
    this.fx.clear();
    this.destroy({ children: true });
  }
}
