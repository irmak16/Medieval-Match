import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getLevel } from '../levels';
import { tex, COLOR_TEX, jarTex, flagTex, chartTex } from '../assets';
import { label, Button, iconButton, Counter, overlay } from '../ui';
import { tween, Ease, fadeUpAndDestroy } from '../tween';
import { getSave, save, DEV } from '../storage';
import { updateMusic } from '../audio';
import type { App } from '../main';
import { dailyAvailable, questsClaimable, roadClaimable, streakBonus, lives, nextLifeIn, MAX_LIVES, refillLives, REFILL_COST, cup, PIGGY_MIN, PIGGY_MAX, chestProgress, raceBadge } from '../liveops';
import { dailyPanel, questsPanel, roadPanel, cupPanel, popup, piggyPanel, chestPanel, racePanel, statsPanel } from './panels';
import { rescueAvailable } from './rescue';
import { Pip, hasPip } from '../mascot';
import { hasTex, homeTex, mapTex } from '../assets';
import { unlocked, rescueVisible, lockText, initUnlocks, pendingUnlock, markUnlockShown, feature, Feature, FeatureKey } from '../unlocks';
import { exportCode, importCode } from '../storage';
import { sfx } from '../audio';
import type { Text } from 'pixi.js';
import { nextTaskCost } from './castle';

let dailyShownThisSession = false;

/** True when the game runs as an installed app (home-screen / standalone display mode). */
function isInstalled(): boolean {
  try {
    return ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches) || (navigator as any).standalone === true;
  } catch {
    return false;
  }
}

export class MenuScene extends Container {
  private floaters: { s: Container; base: number; ph: number; amp: number }[] = [];
  private t = 0;
  private playBtn: Button;
  private falcon!: Sprite;
  private sideButtons: { badge: Container; check: () => number }[] = [];
  private pip: Pip | null = null;
  private heartTxt!: Text;
  private heartTimer!: Text;
  private coinCounter!: Counter;
  private lastSec = -1;
  private playScale = 1;
  private falconY = 0;

