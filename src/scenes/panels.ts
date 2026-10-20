// Live-ops popups: daily reward, daily quests, weekly treasure road.
import { Container, Graphics, Sprite } from 'pixi.js';
import { tex, hasTex, jarTex, flagTex } from '../assets';
import { label, Button, overlay } from '../ui';
import { tween, Ease, after } from '../tween';
import { sfx } from '../audio';
import {
  DAILY, dailyAvailable, dailyIndex, claimDaily, quests, questText, ROAD, road, grant, rewardText, Reward,
} from '../liveops';
import { getSave, save } from '../storage';
import { cup, cupBoard, cupReward, cupTimeLeft } from '../liveops';
import {
  PIGGY_MIN, PIGGY_MAX, piggyBreak, chestProgress, openChest, CHEST_EVERY, raceState, startRace, raceReward, claimRace, RACE_TARGET,
} from '../liveops';

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

// ------------------------------------------------------------------ piggy bank
export function piggyPanel(parent: Container, W: number, H: number, onChange: () => void) {
  const { panel, ph, pw, close } = popup(parent, W, H, 'Hazine Kumbarası', onChange);
  const s = getSave();
  const k = s.piggy / PIGGY_MAX;
  const jar = new Sprite(jarTex(k));
  jar.anchor.set(0.5);
  jar.scale.set(1.7);
  jar.y = -ph * 0.17;
  panel.addChild(jar);
  const amount = label(`${s.piggy} altın`, 40, { fill: 0xffe066 });
  amount.y = ph * 0.0;
  const bar = progressBar(pw * 0.62, 30, k, 0xffcf3a);
  bar.y = ph * 0.075;
  const mark = new Graphics().rect(-2, -20, 4, 40).fill({ color: 0xffffff });
  mark.position.set(-pw * 0.31 + pw * 0.62 * (PIGGY_MIN / PIGGY_MAX), ph * 0.075);
  panel.addChild(amount, bar, mark);
  const info = label(
    s.piggy >= PIGGY_MAX ? 'Kumbara tamamen doldu!\nKırmazsan artık dolmaz.'
      : s.piggy >= PIGGY_MIN ? 'Kırmaya hazır! İstersen bekle,\ndaha da dolsun (en fazla 1500).'
        : `Her kazandığın seviye kumbarayı doldurur.\n${PIGGY_MIN} altında kırılabilir.`,
    23, INK);
  info.style.lineHeight = 32;
  info.y = ph * 0.17;
  panel.addChild(info);
  const b = new Button(s.piggy >= PIGGY_MIN ? 'green' : 'red', 360, s.piggy >= PIGGY_MIN ? 'Kumbarayı Kır!' : 'Kapat', () => {
    if (getSave().piggy < PIGGY_MIN) {
      close();
      return;
    }
    b.enabled = false;
    // shake, crack, coin burst
    const x0 = jar.x;
    const shake = (n: number): Promise<void> =>
      n <= 0 ? Promise.resolve() : tween(jar, { x: x0 + (n % 2 ? 10 : -10) }, 0.05).then(() => shake(n - 1));
    sfx.crate();
    shake(8).then(() => {
      const got = piggyBreak();
      sfx.barrel();
      sfx.coin();
      for (let i = 0; i < 24; i++) {
        const c = new Sprite(tex('ic_coin'));
        c.anchor.set(0.5);
        c.scale.set(0.25);
        c.position.set(jar.x, jar.y);
        panel.addChild(c);
        const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 160;
        tween(c, { x: Math.cos(a) * d, y: jar.y + Math.sin(a) * d * 0.7 - 40 }, 0.5, Ease.outCubic, i * 0.01).then(() =>
          tween(c, { alpha: 0 }, 0.3, Ease.inQuad, 0.3).then(() => c.destroy()));
      }
      tween(jar.scale, { x: 2.1, y: 1.3 }, 0.12).then(() => tween(jar, { alpha: 0 }, 0.2));
      amount.text = `+${got} altın!`;
      after(1.3, () => close(), 'ui');
    });
  }, 34);
  b.y = ph * 0.32;
  panel.addChild(b);
}

