// Live-ops popups: daily reward, daily quests, weekly treasure road.
import { Container, Graphics, Sprite } from 'pixi.js';
import { tex, hasTex } from '../assets';
import { label, Button, overlay } from '../ui';
import { tween, Ease } from '../tween';
import { sfx } from '../audio';
import {
  DAILY, dailyAvailable, dailyIndex, claimDaily, quests, questText, ROAD, road, grant, rewardText, Reward,
} from '../liveops';
import { getSave, save } from '../storage';
import { cup, cupBoard, cupReward, cupTimeLeft } from '../liveops';

export interface PopupParts { root: Container; panel: Container; ph: number; pw: number; close: () => void }

/** Parchment popup with a ribbon title, scaled-in, over a dark overlay. */
export function popup(parent: Container, W: number, H: number, title: string, onClose?: () => void): PopupParts {
  const root = new Container();
  root.addChild(overlay(W, H));
  const panel = new Container();
  const p = new Sprite(tex('ui_popup'));
  p.anchor.set(0.5);
  const pw = Math.min(640, W - 40);
  p.scale.set(pw / p.texture.width);
  const ph = p.height;
  panel.addChild(p);
  const t = label(title, 44, { fill: 0xfff2c8, stroke: 0x5a0a0a });
  t.y = -ph / 2 + ph * 0.073;
  panel.addChild(t);
  panel.position.set(W / 2, H / 2);
  root.addChild(panel);
  parent.addChild(root);
  panel.scale.set(0.5);
  tween(panel.scale, { x: 1, y: 1 }, 0.35, Ease.outBack);
  const close = () => {
    root.destroy({ children: true });
    onClose?.();
  };
  const x = new Button('red', 80, 'X', close, 34);
  x.position.set(pw / 2 - 46, -ph / 2 + 150);
  panel.addChild(x);
  return { root, panel, ph, pw, close };
}

const INK = { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false } as const;

function rewardIcon(r: Reward): string {
  if (r.hammer) return 'bt_hammer';
  if (r.row) return 'bt_row';
  if (r.col) return 'bt_col';
  if (r.shuffle) return 'bt_shuffle';
  return 'ic_coin';
}
const FALLBACK: Record<string, string> = { bt_hammer: 'ob_stone2', bt_row: 'pw_arrow', bt_col: 'pw_arrow', bt_shuffle: 'pw_orb' };
export function safeIcon(name: string, size: number): Sprite {
  const n = name.startsWith('bt_') && !hasTex(name) ? FALLBACK[name] : name;
  const s = new Sprite(tex(n));
  s.anchor.set(0.5);
  s.scale.set(size / s.texture.width);
  if (name === 'bt_col' && !hasTex(name)) s.rotation = -Math.PI / 2;
  return s;
}

function progressBar(w: number, h: number, k: number, color = 0x5fd04a): Container {
  const c = new Container();
  c.addChild(new Graphics().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x3b2210 }).stroke({ width: 3, color: 0xc89a3c }));
  if (k > 0) c.addChild(new Graphics().roundRect(-w / 2 + 3, -h / 2 + 3, Math.max(h - 6, (w - 6) * Math.min(1, k)), h - 6, (h - 6) / 2).fill({ color }));
  return c;
}

// ------------------------------------------------------------------ daily reward
export function dailyPanel(parent: Container, W: number, H: number, onChange: () => void) {
  const { panel, ph, close } = popup(parent, W, H, 'Günlük Ödül', onChange);
  const today = dailyIndex();
  const avail = dailyAvailable();
  DAILY.forEach((r, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const cell = new Container();
    const cx = row === 0 ? (col - 1.5) * 128 : (col - 1) * 128;
    cell.position.set(cx, -ph * 0.2 + row * 170);
    const isToday = i === today && avail;
    const done = i < today || (!avail && i === today - 1) || (!avail && i < today);
    const bg = new Graphics().roundRect(-56, -70, 112, 150, 18).fill({ color: isToday ? 0x6a8a2a : 0x3b2210, alpha: 0.9 }).stroke({ width: isToday ? 5 : 3, color: isToday ? 0xffe066 : 0xc89a3c });
    const day = label(`${i + 1}. Gün`, 22);
    day.y = -50;
    const ic = safeIcon(rewardIcon(r), 62);
    ic.y = 4;
    const items = rewardText({ ...r, coins: 0 });
    const txt = label(items ? (r.coins ? `${items} +${r.coins}` : items) : String(r.coins), items && r.coins ? 15 : 18);
    txt.y = 56;
    cell.addChild(bg, day, ic, txt);
    if (done) {
      const tick = new Graphics().circle(30, -42, 16).fill({ color: 0x2f9b2a }).stroke({ width: 3, color: 0xffffff });
      cell.addChild(tick);
      cell.alpha = 0.6;
    }
    panel.addChild(cell);
  });
  const info = label(avail ? 'Her gün gel, ödüller büyüsün!' : 'Bugünün ödülünü aldın. Yarın görüşürüz!', 26, INK);
  info.y = ph * 0.2;
  panel.addChild(info);
  const b = new Button(avail ? 'green' : 'red', 280, avail ? 'Topla' : 'Kapat', () => {
    if (avail) {
      const r = claimDaily();
      sfx.coin();
      sfx.star();
      void r;
    }
    close();
  }, 40);
  b.y = ph * 0.33;
  panel.addChild(b);
}

