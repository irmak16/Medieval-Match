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

// procedurally drawn witch's cauldron (fill 0..3 = how close it is to boiling over)
const cauldronCache: Record<number, Texture> = {};
export function cauldronTex(fill: number): Texture {
  if (cauldronCache[fill]) return cauldronCache[fill];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // legs
  g.fillStyle = '#1b1b22';
  for (const x of [34, 94]) {
    g.beginPath();
    g.moveTo(x - 7, 100); g.lineTo(x + 7, 100); g.lineTo(x + 4, 120); g.lineTo(x - 4, 120);
    g.closePath(); g.fill();
  }
  // body
  const body = g.createRadialGradient(50, 60, 6, 64, 76, 60);
  body.addColorStop(0, '#5d5f72');
  body.addColorStop(0.55, '#2c2d38');
  body.addColorStop(1, '#101016');
  g.fillStyle = body;
  g.beginPath();
  g.ellipse(64, 76, 52, 40, 0, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#0a0a0e';
  g.stroke();
  // handles
  g.strokeStyle = '#3a3b48';
  g.lineWidth = 6;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.arc(64 + s * 54, 62, 9, 0, Math.PI * 2);
    g.stroke();
  }
  // liquid (glows more the fuller it is)
  const lv = Math.max(0, Math.min(3, fill));
  const liquid = ['#2d5a2a', '#3f9a2e', '#5fd03a', '#a8ff5a'][lv];
  if (lv >= 2) {
    g.shadowColor = '#9dff6a';
    g.shadowBlur = 8 + lv * 6;
  }
  g.fillStyle = liquid;
  g.beginPath();
  g.ellipse(64, 44, 44, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  // bubbles
  g.fillStyle = 'rgba(220,255,200,0.85)';
  const bubbles = [[48, 42, 5], [70, 46, 4], [84, 40, 3], [58, 38, 3], [40, 46, 3], [76, 36, 5]];
  for (let i = 0; i < lv * 2; i++) {
    const [x, y, r] = bubbles[i];
    g.beginPath();
    g.arc(x, y - lv * 3, r, 0, Math.PI * 2);
    g.fill();
  }
  // rim
  g.lineWidth = 7;
  g.strokeStyle = '#4a4c5c';
  g.beginPath();
  g.ellipse(64, 44, 47, 14, 0, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = '#8a8ca0';
  g.beginPath();
  g.ellipse(64, 42, 47, 13, 0, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
  // fill pips on the front
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(46 + i * 18, 88, 6, 0, Math.PI * 2);
    g.fillStyle = i < lv ? '#a8ff5a' : '#1a1a20';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#6a6c7c';
    g.stroke();
  }
  cauldronCache[fill] = Texture.from(c);
  return cauldronCache[fill];
}

// colour-blind helper symbols (one shape per tile colour)
const symCache: Record<number, Texture> = {};
export function symbolTex(color: number): Texture {
  if (symCache[color]) return symCache[color];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.lineWidth = 6;
  g.lineJoin = 'round';
  g.beginPath();
  if (color === 0) g.arc(32, 32, 16, 0, Math.PI * 2); // circle
  else if (color === 1) g.rect(16, 16, 32, 32); // square
  else if (color === 2) { g.moveTo(32, 12); g.lineTo(52, 50); g.lineTo(12, 50); g.closePath(); } // triangle
  else if (color === 3) { g.moveTo(32, 10); g.lineTo(54, 32); g.lineTo(32, 54); g.lineTo(10, 32); g.closePath(); } // diamond
  else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 9 : 21;
      if (i) g.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
      else g.moveTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r);
    }
    g.closePath();
  }
  g.stroke();
  g.fill();
  symCache[color] = Texture.from(c);
  return symCache[color];
}

// small conveyor icon (for tips)
let beltIcon: Texture | null = null;
export function beltTex(): Texture {
  if (beltIcon) return beltIcon;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4a3626';
  g.beginPath();
  g.roundRect(4, 34, 120, 60, 18);
  g.fill();
  g.strokeStyle = '#d9a53c';
  g.lineWidth = 5;
  g.stroke();
  g.strokeStyle = '#ffd27a';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const x of [30, 64, 98]) {
    g.beginPath();
    g.moveTo(x - 9, 46); g.lineTo(x + 9, 64); g.lineTo(x - 9, 82);
    g.stroke();
  }
  beltIcon = Texture.from(c);
  return beltIcon;
}