// ------------------------------------------------------------------ star chest
export function chestPanel(parent: Container, W: number, H: number, onChange: () => void) {
  const { root, panel, ph, pw, close } = popup(parent, W, H, 'Yıldız Sandığı', onChange);
  const p = chestProgress();
  const chest = safeIcon(hasTex('it_chest') ? 'it_chest' : 'ui_star', 190);
  chest.y = -ph * 0.17;
  panel.addChild(chest);
  const t = label(p.ready ? 'Sandık hazır!' : `${p.have} / ${p.need} yıldız`, 36, INK);
  t.y = ph * 0.0;
  const bar = progressBar(pw * 0.62, 30, p.have / p.need, 0xffd23a);
  bar.y = ph * 0.075;
  const info = label(`Her ${CHEST_EVERY} yıldızda bir sandık açılır:\naltın, güçlendirici ve bazen kart paketi.`, 23, INK);
  info.style.lineHeight = 32;
  info.y = ph * 0.17;
  panel.addChild(t, bar, info);
  if (!p.ready) {
    const c = new Button('red', 240, 'Kapat', close, 34);
    c.y = ph * 0.32;
    panel.addChild(c);
    return;
  }
  const b = new Button('green', 280, 'Aç!', () => {
    b.enabled = false;
    sfx.crate();
    const s0 = chest.scale.x;
    tween(chest.scale, { x: s0 * 1.15, y: s0 * 0.85 }, 0.12).then(() => tween(chest.scale, { x: s0 * 1.3, y: s0 * 1.3 }, 0.2, Ease.outBack)).then(() => {
      const r = openChest();
      sfx.star();
      sfx.coin();
      const glow = new Sprite(tex('p_glow'));
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = 0xffd060;
      glow.scale.set(4);
      glow.position.copyFrom(chest.position);
      panel.addChildAt(glow, 1);
      t.text = r ? rewardText(r) : '';
      t.style.fontSize = 28;
      b.visible = false;
      after(1.8, () => {
        if (root.destroyed) return;
        if (chestProgress().ready) {
          root.destroy({ children: true });
          chestPanel(parent, W, H, onChange);
        } else close();
      }, 'ui');
    });
  }, 40);
  b.y = ph * 0.32;
  panel.addChild(b);
}

