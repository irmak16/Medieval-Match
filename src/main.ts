import '@fontsource/titan-one/latin-400.css';
import '@fontsource/titan-one/latin-ext-400.css';
import '@fontsource/baloo-2/latin-ext-800.css';
import { Application, Container, Sprite } from 'pixi.js';
import { loadAssets, loadOptional, tex } from './assets';
import { updateTweens } from './tween';
import { loadSave } from './storage';
import { unlockAudio, loadRecordedAudio } from './audio';
import { MenuScene } from './scenes/menu';
import { GameScene } from './scenes/game';
import { LevelsScene } from './scenes/levels';
import { CastleScene } from './scenes/castle';
import { AlbumScene } from './scenes/albumScene';
import { RescueScene } from './scenes/rescue';

const DESIGN_W = 720;
const MIN_H = 1150;

export class App {
  pixi = new Application();
  bg!: Sprite;
  root = new Container();
  scene: MenuScene | GameScene | LevelsScene | CastleScene | AlbumScene | RescueScene | null = null;
  sceneH = 1280;

  async start() {
    await this.pixi.init({
      resizeTo: window,
      background: '#2b1a10',
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    document.getElementById('app')!.appendChild(this.pixi.canvas);
    loadSave();
    try {
      await Promise.all([
        document.fonts.load('40px "Titan One"'),
        document.fonts.load('40px "Titan One"', 'ğüşıöçĞŞ'),
        document.fonts.load('800 40px "Baloo 2"', 'İ'),
      ]);
    } catch {
      /* fall back to system font */
    }
    const loader = document.getElementById('loader');
    await loadAssets((p) => {
      if (loader) loader.textContent = `Yükleniyor… %${Math.round(p * 100)}`;
    });
    await loadOptional();
    loadRecordedAudio();
    document.getElementById('loader')?.remove();

    this.bg = new Sprite(tex('bg_game'));
    this.bg.anchor.set(0.5);
    this.pixi.stage.addChild(this.bg, this.root);
    this.pixi.stage.eventMode = 'passive';
    window.addEventListener('pointerdown', () => unlockAudio());

    window.addEventListener('resize', () => this.layout());
    // ?speed=N runs N simulation steps per frame (only used for automated testing)
    let steps = 1;
    try {
      steps = Math.max(1, Math.min(8, parseInt(new URLSearchParams(location.search).get('speed') || '1', 10) || 1));
    } catch {
      /* ignore */
    }
    this.pixi.ticker.add((tk) => {
      const dt = Math.min(tk.deltaMS / 1000, 1 / 20);
      for (let i = 0; i < steps; i++) {
        updateTweens(dt);
        this.scene?.update(dt);
      }
    });
    (window as any).__mm = this; // handy for debugging in the console
    this.showMenu();
  }

  private metrics() {
    const sw = this.pixi.screen.width, sh = this.pixi.screen.height;
    const scale = Math.min(sw / DESIGN_W, sh / MIN_H);
    return { sw, sh, scale, h: sh / scale };
  }

  layout() {
    const { sw, sh } = this.metrics();
    const scale = Math.min(sw / DESIGN_W, sh / this.sceneH);
    this.root.scale.set(scale);
    this.root.position.set((sw - DESIGN_W * scale) / 2, (sh - this.sceneH * scale) / 2);
    const bs = Math.max(sw / this.bg.texture.width, sh / this.bg.texture.height);
    this.bg.scale.set(bs);
    this.bg.position.set(sw / 2, sh / 2);
  }

  private setScene(make: (h: number) => MenuScene | GameScene | LevelsScene | CastleScene | AlbumScene | RescueScene) {
    if (this.scene) this.scene.destroyScene();
    const { h } = this.metrics();
    this.sceneH = Math.min(h, 1600);
    this.scene = make(this.sceneH);
    this.root.addChild(this.scene);
    this.layout();
    this.scene.alpha = 0;
    const s = this.scene;
    const fade = () => {
      s.alpha = Math.min(1, s.alpha + 0.12);
      if (s.alpha < 1 && !s.destroyed) requestAnimationFrame(fade);
    };
    fade();
  }

  showMenu() {
    this.setScene((h) => new MenuScene(this, DESIGN_W, h));
  }

  showCastle() {
    this.setScene((h) => new CastleScene(this, DESIGN_W, h));
  }

  showAlbum() {
    this.setScene((h) => new AlbumScene(this, DESIGN_W, h));
  }

  showRescue() {
    this.setScene((h) => new RescueScene(this, DESIGN_W, h));
  }

  showLevels() {
    this.setScene((h) => new LevelsScene(this, DESIGN_W, h));
  }

  startLevel(n: number) {
    this.setScene((h) => new GameScene(this, n, DESIGN_W, h));
  }
}

new App().start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