function canvasTex(draw: (g: CanvasRenderingContext2D) => void, size = 128): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!);
  return Texture.from(c);
}

/** Clay coin jar for the piggy bank (k = how full, 0..1). */
const jarCache: Record<number, Texture> = {};
export function jarTex(k = 1): Texture {
  const key = Math.round(Math.max(0, Math.min(1, k)) * 10);
  if (jarCache[key]) return jarCache[key];
  jarCache[key] = canvasTex((g) => {
    // body
    const body = g.createRadialGradient(48, 56, 8, 64, 74, 62);
    body.addColorStop(0, '#f0a868');
    body.addColorStop(0.6, '#c06a32');
    body.addColorStop(1, '#7a3a14');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(40, 22);
    g.bezierCurveTo(10, 40, 6, 110, 40, 120);
    g.lineTo(88, 120);
    g.bezierCurveTo(122, 110, 118, 40, 88, 22);
    g.closePath();
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#4a1e08';
    g.stroke();
    // window showing the coins inside
    g.save();
    g.beginPath();
    g.ellipse(64, 78, 30, 30, 0, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2a1408';
    g.fillRect(30, 44, 70, 70);
    const top = 108 - (key / 10) * 60;
    g.fillStyle = '#ffcf3a';
    g.fillRect(30, top, 70, 120);
    g.fillStyle = '#ffe98a';
    for (let y = top + 6; y < 110; y += 12) for (let x = 36 + ((y / 12) % 2) * 6; x < 96; x += 14) {
      g.beginPath();
      g.ellipse(x, y, 6, 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.lineWidth = 4;
    g.strokeStyle = '#4a1e08';
    g.beginPath();
    g.ellipse(64, 78, 30, 30, 0, 0, Math.PI * 2);
    g.stroke();
    // rim + coin slot
    g.fillStyle = '#d9a53c';
    g.fillRect(36, 12, 56, 14);
    g.strokeRect(36, 12, 56, 14);
    g.fillStyle = '#2a1408';
    g.fillRect(50, 16, 28, 5);
    // shine
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    g.ellipse(32, 64, 6, 18, 0.2, 0, Math.PI * 2);
    g.fill();
  });
  return jarCache[key];
}

/** Pennant on a pole (knights' race). */
let flag: Texture | null = null;
export function flagTex(): Texture {
  if (flag) return flag;
  flag = canvasTex((g) => {
    g.fillStyle = '#6a4020';
    g.fillRect(26, 10, 10, 112);
    g.fillStyle = '#ffd23a';
    g.beginPath();
    g.arc(31, 10, 9, 0, Math.PI * 2);
    g.fill();
    const grad = g.createLinearGradient(36, 20, 116, 60);
    grad.addColorStop(0, '#e03a2a');
    grad.addColorStop(1, '#9a1414');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(36, 20);
    g.quadraticCurveTo(80, 10, 118, 38);
    g.quadraticCurveTo(80, 50, 36, 74);
    g.closePath();
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#5a0a0a';
    g.stroke();
    g.fillStyle = '#ffd23a';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 13;
      g.lineTo(66 + Math.cos(a) * r, 42 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  return flag;
}

/** Bar chart icon (statistics). */
let chart: Texture | null = null;
export function chartTex(): Texture {
  if (chart) return chart;
  chart = canvasTex((g) => {
    const cols = ['#5fd04a', '#ffd23a', '#e03a2a'];
    [50, 84, 30].forEach((h, i) => {
      g.fillStyle = cols[i];
      g.fillRect(18 + i * 34, 112 - h, 26, h);
      g.lineWidth = 4;
      g.strokeStyle = '#3a1e0c';
      g.strokeRect(18 + i * 34, 112 - h, 26, h);
    });
    g.fillStyle = '#3a1e0c';
    g.fillRect(10, 112, 108, 6);
  });
  return chart;
}
