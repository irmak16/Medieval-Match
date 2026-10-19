import { Container, Graphics, NineSliceSprite, Point, Sprite, Text } from 'pixi.js';
import { Board, Kind, BoosterKind } from '../game/board';
import { trackQuest, addRoadPoints, streakBonus, addCupPoints, loseLife } from '../liveops';
import { addPacks } from '../album';
import { Pip, hasPip } from '../mascot';
import { FX } from '../fx';
import { getLevel, GoalType, LevelDef } from '../levels';
import { tex, hasTex, texOr, iceTex } from '../assets';
const gtex = (n: string) => (n === '__ice' ? iceTex(2) : tex(n));
import { label, woodPanel, Button, iconButton, overlay } from '../ui';
import { tween, Ease, wait, clearTimers, after, killTweens, fadeUpAndDestroy } from '../tween';
import { sfx, updateMusic, setMusicIntensity } from '../audio';
import { getSave, save, DEV, firstTime } from '../storage';
import type { App } from '../main';

const GOAL_TEX: Record<GoalType, string> = {
  red: 'tile_red', blue: 'tile_blue', green: 'tile_green', yellow: 'tile_yellow', purple: 'tile_purple',
  crate: 'ob_crate1', stone: 'ob_stone1', chain: 'ob_chain', vines: 'ob_vines', gold: 'ic_coin', ice: '__ice',
};

