// Castle restoration meta: spend stars earned in levels to restore the castle area by area.
// Each task restores a specific spot of the picture with a dust-cloud reveal (ruin -> restored).
import { ColorMatrixFilter, Container, Graphics, RenderTexture, Sprite, Texture, Point } from 'pixi.js';
import { tex, hasTex } from '../assets';
import { label, Button, Counter } from '../ui';
import { tween, Ease, wait } from '../tween';
import { sfx } from '../audio';
import { getSave, save } from '../storage';
import { grant, rewardText, Reward } from '../liveops';
import { popup } from './panels';
import { FX } from '../fx';
import { Pip, hasPip } from '../mascot';
import type { App } from '../main';

/** spot circles in normalized picture coordinates: [x, y, radius] (radius relative to picture width) */
type Spot = [number, number, number];
interface Task { id: string; name: string; cost: number; spots: Spot[] }
interface Area { name: string; art: string; tasks: Task[]; reward: Reward }

export const AREAS: Area[] = [
  { name: 'Kale Kapısı', art: 'castle_1', reward: { coins: 200, hammer: 1 }, tasks: [
    { id: 'a1', name: 'Kapıyı onar', cost: 1, spots: [[0.5, 0.48, 0.17]] },
    { id: 'a2', name: 'Meşaleleri yak', cost: 1, spots: [[0.28, 0.72, 0.13], [0.72, 0.72, 0.13]] },
    { id: 'a3', name: 'Sancakları as', cost: 2, spots: [[0.5, 0.12, 0.3], [0.15, 0.3, 0.12], [0.85, 0.3, 0.12]] },
    { id: 'a4', name: 'Asma köprüyü indir', cost: 2, spots: [[0.5, 0.86, 0.22], [0.15, 0.85, 0.15], [0.85, 0.85, 0.15]] },
    { id: 'a5', name: 'Kuleleri yükselt', cost: 3, spots: [[0.24, 0.4, 0.2], [0.76, 0.4, 0.2]] }] },
  { name: 'Kraliyet Avlusu', art: 'castle_2', reward: { coins: 300, row: 1, col: 1 }, tasks: [
    { id: 'b1', name: 'Çeşmeyi temizle', cost: 2, spots: [[0.5, 0.74, 0.2]] },
    { id: 'b2', name: 'Gül bahçesini dik', cost: 2, spots: [[0.1, 0.88, 0.15], [0.9, 0.88, 0.15], [0.08, 0.42, 0.12], [0.94, 0.4, 0.1]] },
    { id: 'b3', name: 'Pazar tezgâhları', cost: 3, spots: [[0.2, 0.66, 0.17], [0.88, 0.66, 0.14], [0.38, 0.55, 0.12]] },
    { id: 'b4', name: 'Kuyuyu onar', cost: 3, spots: [[0.72, 0.6, 0.12]] },
    { id: 'b5', name: 'Ulu meşeyi canlandır', cost: 4, spots: [[0.78, 0.32, 0.2], [0.5, 0.25, 0.22]] }] },
  { name: 'Taht Salonu', art: 'castle_3', reward: { coins: 500, shuffle: 1, hammer: 2 }, tasks: [
    { id: 'c1', name: 'Kırmızı halıyı ser', cost: 3, spots: [[0.48, 0.86, 0.22]] },
    { id: 'c2', name: 'Avizeleri as', cost: 3, spots: [[0.5, 0.13, 0.3], [0.18, 0.15, 0.12], [0.8, 0.15, 0.12]] },
    { id: 'c3', name: 'Vitray pencereler', cost: 4, spots: [[0.14, 0.42, 0.15], [0.84, 0.42, 0.15]] },
    { id: 'c4', name: 'Altın taht', cost: 5, spots: [[0.5, 0.48, 0.16]] },
    { id: 'c5', name: 'Duvarları süsle', cost: 5, spots: [[0.05, 0.6, 0.15], [0.95, 0.6, 0.15], [0.3, 0.45, 0.1], [0.7, 0.45, 0.1]] }] },
  { name: 'Surlar ve Kuleler', art: 'castle_4', reward: { coins: 600, hammer: 2, row: 1 }, tasks: [
    { id: 'd1', name: 'Surları ör', cost: 4, spots: [[0.2, 0.72, 0.2], [0.45, 0.68, 0.14]] },
    { id: 'd2', name: 'Mancınıkları kur', cost: 4, spots: [[0.28, 0.5, 0.18]] },
    { id: 'd3', name: 'Kuleleri yükselt', cost: 5, spots: [[0.27, 0.22, 0.17], [0.75, 0.22, 0.17], [0.88, 0.25, 0.1]] },
    { id: 'd4', name: 'Nöbetçi yolu', cost: 5, spots: [[0.72, 0.82, 0.2], [0.9, 0.6, 0.12]] },
    { id: 'd5', name: 'Büyük çanı as', cost: 6, spots: [[0.62, 0.45, 0.13]] }] },
  { name: 'Kraliyet Bahçesi', art: 'castle_5', reward: { coins: 800, shuffle: 2, col: 1 }, tasks: [
    { id: 'e1', name: 'Labirent çitleri', cost: 5, spots: [[0.42, 0.75, 0.22]] },
    { id: 'e2', name: 'Kuğulu gölet', cost: 5, spots: [[0.35, 0.45, 0.16]] },
    { id: 'e3', name: 'Çiçek kemerleri', cost: 6, spots: [[0.18, 0.5, 0.12], [0.62, 0.35, 0.12], [0.8, 0.62, 0.1]] },
    { id: 'e4', name: 'Gül çalıları', cost: 6, spots: [[0.08, 0.88, 0.14], [0.92, 0.88, 0.14]] },
    { id: 'e5', name: 'Ejderha heykeli', cost: 7, spots: [[0.82, 0.35, 0.14], [0.3, 0.15, 0.25], [0.8, 0.12, 0.16]] }] },
  { name: 'Hazine Odası', art: 'castle_6', reward: { coins: 1500, hammer: 3, row: 2, col: 2, shuffle: 2 }, tasks: [
    { id: 'f1', name: 'Altın sandıklar', cost: 6, spots: [[0.1, 0.8, 0.14], [0.9, 0.8, 0.14]] },
    { id: 'f2', name: 'Mücevher rafları', cost: 6, spots: [[0.12, 0.35, 0.14], [0.84, 0.4, 0.14]] },
    { id: 'f3', name: 'Kraliyet tacı', cost: 7, spots: [[0.5, 0.4, 0.13]] },
    { id: 'f4', name: 'Kılıç koleksiyonu', cost: 7, spots: [[0.58, 0.62, 0.15]] },
    { id: 'f5', name: 'Altın yığınları', cost: 8, spots: [[0.3, 0.85, 0.16], [0.5, 0.15, 0.25]] }] },
];

