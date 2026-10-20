import { Container, Graphics, Sprite, Rectangle, FederatedPointerEvent, Point } from 'pixi.js';
import { tex, hasTex, COLOR_TEX, COLOR_TINT, iceTex, cauldronTex, symbolTex } from '../assets';
import { FX } from '../fx';
import { tween, Ease, after, pendingTimers, clearTimers, killTweens } from '../tween';
import { sfx } from '../audio';
import { LevelDef, GoalType, COLOR_GOALS } from '../levels';

export type Kind = 'c' | 'ah' | 'av' | 'barrel' | 'falcon' | 'orb' | 'gold';
export type BoosterKind = 'hammer' | 'row' | 'col' | 'shuffle';
type TState = 'idle' | 'fall' | 'swap' | 'spawn';
type BlockType = 'crate' | 'stone' | 'vines' | 'cauldron';

const G = 58; // gravity in cells/s^2
const VMAX = 17; // max fall speed in cells/s
const V0 = 4.5; // initial fall speed
const SWAP_T = 0.12;
const ARROW_SPEED = 24; // cells/s

let NEXT_ID = 1;

export class Tile {
  id = NEXT_ID++;
  r = 0; c = 0; x = 0; y = 0; vy = 0;
  state: TState = 'idle';
  stamp = 0; // last time this tile was moved by the player / landed (for power-up placement)
  view = new Container();
  spr: Sprite;
  sym: Sprite | null = null;
  glow: Sprite | null = null;
  phase = Math.random() * 10;
  hinted = false;
  constructor(public kind: Kind, public color: number) {
    this.spr = new Sprite();
    this.spr.anchor.set(0.5);
    this.view.addChild(this.spr);
  }
  get isPower(): boolean {
    return this.kind !== 'c' && this.kind !== 'gold';
  }
  get isItem(): boolean {
    return this.kind === 'gold';
  }
}

interface Blocker { type: BlockType; hp: number; spr: Sprite; grow?: boolean; color?: number; badge?: Sprite }
interface Cell { ok: boolean; blocker: Blocker | null; chain: Sprite | null; tile: Tile | null; ice: { hp: number; spr: Sprite } | null }

interface Projectile { update(dt: number): boolean } // returns false when finished

export interface BoardHooks {
  canMove(): boolean;
  useMove(): void;
  collect(type: GoalType, gx: number, gy: number, texture: string): void;
  wantsGoal(type: GoalType): boolean;
  powerCreated?(kind: Kind): void;
  /** Big moments (1 = small blast … 3 = board wipe) for hit-stop / camera zoom. */
  impact?(level: number): void;
  /** Statistics for daily quests: 'tile', 'power', 'crate', 'stone', 'vines', 'chain', 'gold'. */
  stat?(key: string, n?: number): void;
  /** A goal grew (spreading vines). */
  goalAdded?(type: GoalType): void;
}

interface Group { cells: Tile[]; power: Kind | null; anchor: Tile }

const rnd = (n: number) => Math.floor(Math.random() * n);

export class Board extends Container {
  W: number; H: number;
  S: number; // cell size in px
  grid: Cell[][] = [];
  tiles = new Set<Tile>();
  colors: number;
  fx: FX;
  stamp = 0;
  cascade = 0;
  inputEnabled = true;
  private bgLayer = new Container();
  private tileLayer = new Container();
  private blockLayer = new Container();
  private chainLayer = new Container();
  private iceLayer = new Container();
  private fxLayer = new Container();
  private fxAdd = new Container();
  private projLayer = new Container();
  private projectiles: Projectile[] = [];
  private busy = 0; // count of running scripted effects
  private drag: { r: number; c: number; x: number; y: number; moved: boolean } | null = null;
  private idleTime = 0;
  private hintTiles: Tile[] = [];
  private falconTargets = new Set<string>();
  private shuffling = false;
  private time = 0;
  private changed = false;
  private moveActive = false; // a player move is resolving
  private vinesBroken = false;
  private itemsLeft = 0; // collectible items still to spawn
  private portals: { from: [number, number]; to: [number, number] }[] = [];
  private bias = 0; // spawn bias: >0 helps the player, <0 hinders (sawtooth difficulty)
  private belts: { row: number; dir: number; arrows: Container }[] = [];
  /** colour-blind mode: draw a small shape on every tile */
  static symbols = false;
  pendingBooster: BoosterKind | null = null;
  onBoosterUsed: ((k: BoosterKind) => void) | null = null;

  constructor(public def: LevelDef, size: number, public hooks: BoardHooks) {
    super();
    this.H = def.grid.length;
    this.W = def.grid[0].length;
    this.S = size;
    this.colors = def.colors;
    const S = size;
    this.fx = new FX(this.fxLayer, this.fxAdd, S);

    // --- cells
    for (let r = 0; r < this.H; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < this.W; c++) row.push({ ok: def.grid[r][c] !== 'x', blocker: null, chain: null, tile: null, ice: null });
      this.grid.push(row);
    }

    this.addChild(this.bgLayer, this.iceLayer, this.tileLayer, this.blockLayer, this.chainLayer, this.fxLayer, this.fxAdd, this.projLayer);
    this.drawBackground();