  constructor(private app: App, public W: number, public H: number) {
    super();
    initUnlocks();
    const s = getSave();

    // vertical layout: title block on top, the bottom bar below everything, play button just above the bar
    const barH = 116;
    const barTop = H - 14 - barH;
    const crownY = Math.max(176, H * 0.145);
    const t1Y = crownY + 124;
    const t2Y = t1Y + 100;
    const colTop = t2Y + 58 + 40; // side columns start below the title
    const playScale = 0.85;
    this.playScale = playScale;

    // title
    const crown = new Sprite(tex('tile_yellow'));
    crown.anchor.set(0.5);
    crown.scale.set(170 / crown.texture.width);
    crown.position.set(W / 2, crownY);
    this.addChild(crown);
    this.floaters.push({ s: crown, base: crown.y, ph: 0, amp: 8 });
    const t1 = label('Medieval', 104, { fill: 0xffd84a, stroke: 0x4a1e05, strokeW: 16 });
    t1.position.set(W / 2, t1Y);
    const t2 = label('Match', 124, { fill: 0xffffff, stroke: 0x8e1d1d, strokeW: 18 });
    t2.position.set(W / 2, t2Y);
    if (t1.width > W - 30) t1.scale.set((W - 30) / t1.width);
    this.addChild(t1, t2);

    // play button (just above the bottom bar), then the streak box and Pip stack upwards from it
    const diff = getLevel(s.level).diff ?? 'normal';
    this.playBtn = new Button(diff === 'normal' ? 'green' : 'red', 440, `Seviye ${s.level}`, () => this.play(), 58);
    const playY = barTop - 12 - (this.playBtn.h * playScale) / 2;
    const playTop = playY - (this.playBtn.h * playScale) / 2;
    const streakY = playTop - (diff !== 'normal' && s.streak > 0 ? 96 : 44);
    const pipBottom = streakY - (s.streak > 0 ? 44 : 8);
    const pipSize = Math.max(120, Math.min(300, pipBottom - (t2Y + 66)));
    this.falconY = (pipBottom + t2Y + 66) / 2;
    this.falcon = new Sprite(tex('pw_falcon'));
    this.falcon.anchor.set(0.5);
    this.falcon.scale.set(150 / this.falcon.texture.width);
    this.falcon.position.set(W / 2, this.falconY);
    this.addChild(this.falcon);
    if (hasPip('wave')) {
      this.falcon.visible = false;
      this.pip = new Pip('wave', pipSize);
      this.pip.position.set(W / 2, pipBottom);
      this.addChild(this.pip);
      this.pip.popIn(0.2);
      this.pip.eventMode = 'static';
      this.pip.on('pointertap', () => {
        sfx.click();
        this.pip?.setPose(Math.random() < 0.5 ? 'happy' : 'wave');
      });
    }

    // counters + settings
    const hearts = new Counter('ic_heart', lives(), 140);
    hearts.position.set(92, 60);
    this.heartTxt = hearts.txt;
    this.heartTimer = label('', 18, { fill: 0xffd0c0 });
    this.heartTimer.position.set(110, 98);
    hearts.eventMode = 'static';
    hearts.cursor = 'pointer';
    hearts.on('pointertap', () => this.livesPanel());
    this.coinCounter = new Counter('ic_coin', s.coins, 170);
    this.coinCounter.position.set(275, 60);
    const stars = new Counter('ui_star', s.stars, 140);
    stars.position.set(448, 60);
    stars.eventMode = 'static';
    stars.cursor = 'pointer';
    stars.on('pointertap', () => chestPanel(this, W, H, () => this.app.showMenu()));
    // star chest progress under the star counter
    const cp = chestProgress();
    const chestBar = new Graphics()
      .roundRect(400, 88, 110, 12, 6).fill({ color: 0x2a160a, alpha: 0.85 })
      .roundRect(402, 90, Math.max(8, 106 * Math.min(1, cp.have / cp.need)), 8, 4).fill({ color: cp.ready ? 0x5fe05a : 0xffd23a });
    this.addChild(chestBar);
    const gear = iconButton('ic_gear', 84, () => this.openSettings());
    gear.position.set(W - 60, 60);
    this.addChild(hearts, this.heartTimer, this.coinCounter, stars, gear);
    if (cp.ready) {
      const badge = new Container();
      badge.addChild(new Graphics().circle(0, 0, 15).fill({ color: 0xd62020 }).stroke({ width: 3, color: 0xffffff }));
      badge.addChild(label('!', 20));
      badge.position.set(505, 38);
      this.addChild(badge);
      this.sideButtons.push({ badge, check: () => chestProgress().ready });
    }

    // side buttons: the activities (right: daily things, left: Pip + piggy bank). Locked ones are not shown at all.
    const refresh = () => this.refreshBadges();
    const step = Math.min(120, (barTop - 93 - colTop) / 4);
    const bsz = Math.min(92, step - 27);
    type SideDef = { feat: FeatureKey | null; show: () => boolean; icon: string | Texture; text: string; tap: () => void; check: () => number };
    const rightCol: SideDef[] = [
      { feat: 'daily', show: () => true, icon: 'ic_heart', text: 'Günlük', tap: () => dailyPanel(this, W, H, refresh), check: () => (dailyAvailable() ? 1 : 0) },
      { feat: 'quests', show: () => true, icon: 'ui_star', text: 'Görevler', tap: () => questsPanel(this, W, H, refresh), check: () => questsClaimable() },
      { feat: 'road', show: () => true, icon: 'ic_coin', text: 'Hazine Yolu', tap: () => roadPanel(this, W, H, refresh), check: () => roadClaimable() },
      { feat: 'cup', show: () => true, icon: hasTex('trophy') ? 'trophy' : 'tile_yellow', text: 'Kupa', tap: () => cupPanel(this, W, H, refresh), check: () => (cup().pending ? 1 : 0) },
      { feat: 'race', show: () => true, icon: flagTex(), text: 'Yarış', tap: () => racePanel(this, W, H, refresh), check: () => raceBadge() },
    ];
    const leftCol: SideDef[] = [
      {
        feat: null, show: () => rescueVisible(), icon: 'pw_falcon', text: "Pip'i Kurtar",
        tap: () => {
          if (rescueAvailable()) this.app.showRescue();
          else {
            sfx.invalid();
            const left = getSave().rescue.nextAt - (getSave().level - 1);
            this.toast(`${left} seviye daha geç, Pip yine tehlikede olacak!`);
          }
        },
        check: () => (rescueAvailable() ? 1 : 0),
      },
      { feat: 'piggy', show: () => true, icon: jarTex(s.piggy / PIGGY_MAX), text: 'Kumbara', tap: () => piggyPanel(this, W, H, () => this.app.showMenu()), check: () => (getSave().piggy >= PIGGY_MIN ? 1 : 0) },
    ];
    const place = (col: SideDef[], x: number) => {
      let i = 0;
      for (const d of col) {
        if ((d.feat && !unlocked(d.feat)) || !d.show()) continue;
        this.side(x, colTop + i * step, bsz, d.icon, d.text, d.tap, d.check);
        i++;
      }
      return i;
    };
    const rightN = place(rightCol, W - 70);
    place(leftCol, 70);

    // bottom navigation bar
    this.buildBar(W, barTop, barH);
    this.refreshBadges();

    // win streak indicator
    const sb = streakBonus();
    if (s.streak > 0) {
      const box = new Container();
      const bg = new Graphics().roundRect(-200, -32, 400, 64, 32).fill({ color: 0x2a1408, alpha: 0.85 }).stroke({ width: 3, color: 0xffa040 });
      const t = label(`Galibiyet serisi: ${s.streak}`, 26, { fill: 0xffc070 });
      t.x = -60;
      box.addChild(bg, t);
      ['pw_arrow', 'pw_barrel', 'pw_orb'].forEach((n, i) => {
        const ic = new Sprite(tex(n));
        ic.anchor.set(0.5);
        ic.scale.set(46 / ic.texture.width);
        ic.x = 95 + i * 46;
        ic.alpha = i < sb.length ? 1 : 0.25;
        box.addChild(ic);
      });
      box.position.set(W / 2, streakY);
      this.addChild(box);
    }

    // decoration next to the play button (only where the side columns leave room)
    const deco = [{ t: 'pw_barrel', x: 0.12, s: 90, r: 0.1, show: true }, { t: 'pw_orb', x: 0.88, s: 95, r: -0.05, show: rightN <= 3 }];
    for (const d of deco) {
      if (!d.show) continue;
      const sp = new Sprite(tex(d.t));
      sp.anchor.set(0.5);
      sp.scale.set(d.s / sp.texture.width);
      sp.rotation = d.r;
      sp.position.set(d.x * W, playY);
      this.addChild(sp);
      this.floaters.push({ s: sp, base: sp.y, ph: Math.random() * 6, amp: 10 + Math.random() * 8 });
    }

    // play
    this.playBtn.position.set(W / 2, playY);
    this.playBtn.setBaseScale(playScale);
    this.addChild(this.playBtn);
    if (diff !== 'normal') {
      // Royal Match style "hard level" tag above the play button
      const tag = new Graphics().roundRect(-140, -24, 280, 48, 24).fill({ color: diff === 'hard' ? 0xa01e1e : 0x6a1fa0 }).stroke({ width: 4, color: 0xd9a53c });
      tag.position.set(W / 2, playTop - 30);
      const tt = label(diff === 'hard' ? 'Zor Seviye' : 'Çok Zor Seviye', 32);
      tt.position.copyFrom(tag.position);
      tt.y -= 2;
      this.addChild(tag, tt);
      this.floaters.push({ s: tag, base: tag.y, ph: 0.5, amp: 4 });
      this.floaters.push({ s: tt, base: tt.y, ph: 0.5, amp: 4 });
    }
    this.firstPopups();
  }

