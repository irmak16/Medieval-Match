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

/** Optional art (booster icons, treasure chest, castle pieces). Missing files are simply skipped. */
export const OPTIONAL = [
  'bt_hammer', 'bt_row', 'bt_col', 'bt_shuffle', 'it_chest', 'ob_vines_grow',
  'castle_1', 'castle_2', 'castle_3', 'castle_4', 'castle_5', 'castle_6',
];
const loadedOptional = new Set<string>();

export async function loadOptional(): Promise<void> {
  await Promise.all(
    OPTIONAL.map(async (n) => {
      try {
        for (const ext of n.startsWith('castle_') ? ['jpg', 'png'] : ['png']) {
          const res = await fetch(`assets/${n}.${ext}`, { method: 'HEAD' });
          if (!res.ok || !(res.headers.get('content-type') || '').includes('image')) continue;
          await Assets.load({ alias: n, src: `assets/${n}.${ext}` });
          loadedOptional.add(n);
          return;
        }
      } catch {
        /* not available yet */
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