// ------------------------------------------------------------------ knights' race
export function racePanel(parent: Container, W: number, H: number, onChange: () => void) {
  const { panel, ph, pw, close } = popup(parent, W, H, 'Şövalye Yarışı', onChange);
  const st = raceState();
  if (!st || st.claimed) {
    const fl = new Sprite(flagTex());
    fl.anchor.set(0.5);
    fl.scale.set(1.4);
    fl.y = -ph * 0.18;
    const t = label(`${RACE_TARGET} seviyeyi ilk bitiren kazanır!\n4 şövalyeye karşı 24 saat.`, 28, INK);
    t.style.lineHeight = 38;
    t.y = ph * 0.0;
    const rw = label(`1.: ${rewardText(raceReward(1)!)}\n2.: ${rewardText(raceReward(2)!)} · 3.: ${rewardText(raceReward(3)!)}`, 20, { fill: 0x2f7a1a, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    rw.style.lineHeight = 28;
    rw.y = ph * 0.13;
    const b = new Button('green', 300, 'Yarışa Katıl', () => {
      startRace();
      close();
      racePanel(parent, W, H, onChange);
    }, 34);
    b.y = ph * 0.3;
    panel.addChild(fl, t, rw, b);
    return;
  }
  const head = label(st.over ? 'Yarış bitti!' : `Kalan süre: ${Math.floor(st.left / 3600000)} sa ${Math.floor((st.left % 3600000) / 60000)} dk`, 26, INK);
  head.y = -ph * 0.32;
  panel.addChild(head);
  // track: one lane per racer
  st.racers.forEach((r, i) => {
    const y = -ph * 0.22 + i * 82;
    const lane = new Graphics().roundRect(-pw * 0.4, y - 32, pw * 0.8, 64, 18).fill({ color: r.me ? 0x2f6a1a : 0x3b2210, alpha: 0.9 }).stroke({ width: r.me ? 3 : 0, color: 0x9fe08a });
    const medal = i < 3 ? [0xffd23a, 0xd8d8e0, 0xd08a4a][i] : 0x6a5040;
    const rk = new Graphics().circle(-pw * 0.35, y, 18).fill({ color: medal });
    const rt = label(String(i + 1), 20, { stroke: 0x3a1e0c });
    rt.position.set(-pw * 0.35, y);
    const nm = label(r.name, 20);
    nm.anchor.set(0, 0.5);
    nm.position.set(-pw * 0.3, y - 14);
    const track = progressBar(pw * 0.5, 16, r.wins / RACE_TARGET, r.me ? 0x9fe08a : 0xffcf3a);
    track.position.set(-pw * 0.3 + pw * 0.25, y + 14);
    const n = label(`${r.wins}/${RACE_TARGET}`, 20, { fill: 0xffe066 });
    n.position.set(pw * 0.32, y);
    panel.addChild(lane, rk, rt, nm, track, n);
    if (r.wins >= RACE_TARGET) {
      const f = new Sprite(flagTex());
      f.anchor.set(0.5);
      f.scale.set(0.3);
      f.position.set(pw * 0.25, y - 14);
      panel.addChild(f);
    }
  });
  if (st.over) {
    const rw = raceReward(st.rank);
    const t = label(rw ? `${st.rank}. oldun! Ödül: ${rewardText(rw)}` : `${st.rank}. oldun. Bir dahakine!`, 21, INK);
    t.y = ph * 0.22;
    const b = new Button('green', 280, rw ? 'Topla' : 'Tamam', () => {
      claimRace();
      if (rw) { sfx.coin(); sfx.star(); }
      close();
    }, 34);
    b.y = ph * 0.32;
    panel.addChild(t, b);
  } else {
    const t = label('Her kazandığın seviye seni 1 adım ilerletir.', 21, INK);
    t.y = ph * 0.25;
    panel.addChild(t);
  }
}

// ------------------------------------------------------------------ statistics
export function statsPanel(parent: Container, W: number, H: number) {
  const { panel, ph, pw } = popup(parent, W, H, 'İstatistikler');
  const s = getSave();
  const st = s.stats;
  const c = st.counts;
  const total = st.wins + st.losses;
  const rows: [string, string][] = [
    ['Geçilen seviye', String(s.best)],
    ['Kazanma oranı', total ? `%${Math.round((st.wins / total) * 100)} (${st.wins}/${total})` : '-'],
    ['En uzun seri', String(st.bestStreak)],
    ['En büyük kombo', st.bestCombo ? `x${st.bestCombo}` : '-'],
    ['Patlatılan taş', String(c.tile ?? 0)],
    ['Oluşturulan güçlendirici', String(c.power ?? 0)],
    ['Güçlendirici kombosu', String(c.combo ?? 0)],
    ['Kırılan sandık / taş', `${c.crate ?? 0} / ${c.stone ?? 0}`],
  ];
  rows.forEach(([k, v], i) => {
    const y = -ph * 0.27 + i * 46;
    const bg = new Graphics().roundRect(-pw * 0.4, y - 20, pw * 0.8, 40, 12).fill({ color: 0x3b2210, alpha: i % 2 ? 0.7 : 0.85 });
    const a = label(k, 21);
    a.anchor.set(0, 0.5);
    a.position.set(-pw * 0.37, y);
    const b = label(v, 22, { fill: 0xffe066 });
    b.anchor.set(1, 0.5);
    b.position.set(pw * 0.37, y);
    panel.addChild(bg, a, b);
  });
  const worst = Object.entries(st.fails).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const hy = -ph * 0.27 + rows.length * 46 + 14;
  const head = label('En çok zorlandığın seviyeler', 22, INK);
  head.y = hy;
  panel.addChild(head);
  const list = label(worst.length ? worst.map(([n, k]) => `${n} (${k} kez)`).join('  ·  ') : 'Henüz yok — harika gidiyorsun!', 20, { fill: 0x8e1d1d, stroke: 0xfff2d0, strokeW: 4, shadow: false });
  list.y = hy + 34;
  if (list.width > pw * 0.8) list.scale.set((pw * 0.8) / list.width);
  panel.addChild(list);
}
