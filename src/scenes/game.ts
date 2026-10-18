import { Container, Graphics, NineSliceSprite, Point, Sprite, Text } from 'pixi.js';
import { Board, Kind } from '../game/board';
import { getLevel, GoalType, LevelDef } from '../levels';
import { tex } from '../assets';
import { label, woodPanel, Button, iconButton, overlay } from '../ui';
import { tween, Ease, wait, clearTimers, after, killTweens } from '../tween';
import { sfx, updateMusic } from '../audio';
import { getSave, save, DEV, firstTime } from '../storage';
import type { App } from '../main';

const GOAL_TEX: Record<GoalType, string> = {
  red: 'tile_red', blue: 'tile_blue', green: 'tile_green', yellow: 'tile_yellow', purple: 'tile_purple',
  crate: 'ob_crate1', stone: 'ob_stone1', chain: 'ob_chain', vines: 'ob_vines',
};

export const DIFF_COLOR = { normal: 0x2c5f9e, hard: 0xa01e1e, superhard: 0x6a1fa0 } as const;

interface GoalUI { type: GoalType; left: number; shown: number; icon: Sprite; base: number; txt: Text; tick: Graphics; node: Container }

export class GameScene extends Container {
  board!: Board;
  private def: LevelDef;
  private moves: number;
  private movesTxt!: Text;
  private movesNode!: Container;
  private goals: GoalUI[] = [];
  private state: 'play' | 'won' | 'lost' | 'paused' = 'play';
  private popupLayer = new Container();
  private flyLayer = new Container();
  private praiseCooldown = 0;
  private lastCascade = 0;
  private boardHolder = new Container();

  constructor(private app: App, public levelNo: number, public W: number, public H: number) {
    super();
    this.def = getLevel(levelNo);
    this.moves = this.def.moves;
    this.build();
  }