const BOOSTERS: { k: BoosterKind; tex: string; fallback: string; rot: number; name: string; price: number; hint: string }[] = [
  { k: 'hammer', tex: 'bt_hammer', fallback: 'ob_stone2', rot: 0, name: 'Çekiç', price: 90, hint: 'Bir hücreye dokun: tek vuruşta kırar' },
  { k: 'row', tex: 'bt_row', fallback: 'pw_arrow', rot: 0, name: 'Okçu', price: 120, hint: 'Bir hücreye dokun: o satırı temizler' },
  { k: 'col', tex: 'bt_col', fallback: 'pw_arrow', rot: -Math.PI / 2, name: 'Mancınık', price: 120, hint: 'Bir hücreye dokun: o sütunu temizler' },
  { k: 'shuffle', tex: 'bt_shuffle', fallback: 'pw_orb', rot: 0, name: 'Soytarı', price: 70, hint: '' },
];

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
  private playfield = new Container();
  private timeScale = 1;
  private hitStop = 0;
  private comboTxt!: Text;
  private comboTimer = 0;
  private lowMoves = false;
  private boosterBtns: { k: BoosterKind; node: Container; badge: Text; ring: Graphics }[] = [];
  private boosterHint: Container | null = null;
  private uiFx!: FX;
  private uiFxLayer = new Container();
  private uiFxAdd = new Container();
  private pips: Pip[] = [];
  private scaredShown = false;

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
      const onlyGrow = gd.type === 'vines' && this.def.grid.some((r) => r.includes('g')) && !this.def.grid.some((r) => r.includes('v'));
      const icon = new Sprite(
        gd.type === 'gold' ? texOr('it_chest', 'ic_coin') : onlyGrow ? texOr('ob_vines_grow', 'ob_vines') : gtex(GOAL_TEX[gd.type]),
      );
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
    const bottomReserve = 150;
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
      impact: (lvl) => this.impact(lvl),
      stat: (key, n) => trackQuest(key, n ?? 1),
      goalAdded: (type) => {
        const g = this.goals.find((q) => q.type === type);
        if (!g) return;
        g.left++;
        g.shown++;
        g.txt.visible = true;
        g.tick.visible = false;
        g.txt.text = String(g.shown);
      },
    });
    this.board.position.set(bx, by);
    this.boardHolder.addChild(this.board);
    const cx = bx + bw / 2, cy = by + bh / 2;
    this.playfield.pivot.set(cx, cy);
    this.playfield.position.set(cx, cy);
    this.playfield.addChild(this.boardHolder, frame);
    this.addChild(this.playfield);

    // combo counter (shows during long cascades)
    this.comboTxt = label('', 40, { fill: 0xffe066, stroke: 0x7a2e00, strokeW: 8 });
    this.comboTxt.position.set(W / 2, by - 42);
    this.comboTxt.alpha = 0;

    // ---------------- bottom bar: pause + in-game boosters
    const barY = Math.min(H - 70, by + bh + 92);
    const gear = iconButton('ic_gear', 88, () => this.openPause());
    gear.position.set(64, barY);
    this.addChild(gear, this.comboTxt);
    BOOSTERS.forEach((b, i) => {
      const node = new Container();
      node.position.set(200 + i * 130, barY);
      const ring = new Graphics().circle(0, 0, 54).stroke({ width: 7, color: 0x5fe05a });
      ring.visible = false;
      const bg = new Graphics().circle(0, 0, 48).fill({ color: 0x2a1408, alpha: 0.88 }).stroke({ width: 4, color: 0xd9a53c });
      const ic = new Sprite(texOr(b.tex, b.fallback));
      ic.anchor.set(0.5);
      ic.scale.set(76 / ic.texture.width);
      ic.rotation = hasTex(b.tex) ? 0 : b.rot;
      const badge = label('', 22);
      badge.position.set(34, 32);
      const badgeBg = new Graphics().circle(34, 32, 19).fill({ color: 0x8e1d1d }).stroke({ width: 3, color: 0xffffff });
      node.addChild(ring, bg, ic, badgeBg, badge);
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', () => this.tapBooster(b.k));
      this.addChild(node);
      this.boosterBtns.push({ k: b.k, node, badge, ring });
    });
    this.refreshBoosters();
    this.board.onBoosterUsed = (k) => this.boosterConsumed(k);

    this.addChild(this.flyLayer, this.popupLayer, this.uiFxLayer, this.uiFxAdd);
    this.uiFx = new FX(this.uiFxLayer, this.uiFxAdd, 80);
    this.dropIn();
    this.intro();
  }

  private countInGrid(type: GoalType): number {
    const chars = type === 'crate' ? '123' : type === 'stone' ? '456' : type === 'vines' ? 'vg' : type === 'chain' ? 'c' : type === 'gold' ? 'T' : '';
    if (type === 'ice') {
      let k = 0;
      for (const row of this.def.grid) for (const ch of row) k += ch === 'i' || ch === 'I' ? 1 : 0;
      return k;
    }
    let n = type === 'gold' ? this.def.items ?? 0 : 0;
    for (const row of this.def.grid) for (const ch of row) if (chars.includes(ch)) n++;
    return n;
  }

  private async intro() {
    this.board.inputEnabled = false;
    if (!DEV.on) {
      const boosters = await this.startPopup();
      await this.mechanicTip();
      if (this.state === 'play') this.board.inputEnabled = true;
      const all = [...boosters, ...streakBonus()];
      if (all.length) this.board.addStartBoosters(all);
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
      const sb = streakBonus();
      if (sb.length) {
        const st = label(`Seri bonusu (${getSave().streak} galibiyet): +${sb.length} hediye güçlendirici!`, 22, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
        st.y = y + ph * 0.115;
        panel.addChild(st);
      }
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
      31: { key: 'tip_gold', title: 'Yeni: Kraliyet Hazinesi', icons: [hasTex('it_chest') ? 'it_chest' : 'ic_coin'], text: 'Hazineyi eşleşmelerle aşağı indir.\nTahtanın en altına ulaşınca toplanır!' },
      32: { key: 'tip_portal', title: 'Yeni: Büyülü Geçit', icons: ['p_ring'], text: 'Bir geçidin altına düşen taşlar\ndiğer geçitten çıkar.' },
      41: { key: 'tip_ice', title: 'Yeni: Buz', icons: ['__ice'], text: 'Buzun üstündeki taşı patlat,\nbuz kırılsın. Kalın buz iki vuruş ister.' },
      33: { key: 'tip_grow', title: 'Yeni: Büyüyen Sarmaşık', icons: ['ob_vines'], text: 'Bir hamlede hiç sarmaşık kırmazsan\nsarmaşık yanındaki taşa yayılır!' },
    };
    const tip = tips[this.levelNo];
    if (!tip || !firstTime(tip.key)) return Promise.resolve();
    return new Promise((resolve) => {
      const { root, panel, ph } = this.popup(tip.title);
      tip.icons.forEach((n, i) => {
        const ic = new Sprite(gtex(n));
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

  /** Tiles rain into the board in a wave at level start (they really fall, with the board's gravity). */
  private dropIn() {
    const b = this.board;
    for (const t of b.tiles) {
      t.y = t.r - (b.H + 1) - t.c * 0.45;
      t.vy = 0;
      t.state = 'fall';
    }
  }

  /** Pip peeks in from the side of the screen with a pose (if the mascot art exists). */
  private peekPip(pose: 'happy' | 'sad' | 'scared', parent: Container, x: number, y: number, size: number): Pip | null {
    if (!hasPip(pose)) return null;
    const p = new Pip(pose, size);
    p.position.set(x, y);
    parent.addChild(p);
    p.popIn();
    this.pips.push(p);
    return p;
  }

  private useMove() {
    this.moves = Math.max(0, this.moves - 1);
    this.movesTxt.text = String(this.moves);
    this.movesTxt.scale.set(1.3);
    tween(this.movesTxt.scale, { x: 1, y: 1 }, 0.25, Ease.outBack);
    this.movesTxt.style.fill = this.moves <= 5 ? 0xff7a6a : 0xffffff;
    if (this.moves <= 5 && this.moves > 0 && this.state === 'play') {
      // tension: shake the counter, speed up the music, one-time banner
      const x0 = this.W - 24 - 92;
      tween(this.movesNode, { x: x0 + 8 }, 0.05).then(() => tween(this.movesNode, { x: x0 }, 0.3, Ease.outElastic));
      if (!this.lowMoves && !this.goalsDone()) {
        this.lowMoves = true;
        setMusicIntensity(true);
        this.praise('Son 5 hamle!', 0xff8a7a);
        if (!this.scaredShown) {
          this.scaredShown = true;
          const p = this.peekPip('scared', this.flyLayer, this.W - 70, this.H - 10, 170);
          if (p) after(2.2, () => tween(p, { y: this.H + 200 }, 0.4, Ease.inBack).then(() => p.destroy()), 'ui');
        }
      }
    }
  }

  /** Hit-stop + small camera punch for big moments. */
  private impact(level: number) {
    this.hitStop = 0.035 + level * 0.03;
    this.timeScale = 0.08;
    killTweens(this.playfield.scale);
    const z = 1 + 0.012 * level;
    this.playfield.scale.set(z);
    tween(this.playfield.scale, { x: 1, y: 1 }, 0.35 + level * 0.1, Ease.outCubic);
  }

  private refreshBoosters() {
    const inv = getSave().inv;
    for (const b of this.boosterBtns) {
      const n = inv[b.k];
      b.badge.text = n > 0 ? String(n) : '+';
      b.ring.visible = this.board?.pendingBooster === b.k;
    }
  }

  private tapBooster(k: BoosterKind) {
    if (this.state !== 'play' || !this.board.inputEnabled) return;
    sfx.click();
    const info = BOOSTERS.find((b) => b.k === k)!;
    const s = getSave();
    if (this.board.pendingBooster === k) {
      this.board.pendingBooster = null;
      this.showBoosterHint(null);
      this.refreshBoosters();
      return;
    }
    if (s.inv[k] <= 0) {
      if (s.coins < info.price) {
        sfx.invalid();
        this.praise(`${info.price} altın gerekli`, 0xff8a7a);
        return;
      }
      s.coins -= info.price;
      s.inv[k] += 1;
      save();
      sfx.coin();
    }
    if (k === 'shuffle') {
      if (!this.board.isStable()) return;
      this.board.useBooster('shuffle', 0, 0);
      this.boosterConsumed('shuffle');
      return;
    }
    this.board.pendingBooster = k;
    this.showBoosterHint(info.hint);
    this.refreshBoosters();
  }

  private boosterConsumed(k: BoosterKind) {
    const s = getSave();
    s.inv[k] = Math.max(0, s.inv[k] - 1);
    save();
    trackQuest('booster');
    this.showBoosterHint(null);
    this.refreshBoosters();
  }

  private showBoosterHint(text: string | null) {
    this.boosterHint?.destroy({ children: true });
    this.boosterHint = null;
    if (!text) return;
    const c = new Container();
    const bg = new Graphics().roundRect(-300, -34, 600, 68, 34).fill({ color: 0x2a1408, alpha: 0.92 }).stroke({ width: 4, color: 0x5fe05a });
    const t = label(text, 26);
    c.addChild(bg, t);
    c.position.set(this.W / 2, this.board.y - 42);
    this.flyLayer.addChild(c);
    this.boosterHint = c;
  }

  private collect(type: GoalType, gx: number, gy: number, texName: string) {
    const g = this.goals.find((q) => q.type === type && q.left > 0);
    if (!g) return;
    g.left--;
    const from = this.toLocal(new Point(gx, gy));
    const to = this.toLocal(g.icon.getGlobalPosition());
    const s = new Sprite(gtex(texName));
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
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      if (this.hitStop <= 0) this.timeScale = 1;
    }
    this.board.update(dt * this.timeScale);
    this.uiFx.update(dt);
    for (const p of this.pips) if (!p.destroyed) p.update(dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) tween(this.comboTxt, { alpha: 0 }, 0.3);
    }
    if (this.praiseCooldown > 0) this.praiseCooldown -= dt;
    // praise for long cascades
    const cs = this.board.cascade;
    if (cs !== this.lastCascade) {
      this.lastCascade = cs;
      if (cs >= 2) {
        this.comboTxt.text = `Kombo x${cs}`;
        killTweens(this.comboTxt);
        killTweens(this.comboTxt.scale);
        this.comboTxt.alpha = 1;
        this.comboTxt.scale.set(1.35);
        tween(this.comboTxt.scale, { x: 1, y: 1 }, 0.25, Ease.outBack);
        this.comboTimer = 0.9;
      }
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

  private praise(word: string, fill = 0xffe066) {
    const t = label(word, 72, { fill, stroke: 0x7a2e00, strokeW: 10 });
    t.position.set(this.W / 2, this.board.y + (this.board.H * this.board.S) / 2);
    t.scale.set(0.2);
    this.flyLayer.addChild(t);
    sfx.star();
    tween(t.scale, { x: 1, y: 1 }, 0.35, Ease.outBack).then(() => fadeUpAndDestroy(t, 80, 0.45, 0.35));
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
    s.streak += 1;
    trackQuest('win');
    const pts = diff === 'superhard' ? 3 : diff === 'hard' ? 2 : 1;
    addRoadPoints(pts);
    addCupPoints(pts);
    const packChance = diff === 'superhard' ? 1 : diff === 'hard' ? 0.6 : 0.25;
    const gotPack = Math.random() < packChance;
    if (gotPack) addPacks(1);
    save();
    this.uiFx.confetti(this.W / 2, -20, this.W, 120);
    this.showWinPopup(reward, gotPack);
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

  private showWinPopup(reward: number, gotPack = false) {
    const { panel, ph } = this.popup('Tebrikler!');
    this.peekPip('happy', panel, -ph * 0.36, ph * 0.08, 200);
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
    const ct = label('+0', 44, { fill: 0xffe066 });
    ct.position.set(30, ph * 0.17);
    panel.addChild(coin, ct);
    const roll = { v: 0 };
    tween(roll, { v: reward }, 0.9, Ease.outCubic, 0.5, () => {
      ct.text = `+${Math.round(roll.v)}`;
    });
    after(0.5, () => {
      const g = coin.getGlobalPosition();
      const l = this.toLocal(g);
      this.uiFx.sparkleBurst(l.x, l.y, 18, 0xffe070, 5);
    }, 'ui');
    if (gotPack) {
      const pk = label('+1 kart paketi!', 26, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
      pk.y = ph * 0.245;
      panel.addChild(pk);
    }
    after(0.6, () => sfx.coin());
    const b = new Button('green', 280, 'Devam', () => this.app.showMenu());
    b.y = ph * 0.33;
    panel.addChild(b);
  }

  private onOutOfMoves() {
    sfx.lose();
    const { root, panel, ph } = this.popup('Hamle Bitti!');
    this.peekPip('sad', panel, -ph * 0.36, ph * 0.1, 170);
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
    const quit = new Button('red', 260, 'Pes Et', () => {
      getSave().streak = 0;
      loseLife();
      save();
      this.app.showMenu();
    }, 34);
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
    const quit = new Button('red', 280, 'Ana Menü', () => {
      if (this.moves < this.def.moves) {
        getSave().streak = 0; // leaving a started level breaks the streak
        loseLife();
        save();
      }
      this.app.showMenu();
    }, 34);
    quit.y = ph * 0.305;
    panel.addChild(resume, quit);
  }

  destroyScene() {
    clearTimers('ui');
    this.uiFx.clear();
    setMusicIntensity(false);
    this.board.destroyBoard();
    this.destroy({ children: true });
  }
}

