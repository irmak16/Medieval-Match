export interface SaveData {
  level: number; // next level to play (1-based)
  stars: number;
  coins: number;
  sound: boolean;
  music: boolean;
  seen: string[]; // tutorial tips already shown
  best: number; // highest level completed
  streak: number; // consecutive wins (win-streak bonus)
  inv: { hammer: number; row: number; col: number; shuffle: number }; // in-game booster inventory
  daily: { last: string; day: number };
  quests: { date: string; list: { key: string; target: number; progress: number; reward: number; claimed: boolean }[] };
  road: { week: string; points: number; claimed: number[] };
  castle: { done: string[] };
  album: { cards: Record<string, number>; packs: number; sets: string[] };
  cup: { week: string; score: number; claimed: string[] };
  lives: { n: number; t: number }; // current lives and timestamp when the next one started regenerating
  rescue: { done: number; nextAt: number }; // Pip rescue mini-game progress
  piggy: number; // coins collected in the piggy bank
  chest: number; // star chests already opened
  race: { start: number; wins: number; done: number; seed: number; claimed: boolean } | null; // knights' race
  stats: Stats;
  gfx: 'auto' | 'low' | 'high';
  symbols: boolean; // colour-blind helper shapes on tiles
  homeHint: boolean; // the "add to home screen / backup code" hint was dismissed
  unlocks: string[]; // feature-unlock popups already shown
  unlocksInit: boolean; // old saves have had their already-unlocked features marked as shown
}

export interface Stats {
  wins: number; losses: number; starsEarned: number; bestStreak: number; bestCombo: number;
  counts: Record<string, number>; // tiles, powers, crates… cleared
  fails: Record<string, number>; // per level: times given up
}

const KEY = 'medieval-match-save-v1';
const BACKUP_KEY = 'medieval-match-save-v1-bak'; // the previous good save
const DEFAULTS: SaveData = {
  level: 1, stars: 0, coins: 300, sound: true, music: true, seen: [], best: 0, streak: 0,
  inv: { hammer: 2, row: 1, col: 1, shuffle: 1 },
  daily: { last: '', day: 0 },
  quests: { date: '', list: [] },
  road: { week: '', points: 0, claimed: [] },
  castle: { done: [] },
  album: { cards: {}, packs: 1, sets: [] },
  cup: { week: '', score: 0, claimed: [] },
  lives: { n: 5, t: 0 },
  rescue: { done: 0, nextAt: 6 },
  piggy: 0,
  chest: 0,
  race: null,
  stats: { wins: 0, losses: 0, starsEarned: 0, bestStreak: 0, bestCombo: 0, counts: {}, fails: {} },
  gfx: 'auto',
  symbols: false,
  homeHint: false,
  unlocks: [],
  unlocksInit: false,
};

let data: SaveData = structuredClone(DEFAULTS);
/** Set when the page was opened with ?level=N (testing): tutorials and start popups are skipped. */
export const DEV = { on: false };

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Fills in anything missing or of the wrong type from the defaults, recursively (unknown keys are kept). */
function mergeDefaults(def: any, v: any): any {
  const out: any = isObj(v) ? { ...v } : {};
  for (const k of Object.keys(def)) {
    const d = def[k];
    if (Array.isArray(d)) {
      if (!Array.isArray(out[k])) out[k] = structuredClone(d);
    } else if (isObj(d)) out[k] = mergeDefaults(d, out[k]);
    else if (d === null) {
      if (!isObj(out[k])) out[k] = null;
    } else if (typeof out[k] !== typeof d || (typeof d === 'number' && !Number.isFinite(out[k]))) out[k] = d;
  }
  return out;
}

/** Turns whatever was stored (or imported) into a complete, valid save. */
function normalize(parsed: unknown): SaveData {
  const d: SaveData = mergeDefaults(DEFAULTS, parsed);
  if (!['auto', 'low', 'high'].includes(d.gfx)) d.gfx = 'auto';
  if (d.race && ![d.race.start, d.race.wins, d.race.done, d.race.seed].every((n) => Number.isFinite(n))) d.race = null;
  d.level = Math.max(1, Math.floor(d.level));
  d.best = Math.max(d.best ?? 0, d.level - 1);
  // older saves: count already finished levels as earned stars
  if (!d.stats.starsEarned && d.best > 0) d.stats.starsEarned = d.best;
  return d;
}

function readSlot(key: string): { raw: string; save: SaveData } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isObj(parsed)) return null;
    return { raw, save: normalize(parsed) };
  } catch {
    return null;
  }
}

let lastGoodRaw: string | null = null; // what the main key held after the last successful load/save

export function loadSave(): SaveData {
  data = structuredClone(DEFAULTS);
  try {
    // main key first; if it is missing or unreadable (e.g. evicted/corrupted), fall back to the backup
    let slot = readSlot(KEY);
    if (!slot) {
      slot = readSlot(BACKUP_KEY);
      if (slot) localStorage.setItem(KEY, slot.raw);
    }
    if (slot) {
      data = slot.save;
      lastGoodRaw = slot.raw;
    }
  } catch {
    /* storage unavailable: play without saving */
  }
  // dev helper: ?level=N jumps to a level
  try {
    const q = new URLSearchParams(location.search).get('level');
    if (q) {
      data.level = Math.max(1, parseInt(q, 10) || 1);
      DEV.on = true;
    }
  } catch {
    /* ignore */
  }
  return data;
}

export function save(): void {
  try {
    const raw = JSON.stringify(data);
    // keep the previous good save as a rolling backup before overwriting it
    if (lastGoodRaw && lastGoodRaw !== raw) {
      try {
        localStorage.setItem(BACKUP_KEY, lastGoodRaw);
      } catch {
        /* ignore */
      }
    }
    localStorage.setItem(KEY, raw);
    lastGoodRaw = raw;
  } catch {
    /* ignore */
  }
}

/** Asks the browser not to evict our storage; called once, after the first user interaction. */
export function requestPersistentStorage(): void {
  const ask = () => {
    try {
      navigator.storage?.persist?.()?.catch(() => {});
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('pointerdown', ask, { once: true });
}

export function getSave(): SaveData {
  return data;
}

/** Returns true the first time a tip key is asked for (and remembers it). */
export function firstTime(key: string): boolean {
  if (data.seen.includes(key)) return false;
  data.seen.push(key);
  save();
  return true;
}

/** Export the whole save as a short text code (for moving progress between devices). */
export function exportCode(): string {
  const json = JSON.stringify(data);
  return 'MM1-' + btoa(unescape(encodeURIComponent(json)));
}

export function importCode(code: string): boolean {
  try {
    const c = code.trim();
    if (!c.startsWith('MM1-')) return false;
    const parsed = JSON.parse(decodeURIComponent(escape(atob(c.slice(4)))));
    if (!isObj(parsed) || typeof parsed.level !== 'number' || !Number.isFinite(parsed.level)) return false;
    data = normalize(parsed);
    save();
    return true;
  } catch {
    return false;
  }
}
