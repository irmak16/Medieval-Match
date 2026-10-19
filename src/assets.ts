import { Assets, Texture } from 'pixi.js';

const NAMES = [
  'tile_red', 'tile_blue', 'tile_green', 'tile_yellow', 'tile_purple',
  'pw_arrow', 'pw_barrel', 'pw_falcon', 'pw_orb',
  'ob_crate1', 'ob_crate2', 'ob_crate3', 'ob_stone1', 'ob_stone2', 'ob_stone3', 'ob_chain', 'ob_vines',
  'ui_frame', 'ui_panel', 'ui_popup', 'ui_btn_green', 'ui_btn_red', 'ui_btn_round', 'ui_star', 'ui_star_empty',
  'ic_heart', 'ic_coin', 'ic_gear', 'ic_lock',
  'fx_wood1', 'fx_wood2', 'fx_wood3', 'fx_wood4', 'fx_stone1', 'fx_stone2', 'fx_stone3', 'fx_stone4',
  'fx_leaf1', 'fx_leaf2', 'fx_leaf3', 'fx_link1', 'fx_link2',
  'p_glow', 'p_ring', 'p_sparkle', 'p_smoke', 'p_streak', 'p_star',
];

export async function loadAssets(onProgress?: (p: number) => void): Promise<void> {
  const WEBP = new Set(['ui_frame', 'ui_popup', 'ui_panel', 'ui_btn_green', 'ui_btn_red']);
  const list = NAMES.map((n) => ({ alias: n, src: `assets/${n}.${WEBP.has(n) ? 'webp' : 'png'}` }));
  list.push({ alias: 'bg_game', src: 'assets/bg_game.jpg' });
  Assets.addBundle('main', list);
  await Assets.loadBundle('main', onProgress);
}

/** Optional art (added over time). Missing files are simply skipped and the game uses fallbacks. */
const CARD_IDS = ['a', 'b', 'c'].flatMap((s) => Array.from({ length: 9 }, (_, i) => `card_${s}${i + 1}`));
export const OPTIONAL: string[] = [
  'bt_hammer', 'bt_row', 'bt_col', 'bt_shuffle', 'it_chest', 'ob_vines_grow',
  ...[1, 2, 3, 4, 5, 6].flatMap((i) => [`castle_${i}`, `castle_${i}_ruin`]),
  'pip_wave', 'pip_happy', 'pip_sad', 'pip_scared', 'pip_build',
  'card_pack', 'trophy', 'dungeon',
  ...CARD_IDS,
];
const loadedOptional = new Set<string>();

/** Optional assets are listed in assets/optional.json at build time (no 404 probing). */
export async function loadOptional(): Promise<void> {
  let list: Record<string, string> = {};
  try {
    const res = await fetch('assets/optional.json', { cache: 'no-cache' });
    if (res.ok) list = await res.json();
  } catch {
    /* none */
  }
  await Promise.all(
    OPTIONAL.filter((n) => list[n]).map(async (n) => {
      try {
        await Assets.load({ alias: n, src: `assets/${list[n]}` });
        loadedOptional.add(n);
      } catch {
        /* broken file */
      }
    }),
  );
}

export function hasTex(name: string): boolean {
  return loadedOptional.has(name);
}

/** Texture with a fallback when an optional asset is missing. */
export function texOr(name: string, fallback: string): Texture {
  return Texture.from(hasTex(name) ? name : fallback);
}

export function tex(name: string): Texture {
  return Texture.from(name);
}

export const COLOR_TEX = ['tile_red', 'tile_blue', 'tile_green', 'tile_yellow', 'tile_purple'];
// particle tint per tile color
export const COLOR_TINT = [0xff4a3a, 0x3fa0ff, 0x4ee04a, 0xffd23a, 0xc06aff];

// procedurally drawn ice floor (hp 2 = thick, hp 1 = cracked)
const iceCache: Record<number, Texture> = {};
export function iceTex(hp: number): Texture {
  if (iceCache[hp]) return iceCache[hp];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = 20;
  const path = () => {
    g.beginPath();
    g.moveTo(6 + r, 6);
    g.arcTo(122, 6, 122, 122, r);
    g.arcTo(122, 122, 6, 122, r);
    g.arcTo(6, 122, 6, 6, r);
    g.arcTo(6, 6, 122, 6, r);
    g.closePath();
  };
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, hp >= 2 ? 'rgba(170,225,255,0.95)' : 'rgba(190,235,255,0.75)');
  grad.addColorStop(1, hp >= 2 ? 'rgba(70,150,230,0.95)' : 'rgba(110,185,240,0.7)');
  path();
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.stroke();
  // shine
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.moveTo(18, 30);
  g.lineTo(46, 14);
  g.lineTo(56, 14);
  g.lineTo(18, 42);
  g.closePath();
  g.fill();
  if (hp >= 2) {
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 4;
    g.strokeRect(20, 20, 88, 88);
  } else {
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(64, 64); g.lineTo(30, 40); g.moveTo(64, 64); g.lineTo(100, 50);
    g.moveTo(64, 64); g.lineTo(80, 108); g.moveTo(64, 64); g.lineTo(28, 96);
    g.moveTo(46, 52); g.lineTo(40, 70);
    g.stroke();
  }
  iceCache[hp] = Texture.from(c);
  return iceCache[hp];
}
