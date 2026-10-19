import { Container, Graphics, Sprite } from 'pixi.js';
import { getLevel } from '../levels';
import { tex, COLOR_TEX } from '../assets';
import { label, Button, iconButton, Counter, overlay } from '../ui';
import { tween, Ease } from '../tween';
import { getSave, save, DEV } from '../storage';
import { updateMusic } from '../audio';
import type { App } from '../main';
import { dailyAvailable, questsClaimable, roadClaimable, streakBonus, lives, nextLifeIn, MAX_LIVES, refillLives, REFILL_COST, cup } from '../liveops';
import { dailyPanel, questsPanel, roadPanel, cupPanel, popup } from './panels';
import { rescueAvailable } from './rescue';
import { Pip, hasPip } from '../mascot';
import { hasTex } from '../assets';
import { exportCode, importCode } from '../storage';
import { sfx } from '../audio';
import type { Text } from 'pixi.js';
import { nextTaskCost } from './castle';

let dailyShownThisSession = false;

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

  constructor(private app: App, public W: number, public H: number) {
    super();
    const s = getSave();

    // floating decorative tiles
    const deco = [
      { t: 'pw_barrel', x: 0.12, y: 0.8, s: 90, r: 0.1 },
      { t: 'pw_orb', x: 0.88, y: 0.8, s: 95, r: -0.05 },
    ];
    for (const d of deco) {
      const sp = new Sprite(tex(d.t));
      sp.anchor.set(0.5);
      sp.scale.set(d.s / sp.texture.width);
      sp.rotation = d.r;
      sp.position.set(d.x * W, d.y * H);
      this.addChild(sp);
      this.floaters.push({ s: sp, base: sp.y, ph: Math.random() * 6, amp: 10 + Math.random() * 8 });
    }

    // title
    const crown = new Sprite(tex('tile_yellow'));
    crown.anchor.set(0.5);
    crown.scale.set(190 / crown.texture.width);
    crown.position.set(W / 2, H * 0.17);
    this.addChild(crown);
    this.floaters.push({ s: crown, base: crown.y, ph: 0, amp: 8 });
    const t1 = label('Medieval', 104, { fill: 0xffd84a, stroke: 0x4a1e05, strokeW: 16 });
    t1.position.set(W / 2, H * 0.29);
    const t2 = label('Match', 124, { fill: 0xffffff, stroke: 0x8e1d1d, strokeW: 18 });
    t2.position.set(W / 2, H * 0.29 + 108);
    this.addChild(t1, t2);

    this.falcon = new Sprite(tex('pw_falcon'));
    this.falcon.anchor.set(0.5);
    this.falcon.scale.set(150 / this.falcon.texture.width);
    this.falcon.position.set(W / 2, H * 0.56);
    this.addChild(this.falcon);
    if (hasPip('wave')) {
      this.falcon.visible = false;
      this.pip = new Pip('wave', Math.min(300, H * 0.24));
      this.pip.position.set(W / 2, H * 0.73);
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
    const gear = iconButton('ic_gear', 84, () => this.openSettings());
    gear.position.set(W - 60, 60);
    this.addChild(hearts, this.heartTimer, this.coinCounter, stars, gear);

    // side buttons (right: events, left: castle + levels)
    const refresh = () => this.refreshBadges();
    const sy = (i: number) => 185 + i * 128;
    this.side(W - 70, sy(0), 'ic_heart', 'Günlük', () => dailyPanel(this, W, H, refresh), () => (dailyAvailable() ? 1 : 0));
    this.side(W - 70, sy(1), 'ui_star', 'Görevler', () => questsPanel(this, W, H, refresh), () => questsClaimable());
    this.side(W - 70, sy(2), 'ic_coin', 'Hazine Yolu', () => roadPanel(this, W, H, refresh), () => roadClaimable());
    this.side(W - 70, sy(3), hasTex('trophy') ? 'trophy' : 'tile_yellow', 'Kupa', () => cupPanel(this, W, H, refresh), () => (cup().pending ? 1 : 0));
    this.side(70, sy(0), 'tile_yellow', 'Kale', () => this.app.showCastle(), () => {
      const c = nextTaskCost();
      return c !== null && getSave().stars >= c ? 1 : 0;
    });
    this.side(70, sy(1), hasTex('card_pack') ? 'card_pack' : 'tile_purple', 'Albüm', () => this.app.showAlbum(), () => getSave().album.packs);
    this.side(70, sy(2), 'pw_falcon', "Pip'i Kurtar", () => {
      if (rescueAvailable()) this.app.showRescue();
      else {
        sfx.invalid();
        const left = getSave().rescue.nextAt - (getSave().level - 1);
        this.toast(`${left} seviye daha geç, Pip yine tehlikede olacak!`);
      }
    }, () => (rescueAvailable() ? 1 : 0));
    this.side(70, sy(3), 'ic_lock', 'Harita', () => this.app.showLevels(), () => 0);
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
      box.position.set(W / 2, H * 0.735);
      this.addChild(box);
    }

    // play
    const diff = getLevel(s.level).diff ?? 'normal';
    this.playBtn = new Button(diff === 'normal' ? 'green' : 'red', 440, `Seviye ${s.level}`, () => this.play(), 58);
    this.playBtn.position.set(W / 2, H * 0.89);
    this.addChild(this.playBtn);
    if (diff !== 'normal') {
      // Royal Match style "hard level" tag above the play button
      const tag = new Graphics().roundRect(-140, -24, 280, 48, 24).fill({ color: diff === 'hard' ? 0xa01e1e : 0x6a1fa0 }).stroke({ width: 4, color: 0xd9a53c });
      tag.position.set(W / 2, H * 0.89 - 128);
      const tt = label(diff === 'hard' ? 'Zor Seviye' : 'Çok Zor Seviye', 32);
      tt.position.copyFrom(tag.position);
      tt.y -= 2;
      this.addChild(tag, tt);
      this.floaters.push({ s: tag, base: tag.y, ph: 0.5, amp: 4 });
      this.floaters.push({ s: tt, base: tt.y, ph: 0.5, amp: 4 });
    }
    if (!dailyShownThisSession && dailyAvailable() && !DEV.on) {
      dailyShownThisSession = true;
      dailyPanel(this, W, H, () => this.refreshBadges());
    }
  }

  private play() {
    if (lives() <= 0 && !DEV.on) {
      this.livesPanel();
      return;
    }
    this.app.startLevel(getSave().level);
  }

  private toast(text: string) {
    const t = label(text, 26, { fill: 0xffe0b0 });
    t.position.set(this.W / 2, this.H * 0.47);
    if (t.width > this.W - 40) t.scale.set((this.W - 40) / t.width);
    this.addChild(t);
    tween(t, { alpha: 0, y: t.y - 50 }, 0.8, Ease.inQuad, 1.4).then(() => t.destroy());
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

  private side(x: number, y: number, icon: string, text: string, onTap: () => void, check: () => number) {
    const b = iconButton(icon, 92, onTap);
    b.position.set(x, y);
    const t = label(text, 21);
    t.position.set(x, y + 60);
    const badge = new Container();
    badge.addChild(new Graphics().circle(0, 0, 17).fill({ color: 0xd62020 }).stroke({ width: 3, color: 0xffffff }));
    badge.addChild(label('!', 22));
    badge.position.set(x + 32, y - 30);
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
      const ny = this.H * 0.56 + Math.sin(k * 2) * 40;
      f.scale.x = (Math.cos(k) >= 0 ? 1 : -1) * (150 / f.texture.width) * (1 + Math.sin(this.t * 12) * 0.04);
      f.scale.y = (150 / f.texture.width) * (1 - Math.sin(this.t * 12) * 0.03);
      f.rotation = (nx - f.x) * 0.02;
      f.position.set(nx, ny);
    }
    for (const b of this.sideButtons) if (b.badge.visible) b.badge.scale.set(1 + Math.sin(this.t * 5) * 0.12);
    for (const f of this.floaters) f.s.y = f.base + Math.sin(this.t * 1.6 + f.ph) * f.amp;
    const k = 1 + Math.sin(this.t * 4) * 0.035;
    this.playBtn.setBaseScale(k);
  }

  private openSettings() {
    const s = getSave();
    const root = new Container();
    root.addChild(overlay(this.W, this.H));
    const panel = new Container();
    const p = new Sprite(tex('ui_popup'));
    p.anchor.set(0.5);
    p.scale.set(Math.min(600, this.W - 60) / p.texture.width);
    const ph = p.height;
    panel.addChild(p);
    const title = label('Ayarlar', 46, { fill: 0xfff2c8, stroke: 0x5a0a0a });
    title.y = -ph / 2 + ph * 0.073;
    panel.addChild(title);
    const mk = (y: number, text: () => string, fn: () => void) => {
      const b: Button = new Button('green', 280, text(), () => {
        fn();
        panel.removeChild(b);
        b.destroy({ children: true });
        panel.addChild(mk(y, text, fn));
      }, 32);
      b.y = y;
      return b;
    };
    panel.addChild(
      mk(-ph * 0.24, () => `Ses: ${s.sound ? 'Açık' : 'Kapalı'}`, () => { s.sound = !s.sound; save(); }),
      mk(-ph * 0.11, () => `Müzik: ${s.music ? 'Açık' : 'Kapalı'}`, () => { s.music = !s.music; save(); updateMusic(); }),
    );
    const exp = new Button('green', 280, 'Kayıt Kodu Al', () => {
      const code = exportCode();
      try {
        navigator.clipboard?.writeText(code);
      } catch {
        /* ignore */
      }
      window.prompt('İlerleme kodun (kopyalandı). Diğer cihazda "Kodu Yükle" ile kullan:', code);
    }, 28);
    exp.y = ph * 0.02;
    const imp = new Button('green', 280, 'Kodu Yükle', () => {
      const code = window.prompt('Kayıt kodunu yapıştır:');
      if (!code) return;
      if (importCode(code)) {
        root.destroy({ children: true });
        this.app.showMenu();
      } else window.alert('Kod geçersiz.');
    }, 28);
    imp.y = ph * 0.15;
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