// ------------------------------------------------------------------ daily quests
export function questsPanel(parent: Container, W: number, H: number, onChange: () => void) {
  const { panel, ph, pw, close } = popup(parent, W, H, 'Günlük Görevler', onChange);
  const list = quests();
  const draw = () => {
    for (const ch of [...panel.children]) if ((ch as any).__q) ch.destroy({ children: true });
    list.forEach((q, i) => {
      const row = new Container();
      (row as any).__q = true;
      row.y = -ph * 0.24 + i * 150;
      const bg = new Graphics().roundRect(-pw * 0.4, -60, pw * 0.8, 120, 20).fill({ color: 0x3b2210, alpha: 0.85 }).stroke({ width: 3, color: 0xc89a3c });
      const t = label(`${q.target} ${questText(q.key)}`, 26);
      t.anchor.set(0, 0.5);
      t.position.set(-pw * 0.37, -24);
      const bar = progressBar(pw * 0.42, 26, q.progress / q.target);
      bar.position.set(-pw * 0.37 + pw * 0.21, 24);
      const pt = label(`${q.progress}/${q.target}`, 20);
      pt.position.copyFrom(bar.position);
      row.addChild(bg, t, bar, pt);
      if (q.claimed) {
        const d = label('Alındı', 28, { fill: 0x9fe08a });
        d.x = pw * 0.27;
        row.addChild(d);
      } else if (q.progress >= q.target) {
        const b = new Button('green', 170, `+${q.reward}`, () => {
          q.claimed = true;
          grant({ coins: q.reward });
          sfx.coin();
          save();
          draw();
        }, 30);
        b.x = pw * 0.27;
        row.addChild(b);
      } else {
        const ic = new Sprite(tex('ic_coin'));
        ic.anchor.set(0.5);
        ic.scale.set(0.36);
        ic.x = pw * 0.22;
        const r = label(String(q.reward), 28, { fill: 0xffe066 });
        r.x = pw * 0.3;
        row.addChild(ic, r);
      }
      panel.addChild(row);
    });
  };
  draw();
  const info = label('Görevler her gün yenilenir.', 24, INK);
  info.y = ph * 0.22;
  panel.addChild(info);
  const b = new Button('red', 240, 'Kapat', close, 36);
  b.y = ph * 0.34;
  panel.addChild(b);
}