  /** Popups on arriving at the menu, strictly one at a time: unlock news first, then the daily reward or the hint. */
  private firstPopups() {
    const next = pendingUnlock();
    if (next) {
      this.unlockPanel(next, () => this.firstPopups());
      return;
    }
    if (!dailyShownThisSession && unlocked('daily') && dailyAvailable() && !DEV.on) {
      dailyShownThisSession = true;
      dailyPanel(this, this.W, this.H, () => this.refreshBadges());
    } else if (!this.unlockShown && getSave().best >= 5 && !getSave().homeHint && !DEV.on && !isInstalled()) {
      this.homeHintPanel();
    }
  }

  private unlockShown = false;

  private unlockPanel(f: Feature, onClose: () => void) {
    this.unlockShown = true;
    markUnlockShown(f.key);
    const { panel, ph, close } = popup(this, this.W, this.H, `Yeni: ${f.name}`, onClose);
    const ic = new Sprite(typeof f.icon() === 'string' ? tex(f.icon() as string) : (f.icon() as Texture));
    ic.anchor.set(0.5);
    const base = 190 / Math.max(ic.texture.width, ic.texture.height);
    ic.position.set(0, -ph * 0.16);
    panel.addChild(ic);
    ic.scale.set(0);
    tween(ic.scale, { x: base, y: base }, 0.45, Ease.outBack, 0.15);
    const t = label(f.text, 28, { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false });
    t.style.lineHeight = 40;
    t.y = ph * 0.07;
    if (t.width > 500) t.scale.set(500 / t.width);
    panel.addChild(t);
    const b = new Button('green', 260, 'Tamam', close, 38);
    b.y = ph * 0.31;
    panel.addChild(b);
  }