  private build() {
    const W = this.W, H = this.H;
    // ---------------- HUD
    const hudH = 168;
    const hudY = Math.max(16, (H - 1280) * 0.25 + 16);
    const hud = woodPanel(W - 24, hudH, 0.42);
    hud.position.set(W / 2, hudY + hudH / 2);
    this.addChild(hud);

    const diff = this.def.diff ?? 'normal';
    const lvlText = diff === 'normal' ? `Seviye ${this.levelNo}` : `${diff === 'hard' ? 'Zor' : 'Çok Zor'} · ${this.levelNo}`;
    const lvl = label(lvlText, 30, { fill: 0xffe39a });
    lvl.position.set(W / 2, hudY - 2);
    const rw = diff === 'normal' ? 200 : 250;
    const ribbon = new Graphics().roundRect(-rw / 2, -24, rw, 46, 23).fill({ color: DIFF_COLOR[diff] }).stroke({ width: 4, color: 0xd9a53c });
    ribbon.position.copyFrom(lvl.position);
    this.addChild(ribbon, lvl);

    // goals on the left part
    const goalArea = W - 24 - 200;
    const n = this.def.goals.length;
    const gw = Math.min(118, (goalArea - 40) / n);
    this.def.goals.forEach((gd, i) => {
      const count = gd.count ?? this.countInGrid(gd.type);
      const node = new Container();
      node.position.set(12 + 20 + (goalArea - 20 - n * gw) / 2 + gw * (i + 0.5), hudY + hudH / 2 + 4);
      const icon = new Sprite(tex(GOAL_TEX[gd.type]));
      icon.anchor.set(0.5);
      icon.scale.set(Math.min(74, gw - 10) / icon.texture.width);
      icon.y = -14;
      const txt = label(String(count), 34);
      txt.y = 40;
      const tick = new Graphics()
        .circle(0, 0, 20).fill({ color: 0x2f9b2a }).stroke({ width: 4, color: 0xffffff })
        .moveTo(-9, 1).lineTo(-2, 8).lineTo(10, -7).stroke({ width: 6, color: 0xffffff, cap: 'round', join: 'round' });
      tick.position.set(0, 38);
      tick.visible = false;
      node.addChild(icon, txt, tick);
      this.addChild(node);
      this.goals.push({ type: gd.type, left: count, shown: count, icon, base: icon.scale.x, txt, tick, node });
    });

    // moves box on the right
    const mv = new Container();
    mv.position.set(W - 24 - 92, hudY + hudH / 2 + 2);
    const box = new Graphics().roundRect(-78, -62, 156, 124, 22).fill({ color: 0x2a1408, alpha: 0.85 }).stroke({ width: 4, color: 0xd9a53c });
    const mvLabel = label('Hamle', 24, { fill: 0xffe39a });
    mvLabel.y = -36;
    this.movesTxt = label(String(this.moves), 58);
    this.movesTxt.y = 14;
    mv.addChild(box, mvLabel, this.movesTxt);
    this.movesNode = mv;
    this.addChild(mv);

    // ---------------- board
    const top = hudY + hudH + 30;
    const bottomReserve = 110;
    const availH = H - top - bottomReserve;
    const availW = W - 56;
    const cols = this.def.grid[0].length, rows = this.def.grid.length;
    const S = Math.floor(Math.min(availW / cols, availH / rows, 86));
    const bw = S * cols, bh = S * rows;
    const bx = (W - bw) / 2, by = top + (availH - bh) * 0.4;

    // frame (9-slice, scaled)
    const fs = 0.2;
    const border = 137 * fs;
    const frame = new NineSliceSprite({ texture: tex('ui_frame'), leftWidth: 215, rightWidth: 215, topHeight: 215, bottomHeight: 215 });
    frame.scale.set(fs);
    const inset = 8;
    frame.width = (bw + 2 * (border - inset)) / fs;
    frame.height = (bh + 2 * (border - inset)) / fs;
    frame.position.set(bx - border + inset, by - border + inset);
    frame.eventMode = 'none';
    // dark backing inside frame

    this.board = new Board(this.def, S, {
      canMove: () => this.state === 'play' && this.moves > 0,
      useMove: () => this.useMove(),
      collect: (type, gx, gy, t) => this.collect(type, gx, gy, t),
      wantsGoal: (type) => this.goals.some((g) => g.type === type && g.left > 0),
      powerCreated: (kind) => this.powerTip(kind),
    });
    this.board.position.set(bx, by);
    this.boardHolder.addChild(this.board);
    this.addChild(this.boardHolder, frame);

    // ---------------- bottom bar
    const gear = iconButton('ic_gear', 92, () => this.openPause());
    gear.position.set(70, H - 66);
    this.addChild(gear);

    this.addChild(this.flyLayer, this.popupLayer);
    this.intro();
  }

  private countInGrid(type: GoalType): number {
    const chars = type === 'crate' ? '123' : type === 'stone' ? '456' : type === 'vines' ? 'v' : type === 'chain' ? 'c' : '';
    let n = 0;
    for (const row of this.def.grid) for (const ch of row) if (chars.includes(ch)) n++;
    return n;
  }

  private async intro() {
    this.board.inputEnabled = false;
    if (!DEV.on) {
      const boosters = await this.startPopup();
      await this.mechanicTip();
      if (this.state === 'play') this.board.inputEnabled = true;
      if (boosters.length) this.board.addStartBoosters(boosters);
      return;
    }
    const banner = new Container();
    const bg = new Graphics().roundRect(-260, -90, 520, 180, 30).fill({ color: 0x2a1408, alpha: 0.9 }).stroke({ width: 5, color: 0xd9a53c });
    const t = label(`Seviye ${this.levelNo}`, 56, { fill: 0xffe39a });
    t.y = -38;
    banner.addChild(bg, t);
    const diff = this.def.diff ?? 'normal';
    if (diff !== 'normal') {
      const tag = new Graphics().roundRect(-130, -22, 260, 44, 22).fill({ color: DIFF_COLOR[diff] }).stroke({ width: 4, color: 0xd9a53c });
      tag.y = -118;
      const tt = label(diff === 'hard' ? 'Zor Seviye' : 'Çok Zor Seviye', 28);
      tt.y = -120;
      banner.addChild(tag, tt);
      sfx.barrel();
    }
    const n = this.goals.length;
    this.goals.forEach((g, i) => {
      const ic = new Sprite(g.icon.texture);
      ic.anchor.set(0.5);
      ic.scale.set(56 / ic.texture.width);
      ic.position.set((i - (n - 1) / 2) * 110 - 22, 38);
      const c = label(String(g.left), 34);
      c.position.set(ic.x + 46, 40);
      banner.addChild(ic, c);
    });
    banner.position.set(this.W / 2, this.board.y + (this.board.H * this.board.S) / 2);
    banner.scale.set(0.3);
    banner.alpha = 0;
    this.popupLayer.addChild(banner);
    await Promise.all([tween(banner.scale, { x: 1, y: 1 }, 0.35, Ease.outBack), tween(banner, { alpha: 1 }, 0.2)]);
    await wait(1.1, 'ui');
    await Promise.all([tween(banner, { alpha: 0 }, 0.25), tween(banner.scale, { x: 0.8, y: 0.8 }, 0.25)]);
    banner.destroy({ children: true });
    if (this.state === 'play') this.board.inputEnabled = true;
  }

