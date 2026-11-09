// Features open up as the player progresses (measured by `best`, the highest level completed).
import type { Texture } from 'pixi.js';
import { getSave, save, DEV } from './storage';
import { flagTex, jarTex, hasTex } from './assets';
import { rescueAvailable } from './scenes/rescue';

export type FeatureKey = 'daily' | 'castle' | 'quests' | 'piggy' | 'album' | 'road' | 'cup' | 'race';

export interface Feature {
  key: FeatureKey;
  name: string; // shown in "Yeni: <name>"
  after: number; // unlocked once this many levels are completed
  abl: 'ten' | 'den' | 'dan'; // Turkish ablative suffix of the number ("3'ten", "10'dan")
  icon: () => string | Texture;
  text: string;
}

export const FEATURES: Feature[] = [
  { key: 'daily', name: 'Günlük Ödül', after: 2, abl: 'den', icon: () => 'ic_heart', text: 'Her gün gel, bir ödül topla!\nArka arkaya gelirsen ödüller büyür.' },
  { key: 'castle', name: 'Kale', after: 3, abl: 'ten', icon: () => (hasTex('castle_1') ? 'castle_1' : 'tile_yellow'), text: 'Kazandığın yıldızlarla kaleni onar.\nHer bölge bitince büyük ödül var!' },
  { key: 'quests', name: 'Görevler', after: 6, abl: 'dan', icon: () => 'ui_star', text: 'Her gün yeni görevler seni bekler.\nTamamla, altınları topla!' },
  { key: 'piggy', name: 'Kumbara', after: 8, abl: 'den', icon: () => jarTex(0.7), text: 'Her seviye kazanışında kumbara dolar.\nİstediğinde kır, altınlar senin olsun!' },
  { key: 'album', name: 'Kart Albümü', after: 10, abl: 'dan', icon: () => (hasTex('card_pack') ? 'card_pack' : 'tile_purple'), text: 'Kart paketleri aç, setleri tamamla.\nHer set için büyük bir ödül var!' },
  { key: 'road', name: 'Hazine Yolu', after: 12, abl: 'den', icon: () => 'ic_coin', text: 'Seviye kazandıkça puan topla,\nyol boyunca ödülleri aç!' },
  { key: 'cup', name: 'Kupa', after: 15, abl: 'ten', icon: () => (hasTex('trophy') ? 'trophy' : 'tile_yellow'), text: 'Haftalık kupada puan topla,\nöbür şövalyelerle yarış!' },
  { key: 'race', name: 'Şövalye Yarışı', after: 20, abl: 'den', icon: () => flagTex(), text: 'Şövalyelerle yarışa katıl.\nEn çok seviyeyi kazanan birinci olur!' },
];

export function feature(key: FeatureKey): Feature {
  return FEATURES.find((f) => f.key === key)!;
}

/** Dev mode (?level=N) treats everything as unlocked. */
export function unlocked(key: FeatureKey): boolean {
  return DEV.on || getSave().best >= feature(key).after;
}

/** The rescue mini-game keeps its own gate; its button only appears once the first one is available. */
export function rescueVisible(): boolean {
  return DEV.on || getSave().rescue.done > 0 || rescueAvailable();
}

export function lockText(key: FeatureKey): string {
  const f = feature(key);
  return `Seviye ${f.after}'${f.abl} sonra açılır`;
}

/**
 * Saves from before this system existed (never recorded any unlock) must not replay the whole backlog:
 * on the first menu visit everything already unlocked counts as shown.
 */
export function initUnlocks(): void {
  const s = getSave();
  if (s.unlocksInit || DEV.on) return;
  s.unlocksInit = true;
  for (const f of FEATURES) if (s.best >= f.after && !s.unlocks.includes(f.key)) s.unlocks.push(f.key);
}

/** The next newly unlocked feature whose popup has not been shown yet. */
export function pendingUnlock(): Feature | null {
  if (DEV.on) return null;
  const s = getSave();
  return FEATURES.find((f) => s.best >= f.after && !s.unlocks.includes(f.key)) ?? null;
}

export function markUnlockShown(key: FeatureKey): void {
  const s = getSave();
  if (!s.unlocks.includes(key)) s.unlocks.push(key);
  save();
}