  /** Bottom tabs: Kale, Albüm, Ana (selected here), Harita. A locked tab is greyed with a lock and explains itself when tapped. */
  private buildBar(W: number, barTop: number, barH: number) {
    const bar = new Container();
    bar.addChild(new Graphics().roundRect(14, barTop, W - 28, barH, 30).fill({ color: 0x2a1408, alpha: 0.94 }).stroke({ width: 5, color: 0xd9a53c }));
    const tabs: { text: string; icon: string | Texture; feat: FeatureKey | null; tap: () => void; check: () => number }[] = [
      {
        text: 'Kale', icon: 'tile_yellow', feat: 'castle', tap: () => this.app.showCastle(),
        check: () => {
          const c = nextTaskCost();
          return c !== null && getSave().stars >= c ? 1 : 0;
        },
      },
      { text: 'Albüm', icon: hasTex('card_pack') ? 'card_pack' : 'tile_purple', feat: 'album', tap: () => this.app.showAlbum(), check: () => getSave().album.packs },
      { text: 'Ana', icon: homeTex(), feat: null, tap: () => {}, check: () => 0 },
      { text: 'Harita', icon: mapTex(), feat: null, tap: () => this.app.showLevels(), check: () => 0 },
    ];
    const sw = (W - 28) / 4;
    tabs.forEach((tb, i) => {
      const cx = 14 + sw * (i + 0.5);
      const locked = !!tb.feat && !unlocked(tb.feat);
      const home = tb.text === 'Ana';
      const node = new Container();
      node.position.set(cx, barTop + barH / 2);
      if (home) node.addChild(new Graphics().roundRect(-sw / 2 + 8, -barH / 2 + 8, sw - 16, barH - 16, 22).fill({ color: 0x8e1d1d, alpha: 0.95 }).stroke({ width: 4, color: 0xd9a53c }));
      const hit = new Graphics().rect(-sw / 2, -barH / 2, sw, barH).fill({ color: 0xffffff, alpha: 0.001 });
      const ic = new Sprite(typeof tb.icon === 'string' ? tex(tb.icon) : tb.icon);
      ic.anchor.set(0.5);
      ic.scale.set(64 / Math.max(ic.texture.width, ic.texture.height));
      ic.y = -14;
      const lb = label(tb.text, 22, locked ? { fill: 0xa89a88 } : {});
      lb.y = barH / 2 - 26;
      node.addChild(hit, ic, lb);
      if (locked) {
        ic.tint = 0x707070;
        ic.alpha = 0.7;
        const lk = new Sprite(tex('ic_lock'));
        lk.anchor.set(0.5);
        lk.scale.set(0.26);
        lk.position.set(20, 2);
        node.addChild(lk);
      }
      node.eventMode = 'static';
      node.cursor = 'pointer';
      node.on('pointertap', () => {
        if (locked) {
          sfx.invalid();
          this.toast(lockText(tb.feat!), this.H * 0.47);
        } else if (!home) {
          sfx.click();
          tb.tap();
        }
      });
      bar.addChild(node);
      if (!locked) {
        const badge = new Container();
        badge.addChild(new Graphics().circle(0, 0, 15).fill({ color: 0xd62020 }).stroke({ width: 3, color: 0xffffff }));
        badge.addChild(label('!', 20));
        badge.position.set(cx + 34, barTop + 24);
        bar.addChild(badge);
        this.sideButtons.push({ badge, check: tb.check });
      }
    });
    this.addChild(bar);
  }