/** Index of the first area that isn't finished (or the last one). */
export function currentArea(): number {
  const done = getSave().castle.done;
  for (let i = 0; i < AREAS.length; i++) if (AREAS[i].tasks.some((t) => !done.includes(t.id))) return i;
  return AREAS.length - 1;
}

export function nextTaskCost(): number | null {
  const a = AREAS[currentArea()];
  const t = a.tasks.find((q) => !getSave().castle.done.includes(q.id));
  return t ? t.cost : null;
}

/** Radial soft brush used to paint the reveal mask. */
let brush: Texture | null = null;
function brushTex(): Texture {
  if (!brush) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.72, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    brush = Texture.from(c);
  }
  return brush;
}

export class CastleScene extends Container {
  private view = 0;
  private body = new Container();
  private stars!: Counter;
  private fx: FX;
  private fxLayer = new Container();
  private fxAdd = new Container();
  private pic = new Container();
  private picInner = new Container();
  private aw = 0;
  private ah = 0;
  private picY = 0;
  private maskRT: RenderTexture | null = null;
  private maskStamp = new Container();
  private reveal: { spot: Spot; k: number }[] = [];
  private busy = false;
  private pip: Pip | null = null;
  private header = new Container();

  constructor(private app: App, public W: number, public H: number) {
    super();
    this.fx = new FX(this.fxLayer, this.fxAdd, 80);
    this.view = currentArea();
    const hb = new Graphics().roundRect(30, 26, W - 60, 100, 30).fill({ color: 0x2a1408, alpha: 0.9 }).stroke({ width: 5, color: 0xd9a53c });
    const title = label('Kale', 52, { fill: 0xffe39a });
    title.position.set(W / 2, 76);
    const back = new Button('red', 140, 'Geri', () => this.app.showMenu(), 34);
    back.position.set(115, 77);
    back.setBaseScale(0.8);
    this.stars = new Counter('ui_star', getSave().stars, 150);
    this.stars.position.set(W - 120, 76);
    this.header.addChild(hb, title, back, this.stars);
    this.addChild(this.body, this.fxLayer, this.fxAdd, this.header);
    this.draw();
  }