// ------------------------------------------------------------------ weekly treasure road
export function roadPanel(parent: Container, W: number, H: number, onChange: () => void) {
  const { panel, ph, pw, close } = popup(parent, W, H, 'Hazine Yolu', onChange);
  const rd = road();
  const top = label(`Bu hafta: ${rd.points} puan`, 30, INK);
  top.y = -ph * 0.31;
  const sub = label('Seviye geç: +1 · Zor: +2 · Çok Zor: +3', 20, INK);
  sub.y = -ph * 0.265;
  panel.addChild(top, sub);
  const draw = () => {
    for (const ch of [...panel.children]) if ((ch as any).__r) ch.destroy({ children: true });
    ROAD.forEach((t, i) => {
      const row = new Container();
      (row as any).__r = true;
      row.y = -ph * 0.21 + i * 64;
      const reached = rd.points >= t.at;
      const claimed = rd.claimed.includes(i);
      const node = new Graphics().circle(-pw * 0.34, 0, 24).fill({ color: reached ? 0xd9a53c : 0x5a4030 }).stroke({ width: 3, color: 0xfff2c8 });
      const at = label(String(t.at), 22);
      at.x = -pw * 0.34;
      const txt = label(rewardText(t.reward), 22, reached ? { fill: 0xffffff } : { fill: 0xcbb89a });
      txt.anchor.set(0, 0.5);
      txt.x = -pw * 0.27;
      const bg = new Graphics().roundRect(-pw * 0.4, -27, pw * 0.8, 54, 16).fill({ color: 0x3b2210, alpha: reached ? 0.9 : 0.55 });
      row.addChild(bg, node, at, txt);
      if (claimed) {
        const d = label('Alındı', 22, { fill: 0x9fe08a });
        d.x = pw * 0.3;
        row.addChild(d);
      } else if (reached) {
        const b = new Button('green', 120, 'Al', () => {
          rd.claimed.push(i);
          grant(t.reward);
          sfx.coin();
          save();
          draw();
        }, 26);
        b.x = pw * 0.3;
        b.setBaseScale(0.8);
        row.addChild(b);
      }
      panel.addChild(row);
    });
  };
  draw();
  void close;
  void getSave;
}

// ------------------------------------------------------------------ weekly tournament
export function cupPanel(parent: Container, W: number, H: number, onChange: () => void) {
  const { panel, ph, pw, close } = popup(parent, W, H, 'Kraliyet Kupası', onChange);
  const c = cup();
  if (c.pending) {
    const pend = c.pending;
    const t = label(`Geçen hafta ${pend.rank}. oldun!`, 32, INK);
    t.y = -ph * 0.2;
    const r = label(`Ödül: ${rewardText(pend.reward)}`, 24, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    r.y = -ph * 0.08;
    const trophy = safeIcon(hasTex('trophy') ? 'trophy' : 'ui_star', 150);
    trophy.y = -ph * 0.32 + 10;
    const b = new Button('green', 260, 'Topla', () => {
      grant(pend.reward);
      delete (c as any).pending;
      save();
      sfx.coin();
      close();
      cupPanel(parent, W, H, onChange);
    }, 38);
    b.y = ph * 0.2;
    panel.addChild(trophy, t, r, b);
    return;
  }
  const head = label(`Bitime: ${cupTimeLeft()}`, 24, INK);
  head.y = -ph * 0.33;
  const sub = label('Seviye geç: +1 · Zor: +2 · Çok Zor: +3', 19, INK);
  sub.y = -ph * 0.295;
  panel.addChild(head, sub);
  const board = cupBoard();
  const meIdx = board.findIndex((b) => b.me);
  // show top 7 + the player's row
  const rows = board.slice(0, 7).map((b, i) => ({ ...b, rank: i + 1 }));
  if (meIdx >= 7) rows.push({ ...board[meIdx], rank: meIdx + 1 });
  rows.forEach((b, i) => {
    const row = new Container();
    row.y = -ph * 0.22 + i * 60;
    const bg = new Graphics().roundRect(-pw * 0.4, -25, pw * 0.8, 50, 14).fill({ color: b.me ? 0x2f6a1a : 0x3b2210, alpha: 0.9 }).stroke({ width: b.me ? 3 : 0, color: 0x9fe08a });
    const medal = b.rank <= 3 ? [0xffd23a, 0xd8d8e0, 0xd08a4a][b.rank - 1] : 0x6a5040;
    const rk = new Graphics().circle(-pw * 0.34, 0, 19).fill({ color: medal });
    const rt = label(String(b.rank), 20, { stroke: 0x3a1e0c });
    rt.x = -pw * 0.34;
    const nm = label(b.me ? 'Sen' : b.name, 22);
    nm.anchor.set(0, 0.5);
    nm.x = -pw * 0.28;
    const sc = label(String(b.score), 24, { fill: 0xffe066 });
    sc.x = pw * 0.32;
    row.addChild(bg, rk, rt, nm, sc);
    panel.addChild(row);
  });
  const myRank = meIdx + 1;
  const rw = cupReward(myRank);
  const info = label(rw ? `Şu an ${myRank}. sıradasın · Ödül: ${rewardText(rw)}` : `Şu an ${myRank}. sıradasın · İlk 10'a gir!`, 19, INK);
  info.y = ph * 0.3;
  panel.addChild(info);
}
