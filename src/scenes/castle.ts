// Castle restoration meta: spend stars earned in levels to restore the castle area by area.
import { ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { tex, hasTex } from '../assets';
import { label, Button, Counter } from '../ui';
import { tween, Ease } from '../tween';
import { sfx } from '../audio';
import { getSave, save } from '../storage';
import { grant, rewardText, Reward } from '../liveops';
import { popup } from './panels';
import { FX } from '../fx';
import type { App } from '../main';

interface Area { name: string; art: string; tasks: { id: string; name: string; cost: number }[]; reward: Reward }

export const AREAS: Area[] = [
  { name: 'Kale Kapısı', art: 'castle_1', reward: { coins: 200, hammer: 1 }, tasks: [
    { id: 'a1', name: 'Kapıyı onar', cost: 1 }, { id: 'a2', name: 'Meşaleleri yak', cost: 1 },
    { id: 'a3', name: 'Sancakları as', cost: 2 }, { id: 'a4', name: 'Asma köprüyü indir', cost: 2 },
    { id: 'a5', name: 'Gözcü kulesini kur', cost: 3 }] },
  { name: 'Kraliyet Avlusu', art: 'castle_2', reward: { coins: 300, row: 1, col: 1 }, tasks: [
    { id: 'b1', name: 'Çeşmeyi temizle', cost: 2 }, { id: 'b2', name: 'Gül bahçesini dik', cost: 2 },
    { id: 'b3', name: 'Pazar tezgâhları', cost: 3 }, { id: 'b4', name: 'Ahırı yenile', cost: 3 },
    { id: 'b5', name: 'Kral heykelini dik', cost: 4 }] },
  { name: 'Taht Salonu', art: 'castle_3', reward: { coins: 500, shuffle: 1, hammer: 2 }, tasks: [
    { id: 'c1', name: 'Kırmızı halıyı ser', cost: 3 }, { id: 'c2', name: 'Avizeleri as', cost: 3 },
    { id: 'c3', name: 'Vitray pencereler', cost: 4 }, { id: 'c4', name: 'Altın taht', cost: 5 },
    { id: 'c5', name: 'Kraliyet sancağı', cost: 5 }] },
  { name: 'Surlar ve Kuleler', art: 'castle_4', reward: { coins: 600, hammer: 2, row: 1 }, tasks: [
    { id: 'd1', name: 'Surları ör', cost: 4 }, { id: 'd2', name: 'Mancınıkları kur', cost: 4 },
    { id: 'd3', name: 'Kuleleri yükselt', cost: 5 }, { id: 'd4', name: 'Nöbetçi yolu', cost: 5 },
    { id: 'd5', name: 'Büyük çan', cost: 6 }] },
  { name: 'Kraliyet Bahçesi', art: 'castle_5', reward: { coins: 800, shuffle: 2, col: 1 }, tasks: [
    { id: 'e1', name: 'Labirent çitleri', cost: 5 }, { id: 'e2', name: 'Kuğulu gölet', cost: 5 },
    { id: 'e3', name: 'Çiçek kemerleri', cost: 6 }, { id: 'e4', name: 'Kameriye', cost: 6 },
    { id: 'e5', name: 'Ejderha heykeli', cost: 7 }] },
  { name: 'Hazine Odası', art: 'castle_6', reward: { coins: 1500, hammer: 3, row: 2, col: 2, shuffle: 2 }, tasks: [
    { id: 'f1', name: 'Altın sandıklar', cost: 6 }, { id: 'f2', name: 'Mücevher rafları', cost: 6 },
    { id: 'f3', name: 'Kraliyet tacı', cost: 7 }, { id: 'f4', name: 'Kılıç koleksiyonu', cost: 7 },
    { id: 'f5', name: 'Kralın portresi', cost: 8 }] },
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

export class CastleScene extends Container {
  private view = 0;
  private body = new Container();
  private stars!: Counter;
  private fx: FX;
  private fxLayer = new Container();
  private fxAdd = new Container();

  constructor(private app: App, public W: number, public H: number) {
    super();
    this.fx = new FX(this.fxLayer, this.fxAdd, 80);
    this.view = currentArea();
    const header = new Graphics().roundRect(30, 26, W - 60, 100, 30).fill({ color: 0x2a1408, alpha: 0.9 }).stroke({ width: 5, color: 0xd9a53c });
    const title = label('Kale', 52, { fill: 0xffe39a });
    title.position.set(W / 2, 76);
    const back = new Button('red', 140, 'Geri', () => this.app.showMenu(), 34);
    back.position.set(115, 77);
    back.setBaseScale(0.8);
    this.stars = new Counter('ui_star', getSave().stars, 150);
    this.stars.position.set(W - 120, 76);
    this.addChild(this.body, header, title, back, this.stars, this.fxLayer, this.fxAdd);
    this.draw();
  }

  private draw() {
    this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const W = this.W, H = this.H;
    const area = AREAS[this.view];
    const done = getSave().castle.done;
    const k = area.tasks.filter((t) => done.includes(t.id)).length / area.tasks.length;

    // area picture: desaturated ruin that regains its colours as tasks complete
    const artTex: Texture = hasTex(area.art) ? tex(area.art) : tex('bg_game');
    const pic = new Container();
    const art = new Sprite(artTex);
    art.anchor.set(0.5);
    const aw = W - 60, ah = Math.min(H * 0.42, 560);
    art.scale.set(Math.max(aw / art.texture.width, ah / art.texture.height));
    const mask = new Graphics().roundRect(-aw / 2, -ah / 2, aw, ah, 30).fill(0xffffff);
    art.mask = mask;
    const cm = new ColorMatrixFilter();
    cm.desaturate();
    cm.alpha = 1 - k;
    const dark = new ColorMatrixFilter();
    dark.brightness(0.55 + 0.45 * k, false);
    art.filters = [cm, dark];
    const border = new Graphics().roundRect(-aw / 2, -ah / 2, aw, ah, 30).stroke({ width: 6, color: 0xd9a53c });
    pic.addChild(art, mask, border);
    pic.position.set(W / 2, 150 + ah / 2);
    this.body.addChild(pic);

    const name = label(area.name, 44, { fill: 0xffe39a, stroke: 0x3a1e0c, strokeW: 8 });
    name.position.set(W / 2, 150 + ah - 40);
    this.body.addChild(name);
    if (this.view > 0) {
      const prev = new Button('green', 70, '<', () => { this.view--; this.draw(); }, 40);
      prev.position.set(70, 150 + ah / 2);
      this.body.addChild(prev);
    }
    if (this.view < currentArea()) {
      const next = new Button('green', 70, '>', () => { this.view++; this.draw(); }, 40);
      next.position.set(W - 70, 150 + ah / 2);
      this.body.addChild(next);
    }

    // progress
    const pbY = 150 + ah + 40;
    const pbw = W - 120;
    const pb = new Graphics().roundRect(-pbw / 2, -16, pbw, 32, 16).fill({ color: 0x3b2210, alpha: 0.9 }).stroke({ width: 3, color: 0xc89a3c });
    pb.position.set(W / 2, pbY);
    this.body.addChild(pb);
    if (k > 0) {
      const fill = new Graphics().roundRect(-pbw / 2 + 4, -12, (pbw - 8) * k, 24, 12).fill({ color: 0x5fd04a });
      fill.position.copyFrom(pb.position);
      this.body.addChild(fill);
    }
    const rw = label(k >= 1 ? 'Restore edildi!' : `Ödül: ${rewardText(area.reward)}`, 22);
    rw.position.set(W / 2, pbY);
    this.body.addChild(rw);

    // tasks
    const listTop = pbY + 60;
    const rowH = Math.min(96, (H - listTop - 30) / area.tasks.length);
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
        const tick = new Graphics().circle((W - 60) / 2 - 50, 0, 22).fill({ color: 0x2f9b2a }).stroke({ width: 4, color: 0xffffff })
          .moveTo((W - 60) / 2 - 60, 1).lineTo((W - 60) / 2 - 53, 8).lineTo((W - 60) / 2 - 40, -7).stroke({ width: 6, color: 0xffffff, cap: 'round' });
        row.addChild(tick);
      } else if (this.view === currentArea()) {
        const can = getSave().stars >= t.cost;
        const b = new Button(can ? 'green' : 'red', 150, `${t.cost}`, () => this.buy(t.id, t.cost, row), 32);
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

  private buy(id: string, cost: number, row: Container) {
    const s = getSave();
    if (s.stars < cost) {
      sfx.invalid();
      const t = label('Seviye geçerek yıldız kazan!', 30, { fill: 0xff9a8a });
      t.position.set(row.x, row.y - 50);
      this.addChild(t);
      tween(t, { alpha: 0, y: t.y - 40 }, 0.9, Ease.inQuad, 0.6).then(() => t.destroy());
      return;
    }
    s.stars -= cost;
    s.castle.done.push(id);
    save();
    this.stars.value = s.stars;
    sfx.star();
    sfx.powerCreate();
    this.fx.sparkleBurst(this.W / 2, 150 + 200, 40, 0xffe070, 10);
    this.fx.flash(this.W / 2, 150 + 200, 500, 0xfff0c0, 0.5);
    const area = AREAS[this.view];
    const finished = area.tasks.every((t) => s.castle.done.includes(t.id));
    this.draw();
    if (finished) {
      grant(area.reward);
      sfx.win();
      const { panel, ph, close } = popup(this, this.W, this.H, 'Bölge Restore Edildi!');
      const t = label(`${area.name}\neski görkemine kavuştu!`, 30, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      t.y = -ph * 0.1;
      const r = label(`Ödül: ${rewardText(area.reward)}`, 28, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      r.y = ph * 0.02;
      const b = new Button('green', 280, 'Harika!', () => {
        close();
        this.view = currentArea();
        this.draw();
      }, 40);
      b.y = ph * 0.3;
      panel.addChild(t, r, b);
    }
  }

  update(dt: number) {
    this.fx.update(dt);
  }

  destroyScene() {
    this.fx.clear();
    this.destroy({ children: true });
  }
}