  private renderer() {
    return this.app.pixi.renderer;
  }

  /** Repaint the reveal mask: all finished spots + those currently animating. */
  private paintMask() {
    if (!this.maskRT || this.destroyed || this.maskRT.destroyed) return;
    this.maskStamp.removeChildren().forEach((c) => c.destroy());
    const area = AREAS[this.view];
    const done = getSave().castle.done;
    const finished = area.tasks.every((t) => done.includes(t.id));
    const add = (s: Spot, k: number) => {
      if (k <= 0) return;
      const b = new Sprite(brushTex());
      b.anchor.set(0.5);
      const d = (s[2] * this.aw * 2 * k) / 256 / 0.86;
      b.scale.set(d);
      b.position.set(s[0] * this.aw, s[1] * this.ah);
      this.maskStamp.addChild(b);
    };
    if (finished && !this.reveal.length) {
      const g = new Graphics().rect(0, 0, this.aw, this.ah).fill(0xffffff);
      this.maskStamp.addChild(g);
    } else {
      for (const t of area.tasks) if (done.includes(t.id) && !this.reveal.some((r) => t.spots.includes(r.spot))) t.spots.forEach((s) => add(s, 1));
      for (const r of this.reveal) add(r.spot, r.k);
    }
    this.renderer().render({ container: this.maskStamp, target: this.maskRT, clear: true });
  }