  /** One-time hint: browsers can wipe site data, so suggest installing the game and making a backup code. */
  private homeHintPanel() {
    const { panel, ph, close } = popup(this, this.W, this.H, 'İlerlemeni Koru', () => {
      getSave().homeHint = true;
      save();
    });
    const ink = { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false } as const;
    const t = label('İlerlemen bu tarayıcıda\nsaklanıyor ve silinebilir.\nOyunu ana ekrana ekle,\nilerlemen korunsun.\n\nYedek için:\nAyarlar > "Kayıt Kodu Al"', 28, ink);
    t.y = -ph * 0.04;
    panel.addChild(t);
    const b = new Button('green', 260, 'Tamam', close, 38);
    b.y = ph * 0.33;
    panel.addChild(b);
  }

  private play() {
    if (lives() <= 0 && !DEV.on) {
      this.livesPanel();
      return;
    }
    this.app.startLevel(getSave().level);
  }

  private toast(text: string, y = this.H * 0.47) {
    const t = label(text, 26, { fill: 0xffe0b0 });
    t.position.set(this.W / 2, y);
    if (t.width > this.W - 40) t.scale.set((this.W - 40) / t.width);
    this.addChild(t);
    fadeUpAndDestroy(t, 50, 0.8, 1.4);
  }

  private livesPanel() {
    const { panel, ph, close } = popup(this, this.W, this.H, 'Canlar');
    const n = lives();
    for (let i = 0; i < MAX_LIVES; i++) {
      const h = new Sprite(tex('ic_heart'));
      h.anchor.set(0.5);
      h.scale.set(0.55);
      h.position.set((i - 2) * 90, -ph * 0.2);
      if (i >= n) h.tint = 0x444444;
      panel.addChild(h);
    }
    const ink = { fill: 0x5a2e0e, stroke: 0xfff2d0, strokeW: 4, shadow: false } as const;
    const t = label(n >= MAX_LIVES ? 'Canların dolu!' : `Sonraki can: ${nextLifeIn()}\nHer 20 dakikada 1 can dolar.`, 28, ink);
    t.y = -ph * 0.04;
    panel.addChild(t);
    if (n < MAX_LIVES) {
      const b = new Button('green', 330, `Doldur (${REFILL_COST} altın)`, () => {
        if (refillLives()) {
          sfx.coin();
          close();
          this.app.showMenu();
        } else sfx.invalid();
      }, 28);
      b.y = ph * 0.18;
      if (getSave().coins < REFILL_COST) b.alpha = 0.55;
      panel.addChild(b);
    }
    const c = new Button('red', 240, 'Kapat', close, 34);
    c.y = ph * 0.33;
    panel.addChild(c);
  }

  private side(x: number, y: number, size: number, icon: string | Texture, text: string, onTap: () => void, check: () => number) {
    const b = iconButton(icon, size, onTap);
    b.position.set(x, y);
    const t = label(text, 21);
    t.position.set(x, y + size / 2 + 14);
    if (t.width > 124) t.scale.set(124 / t.width); // never clipped by the screen edge or the title
    const badge = new Container();
    badge.addChild(new Graphics().circle(0, 0, 17).fill({ color: 0xd62020 }).stroke({ width: 3, color: 0xffffff }));
    badge.addChild(label('!', 22));
    badge.position.set(x + size * 0.35, y - size * 0.33);
    this.addChild(b, t, badge);
    this.sideButtons.push({ badge, check });
  }

  refreshBadges() {
    for (const b of this.sideButtons) b.badge.visible = b.check() > 0;
  }