  /** Royal Match style level start popup: goals + optional pre-level boosters bought with coins. */
  private startPopup(): Promise<Kind[]> {
    return new Promise((resolve) => {
      const diff = this.def.diff ?? 'normal';
      const { root, panel, ph } = this.popup(`Seviye ${this.levelNo}`);
      let y = -ph * 0.3;
      if (diff !== 'normal') {
        const tag = new Graphics().roundRect(-125, -22, 250, 44, 22).fill({ color: DIFF_COLOR[diff] }).stroke({ width: 4, color: 0xd9a53c });
        tag.y = y;
        const tt = label(diff === 'hard' ? 'Zor Seviye' : 'Çok Zor Seviye', 28);
        tt.y = y - 2;
        panel.addChild(tag, tt);
      }
      y += ph * 0.09;
      const hl = label('Hedefler', 32, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      hl.y = y;
      panel.addChild(hl);
      y += ph * 0.1;
      const n = this.goals.length;
      this.goals.forEach((g, i) => {
        const ic = new Sprite(g.icon.texture);
        ic.anchor.set(0.5);
        ic.scale.set(70 / ic.texture.width);
        ic.position.set((i - (n - 1) / 2) * 112, y);
        const c = label(String(g.left), 30);
        c.position.set(ic.x + 28, y + 30);
        panel.addChild(ic, c);
      });
      y += ph * 0.13;
      const bl = label('Güçlendiriciler', 30, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      bl.y = y;
      bl.x = -60;
      const coinY = y;
      panel.addChild(bl);
      y += ph * 0.11;
      const s = getSave();
      const coinTxt = label(String(s.coins), 28, { fill: 0xffe066 });
      const opts: { kind: Kind; tex: string; cost: number }[] = [
        { kind: 'ah', tex: 'pw_arrow', cost: 60 },
        { kind: 'barrel', tex: 'pw_barrel', cost: 90 },
        { kind: 'orb', tex: 'pw_orb', cost: 150 },
      ];
      const chosen = new Set<number>();
      const spent = () => [...chosen].reduce((a, i) => a + opts[i].cost, 0);
      opts.forEach((o, i) => {
        const slot = new Container();
        slot.position.set((i - 1) * 140, y);
        const bg = new Graphics().roundRect(-55, -55, 110, 110, 24).fill({ color: 0x3b2210, alpha: 0.85 }).stroke({ width: 4, color: 0xc89a3c });
        const sel = new Graphics().roundRect(-58, -58, 116, 116, 26).stroke({ width: 7, color: 0x5fe05a });
        sel.visible = false;
        const ic = new Sprite(tex(o.tex));
        ic.anchor.set(0.5);
        ic.scale.set(82 / ic.texture.width);
        if (o.kind === 'ah') ic.rotation = -0.5;
        const price = new Container();
        const pc = new Sprite(tex('ic_coin'));
        pc.anchor.set(0.5);
        pc.scale.set(0.24);
        pc.x = -22;
        const pt = label(String(o.cost), 24, { fill: 0xffe066 });
        pt.x = 14;
        price.addChild(pc, pt);
        price.y = 74;
        slot.addChild(bg, sel, ic, price);
        slot.eventMode = 'static';
        slot.cursor = 'pointer';
        slot.on('pointertap', () => {
          if (chosen.has(i)) chosen.delete(i);
          else if (spent() + o.cost <= getSave().coins) chosen.add(i);
          else {
            sfx.invalid();
            return;
          }
          sfx.click();
          sel.visible = chosen.has(i);
          ic.scale.set((chosen.has(i) ? 92 : 82) / ic.texture.width);
          coinTxt.text = String(getSave().coins - spent());
        });
        panel.addChild(slot);
      });
      const coinRow = new Container();
      const ci = new Sprite(tex('ic_coin'));
      ci.anchor.set(0.5);
      ci.scale.set(0.34);
      ci.x = -34;
      coinTxt.x = 22;
      coinRow.addChild(ci, coinTxt);
      coinRow.position.set(150, coinY);
      panel.addChild(coinRow);
      const play = new Button('green', 280, 'Oyna', () => {
        const kinds = [...chosen].map((i) => opts[i].kind);
        getSave().coins -= spent();
        save();
        root.destroy({ children: true });
        resolve(kinds);
      }, 44);
      play.y = ph * 0.355;
      panel.addChild(play);
      const pw = (panel.children[0] as Sprite).width;
      const close = new Button('red', 80, 'X', () => this.app.showMenu(), 34);
      close.position.set(pw / 2 - 46, -ph / 2 + 150);
      panel.addChild(close);
    });
  }

  /** One-time explanation when a level introduces a new mechanic. */
  private mechanicTip(): Promise<void> {
    const tips: Record<number, { key: string; title: string; icons: string[]; text: string }> = {
      1: { key: 'tip_match', title: 'Nasıl Oynanır?', icons: ['tile_red', 'tile_red', 'tile_red'], text: 'Taşları kaydırarak aynı renkten\n3 veya daha fazlasını yan yana getir.\nHedefleri hamlelerin bitmeden topla!' },
      3: { key: 'tip_crate', title: 'Yeni: Tahta Sandık', icons: ['ob_crate1', 'ob_crate2'], text: 'Sandığın yanında eşleşme yap\nya da bir güçlendiriciyle vur.\nÇatlak sandık tek vuruşta kırılır.' },
      6: { key: 'tip_chain', title: 'Yeni: Zincir', icons: ['ob_chain'], text: 'Zincirli taş yer değiştiremez.\nOnu da içeren bir eşleşme yap\nya da güçlendiriciyle zinciri kır.' },
      7: { key: 'tip_stone', title: 'Yeni: Taş Blok', icons: ['ob_stone1', 'ob_stone2'], text: 'Taş bloklar sağlamdır,\nkırılmak için birkaç vuruş ister.' },
      8: { key: 'tip_vines', title: 'Yeni: Dikenli Sarmaşık', icons: ['ob_vines'], text: 'Sarmaşığın yanında eşleşme yap\nya da güçlendiriciyle temizle.' },
      13: { key: 'tip_purple', title: 'Yeni Renk!', icons: ['tile_purple'], text: 'Büyü kitabı tahtaya katıldı.\nArtık 5 renk var, eşleşmeler zorlaşıyor!' },
    };
    const tip = tips[this.levelNo];
    if (!tip || !firstTime(tip.key)) return Promise.resolve();
    return new Promise((resolve) => {
      const { root, panel, ph } = this.popup(tip.title);
      tip.icons.forEach((n, i) => {
        const ic = new Sprite(tex(n));
        ic.anchor.set(0.5);
        ic.scale.set(110 / ic.texture.width);
        ic.position.set((i - (tip.icons.length - 1) / 2) * 120, -ph * 0.17);
        panel.addChild(ic);
        ic.scale.set(0);
        tween(ic.scale, { x: 110 / ic.texture.width, y: 110 / ic.texture.width }, 0.4, Ease.outBack, 0.15 + i * 0.1);
      });
      const t = label(tip.text, 30, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      t.style.lineHeight = 42;
      t.y = ph * 0.06;
      panel.addChild(t);
      const ok = new Button('green', 280, 'Anladım', () => {
        root.destroy({ children: true });
        resolve();
      }, 40);
      ok.y = ph * 0.31;
      panel.addChild(ok);
    });
  }

  /** Non-blocking toast the first time each power-up is created. */
  private powerTip(kind: Kind) {
    const k = kind === 'av' ? 'ah' : kind;
    if (DEV.on || !firstTime('pw_' + k)) return;
    const info: Record<string, [string, string]> = {
      ah: ['pw_arrow', '4\'lü eşleşme: Ok! Dokun veya kaydır,\nbütün satırı/sütunu temizlesin.'],
      barrel: ['pw_barrel', 'L/T şekli: Barut Fıçısı!\nPatlayınca çevresini yok eder.'],
      falcon: ['pw_falcon', '2x2 kare: Şahin!\nHedeflere doğru uçup vurur.'],
      orb: ['pw_orb', '5\'li sıra: Kristal Küre!\nBir taşla değiştir, o rengi siler.'],
    };
    const [t, text] = info[k];
    const toast = new Container();
    const bg = new Graphics().roundRect(-320, -62, 640, 124, 26).fill({ color: 0x2a1408, alpha: 0.93 }).stroke({ width: 4, color: 0xd9a53c });
    const ic = new Sprite(tex(t));
    ic.anchor.set(0.5);
    ic.scale.set(96 / ic.texture.width);
    ic.x = -255;
    const tx = label(text, 27, { align: 'left' });
    tx.anchor.set(0, 0.5);
    tx.x = -195;
    toast.addChild(bg, ic, tx);
    toast.position.set(this.W / 2, this.board.y - 70);
    toast.alpha = 0;
    this.flyLayer.addChild(toast);
    tween(toast, { alpha: 1, y: toast.y + 20 }, 0.3, Ease.outBack).then(() =>
      tween(toast, { alpha: 0 }, 0.4, Ease.inQuad, 3.2).then(() => toast.destroy({ children: true })),
    );
  }

  private useMove() {
    this.moves = Math.max(0, this.moves - 1);
    this.movesTxt.text = String(this.moves);
    this.movesTxt.scale.set(1.3);
    tween(this.movesTxt.scale, { x: 1, y: 1 }, 0.25, Ease.outBack);
    this.movesTxt.style.fill = this.moves <= 5 ? 0xff7a6a : 0xffffff;
  }

  private collect(type: GoalType, gx: number, gy: number, texName: string) {
    const g = this.goals.find((q) => q.type === type && q.left > 0);
    if (!g) return;
    g.left--;
    const from = this.toLocal(new Point(gx, gy));
    const to = this.toLocal(g.icon.getGlobalPosition());
    const s = new Sprite(tex(texName));
    s.anchor.set(0.5);
    const base = this.board.S / s.texture.width;
    s.scale.set(base * 0.9);
    s.position.copyFrom(from);
    this.flyLayer.addChild(s);
    const mid = { x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 120, y: Math.min(from.y, to.y) - 60 };
    let k = 0;
    const dur = 0.55 + Math.random() * 0.12;
    const p0 = from.clone();
    const holder = { k: 0 };
    tween(holder, { k: 1 }, dur, Ease.inQuad, 0.05, () => {
      k = holder.k;
      s.x = (1 - k) * (1 - k) * p0.x + 2 * (1 - k) * k * mid.x + k * k * to.x;
      s.y = (1 - k) * (1 - k) * p0.y + 2 * (1 - k) * k * mid.y + k * k * to.y;
      const sc = base * (0.9 - 0.35 * k);
      s.scale.set(sc);
    }).then(() => {
      s.destroy();
      g.shown = Math.max(g.left, g.shown - 1);
      g.txt.text = String(g.shown);
      sfx.goal();
      killTweens(g.icon.scale);
      g.icon.scale.set(g.base * 1.22);
      tween(g.icon.scale, { x: g.base, y: g.base }, 0.2, Ease.outBack);
      if (g.shown === 0) {
        g.txt.visible = false;
        g.tick.visible = true;
        g.tick.scale.set(0);
        tween(g.tick.scale, { x: 1, y: 1 }, 0.35, Ease.outBack);
      }
    });
  }

  private goalsDone(): boolean {
    return this.goals.every((g) => g.left <= 0);
  }

  update(dt: number) {
    this.board.update(dt);
    if (this.praiseCooldown > 0) this.praiseCooldown -= dt;
    // praise for long cascades
    const cs = this.board.cascade;
    if (cs !== this.lastCascade) {
      this.lastCascade = cs;
      const words: Record<number, string> = { 4: 'Güzel!', 6: 'Harika!', 9: 'Muhteşem!', 13: 'İnanılmaz!' };
      if (words[cs] && this.praiseCooldown <= 0) {
        this.praise(words[cs]);
        this.praiseCooldown = 0.8;
      }
    }
    if (this.state !== 'play') return;
    if (this.goalsDone()) {
      this.state = 'won';
      this.board.inputEnabled = false;
      this.onWin();
    } else if (this.moves <= 0 && this.board.isStable()) {
      this.state = 'lost';
      this.board.inputEnabled = false;
      this.onOutOfMoves();
    }
  }

  private praise(word: string) {
    const t = label(word, 72, { fill: 0xffe066, stroke: 0x7a2e00, strokeW: 10 });
    t.position.set(this.W / 2, this.board.y + (this.board.H * this.board.S) / 2);
    t.scale.set(0.2);
    this.flyLayer.addChild(t);
    sfx.star();
    tween(t.scale, { x: 1, y: 1 }, 0.35, Ease.outBack).then(() =>
      tween(t, { alpha: 0, y: t.y - 80 }, 0.45, Ease.inQuad, 0.35).then(() => t.destroy()),
    );
  }

  private async waitStable() {
    while (!this.board.isStable()) await wait(0.05, 'ui');
  }

  private async onWin() {
    await this.waitStable();
    await wait(0.3, 'ui');
    sfx.win();
    // "Kral Bonusu": remaining moves become arrows
    const banner = label('Kraliyet Bonusu!', 64, { fill: 0xffe066, stroke: 0x7a2e00, strokeW: 10 });
    banner.position.set(this.W / 2, this.board.y + (this.board.H * this.board.S) / 2);
    banner.scale.set(0);
    this.flyLayer.addChild(banner);
    await tween(banner.scale, { x: 1, y: 1 }, 0.4, Ease.outBack);
    await wait(0.6, 'ui');
    await tween(banner, { alpha: 0 }, 0.3);
    banner.destroy();
    if (this.moves > 0) {
      const fromG = this.movesTxt.getGlobalPosition();
      await this.board.runBonus(this.moves, fromG, () => this.useMove());
    }
    await wait(0.4, 'ui');
    const s = getSave();
    const diff = this.def.diff ?? 'normal';
    const reward = (30 + Math.min(this.levelNo, 50) * 2) * (diff === 'superhard' ? 3 : diff === 'hard' ? 2 : 1);
    s.stars += 1;
    s.coins += reward;
    if (s.level <= this.levelNo) s.level = this.levelNo + 1;
    s.best = Math.max(s.best, this.levelNo);
    save();
    this.showWinPopup(reward);
  }

  private popup(title: string, h = 760): { root: Container; panel: Container; ph: number } {
    const root = new Container();
    root.addChild(overlay(this.W, this.H));
    const panel = new Container();
    const p = new Sprite(tex('ui_popup'));
    p.anchor.set(0.5);
    const pw = Math.min(620, this.W - 60);
    p.scale.set(pw / p.texture.width);
    const ph = p.height;
    panel.addChild(p);
    const t = label(title, 46, { fill: 0xfff2c8, stroke: 0x5a0a0a });
    t.y = -ph / 2 + ph * 0.073;
    panel.addChild(t);
    panel.position.set(this.W / 2, this.H / 2);
    root.addChild(panel);
    this.popupLayer.addChild(root);
    panel.scale.set(0.5);
    panel.alpha = 0;
    tween(panel.scale, { x: 1, y: 1 }, 0.35, Ease.outBack);
    tween(panel, { alpha: 1 }, 0.15);
    void h;
    return { root, panel, ph };
  }

  private showWinPopup(reward: number) {
    const { panel, ph } = this.popup('Tebrikler!');
    const star = new Sprite(tex('ui_star'));
    star.anchor.set(0.5);
    star.scale.set(0);
    star.y = -ph * 0.17;
    const glow = new Sprite(tex('p_glow'));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = 0xffd060;
    glow.scale.set(3.2);
    glow.y = star.y;
    glow.alpha = 0;
    panel.addChild(glow, star);
    tween(star.scale, { x: 0.95, y: 0.95 }, 0.5, Ease.outBack, 0.25).then(() => sfx.star());
    tween(glow, { alpha: 0.8 }, 0.5, Ease.outQuad, 0.25);
    const txt = label(`Seviye ${this.levelNo} tamamlandı`, 34, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    txt.y = ph * 0.06;
    panel.addChild(txt);
    const coin = new Sprite(tex('ic_coin'));
    coin.anchor.set(0.5);
    coin.scale.set(0.62);
    coin.position.set(-50, ph * 0.17);
    const ct = label(`+${reward}`, 44, { fill: 0xffe066 });
    ct.position.set(30, ph * 0.17);
    panel.addChild(coin, ct);
    after(0.6, () => sfx.coin());
    const b = new Button('green', 280, 'Devam', () => this.app.showMenu());
    b.y = ph * 0.33;
    panel.addChild(b);
  }

  private onOutOfMoves() {
    sfx.lose();
    const { root, panel, ph } = this.popup('Hamle Bitti!');
    const t = label('Biraz daha hamle ister misin?', 30, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    t.y = -ph * 0.25;
    panel.addChild(t);
    const left = this.goals.filter((g) => g.left > 0);
    left.forEach((g, i) => {
      const ic = new Sprite(g.icon.texture);
      ic.anchor.set(0.5);
      ic.scale.set(78 / ic.texture.width);
      ic.position.set((i - (left.length - 1) / 2) * 120, -ph * 0.1);
      const c = label(String(g.left), 36);
      c.position.set(ic.x + 30, ic.y + 34);
      panel.addChild(ic, c);
    });
    const cost = 150;
    const s = getSave();
    const coinRow = new Container();
    const coinIc = new Sprite(tex('ic_coin'));
    coinIc.anchor.set(0.5);
    coinIc.scale.set(0.42);
    coinIc.x = -40;
    const have = label(`${s.coins}`, 32, { fill: 0xffe066 });
    have.x = 20;
    coinRow.addChild(coinIc, have);
    coinRow.y = ph * 0.02;
    panel.addChild(coinRow);
    const more = new Button('green', 290, `+5 Hamle  (${cost})`, () => {
      if (getSave().coins < cost) return;
      getSave().coins -= cost;
      save();
      sfx.coin();
      root.destroy({ children: true });
      this.moves += 5;
      this.movesTxt.text = String(this.moves);
      this.movesTxt.style.fill = 0xffffff;
      this.state = 'play';
      this.board.inputEnabled = true;
    }, 30);
    more.y = ph * 0.15;
    if (s.coins < cost) {
      more.enabled = false;
      more.alpha = 0.5;
    }
    const quit = new Button('red', 260, 'Pes Et', () => this.app.showMenu(), 34);
    quit.y = ph * 0.32;
    panel.addChild(more, quit);
  }

  private openPause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.board.inputEnabled = false;
    const { root, panel, ph } = this.popup('Duraklatıldı');
    const s = getSave();
    const close = () => {
      root.destroy({ children: true });
      this.state = 'play';
      this.board.inputEnabled = true;
    };
    const mk = (y: number, text: () => string, fn: () => void, kind: 'green' | 'red' = 'green') => {
      const b: Button = new Button(kind, 280, text(), () => {
        fn();
        panel.removeChild(b);
        b.destroy({ children: true });
        const nb = mk(y, text, fn, kind);
        panel.addChild(nb);
      }, 32);
      b.y = y;
      return b;
    };
    panel.addChild(
      mk(-ph * 0.22, () => `Ses: ${s.sound ? 'Açık' : 'Kapalı'}`, () => { s.sound = !s.sound; save(); }),
      mk(-ph * 0.045, () => `Müzik: ${s.music ? 'Açık' : 'Kapalı'}`, () => { s.music = !s.music; save(); updateMusic(); }),
    );
    const resume = new Button('green', 280, 'Devam Et', close, 34);
    resume.y = ph * 0.13;
    const quit = new Button('red', 280, 'Ana Menü', () => this.app.showMenu(), 34);
    quit.y = ph * 0.305;
    panel.addChild(resume, quit);
  }

  destroyScene() {
    clearTimers('ui');
    this.board.destroyBoard();
    this.destroy({ children: true });
  }
}