    // tile mask: only playable cells
    const mask = new Graphics();
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) if (this.grid[r][c].ok) mask.rect(c * S - 1, r * S - 1, S + 2, S + 2);
    mask.fill(0xffffff);
    this.addChild(mask);
    this.tileLayer.mask = mask;

    // --- contents
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) {
        const ch = def.grid[r][c];
        const cell = this.grid[r][c];
        if (!cell.ok) continue;
        if ('123'.includes(ch)) this.addBlocker(r, c, 'crate', +ch);
        else if ('456'.includes(ch)) this.addBlocker(r, c, 'stone', +ch - 3);
        else if (ch === 'v') this.addBlocker(r, c, 'vines', 1);
        else if (ch === 'g') this.addBlocker(r, c, 'vines', 1, true);
        else if (ch === 'K') this.addBlocker(r, c, 'cauldron', 4);
        else if ('7890'.includes(ch)) this.addBlocker(r, c, 'crate', 1, false, '7890'.indexOf(ch));
        else {
          let kind: Kind = 'c';
          if (ch === 'H') kind = 'ah';
          else if (ch === 'V') kind = 'av';
          else if (ch === 'B') kind = 'barrel';
          else if (ch === 'F') kind = 'falcon';
          else if (ch === 'O') kind = 'orb';
          else if (ch === 'T') kind = 'gold';
          if (ch === 'i' || ch === 'I') this.addIce(r, c, ch === 'I' ? 2 : 1);
          const t = this.makeTile(kind, kind === 'c' ? this.safeColor(r, c) : -1);
          this.place(t, r, c);
          t.y = r;
          t.x = c;
          if (ch === 'c') this.addChain(r, c);
        }
      }
    this.ensureMoves(true);
    for (const t of this.tiles) this.syncView(t);
    this.itemsLeft = def.items ?? 0;
    this.bias = def.diff === 'superhard' ? -0.5 : def.diff === 'hard' ? -0.35 : 0.12;
    for (const pr of def.portals ?? []) {
      this.portals.push({ from: [pr[0], pr[1]], to: [pr[2], pr[3]] });
      this.drawPortal(pr[0] + 1, pr[1], 0xb070ff); // entrance: bottom edge of the cell
      this.drawPortal(pr[2], pr[3], 0x70d0ff); // exit: top edge of the cell
    }
    for (const [row, dir] of def.belts ?? []) this.addBelt(row, dir);

    // --- input
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, this.W * S, this.H * S);
    this.on('pointerdown', this.onDown, this);
    this.on('globalpointermove', this.onMove, this);
    this.on('pointerup', this.onUp, this);
    this.on('pointerupoutside', this.onUp, this);
  }

  // ======================================================================= setup helpers
  private drawBackground() {
    const S = this.S;
    const g = new Graphics();
    // soft shadow + base plate behind playable cells
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) {
        if (!this.grid[r][c].ok) continue;
        g.roundRect(c * S - 3, r * S - 3, S + 6, S + 6, S * 0.16).fill({ color: 0x2a1608, alpha: 0.55 });
      }
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) {
        if (!this.grid[r][c].ok) continue;
        const light = (r + c) % 2 === 0;
        g.roundRect(c * S + 1.5, r * S + 1.5, S - 3, S - 3, S * 0.13).fill({ color: light ? 0xf3dfb4 : 0xe5cb98, alpha: 0.93 });
        g.roundRect(c * S + 1.5, r * S + S * 0.55, S - 3, S * 0.45 - 1.5, S * 0.13).fill({ color: 0xc9a46a, alpha: 0.18 });
      }
    this.bgLayer.addChild(g);
  }

  private makeTile(kind: Kind, color: number): Tile {
    const t = new Tile(kind, color);
    this.setKind(t, kind, color);
    this.tileLayer.addChild(t.view);
    this.tiles.add(t);
    return t;
  }

  private setKind(t: Tile, kind: Kind, color: number) {
    t.kind = kind;
    t.color = color;
    const S = this.S;
    let name = 'tile_red';
    if (kind === 'c') name = COLOR_TEX[color];
    else if (kind === 'ah' || kind === 'av') name = 'pw_arrow';
    else if (kind === 'barrel') name = 'pw_barrel';
    else if (kind === 'falcon') name = 'pw_falcon';
    else if (kind === 'orb') name = 'pw_orb';
    else if (kind === 'gold') name = hasTex('it_chest') ? 'it_chest' : 'ic_coin';
    t.spr.texture = tex(name);
    const scale = kind === 'c' ? 0.9 : kind === 'falcon' ? 1.04 : kind === 'gold' ? 0.84 : 0.98;
    t.spr.scale.set((S * scale) / t.spr.texture.width);
    t.spr.rotation = kind === 'av' ? -Math.PI / 2 : 0;
    t.spr.position.set(0, 0);
    if (Board.symbols && kind === 'c') {
      if (!t.sym) {
        t.sym = new Sprite();
        t.sym.anchor.set(0.5);
        t.view.addChild(t.sym);
      }
      t.sym.texture = symbolTex(color);
      t.sym.scale.set((S * 0.36) / 64);
      t.sym.position.set(S * 0.26, S * 0.26);
    } else if (t.sym) {
      t.sym.destroy();
      t.sym = null;
    }
    if (t.isPower && !t.glow) {
      t.glow = new Sprite(tex('p_glow'));
      t.glow.anchor.set(0.5);
      t.glow.blendMode = 'add';
      t.glow.tint = 0xffd77a;
      t.glow.scale.set((S * 1.15) / 128);
      t.glow.alpha = 0.55;
      t.view.addChildAt(t.glow, 0);
    } else if (!t.isPower && t.glow) {
      t.glow.destroy();
      t.glow = null;
    }
  }

  private safeColor(r: number, c: number): number {
    const bad = new Set<number>();
    const col = (rr: number, cc: number) => {
      const t = this.cell(rr, cc)?.tile;
      return t && t.kind === 'c' ? t.color : -2;
    };
    if (col(r, c - 1) === col(r, c - 2) && col(r, c - 1) >= 0) bad.add(col(r, c - 1));
    if (col(r - 1, c) === col(r - 2, c) && col(r - 1, c) >= 0) bad.add(col(r - 1, c));
    // avoid 2x2 squares too
    if (col(r - 1, c) >= 0 && col(r - 1, c) === col(r, c - 1) && col(r, c - 1) === col(r - 1, c - 1)) bad.add(col(r, c - 1));
    const opts = [...Array(this.colors).keys()].filter((k) => !bad.has(k));
    return opts[rnd(opts.length)];
  }

  private addBlocker(r: number, c: number, type: BlockType, hp: number, grow = false, color?: number) {
    const spr = new Sprite();
    spr.anchor.set(0.5);
    spr.position.set((c + 0.5) * this.S, (r + 0.5) * this.S);
    this.blockLayer.addChild(spr);
    const b: Blocker = { type, hp, spr, grow, color };
    if (color !== undefined) {
      // the colour gem nailed onto the crate
      const badge = new Sprite(tex(COLOR_TEX[color]));
      badge.anchor.set(0.5);
      badge.scale.set((this.S * 0.46) / badge.texture.width);
      spr.addChild(badge);
      b.badge = badge;
    }
    this.grid[r][c].blocker = b;
    this.styleBlocker(b);
  }

  private styleBlocker(b: Blocker) {
    let name = 'ob_vines', tint = 0xffffff;
    if (b.type === 'crate') {
      name = b.hp >= 2 ? 'ob_crate1' : 'ob_crate2';
      if (b.hp >= 3) tint = 0xb98a6c;
    } else if (b.type === 'stone') {
      name = b.hp >= 2 ? 'ob_stone1' : 'ob_stone2';
      if (b.hp >= 3) tint = 0x9aa3b8;
    }
    if (b.grow) {
      name = hasTex('ob_vines_grow') ? 'ob_vines_grow' : 'ob_vines';
      if (name === 'ob_vines') tint = 0xc8ff8a;
    }
    if (b.type === 'cauldron') {
      b.spr.texture = cauldronTex(4 - b.hp);
      b.spr.tint = 0xffffff;
      b.spr.scale.set((this.S * 0.98) / 128);
      return;
    }
    if (b.color !== undefined) name = 'ob_crate1'; // (children inherit tint, so the wood stays natural)
    b.spr.texture = tex(name);
    b.spr.tint = tint;
    b.spr.scale.set((this.S * 0.98) / b.spr.texture.width);
    if (b.badge) b.badge.scale.set((this.S * 0.46) / b.badge.texture.width / b.spr.scale.x);
  }

  private addIce(r: number, c: number, hp: number) {
    const spr = new Sprite(iceTex(hp));
    spr.anchor.set(0.5);
    spr.scale.set(this.S / 128);
    spr.position.set((c + 0.5) * this.S, (r + 0.5) * this.S);
    this.iceLayer.addChild(spr);
    this.grid[r][c].ice = { hp, spr };
  }

  /** Ice under a cell cracks whenever the tile on it is cleared (or the cell is blasted). */
  private crackIce(r: number, c: number) {
    const cl = this.cell(r, c);
    const ice = cl?.ice;
    if (!cl || !ice) return;
    ice.hp--;
    this.changed = true;
    sfx.ice();
    const x = (c + 0.5) * this.S, y = (r + 0.5) * this.S;
    this.fx.iceShards(x, y);
    if (ice.hp > 0) {
      ice.spr.texture = iceTex(ice.hp);
      return;
    }
    cl.ice = null;
    this.hooks.stat?.('ice');
    if (this.hooks.wantsGoal('ice')) {
      const g = this.toGlobal(new Point(x, y));
      this.hooks.collect('ice', g.x, g.y, '__ice');
    }
    const sp = ice.spr;
    tween(sp.scale, { x: sp.scale.x * 1.2, y: sp.scale.y * 1.2 }, 0.15);
    tween(sp, { alpha: 0 }, 0.15).then(() => sp.destroy());
  }

  private addChain(r: number, c: number) {
    const spr = new Sprite(tex('ob_chain'));
    spr.anchor.set(0.5);
    spr.scale.set((this.S * 0.98) / spr.texture.width);
    spr.position.set((c + 0.5) * this.S, (r + 0.5) * this.S);
    this.chainLayer.addChild(spr);
    this.grid[r][c].chain = spr;
  }

  cell(r: number, c: number): Cell | null {
    if (r < 0 || c < 0 || r >= this.H || c >= this.W) return null;
    return this.grid[r][c];
  }

  private place(t: Tile, r: number, c: number) {
    t.r = r;
    t.c = c;
    this.grid[r][c].tile = t;
  }

  private syncView(t: Tile) {
    t.view.position.set((t.x + 0.5) * this.S, (t.y + 0.5) * this.S);
  }

  /** Center of a cell in global (stage) coordinates. */
  cellGlobal(r: number, c: number): Point {
    return this.toGlobal(new Point((c + 0.5) * this.S, (r + 0.5) * this.S));
  }

  // ======================================================================= input
  private cellAt(e: FederatedPointerEvent): { r: number; c: number; x: number; y: number } {
    const p = this.toLocal(e.global);
    return { r: Math.floor(p.y / this.S), c: Math.floor(p.x / this.S), x: p.x, y: p.y };
  }

  private onDown(e: FederatedPointerEvent) {
    if (!this.inputEnabled) return;
    const p = this.cellAt(e);
    if (this.pendingBooster) {
      const cl = this.cell(p.r, p.c);
      if (!cl || !cl.ok || !this.isStable()) return;
      const k = this.pendingBooster;
      this.pendingBooster = null;
      this.useBooster(k, p.r, p.c);
      this.onBoosterUsed?.(k);
      return;
    }
    const t = this.cell(p.r, p.c)?.tile;
    this.drag = { ...p, moved: false };
    this.clearHint();
    if (t && t.state === 'idle') tween(t.view.scale, { x: 1.08, y: 1.08 }, 0.08);
  }

  private onMove(e: FederatedPointerEvent) {
    if (!this.drag || this.drag.moved || !this.inputEnabled) return;
    const p = this.toLocal(e.global);
    const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
    if (Math.hypot(dx, dy) < this.S * 0.3) return;
    this.drag.moved = true;
    const t = this.cell(this.drag.r, this.drag.c)?.tile;
    if (t) tween(t.view.scale, { x: 1, y: 1 }, 0.1);
    let dr = 0, dc = 0;
    if (Math.abs(dx) > Math.abs(dy)) dc = Math.sign(dx);
    else dr = Math.sign(dy);
    this.trySwap(this.drag.r, this.drag.c, this.drag.r + dr, this.drag.c + dc);
  }

  private onUp() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    const t = this.cell(d.r, d.c)?.tile;
    if (t) tween(t.view.scale, { x: 1, y: 1 }, 0.12);
    if (!d.moved && this.inputEnabled && t && t.isPower && t.state === 'idle' && !this.grid[d.r][d.c].chain) {
      if (!this.hooks.canMove()) return;
      this.spendMove();
      this.cascade = 0;
      this.activate(t);
    }
  }

  private spendMove() {
    this.hooks.useMove();
    this.moveActive = true;
    this.vinesBroken = false;
  }

  private drawPortal(r: number, c: number, tint: number) {
    const ring = new Sprite(tex('p_ring'));
    ring.anchor.set(0.5);
    ring.blendMode = 'add';
    ring.tint = tint;
    ring.scale.set((this.S * 0.95) / 128, (this.S * 0.32) / 128);
    ring.position.set((c + 0.5) * this.S, r * this.S);
    this.fxAdd.addChild(ring);
    const glow = new Sprite(tex('p_glow'));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = tint;
    glow.scale.set((this.S * 0.9) / 128, (this.S * 0.35) / 128);
    glow.position.copyFrom(ring.position);
    this.fxAdd.addChild(glow);
    const loop = () => {
      if (glow.destroyed) return;
      tween(glow, { alpha: 0.35 }, 0.6, Ease.inOutQuad).then(() => tween(glow, { alpha: 1 }, 0.6, Ease.inOutQuad).then(loop));
    };
    loop();
  }

  /** Conveyor belt under a row: animated chevrons show the direction. */
  private addBelt(row: number, dir: number) {
    const S = this.S;
    const strip = new Graphics();
    for (let c = 0; c < this.W; c++) {
      if (!this.grid[row][c].ok) continue;
      strip.roundRect(c * S + 1.5, row * S + 1.5, S - 3, S - 3, S * 0.13).fill({ color: 0x3d4250, alpha: 0.9 });
      strip.rect(c * S, row * S + S * 0.08, S, S * 0.06).fill({ color: 0x9aa0b0, alpha: 0.7 });
      strip.rect(c * S, row * S + S * 0.86, S, S * 0.06).fill({ color: 0x9aa0b0, alpha: 0.7 });
    }
    this.bgLayer.addChild(strip);
    // bright arrow tabs at both ends of the row (drawn above the tiles)
    const okCols = [...Array(this.W).keys()].filter((c) => this.grid[row][c].ok);
    for (const c of [okCols[0], okCols[okCols.length - 1]]) {
      const m = new Graphics();
      const w = S * 0.11 * dir;
      m.moveTo(-w, -S * 0.16).lineTo(w, 0).lineTo(-w, S * 0.16).closePath()
        .fill({ color: 0xffd23a }).stroke({ width: S * 0.03, color: 0x5a2e0e, join: 'round' });
      m.position.set(c === okCols[0] ? c * S + S * 0.2 : (c + 1) * S - S * 0.2, (row + 0.5) * S);
      this.chainLayer.addChild(m);
    }
    const arrows = new Container();
    const g = new Graphics();
    for (let k = -2; k < this.W + 2; k++) {
      const x = (k + 0.5) * S, y = (row + 0.5) * S, w = S * 0.16 * dir;
      g.moveTo(x - w, y - S * 0.3).lineTo(x + w, y).lineTo(x - w, y + S * 0.3);
    }
    g.stroke({ width: S * 0.07, color: 0xffd27a, alpha: 0.5, cap: 'round', join: 'round' });
    arrows.addChild(g);
    const mask = new Graphics();
    for (let c = 0; c < this.W; c++) if (this.grid[row][c].ok) mask.rect(c * S, row * S, S, S);
    mask.fill(0xffffff);
    arrows.mask = mask;
    this.bgLayer.addChild(arrows, mask);
    this.belts.push({ row, dir, arrows });
  }

  /** After a move every belt slides its row by one cell (tiles wrap around the ends). */
  private runBelts() {
    const S = this.S;
    let moved = false;
    for (const b of this.belts) {
      const cols: number[] = [];
      for (let c = 0; c < this.W; c++) {
        const cl = this.grid[b.row][c];
        if (cl.ok && !cl.blocker && !cl.chain && cl.tile && cl.tile.state === 'idle') cols.push(c);
      }
      const n = cols.length;
      if (n < 2) continue;
      moved = true;
      const tiles = cols.map((c) => this.grid[b.row][c].tile!);
      for (const c of cols) this.grid[b.row][c].tile = null;
      tiles.forEach((t, i) => {
        const j = (i + b.dir + n) % n;
        const dest = cols[j];
        this.place(t, b.row, dest);
        t.state = 'swap';
        this.busy++;
        const wrap = (b.dir > 0 && j < i) || (b.dir < 0 && j > i);
        const done = () => {
          this.busy--;
          t.x = dest;
          if (t.state === 'swap') t.state = 'idle';
          t.stamp = ++this.stamp;
          this.changed = true;
        };
        if (!wrap) {
          tween(t, { x: dest }, 0.28, Ease.inOutQuad).then(done);
        } else {
          // slide out of one end, come back in at the other
          tween(t, { x: cols[i] + b.dir }, 0.14, Ease.inQuad).then(() => {
            t.x = dest - b.dir;
            return tween(t, { x: dest }, 0.14, Ease.outQuad);
          }).then(done);
        }
      });
      const a = b.arrows;
      killTweens(a);
      a.x = 0;
      tween(a, { x: S * b.dir }, 0.28, Ease.inOutQuad).then(() => (a.x = 0));
    }
    if (moved) sfx.swap();
  }

  /** If an empty cell in column c (at row r) is fed by a portal, return that portal. */
  private portalFor(r: number, c: number) {
    for (const p of this.portals) if (p.to[1] === c && p.to[0] <= r) {
      let ok = true;
      for (let k = p.to[0]; k < r; k++) {
        const ck = this.grid[k][c];
        if (ck.ok && (ck.blocker || ck.tile)) ok = false;
      }
      if (ok) return p;
    }
    return null;
  }

  private spawnColor(r: number, c: number): number {
    const n = this.colors;
    const col = (rr: number, cc: number) => {
      const t = this.cell(rr, cc)?.tile;
      return t && t.kind === 'c' ? t.color : -2;
    };
    const matching = new Set<number>();
    for (let k = 0; k < n; k++) {
      if ((col(r + 1, c) === k && col(r + 2, c) === k) || (col(r, c - 1) === k && col(r, c - 2) === k) ||
          (col(r, c + 1) === k && col(r, c + 2) === k) || (col(r, c - 1) === k && col(r, c + 1) === k)) matching.add(k);
    }
    const roll = Math.random();
    if (this.bias > 0 && roll < this.bias && matching.size) return [...matching][rnd(matching.size)];
    if (this.bias < 0 && roll < -this.bias) {
      const safe = [...Array(n).keys()].filter((k) => !matching.has(k));
      if (safe.length) return safe[rnd(safe.length)];
    }
    return rnd(n);
  }

  private swappable(t: Tile | null | undefined): t is Tile {
    return !!t && t.state === 'idle' && !this.grid[t.r][t.c].chain;
  }

  private trySwap(r1: number, c1: number, r2: number, c2: number) {
    const a = this.cell(r1, c1)?.tile, b = this.cell(r2, c2)?.tile;
    if (!this.swappable(a) || !this.swappable(b)) {
      if (this.swappable(a) && this.cell(r2, c2)) this.nudge(a, r2 - r1, c2 - c1);
      return;
    }
    if (!this.hooks.canMove()) return;
    this.cascade = 0;
    sfx.swap();
    a.state = b.state = 'swap';
    this.place(a, r2, c2);
    this.place(b, r1, c1);
    this.busy++;
    Promise.all([
      tween(a, { x: c2, y: r2 }, SWAP_T, Ease.inOutQuad),
      tween(b, { x: c1, y: r1 }, SWAP_T, Ease.inOutQuad),
    ]).then(() => {
      this.busy--;
      if (a.isPower || b.isPower) {
        a.state = b.state = 'idle';
        this.spendMove();
        if (a.isPower && b.isPower) this.combo(a, b);
        else {
          const p = a.isPower ? a : b, o = a.isPower ? b : a;
          this.activate(p, { color: o.color });
        }
        return;
      }
      a.state = b.state = 'idle';
      const groups = this.findMatches();
      const hit = groups.some((g) => g.cells.includes(a) || g.cells.includes(b));
      if (hit) {
        this.spendMove();
        a.stamp = ++this.stamp + 1000000; // player-moved tiles win power-up placement
        b.stamp = ++this.stamp + 1000000;
      } else {
        // invalid: swap back
        sfx.invalid();
        a.state = b.state = 'swap';
        this.place(a, r1, c1);
        this.place(b, r2, c2);
        this.busy++;
        Promise.all([
          tween(a, { x: c1, y: r1 }, SWAP_T * 1.2, Ease.inOutQuad),
          tween(b, { x: c2, y: r2 }, SWAP_T * 1.2, Ease.inOutQuad),
        ]).then(() => {
          this.busy--;
          a.state = b.state = 'idle';
        });
      }
    });
  }

  /** Little bump when trying to move into a wall. */
  private nudge(t: Tile, dr: number, dc: number) {
    t.state = 'swap';
    this.busy++;
    const x0 = t.c, y0 = t.r;
    tween(t, { x: x0 + dc * 0.15, y: y0 + dr * 0.15 }, 0.07).then(() =>
      tween(t, { x: x0, y: y0 }, 0.15, Ease.outBack).then(() => {
        this.busy--;
        if (t.state === 'swap') t.state = 'idle';
      }),
    );
  }

  // ======================================================================= main loop
  update(dt: number) {
    this.time += dt;
    if (!this.shuffling) {
      this.settle();
      this.moveTiles(dt);
      const groups = this.findMatches();
      for (const g of groups) this.resolveGroup(g);
      if (groups.length) this.changed = true; // cells were just emptied: not stable until refilled
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (!this.projectiles[i].update(dt)) this.projectiles.splice(i, 1);
    this.fx.update(dt);
    this.animateIdle(dt);
    for (const t of this.tiles) if (t.state !== 'spawn') this.syncView(t);
    const sh = this.fx.shakeOffset;
    this.pivot.set(-sh.x, -sh.y);

    if (!this.shuffling) this.collectItems();
    if (this.isStable() && this.moveActive) {
      this.moveActive = false;
      this.endOfMove();
    }
    if (this.isStable()) {
      this.idleTime += dt;
      if (!this.shuffling && !this.hasMoves()) this.shuffle();
      else if (this.idleTime > 5 && this.inputEnabled && this.hintTiles.length === 0) this.showHint();
    } else {
      this.idleTime = 0;
    }
  }

  /** Collectible items that reached the bottom of their column are collected. */
  private collectItems() {
    for (const t of this.tiles) {
      if (!t.isItem || t.state !== 'idle') continue;
      let bottom = true;
      for (let k = t.r + 1; k < this.H; k++) if (this.grid[k][t.c].ok) bottom = false;
      if (!bottom) continue;
      this.detach(t);
      const g = this.toGlobal(t.view.position);
      this.hooks.collect('gold', g.x, g.y, hasTex('it_chest') ? 'it_chest' : 'ic_coin');
      this.hooks.stat?.('gold');
      sfx.coin();
      this.fx.sparkleBurst(t.view.x, t.view.y, 16, 0xffe070, 4);
      const v = t.view;
      tween(v.scale, { x: 1.4, y: 1.4 }, 0.12).then(() => tween(v, { alpha: 0 }, 0.12).then(() => v.destroy({ children: true })));
    }
  }

  /** Called once the cascade of a player move has fully settled. */
  private endOfMove() {
    if (this.belts.length) this.runBelts();
    if (this.vinesBroken) return;
    const growers: [number, number][] = [];
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) if (this.grid[r][c].blocker?.grow) growers.push([r, c]);
    if (!growers.length) return;
    const options: [number, number][] = [];
    for (const [r, c] of growers)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cl = this.cell(r + dr, c + dc);
        if (cl && cl.ok && !cl.blocker && !cl.chain && cl.tile && cl.tile.kind === 'c' && cl.tile.state === 'idle') options.push([r + dr, c + dc]);
      }
    if (!options.length) return;
    const [r, c] = options[rnd(options.length)];
    const t = this.grid[r][c].tile!;
    this.grid[r][c].tile = null;
    this.tiles.delete(t);
    tween(t.view.scale, { x: 0, y: 0 }, 0.2, Ease.inBack).then(() => t.view.destroy({ children: true }));
    this.addBlocker(r, c, 'vines', 1, true);
    const b = this.grid[r][c].blocker!;
    const s = b.spr.scale.x;
    b.spr.scale.set(0);
    tween(b.spr.scale, { x: s, y: s }, 0.4, Ease.outBack);
    sfx.vines();
    this.fx.debris((c + 0.5) * this.S, (r + 0.5) * this.S, 'leaf', 5);
    this.hooks.goalAdded?.('vines');
    this.changed = true;
  }

  isStable(): boolean {
    if (this.busy > 0 || this.projectiles.length > 0 || this.shuffling) return false;
    if (pendingTimers('board') > 0) return false;
    if (this.changed) return false;
    for (const t of this.tiles) if (t.state !== 'idle') return false;
    return !this.needsFill();
  }

  /** Pure check: would settle() move or spawn anything right now? */
  private needsFill(): boolean {
    for (let c = 0; c < this.W; c++)
      for (let r = this.H - 1; r >= 0; r--) {
        const cl = this.grid[r][c];
        if (!cl.ok || cl.blocker || cl.tile) continue;
        let k = r - 1;
        while (k >= 0 && (!this.grid[k][c].ok || (!this.grid[k][c].blocker && !this.grid[k][c].tile))) k--;
        if (k < 0) {
          const portal = this.portalFor(r, c);
          if (!portal) return true;
          const src = this.grid[portal.from[0]][portal.from[1]];
          if (src.tile && src.tile.state === 'idle' && !src.chain) return true;
          continue;
        }
        const ck = this.grid[k][c];
        if (ck.tile && this.movable(ck.tile)) return true;
        for (const dc of [-1, 1]) {
          const src = this.cell(r - 1, c + dc), below = this.cell(r, c + dc);
          if (!src || !src.ok || src.blocker || !src.tile || src.tile.state !== 'idle' || src.chain) continue;
          if (below && below.ok && !below.blocker && !below.tile) continue;
          if (ck.blocker || (ck.tile && this.grid[ck.tile.r][ck.tile.c].chain)) return true;
        }
      }
    return false;
  }

  private movable(t: Tile): boolean {
    return (t.state === 'idle' || t.state === 'fall') && !this.grid[t.r][t.c].chain;
  }

  private settle() {
    this.changed = false;
    const blockedCells: [number, number][] = [];
    for (let c = 0; c < this.W; c++) {
      for (let r = this.H - 1; r >= 0; r--) {
        const cl = this.grid[r][c];
        if (!cl.ok || cl.blocker || cl.tile) continue;
        let k = r - 1;
        while (k >= 0) {
          const ck = this.grid[k][c];
          if (!ck.ok || (!ck.blocker && !ck.tile)) k--;
          else break;
        }
        if (k < 0) {
          const portal = this.portalFor(r, c);
          if (portal) {
            const src = this.grid[portal.from[0]][portal.from[1]];
            const t = src.tile;
            if (t && t.state === 'idle' && !src.chain && !src.blocker) {
              src.tile = null;
              this.fx.flash((portal.from[1] + 0.5) * this.S, (portal.from[0] + 1) * this.S, this.S, 0xc090ff, 0.25);
              t.x = c;
              t.y = portal.to[0] - 1;
              t.vy = V0;
              t.state = 'fall';
              this.place(t, r, c);
              this.syncView(t);
              this.changed = true;
            }
            continue;
          }
          // spawn from the top of the column
          let firstOk = 0;
          while (firstOk < this.H && !this.grid[firstOk][c].ok) firstOk++;
          let top: number = firstOk;
          for (const t of this.tiles) if (Math.round(t.x) === c && t.y < top) top = t.y;
          let item = false;
          if (this.itemsLeft > 0 && Math.random() < 0.25 && ![...this.tiles].some((q) => q.isItem)) {
            item = true;
            this.itemsLeft--;
          }
          const t = item ? this.makeTile('gold', -1) : this.makeTile('c', this.spawnColor(r, c));
          t.x = c;
          t.y = Math.min(firstOk - 1, top - 1.05);
          t.vy = V0;
          t.state = 'fall';
          this.place(t, r, c);
          this.syncView(t);
          this.changed = true;
          continue;
        }
        const ck = this.grid[k][c];
        if (ck.blocker) {
          blockedCells.push([r, c]);
          continue;
        }
        const t = ck.tile!;
        if (this.movable(t)) {
          ck.tile = null;
          this.place(t, r, c);
          if (t.state !== 'fall') {
            t.state = 'fall';
            t.vy = V0 * 0.6;
          }
          this.changed = true;
        } else if (this.grid[t.r][t.c].chain) {
          blockedCells.push([r, c]);
        }
      }
    }
    // diagonal fill for cells that can't be reached from above
    blockedCells.sort((a, b) => b[0] - a[0]);
    for (const [r, c] of blockedCells) {
      const cl = this.grid[r][c];
      if (cl.tile) continue;
      for (const dc of Math.random() < 0.5 ? [-1, 1] : [1, -1]) {
        const src = this.cell(r - 1, c + dc);
        const below = this.cell(r, c + dc);
        if (!src || !src.ok || !src.tile || src.blocker) continue;
        const t = src.tile;
        if (t.state !== 'idle' || this.grid[t.r][t.c].chain) continue;
        if (below && below.ok && !below.blocker && !below.tile) continue; // it will fall straight instead
        src.tile = null;
        this.place(t, r, c);
        t.state = 'fall';
        t.vy = V0 * 0.8;
        this.changed = true;
        break;
      }
    }
  }

  private canDrop(t: Tile): boolean {
    for (let k = t.r + 1; k < this.H; k++) {
      const ck = this.grid[k][t.c];
      if (!ck.ok) continue;
      if (ck.blocker || ck.tile) return false;
      return true;
    }
    return false;
  }

  private moveTiles(dt: number) {
    const falling = [...this.tiles].filter((t) => t.state === 'fall').sort((a, b) => b.r - a.r);
    for (const t of falling) {
      t.vy = Math.min(t.vy + G * dt, VMAX);
      const step = t.vy * dt;
      if (t.x !== t.c) {
        const d = t.c - t.x;
        t.x += Math.sign(d) * Math.min(Math.abs(d), step);
      }
      t.y += step;
      const below = this.cell(t.r + 1, t.c)?.tile;
      if (below && below.c === t.c && below.state === 'fall' && t.y > below.y - 1) {
        t.y = below.y - 1;
        t.vy = Math.min(t.vy, below.vy);
      }
      if (t.y >= t.r) {
        if (this.canDrop(t)) {
          t.y = t.r; // settle() will push it further next frame, keep speed
          continue;
        }
        const fell = t.vy;
        t.y = t.r;
        t.x = t.c;
        t.vy = 0;
        t.state = 'idle';
        t.stamp = ++this.stamp;
        if (fell > 6) this.squash(t);
      }
    }
  }

  private squash(t: Tile) {
    killTweens(t.spr.scale);
    const base = t.spr.scale.x;
    const by = t.spr.scale.y;
    t.spr.scale.set(base * 1.1, by * 0.85);
    t.spr.y = this.S * 0.04;
    tween(t.spr.scale, { x: base, y: by }, 0.25, Ease.outElastic);
    tween(t.spr, { y: 0 }, 0.2, Ease.outQuad);
  }

  private shineT = 2;
  /** Every few seconds a random idle tile gets a glossy shine sweep (keeps the board alive). */
  private idleShine(dt: number) {
    this.shineT -= dt;
    if (this.shineT > 0) return;
    this.shineT = 1.2 + Math.random() * 2.5;
    const list = [...this.tiles].filter((t) => t.kind === 'c' && t.state === 'idle');
    if (!list.length) return;
    const t = list[rnd(list.length)];
    const s = new Sprite(tex('p_streak'));
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.rotation = -0.8;
    s.alpha = 0;
    s.scale.set((this.S * 0.7) / 128, (this.S * 0.22) / 128);
    s.position.set(-this.S * 0.35, this.S * 0.25);
    t.view.addChild(s);
    tween(s, { alpha: 0.85 }, 0.12);
    tween(s, { x: this.S * 0.3, y: -this.S * 0.3 }, 0.45, Ease.inOutQuad).then(() => {
      tween(s, { alpha: 0 }, 0.12).then(() => s.destroy());
    });
    // tiny happy squash
    const sc = t.spr.scale.x;
    tween(t.spr.scale, { y: sc * 1.06 }, 0.12).then(() => tween(t.spr.scale, { y: sc }, 0.3, Ease.outElastic));
  }

  private animateIdle(dt: number) {
    if (this.inputEnabled) this.idleShine(dt);
    for (const t of this.tiles) {
      if (!t.isPower) continue;
      t.phase += dt;
      if (t.glow) t.glow.alpha = 0.4 + 0.25 * Math.sin(t.phase * 4);
      if (t.kind === 'falcon') {
        t.spr.y = Math.sin(t.phase * 5) * this.S * 0.03;
      } else if (t.kind === 'orb') {
        t.spr.rotation = Math.sin(t.phase * 2.2) * 0.06;
        if (Math.random() < dt * 3) this.fx.sparkleBurst(t.view.x + (Math.random() - 0.5) * this.S * 0.5, t.view.y - this.S * 0.1, 1, 0xffffff, 0.5);
      } else if (t.kind === 'barrel' && t.state === 'idle') {
        if (Math.random() < dt * 14) {
          const tp = t.view.position;
          this.fx.emit(tex('p_sparkle'), tp.x + this.S * 0.08, tp.y - this.S * 0.42, {
            vx: (Math.random() - 0.5) * this.S * 2, vy: -Math.random() * this.S * 2, g: this.S * 6, life: 0.3,
            s0: this.S / 128 * 0.28, s1: 0, a0: 1, a1: 0.5, tint: Math.random() < 0.5 ? 0xffc040 : 0xff7020, add: true,
          });
        }
      } else if (t.kind === 'ah' || t.kind === 'av') {
        const k = Math.sin(t.phase * 6) * this.S * 0.03;
        if (t.kind === 'ah') t.spr.x = k;
        else t.spr.y = -k;
      }
    }
  }

  // ======================================================================= matching
  findMatches(): Group[] {
    const W = this.W, H = this.H;
    const okT = (r: number, c: number): Tile | null => {
      const t = this.cell(r, c)?.tile;
      return t && t.kind === 'c' && t.state === 'idle' ? t : null;
    };
    type Run = { tiles: Tile[]; dir: 'h' | 'v' };
    const runs: Run[] = [];
    for (let r = 0; r < H; r++) {
      let c = 0;
      while (c < W) {
        const t = okT(r, c);
        if (!t) { c++; continue; }
        let e = c;
        while (e + 1 < W && okT(r, e + 1)?.color === t.color) e++;
        if (e - c + 1 >= 3) runs.push({ tiles: Array.from({ length: e - c + 1 }, (_, i) => okT(r, c + i)!), dir: 'h' });
        c = e + 1;
      }
    }
    for (let c = 0; c < W; c++) {
      let r = 0;
      while (r < H) {
        const t = okT(r, c);
        if (!t) { r++; continue; }
        let e = r;
        while (e + 1 < H && okT(e + 1, c)?.color === t.color) e++;
        if (e - r + 1 >= 3) runs.push({ tiles: Array.from({ length: e - r + 1 }, (_, i) => okT(r + i, c)!), dir: 'v' });
        r = e + 1;
      }
    }
    const squares: Tile[][] = [];
    for (let r = 0; r < H - 1; r++)
      for (let c = 0; c < W - 1; c++) {
        const a = okT(r, c), b = okT(r, c + 1), d = okT(r + 1, c), e = okT(r + 1, c + 1);
        if (a && b && d && e && a.color === b.color && a.color === d.color && a.color === e.color) squares.push([a, b, d, e]);
      }
    if (!runs.length && !squares.length) return [];

    // union shapes that share tiles
    type Shape = { tiles: Tile[]; run?: Run; square?: boolean };
    const shapes: Shape[] = [...runs.map((r) => ({ tiles: r.tiles, run: r })), ...squares.map((s) => ({ tiles: s, square: true }))];
    const parent = shapes.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map<number, number>();
    shapes.forEach((s, i) => {
      for (const t of s.tiles) {
        const o = owner.get(t.id);
        if (o === undefined) owner.set(t.id, i);
        else parent[find(i)] = find(o);
      }
    });
    const byRoot = new Map<number, Shape[]>();
    shapes.forEach((s, i) => {
      const k = find(i);
      if (!byRoot.has(k)) byRoot.set(k, []);
      byRoot.get(k)!.push(s);
    });
    const groups: Group[] = [];
    for (const list of byRoot.values()) {
      const set = new Map<number, Tile>();
      for (const s of list) for (const t of s.tiles) set.set(t.id, t);
      const cells = [...set.values()];
      const rs = list.filter((s) => s.run).map((s) => s.run!);
      const maxLen = Math.max(0, ...rs.map((r) => r.tiles.length));
      let power: Kind | null = null;
      let anchorPool: Tile[] = cells;
      if (maxLen >= 5) {
        power = 'orb';
        anchorPool = rs.find((r) => r.tiles.length >= 5)!.tiles;
      } else {
        const hs = rs.filter((r) => r.dir === 'h'), vs = rs.filter((r) => r.dir === 'v');
        let cross: Tile | null = null;
        for (const h of hs) for (const v of vs) for (const t of h.tiles) if (v.tiles.includes(t)) cross = t;
        if (cross) {
          power = 'barrel';
          anchorPool = [cross, ...cells];
        } else if (maxLen === 4) {
          const r4 = rs.find((r) => r.tiles.length === 4)!;
          power = r4.dir === 'h' ? 'ah' : 'av';
          anchorPool = r4.tiles;
        } else if (list.some((s) => s.square)) {
          power = 'falcon';
          anchorPool = list.find((s) => s.square)!.tiles;
        }
      }
      let anchor = anchorPool[0];
      if (power === 'barrel') {
        // the crossing tile, unless the player's swapped tile is part of the shape
        const moved = cells.filter((t) => t.stamp > 1000000);
        if (moved.length) anchor = moved[0];
      } else for (const t of anchorPool) if (t.stamp > anchor.stamp) anchor = t;
      groups.push({ cells, power, anchor });
    }
    return groups;
  }

  private resolveGroup(g: Group) {
    this.cascade++;
    sfx.match(this.cascade);
    Board.buzz(this.cascade > 3 ? 14 : 8);
    const S = this.S;
    const ar = g.anchor.r, ac = g.anchor.c;
    const damaged = new Set<string>();
    const inGroup = new Set(g.cells.map((t) => `${t.r},${t.c}`));
    const gColor = g.cells[0].color;
    for (const t of g.cells) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${t.r + dr},${t.c + dc}`;
        if (inGroup.has(k) || damaged.has(k)) continue;
        const cl = this.cell(t.r + dr, t.c + dc);
        if (cl?.blocker && cl.blocker.color !== undefined && cl.blocker.color !== gColor) {
          // wrong colour: the crate just wobbles
          damaged.add(k);
          const sp = cl.blocker.spr;
          killTweens(sp);
          tween(sp, { rotation: 0.12 }, 0.06).then(() => tween(sp, { rotation: 0 }, 0.3, Ease.outElastic));
          continue;
        }
        if (cl?.blocker) {
          damaged.add(k);
          this.damageBlocker(t.r + dr, t.c + dc);
        }
      }
    }
    for (const t of g.cells) {
      const cl = this.grid[t.r][t.c];
      if (cl.chain) {
        this.breakChain(t.r, t.c);
        continue;
      }
      if (g.power) {
        // merge into the anchor cell
        this.crackIce(t.r, t.c);
        cl.tile = null;
        this.tiles.delete(t);
        this.collectColor(t);
        t.state = 'spawn';
        const tx = (ac + 0.5) * S, ty = (ar + 0.5) * S;
        tween(t.view, { x: tx, y: ty }, 0.14, Ease.inQuad).then(() => t.view.destroy({ children: true }));
        tween(t.view.scale, { x: 0.7, y: 0.7 }, 0.14);
      } else {
        this.clearTile(t);
      }
    }
    if (g.power && !this.grid[ar][ac].tile && !this.grid[ar][ac].chain) {
      const p = this.makeTile(g.power, -1);
      p.x = ac;
      p.y = ar;
      this.place(p, ar, ac);
      p.state = 'spawn';
      this.syncView(p);
      p.view.scale.set(0.2);
      this.busy++;
      after(0.12, () => {
        sfx.powerCreate();
        this.hooks.powerCreated?.(p.kind);
        this.hooks.stat?.('power');
        this.fx.flash(p.view.x, p.view.y, S * 1.6, 0xfff3c0, 0.3);
        this.fx.sparkleBurst(p.view.x, p.view.y, 10, 0xfff2a0, 3);
        tween(p.view.scale, { x: 1, y: 1 }, 0.3, Ease.outBack).then(() => {
          this.busy--;
          if (p.state === 'spawn') p.state = 'idle';
          p.stamp = ++this.stamp;
        });
      }, 'board');
    }
  }

  // ======================================================================= damage
  private collectColor(t: Tile) {
    if (t.kind !== 'c') return;
    const type = COLOR_GOALS[t.color];
    if (this.hooks.wantsGoal(type)) {
      const g = this.toGlobal(t.view.position);
      this.hooks.collect(type, g.x, g.y, COLOR_TEX[t.color]);
    }
  }

  /** Remove a normal tile with a pop. */
  private clearTile(t: Tile) {
    this.changed = true;
    this.crackIce(t.r, t.c);
    const cl = this.grid[t.r]?.[t.c];
    if (cl && cl.tile === t) cl.tile = null;
    this.tiles.delete(t);
    this.collectColor(t);
    this.hooks.stat?.('tile');
    t.state = 'spawn';
    this.fx.tilePop(t.view.x, t.view.y, t.color);
    const v = t.view;
    tween(v.scale, { x: 1.18, y: 1.18 }, 0.06).then(() =>
      tween(v.scale, { x: 0, y: 0 }, 0.13, Ease.inBack).then(() => v.destroy({ children: true })),
    );
  }

  private damageBlocker(r: number, c: number) {
    const cl = this.grid[r][c];
    const b = cl.blocker;
    if (!b) return;
    this.changed = true;
    const x = (c + 0.5) * this.S, y = (r + 0.5) * this.S;
    b.hp--;
    if (b.type === 'cauldron') {
      sfx.zap();
      this.fx.sparkleBurst(x, y - this.S * 0.25, 4 + (4 - b.hp) * 3, 0xa8ff5a, 2.5);
      if (b.hp <= 0) {
        this.boilOver(r, c, b);
        return;
      }
    } else if (b.type === 'crate') { sfx.crate(); this.fx.debris(x, y, 'wood', b.hp > 0 ? 4 : 8); }
    else if (b.type === 'stone') { sfx.stone(); this.fx.debris(x, y, 'stone', b.hp > 0 ? 4 : 8); }
    else { sfx.vines(); this.fx.debris(x, y, 'leaf', 8); }
    if (b.hp > 0) {
      this.styleBlocker(b);
      const s = b.spr.scale.x;
      b.spr.scale.set(s * 1.12);
      tween(b.spr.scale, { x: s, y: s }, 0.25, Ease.outBack);
      return;
    }
    cl.blocker = null;
    if (b.type === 'vines') this.vinesBroken = true;
    this.hooks.stat?.(b.type);
    const goal: GoalType = b.type;
    if (b.badge) tween(b.badge, { alpha: 0 }, 0.1);
    if (this.hooks.wantsGoal(goal)) {
      const g = this.toGlobal(new Point(x, y));
      this.hooks.collect(goal, g.x, g.y, b.type === 'crate' ? 'ob_crate1' : b.type === 'stone' ? 'ob_stone1' : 'ob_vines');
    }
    // final frame: shattered texture then vanish
    if (b.type === 'crate') b.spr.texture = tex('ob_crate3');
    if (b.type === 'stone') b.spr.texture = tex('ob_stone3');
    const s = b.spr.scale.x;
    tween(b.spr.scale, { x: s * 1.15, y: s * 1.15 }, 0.08).then(() => {
      tween(b.spr, { alpha: 0 }, 0.15);
      tween(b.spr.scale, { x: s * 0.6, y: s * 0.6 }, 0.15).then(() => b.spr.destroy());
    });
  }

  /** A full cauldron boils over: it vanishes and splashes every cell around it. */
  private boilOver(r: number, c: number, b: Blocker) {
    const cl = this.grid[r][c];
    cl.blocker = null;
    this.changed = true;
    const x = (c + 0.5) * this.S, y = (r + 0.5) * this.S;
    this.hooks.stat?.('cauldron');
    if (this.hooks.wantsGoal('cauldron')) {
      const g = this.toGlobal(new Point(x, y));
      this.hooks.collect('cauldron', g.x, g.y, '__cauldron');
    }
    sfx.barrel();
    Board.buzz(30);
    this.hooks.impact?.(1);
    this.fx.flash(x, y, this.S * 3.2, 0x9dff6a, 0.4);
    this.fx.sparkleBurst(x, y, 26, 0xb8ff7a, 6);
    this.fx.shake(this.S * 0.1, 0.25);
    const sp = b.spr;
    tween(sp.scale, { x: sp.scale.x * 1.35, y: sp.scale.y * 0.7 }, 0.1).then(() => {
      tween(sp, { alpha: 0 }, 0.18);
      tween(sp.scale, { x: sp.scale.x * 0.5, y: sp.scale.y * 1.6 }, 0.18).then(() => sp.destroy());
    });
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        after(0.08, () => this.hitCell(r + dr, c + dc), 'board');
      }
  }

  private breakChain(r: number, c: number) {
    const cl = this.grid[r][c];
    if (!cl.chain) return;
    const spr = cl.chain;
    cl.chain = null;
    sfx.chain();
    this.hooks.stat?.('chain');
    const x = (c + 0.5) * this.S, y = (r + 0.5) * this.S;
    this.fx.debris(x, y, 'link', 6);
    if (this.hooks.wantsGoal('chain')) {
      const g = this.toGlobal(new Point(x, y));
      this.hooks.collect('chain', g.x, g.y, 'ob_chain');
    }
    const s = spr.scale.x;
    tween(spr.scale, { x: s * 1.3, y: s * 1.3 }, 0.18);
    tween(spr, { alpha: 0 }, 0.18).then(() => spr.destroy());
    const t = cl.tile;
    if (t && t.state === 'idle') t.stamp = ++this.stamp;
  }

  /** Generic hit from a power-up. */
  hitCell(r: number, c: number) {
    const cl = this.cell(r, c);
    if (!cl || !cl.ok) return;
    if (cl.blocker) {
      this.damageBlocker(r, c);
      return;
    }
    if (cl.chain) {
      this.breakChain(r, c);
      return;
    }
    const t = cl.tile;
    if (!t && cl.ice) {
      this.crackIce(r, c);
      return;
    }
    if (!t || t.state === 'spawn' || t.state === 'swap' || t.isItem) return;
    if (t.isPower) {
      after(0.06, () => {
        if (this.grid[t.r][t.c].tile === t && t.state !== 'spawn') this.activate(t);
      }, 'board');
      return;
    }
    this.clearTile(t);
  }

  // ======================================================================= power-ups
  private detach(t: Tile) {
    this.changed = true;
    const cl = this.grid[t.r][t.c];
    if (cl.tile === t) cl.tile = null;
    this.tiles.delete(t);
    t.state = 'spawn';
  }

  private pos(r: number, c: number) {
    return { x: (c + 0.5) * this.S, y: (r + 0.5) * this.S };
  }

  activate(t: Tile, opts: { color?: number } = {}) {
    if (!this.tiles.has(t)) return;
    this.clearHint();
    const r = t.r, c = t.c;
    this.detach(t);
    this.crackIce(r, c);
    const v = t.view;
    tween(v.scale, { x: 1.3, y: 1.3 }, 0.08).then(() => v.destroy({ children: true }));
    switch (t.kind) {
      case 'ah': this.fireArrow(r, c, 'h'); break;
      case 'av': this.fireArrow(r, c, 'v'); break;
      case 'barrel': this.explode(r, c, 2); break;
      case 'falcon': this.launchFalcon(r, c, null); break;
      case 'orb': this.orbBlast(r, c, opts.color ?? this.mostCommonColor(), null); break;
    }
  }

  private combo(a: Tile, b: Tile) {
    const r = b.r, c = b.c;
    const kinds = [a.kind, b.kind].map((k) => (k === 'ah' || k === 'av' ? 'arrow' : k)).sort().join('+');
    for (const t of [a, b]) {
      this.detach(t);
      const v = t.view;
      tween(v, { x: (c + 0.5) * this.S, y: (r + 0.5) * this.S }, 0.1);
      tween(v.scale, { x: 1.4, y: 1.4 }, 0.12).then(() => v.destroy({ children: true }));
    }
    const p = this.pos(r, c);
    this.fx.flash(p.x, p.y, this.S * 3, 0xfff0c0, 0.35);
    this.hooks.impact?.(2);
    this.hooks.stat?.('combo');
    this.busy++;
    after(0.12, () => {
      this.busy--;
      switch (kinds) {
        case 'orb+orb': this.boardWipe(r, c); break;
        case 'arrow+orb': this.orbBlast(r, c, this.mostCommonColor(), 'arrow'); break;
        case 'barrel+orb': this.orbBlast(r, c, this.mostCommonColor(), 'barrel'); break;
        case 'falcon+orb': this.orbBlast(r, c, this.mostCommonColor(), 'falcon'); break;
        case 'barrel+barrel': this.explode(r, c, 3, true); break;
        case 'arrow+barrel':
          for (const d of [-1, 0, 1]) {
            this.fireArrow(r + d, c, 'h', true);
            this.fireArrow(r, c + d, 'v', true);
          }
          this.fx.shake(this.S * 0.12, 0.3);
          break;
        case 'arrow+arrow': this.fireArrow(r, c, 'h'); this.fireArrow(r, c, 'v'); break;
        case 'falcon+falcon':
          for (let i = 0; i < 3; i++) after(i * 0.08, () => this.launchFalcon(r, c, null, i === 0), 'board');
          break;
        case 'arrow+falcon': this.launchFalcon(r, c, 'arrow'); break;
        case 'barrel+falcon': this.launchFalcon(r, c, 'barrel'); break;
      }
    }, 'board');
  }

  /** Two arrows fly in opposite directions along a row ('h') or column ('v'). */
  fireArrow(r: number, c: number, dir: 'h' | 'v', silentHitOrigin = false) {
    sfx.arrow();
    if (dir === 'h' && (r < 0 || r >= this.H)) return;
    if (dir === 'v' && (c < 0 || c >= this.W)) return;
    this.hitCell(r, c);
    for (const sgn of [-1, 1]) {
      const spr = new Sprite(tex('pw_arrow'));
      spr.anchor.set(0.5);
      spr.scale.set((this.S * 0.95) / spr.texture.width);
      spr.rotation = dir === 'h' ? (sgn > 0 ? 0 : Math.PI) : sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.projLayer.addChild(spr);
      let pos = 0; // distance traveled in cells
      let lastCell = 0;
      // distance to the board edge in this direction (+ a little so the arrow visibly exits)
      const limit = (dir === 'h' ? (sgn > 0 ? this.W - 1 - c : c) : sgn > 0 ? this.H - 1 - r : r) + 0.7;
      const proj: Projectile = {
        update: (dt: number) => {
          pos += ARROW_SPEED * dt;
          const rr = dir === 'v' ? r + sgn * pos : r;
          const cc = dir === 'h' ? c + sgn * pos : c;
          spr.position.set((cc + 0.5) * this.S, (rr + 0.5) * this.S);
          this.fx.trail(spr.x - Math.cos(spr.rotation) * this.S * 0.4, spr.y - Math.sin(spr.rotation) * this.S * 0.4, spr.rotation);
          const cur = Math.floor(pos + 0.5);
          while (lastCell < cur) {
            lastCell++;
            if (dir === 'h') this.hitCell(r, c + sgn * lastCell);
            else this.hitCell(r + sgn * lastCell, c);
          }
          if (pos > limit) {
            spr.alpha -= dt * 12;
            if (spr.alpha <= 0) {
              spr.destroy();
              return false;
            }
          }
          return true;
        },
      };
      this.projectiles.push(proj);
    }
  }

  explode(r: number, c: number, radius: number, big = false) {
    const p = this.pos(r, c);
    if (big) sfx.bigBoom();
    else sfx.barrel();
    Board.buzz(big ? 60 : 30);
    this.hooks.impact?.(big ? 2 : 1);
    this.fx.explosion(p.x, p.y, radius + 0.5);
    this.fx.shake(this.S * (big ? 0.22 : 0.13), big ? 0.45 : 0.3);
    for (let dr = -radius; dr <= radius; dr++)
      for (let dc = -radius; dc <= radius; dc++) {
        const d = Math.max(Math.abs(dr), Math.abs(dc));
        if (d === 0) {
          this.hitCell(r, c);
          continue;
        }
        after(0.025 * d, () => this.hitCell(r + dr, c + dc), 'board');
      }
  }

  private pickFalconTarget(fromR: number, fromC: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) {
        const cl = this.grid[r][c];
        if (!cl.ok || this.falconTargets.has(`${r},${c}`)) continue;
        if (Math.abs(r - fromR) + Math.abs(c - fromC) <= 1) continue;
        let s = 0;
        if (cl.blocker && this.hooks.wantsGoal(cl.blocker.type)) s = 100 + (cl.blocker.hp === 1 ? 10 : 0);
        else if (cl.chain && this.hooks.wantsGoal('chain')) s = 90;
        else if (cl.blocker) s = 20;
        else if (cl.tile && cl.tile.kind === 'c' && this.hooks.wantsGoal(COLOR_GOALS[cl.tile.color])) s = 40;
        else if (cl.tile && cl.tile.kind === 'c') s = 10;
        else continue;
        s += Math.random() * 8;
        if (s > bestScore) {
          bestScore = s;
          best = [r, c];
        }
      }
    return best;
  }

  launchFalcon(r: number, c: number, carry: 'arrow' | 'barrel' | null, hitNeighbors = true) {
    sfx.falcon();
    if (hitNeighbors) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.hitCell(r + dr, c + dc);
    const target = this.pickFalconTarget(r, c);
    if (!target) return;
    const key = `${target[0]},${target[1]}`;
    this.falconTargets.add(key);
    const spr = new Sprite(tex('pw_falcon'));
    spr.anchor.set(0.5);
    const base = (this.S * 1.05) / spr.texture.width;
    spr.scale.set(base);
    this.projLayer.addChild(spr);
    if (carry) {
      const cs = new Sprite(tex(carry === 'arrow' ? 'pw_arrow' : 'pw_barrel'));
      cs.anchor.set(0.5);
      cs.scale.set(0.55);
      cs.y = cs.texture.height * 0.45;
      spr.addChild(cs);
    }
    const p0 = this.pos(r, c), p2 = this.pos(target[0], target[1]);
    const lift = this.S * 2.2;
    const p1 = { x: (p0.x + p2.x) / 2 + (Math.random() - 0.5) * this.S * 3, y: Math.min(p0.y, p2.y) - lift };
    const dist = Math.hypot(p2.x - p0.x, p2.y - p0.y) / this.S;
    const dur = 0.35 + Math.min(dist, 8) * 0.045;
    let t = 0;
    this.projectiles.push({
      update: (dt: number) => {
        t += dt / dur;
        const k = Math.min(t, 1);
        const e = Ease.inOutQuad(k);
        const x = (1 - e) * (1 - e) * p0.x + 2 * (1 - e) * e * p1.x + e * e * p2.x;
        const y = (1 - e) * (1 - e) * p0.y + 2 * (1 - e) * e * p1.y + e * e * p2.y;
        spr.scale.set(base * (1 + 0.35 * Math.sin(Math.PI * k)) * (1 + 0.08 * Math.sin(t * 60)), base * (1 + 0.35 * Math.sin(Math.PI * k)));
        spr.rotation = (x - spr.x) * 0.01;
        spr.position.set(x, y);
        this.fx.trail(x, y + this.S * 0.2, Math.PI / 2, 0xffe08a);
        if (k >= 1) {
          spr.destroy({ children: true });
          this.falconTargets.delete(key);
          const [tr, tc] = target;
          if (carry === 'arrow') {
            this.fireArrow(tr, tc, 'h');
            this.fireArrow(tr, tc, 'v');
          } else if (carry === 'barrel') this.explode(tr, tc, 2);
          else {
            this.fx.flash(x, y, this.S * 1.5, 0xffe7a0, 0.25);
            this.hitCell(tr, tc);
          }
          return false;
        }
        return true;
      },
    });
  }

  private mostCommonColor(): number {
    const n = new Array(5).fill(0);
    for (const t of this.tiles) if (t.kind === 'c') n[t.color]++;
    let best = 0;
    for (let i = 1; i < 5; i++) if (n[i] > n[best]) best = i;
    return best;
  }

  orbBlast(r: number, c: number, color: number, convert: 'arrow' | 'barrel' | 'falcon' | null) {
    sfx.orb();
    const origin = this.pos(r, c);
    const targets = [...this.tiles].filter((t) => t.kind === 'c' && t.color === color && t.state !== 'spawn');
    targets.sort((a, b) => Math.hypot(a.r - r, a.c - c) - Math.hypot(b.r - r, b.c - c));
    this.fx.flash(origin.x, origin.y, this.S * 2.5, COLOR_TINT[color], 0.5);
    this.busy++;
    const step = 0.035;
    targets.forEach((t, i) => {
      after(i * step, () => {
        if (!this.tiles.has(t)) return;
        sfx.zap();
        this.beam(origin.x, origin.y, t.view.x, t.view.y, COLOR_TINT[color]);
        if (convert) {
          const kind: Kind = convert === 'arrow' ? (Math.random() < 0.5 ? 'ah' : 'av') : convert;
          this.setKind(t, kind, -1);
          t.view.scale.set(1.3);
          tween(t.view.scale, { x: 1, y: 1 }, 0.2, Ease.outBack);
        } else {
          t.spr.tint = 0xffffff;
          tween(t.view.scale, { x: 1.2, y: 1.2 }, 0.1);
          this.fx.flash(t.view.x, t.view.y, this.S, COLOR_TINT[color], 0.3);
        }
      }, 'board');
    });
    const total = targets.length * step + 0.2;
    after(total, () => {
      this.busy--;
      targets.forEach((t, i) => {
        if (!this.tiles.has(t)) return;
        if (convert) after(i * 0.07, () => {
          if (this.tiles.has(t) && this.grid[t.r][t.c].tile === t) this.activate(t);
        }, 'board');
        else this.hitCell(t.r, t.c);
      });
    }, 'board');
  }

  private beam(x0: number, y0: number, x1: number, y1: number, tint: number) {
    const s = new Sprite(tex('p_streak'));
    s.anchor.set(1, 0.5);
    s.blendMode = 'add';
    s.tint = tint;
    const len = Math.hypot(x1 - x0, y1 - y0);
    s.position.set(x1, y1);
    s.rotation = Math.atan2(y1 - y0, x1 - x0);
    s.scale.set(Math.max(len, 1) / 128, (this.S * 0.35) / 128);
    this.fxAdd.addChild(s);
    tween(s, { alpha: 0 }, 0.25).then(() => s.destroy());
    this.fx.sparkleBurst(x1, y1, 3, 0xffffff, 1.5);
  }

  private boardWipe(r: number, c: number) {
    sfx.bigBoom();
    Board.buzz(90);
    this.hooks.impact?.(3);
    sfx.orb();
    const p = this.pos(r, c);
    this.fx.flash(p.x, p.y, this.S * 8, 0xfff6d0, 0.6);
    this.fx.shake(this.S * 0.25, 0.6);
    for (let rr = 0; rr < this.H; rr++)
      for (let cc = 0; cc < this.W; cc++) {
        const d = Math.hypot(rr - r, cc - c);
        after(0.04 * d, () => this.hitCell(rr, cc), 'board');
      }
  }

  // ======================================================================= moves / hints / shuffle
  private wouldMatch(grid: (number | null)[][], r: number, c: number): boolean {
    const v = grid[r][c];
    if (v === null || v < 0) return false;
    const g = (rr: number, cc: number) => (rr >= 0 && cc >= 0 && rr < this.H && cc < this.W ? grid[rr][cc] : null);
    let n = 1;
    for (let k = c - 1; g(r, k) === v; k--) n++;
    for (let k = c + 1; g(r, k) === v; k++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let k = r - 1; g(k, c) === v; k--) n++;
    for (let k = r + 1; g(k, c) === v; k++) n++;
    if (n >= 3) return true;
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
      if (g(r + dr, c) === v && g(r, c + dc) === v && g(r + dr, c + dc) === v) return true;
    return false;
  }

  /** Returns a pair of tiles that makes a valid move, or null. */
  findMove(): [Tile, Tile] | null {
    const colorGrid: (number | null)[][] = [];
    for (let r = 0; r < this.H; r++) {
      colorGrid.push([]);
      for (let c = 0; c < this.W; c++) {
        const t = this.grid[r][c].tile;
        colorGrid[r].push(t && t.kind === 'c' ? t.color : null);
      }
    }
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) {
        const a = this.grid[r][c].tile;
        if (!a || this.grid[r][c].chain) continue;
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const b = this.cell(r + dr, c + dc)?.tile;
          if (!b || this.grid[r + dr][c + dc].chain) continue;
          if (a.isPower || b.isPower) return [a, b];
          const va = colorGrid[r][c], vb = colorGrid[r + dr][c + dc];
          colorGrid[r][c] = vb;
          colorGrid[r + dr][c + dc] = va;
          const ok = this.wouldMatch(colorGrid, r, c) || this.wouldMatch(colorGrid, r + dr, c + dc);
          colorGrid[r][c] = va;
          colorGrid[r + dr][c + dc] = vb;
          if (ok) return [a, b];
        }
      }
    return null;
  }

  hasMoves(): boolean {
    for (const t of this.tiles) if (t.isPower && !this.grid[t.r][t.c].chain) return true;
    return this.findMove() !== null;
  }

  private showHint() {
    const m = this.findMove();
    if (!m) return;
    this.hintTiles = m;
    for (const t of m) {
      t.hinted = true;
      const loop = () => {
        if (!t.hinted || t.view.destroyed) return;
        tween(t.view.scale, { x: 1.12, y: 1.12 }, 0.3, Ease.inOutQuad).then(() =>
          tween(t.view.scale, { x: 1, y: 1 }, 0.3, Ease.inOutQuad).then(() => after(0.5, loop, 'hint')),
        );
      };
      loop();
    }
  }

  clearHint() {
    this.idleTime = 0;
    for (const t of this.hintTiles) {
      t.hinted = false;
      if (!t.view.destroyed) t.view.scale.set(1);
    }
    this.hintTiles = [];
    clearTimers('hint');
  }

  private ensureMoves(initial: boolean) {
    for (let tries = 0; tries < 60 && !this.hasMoves(); tries++) this.recolor(initial);
  }

  /** Reassign colors of free normal tiles so there is no match but at least one move. */
  private recolor(_initial: boolean) {
    const free = [...this.tiles].filter((t) => t.kind === 'c' && !this.grid[t.r][t.c].chain);
    for (const t of free) t.color = -1 as any;
    for (const t of free.sort((a, b) => a.r - b.r || a.c - b.c)) {
      this.grid[t.r][t.c].tile = null;
      t.color = this.safeColor(t.r, t.c);
      this.grid[t.r][t.c].tile = t;
      this.setKind(t, 'c', t.color);
    }
  }

  private shuffle(force = false) {
    this.shuffling = true;
    this.clearHint();
    sfx.shuffle();
    const free = [...this.tiles].filter((t) => t.kind === 'c' && !this.grid[t.r][t.c].chain);
    Promise.all(free.map((t) => tween(t.view.scale, { x: 0, y: 0 }, 0.2, Ease.inBack))).then(() => {
      if (force) this.recolor(false);
      this.ensureMoves(false);
      if (!this.hasMoves()) this.recolor(false);
      Promise.all(free.map((t, i) => tween(t.view.scale, { x: 1, y: 1 }, 0.3, Ease.outBack, i * 0.006))).then(() => {
        this.shuffling = false;
      });
    });
  }

  // ======================================================================= end-of-level bonus
  /** Convert n random tiles into arrows, then fire every power-up on the board. */
  async runBonus(n: number, fromGlobal: Point, onEach: () => void, skipped: () => boolean = () => false): Promise<void> {
    this.inputEnabled = false;
    this.clearHint();
    const wait = (s: number) => new Promise<void>((res) => after(s, res, 'bonus'));
    const t0 = performance.now();
    const MAX_MS = 5000; // the celebration never runs longer than ~5 seconds
    const over = () => skipped() || performance.now() - t0 > MAX_MS;
    const candidates = () => [...this.tiles].filter((t) => t.kind === 'c' && t.state === 'idle' && !this.grid[t.r][t.c].chain);
    // 1) remaining moves fly onto the board as arrows (quick, overlapping)
    for (let i = 0; i < n && !over(); i++) {
      const list = candidates();
      if (!list.length) break;
      const t = list[rnd(list.length)];
      onEach();
      const from = this.toLocal(fromGlobal);
      const star = new Sprite(tex('p_sparkle'));
      star.anchor.set(0.5);
      star.blendMode = 'add';
      star.tint = 0xfff0a0;
      star.scale.set((this.S * 0.8) / 128);
      star.position.copyFrom(from);
      this.projLayer.addChild(star);
      tween(star, { x: t.view.x, y: t.view.y }, 0.22, Ease.inQuad).then(() => {
        star.destroy();
        if (!this.tiles.has(t) || t.kind !== 'c') return;
        this.setKind(t, Math.random() < 0.5 ? 'ah' : 'av', -1);
        sfx.powerCreate();
        this.fx.sparkleBurst(t.view.x, t.view.y, 6);
        t.view.scale.set(1.4);
        tween(t.view.scale, { x: 1, y: 1 }, 0.2, Ease.outBack);
      });
      await wait(n > 10 ? 0.04 : 0.07);
    }
    await wait(0.3);
    // 2) fire every power-up on the board in quick waves (not one by one)
    for (let wave = 0; wave < 6 && !over(); wave++) {
      const powers = [...this.tiles].filter((t) => t.isPower && t.state === 'idle' && !this.grid[t.r][t.c].chain);
      if (!powers.length) break;
      this.cascade = 0;
      powers.forEach((p, i) => after(i * 0.05, () => {
        if (!over() && this.tiles.has(p) && p.state === 'idle') this.activate(p);
      }, 'bonus'));
      await wait(powers.length * 0.05 + 0.15);
      while (!this.isStable() && !over()) await wait(0.05);
    }
    // 3) let the board settle (bounded)
    for (let i = 0; i < 60 && !this.isStable(); i++) await wait(0.05);
  }

  /** In-game boosters (no move is spent). */
  useBooster(k: BoosterKind, r: number, c: number) {
    this.clearHint();
    this.cascade = 0;
    const p = this.pos(r, c);
    if (k === 'hammer') {
      sfx.stone();
      this.fx.flash(p.x, p.y, this.S * 2, 0xffffff, 0.25);
      this.fx.sparkleBurst(p.x, p.y, 14, 0xffe0a0, 4);
      this.fx.shake(this.S * 0.08, 0.15);
      // a hammer clears a whole blocker in one go
      const cl = this.grid[r][c];
      let n = cl.blocker ? cl.blocker.hp : 1;
      while (n-- > 0) this.hitCell(r, c);
      Board.buzz(25);
    } else if (k === 'row') this.fireArrow(r, c, 'h');
    else if (k === 'col') this.fireArrow(r, c, 'v');
    else if (k === 'shuffle') {
      this.fx.sparkleBurst((this.W / 2) * this.S, (this.H / 2) * this.S, 30, 0xffffff, 8);
      this.shuffle(true);
    }
  }

  /** Pre-level boosters: turn random normal tiles into the given power-ups. */
  addStartBoosters(kinds: Kind[]) {
    const pool = [...this.tiles].filter((t) => t.kind === 'c' && t.state === 'idle' && !this.grid[t.r][t.c].chain);
    kinds.forEach((k, i) => {
      if (!pool.length) return;
      const t = pool.splice(rnd(pool.length), 1)[0];
      after(0.15 + i * 0.18, () => {
        if (!this.tiles.has(t) || t.kind !== 'c') return;
        this.setKind(t, k, -1);
        sfx.powerCreate();
        this.fx.flash(t.view.x, t.view.y, this.S * 1.8, 0xfff3c0, 0.35);
        this.fx.sparkleBurst(t.view.x, t.view.y, 12);
        t.view.scale.set(0.2);
        tween(t.view.scale, { x: 1, y: 1 }, 0.35, Ease.outBack);
      }, 'board');
    });
  }

  /** Light haptic feedback on supported phones. */
  static buzz(ms: number) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }

  destroyBoard() {
    clearTimers('board');
    clearTimers('hint');
    clearTimers('bonus');
    this.fx.clear();
    this.destroy({ children: true });
  }
}