  update(dt: number) {
    this.t += dt;
    this.pip?.update(dt);
    const sec = Math.floor(this.t);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      const n = lives();
      this.heartTxt.text = String(n);
      this.heartTimer.text = n >= MAX_LIVES ? 'Dolu' : nextLifeIn();
    }
    // falcon glides around in a lazy figure-eight
    const f = this.falcon;
    if (f && !f.destroyed && f.visible) {
      const k = this.t * 0.45;
      const nx = this.W / 2 + Math.sin(k) * this.W * 0.3;
      const ny = this.falconY + Math.sin(k * 2) * 40;
      f.scale.x = (Math.cos(k) >= 0 ? 1 : -1) * (150 / f.texture.width) * (1 + Math.sin(this.t * 12) * 0.04);
      f.scale.y = (150 / f.texture.width) * (1 - Math.sin(this.t * 12) * 0.03);
      f.rotation = (nx - f.x) * 0.02;
      f.position.set(nx, ny);
    }
    for (const b of this.sideButtons) if (b.badge.visible) b.badge.scale.set(1 + Math.sin(this.t * 5) * 0.12);
    for (const f of this.floaters) f.s.y = f.base + Math.sin(this.t * 1.6 + f.ph) * f.amp;
    const k = 1 + Math.sin(this.t * 4) * 0.035;
    this.playBtn.setBaseScale(k * this.playScale);
  }

  private openSettings() {
    const s = getSave();
    const root = new Container();
    root.addChild(overlay(this.W, this.H));
    const panel = new Container();
    const p = new Sprite(tex('ui_popup'));
    p.anchor.set(0.5);
    p.scale.set(Math.min(640, this.W - 40) / p.texture.width);
    const ph = p.height;
    panel.addChild(p);
    const title = label('Ayarlar', 46, { fill: 0xfff2c8, stroke: 0x5a0a0a });
    title.y = -ph / 2 + ph * 0.073;
    panel.addChild(title);
    const mk = (x: number, y: number, w: number, text: () => string, fn: () => void) => {
      const b: Button = new Button('green', w, text(), () => {
        fn();
        panel.removeChild(b);
        b.destroy({ children: true });
        panel.addChild(mk(x, y, w, text, fn));
      }, 27);
      b.position.set(x, y);
      b.setBaseScale(0.8);
      return b;
    };
    const gfxName = { auto: 'Otomatik', low: 'Düşük', high: 'Yüksek' } as const;
    panel.addChild(
      mk(-140, -ph * 0.26, 300, () => `Ses: ${s.sound ? 'Açık' : 'Kapalı'}`, () => { s.sound = !s.sound; save(); }),
      mk(140, -ph * 0.26, 300, () => `Müzik: ${s.music ? 'Açık' : 'Kapalı'}`, () => { s.music = !s.music; save(); updateMusic(); }),
      mk(-140, -ph * 0.14, 300, () => `Şekiller: ${s.symbols ? 'Açık' : 'Kapalı'}`, () => {
        s.symbols = !s.symbols;
        save();
        if (s.symbols) this.toast('Taşlara renk körleri için şekil eklendi');
      }),
      mk(140, -ph * 0.14, 300, () => `Grafik: ${gfxName[s.gfx]}`, () => {
        s.gfx = s.gfx === 'auto' ? 'low' : s.gfx === 'low' ? 'high' : 'auto';
        save();
        this.toast('Grafik ayarı yeniden açılışta tam uygulanır');
      }),
    );
    const st = new Button('green', 400, 'İstatistikler', () => statsPanel(root, this.W, this.H), 30);
    st.y = ph * 0.01;
    st.setBaseScale(0.8);
    const stIc = new Sprite(chartTex());
    stIc.anchor.set(0.5);
    stIc.scale.set(0.38);
    stIc.position.set(-150, -4);
    st.addChild(stIc);
    panel.addChild(st);
    const exp = new Button('green', 300, 'Kayıt Kodu Al', () => {
      const code = exportCode();
      try {
        navigator.clipboard?.writeText(code);
      } catch {
        /* ignore */
      }
      window.prompt('İlerleme kodun (kopyalandı). Diğer cihazda "Kodu Yükle" ile kullan:', code);
    }, 27);
    exp.position.set(-140, ph * 0.15);
    exp.setBaseScale(0.8);
    const imp = new Button('green', 300, 'Kodu Yükle', () => {
      const code = window.prompt('Kayıt kodunu yapıştır:');
      if (!code) return;
      if (importCode(code)) {
        root.destroy({ children: true });
        this.app.showMenu();
      } else window.alert('Kod geçersiz.');
    }, 27);
    imp.position.set(140, ph * 0.15);
    imp.setBaseScale(0.8);
    panel.addChild(exp, imp);
    const close = new Button('red', 260, 'Kapat', () => root.destroy({ children: true }), 34);
    close.y = ph * 0.31;
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