  private draw() {
    this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.pip = null;
    const W = this.W, H = this.H;
    const area = AREAS[this.view];
    const done = getSave().castle.done;
    const k = area.tasks.filter((t) => done.includes(t.id)).length / area.tasks.length;

    // ---- picture: ruined layer + restored layer revealed through a soft mask
    this.aw = W - 60;
    this.ah = Math.round(this.aw * 0.747);
    this.ah = Math.min(this.ah, Math.round(H * 0.44));
    this.picY = 150;
    this.pic = new Container();
    this.picInner = new Container();
    const restoredTex: Texture = hasTex(area.art) ? tex(area.art) : tex('bg_game');
    const fit = (s: Sprite) => {
      s.anchor.set(0.5);
      s.scale.set(Math.max(this.aw / s.texture.width, this.ah / s.texture.height));
      s.position.set(this.aw / 2, this.ah / 2);
    };
    const ruin = new Sprite(hasTex(`${area.art}_ruin`) ? tex(`${area.art}_ruin`) : restoredTex);
    fit(ruin);
    if (!hasTex(`${area.art}_ruin`)) {
      const cm = new ColorMatrixFilter();
      cm.desaturate();
      const dk = new ColorMatrixFilter();
      dk.brightness(0.55, false);
      ruin.filters = [cm, dk];
    }
    const restored = new Sprite(restoredTex);
    fit(restored);
    this.maskRT?.destroy(true);
    this.maskRT = RenderTexture.create({ width: this.aw, height: this.ah, resolution: 1 });
    const maskSpr = new Sprite(this.maskRT);
    restored.mask = maskSpr;
    this.picInner.addChild(ruin, restored, maskSpr);
    const clip = new Graphics().roundRect(0, 0, this.aw, this.ah, 30).fill(0xffffff);
    this.picInner.mask = clip;
    const border = new Graphics().roundRect(0, 0, this.aw, this.ah, 30).stroke({ width: 6, color: 0xd9a53c });
    this.pic.addChild(this.picInner, clip, border);
    this.pic.position.set(30, this.picY);
    this.body.addChild(this.pic);
    this.paintMask();

    const name = label(area.name, 44, { fill: 0xffe39a, stroke: 0x3a1e0c, strokeW: 8 });
    name.position.set(W / 2, this.picY + this.ah - 40);
    this.body.addChild(name);
    if (this.view > 0) {
      const prev = new Button('green', 70, '<', () => { if (!this.busy) { this.view--; this.draw(); } }, 40);
      prev.position.set(70, this.picY + this.ah / 2);
      this.body.addChild(prev);
    }
    if (this.view < currentArea()) {
      const next = new Button('green', 70, '>', () => { if (!this.busy) { this.view++; this.draw(); } }, 40);
      next.position.set(W - 70, this.picY + this.ah / 2);
      this.body.addChild(next);
    }

    // ---- progress
    const pbY = this.picY + this.ah + 40;
    const pbw = W - 120;
    const pb = new Graphics().roundRect(-pbw / 2, -16, pbw, 32, 16).fill({ color: 0x3b2210, alpha: 0.9 }).stroke({ width: 3, color: 0xc89a3c });
    pb.position.set(W / 2, pbY);
    this.body.addChild(pb);
    if (k > 0) {
      const fill = new Graphics().roundRect(-pbw / 2 + 4, -12, (pbw - 8) * k, 24, 12).fill({ color: 0x5fd04a });
      fill.position.copyFrom(pb.position);
      this.body.addChild(fill);
    }
    const rw = label(k >= 1 ? 'Restore edildi!' : `Ödül: ${rewardText(area.reward)} + kart paketi`, 22);
    rw.position.set(W / 2, pbY);
    this.body.addChild(rw);

    // ---- tasks
    const listTop = pbY + 50;
    const rowH = Math.min(92, (H - listTop - 20) / area.tasks.length);
    area.tasks.forEach((t, i) => {
      const row = new Container();
      row.position.set(W / 2, listTop + rowH * (i + 0.5));
      const isDone = done.includes(t.id);
      const bg = new Graphics().roundRect(-(W - 60) / 2, -rowH / 2 + 5, W - 60, rowH - 10, 20).fill({ color: isDone ? 0x2f5a1a : 0x2a1408, alpha: 0.85 }).stroke({ width: 3, color: 0xc89a3c });
      const nm = label(t.name, 30);
      nm.anchor.set(0, 0.5);
      nm.x = -(W - 60) / 2 + 30;
      row.addChild(bg, nm);
      if (isDone) {
        const x0 = (W - 60) / 2 - 50;
        const tick = new Graphics().circle(x0, 0, 22).fill({ color: 0x2f9b2a }).stroke({ width: 4, color: 0xffffff })
          .moveTo(x0 - 10, 1).lineTo(x0 - 3, 8).lineTo(x0 + 10, -7).stroke({ width: 6, color: 0xffffff, cap: 'round' });
        row.addChild(tick);
      } else if (this.view === currentArea()) {
        const can = getSave().stars >= t.cost;
        const b = new Button(can ? 'green' : 'red', 150, `${t.cost}`, () => this.buy(t, row), 32);
        b.x = (W - 60) / 2 - 95;
        const st = new Sprite(tex('ui_star'));
        st.anchor.set(0.5);
        st.scale.set(0.16);
        st.x = -34;
        b.addChild(st);
        if (!can) b.alpha = 0.75;
        row.addChild(b);
      }
      this.body.addChild(row);
    });
  }

  private spotGlobal(s: Spot): Point {
    return new Point(30 + s[0] * this.aw, this.picY + s[1] * this.ah);
  }

  private async buy(t: Task, row: Container) {
    if (this.busy) return;
    const s = getSave();
    if (s.stars < t.cost) {
      sfx.invalid();
      const m = label('Seviye geçerek yıldız kazan!', 30, { fill: 0xff9a8a });
      m.position.set(row.x, row.y - 50);
      this.addChild(m);
      tween(m, { alpha: 0, y: m.y - 40 }, 0.9, Ease.inQuad, 0.6).then(() => m.destroy());
      return;
    }
    this.busy = true;
    s.stars -= t.cost;
    s.castle.done.push(t.id);
    save();
    this.stars.value = s.stars;

    // builder Pip pops up in the corner
    if (hasPip('build')) {
      this.pip = new Pip('build', 240);
      this.pip.position.set(this.W - 100, this.H - 10);
      this.addChild(this.pip);
      this.pip.popIn();
    }

    // 1) stars fly from the counter to every spot of the task
    const from = new Point(this.W - 160, 76);
    await Promise.all(
      t.spots.map((sp, i) => {
        const st = new Sprite(tex('ui_star'));
        st.anchor.set(0.5);
        st.scale.set(0.3);
        st.position.copyFrom(from);
        this.fxLayer.addChild(st);
        const to = this.spotGlobal(sp);
        const mid = { x: (from.x + to.x) / 2 + (i % 2 ? -160 : 160), y: Math.min(from.y, to.y) - 80 };
        const h = { k: 0 };
        sfx.coin();
        return tween(h, { k: 1 }, 0.55, Ease.inOutQuad, i * 0.08, () => {
          const k = h.k;
          st.x = (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * mid.x + k * k * to.x;
          st.y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * mid.y + k * k * to.y;
          st.rotation = k * 6;
          this.fx.trail(st.x, st.y, 0, 0xffe070);
        }).then(() => st.destroy());
      }),
    );

    // 2) camera zooms to the (first) spot
    const focus = t.spots[0];
    const z = 1.18;
    const px = focus[0] * this.aw, py = focus[1] * this.ah;
    const tx = Math.min(0, Math.max(this.aw - this.aw * z, this.aw / 2 - px * z));
    const ty = Math.min(0, Math.max(this.ah - this.ah * z, this.ah / 2 - py * z));
    await Promise.all([tween(this.picInner.scale, { x: z, y: z }, 0.35, Ease.inOutQuad), tween(this.picInner, { x: tx, y: ty }, 0.35, Ease.inOutQuad)]);
    if (this.destroyed) return;

    // 3) dust + hammering, then the spot is revealed with a growing soft circle
    for (const sp of t.spots) {
      const g = this.spotGlobal(sp);
      this.reveal.push({ spot: sp, k: 0 });
      for (let i = 0; i < 3; i++) setTimeout(() => sfx.crate(), i * 140);
      this.fx.debris(g.x, g.y, 'wood', 10);
      this.fx.debris(g.x, g.y, 'stone', 6);
    }
    this.fx.shake(6, 0.35);
    await wait(0.25, 'castle');
    if (this.destroyed) return;
    sfx.powerCreate();
    const holder = { k: 0 };
    await tween(holder, { k: 1 }, 0.8, Ease.outBack, 0, () => {
      for (const r of this.reveal) r.k = holder.k;
      this.paintMask();
    });
    for (const sp of t.spots) {
      const g = this.spotGlobal(sp);
      this.fx.sparkleBurst(g.x, g.y, 24, 0xfff2a0, 6);
      this.fx.flash(g.x, g.y, sp[2] * this.aw * 3, 0xfff0c0, 0.5);
    }
    sfx.star();
    this.reveal = [];
    this.paintMask();
    const ok = label(`${t.name}!`, 46, { fill: 0xffe066, stroke: 0x7a2e00, strokeW: 9 });
    const fg = this.spotGlobal(focus);
    ok.position.set(this.W / 2, Math.max(this.picY + 60, fg.y - 40));
    ok.scale.set(0.3);
    this.addChild(ok);
    tween(ok.scale, { x: 1, y: 1 }, 0.35, Ease.outBack).then(() => tween(ok, { alpha: 0, y: ok.y - 60 }, 0.5, Ease.inQuad, 0.6).then(() => ok.destroy()));
    this.pip?.setPose('happy');
    await wait(0.6, 'castle');
    if (this.destroyed) return;
    await Promise.all([tween(this.picInner.scale, { x: 1, y: 1 }, 0.4, Ease.inOutQuad), tween(this.picInner, { x: 0, y: 0 }, 0.4, Ease.inOutQuad)]);
    if (this.destroyed) return;

    const area = AREAS[this.view];
    const finished = area.tasks.every((q) => s.castle.done.includes(q.id));
    if (finished) {
      await this.finale(area);
    }
    this.busy = false;
    this.pip?.destroy();
    this.draw();
  }

  private async finale(area: Area) {
    sfx.win();
    // whole picture comes alive
    const holder = { k: 0 };
    const centers: Spot[] = [[0.5, 0.5, 0.2]];
    this.reveal = centers.map((c) => ({ spot: c, k: 0 }));
    await tween(holder, { k: 1 }, 1.0, Ease.inOutQuad, 0, () => {
      this.reveal[0].k = holder.k * 4;
      this.paintMask();
    });
    this.reveal = [];
    this.paintMask();
    this.fx.confetti(this.W / 2, this.picY - 40, this.W, 140);
    this.fx.flash(this.W / 2, this.picY + this.ah / 2, this.aw * 1.5, 0xfff6d0, 0.6);
    grant({ ...area.reward, packs: 1 });
    await wait(0.8, 'castle');
    if (this.destroyed) return;
    await new Promise<void>((resolve) => {
      const { panel, ph, close } = popup(this, this.W, this.H, 'Bölge Restore Edildi!', resolve);
      const chest = new Sprite(tex(hasTex('it_chest') ? 'it_chest' : 'ic_coin'));
      chest.anchor.set(0.5);
      chest.scale.set(150 / chest.texture.width);
      chest.y = -ph * 0.2;
      const t = label(`${area.name}\neski görkemine kavuştu!`, 30, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      t.y = -ph * 0.02;
      const r = label(`Ödül: ${rewardText(area.reward)}\n+ 1 kart paketi`, 26, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      r.y = ph * 0.12;
      const b = new Button('green', 280, 'Harika!', () => close(), 40);
      b.y = ph * 0.3;
      panel.addChild(chest, t, r, b);
      chest.scale.set(0);
      tween(chest.scale, { x: 150 / chest.texture.width, y: 150 / chest.texture.width }, 0.5, Ease.outBack, 0.3).then(() => {
        const g = chest.getGlobalPosition();
        const l = this.toLocal(g);
        this.fx.confettiBurst(l.x, l.y, 60);
        sfx.coin();
      });
    });
    this.view = currentArea();
  }

  update(dt: number) {
    this.fx.update(dt);
    this.pip?.update(dt);
    const sh = this.fx.shakeOffset;
    this.pic.pivot.set(-sh.x, -sh.y);
  }

  destroyScene() {
    this.fx.clear();
    this.destroy({ children: true });
    this.maskRT?.destroy(true);
    this.maskRT = null;
  }
}
