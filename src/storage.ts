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
}

export interface Stats {
  wins: number; losses: number; starsEarned: number; bestStreak: number; bestCombo: number;
  counts: Record<string, number>; // tiles, powers, crates… cleared
  fails: Record<string, number>; // per level: times given up
}

const KEY = 'medieval-match-save-v1';
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
};

let data: SaveData = structuredClone(DEFAULTS);
/** Set when the page was opened with ?level=N (testing): tutorials and start popups are skipped. */
export const DEV = { on: false };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = { ...structuredClone(DEFAULTS), ...JSON.parse(raw) };
    else data = structuredClone(DEFAULTS);
    data.inv = { ...DEFAULTS.inv, ...data.inv };
    data.album = { ...structuredClone(DEFAULTS.album), ...data.album };
    data.lives = { ...DEFAULTS.lives, ...data.lives };
    data.stats = { ...structuredClone(DEFAULTS.stats), ...data.stats };
    if (!Array.isArray(data.seen)) data.seen = [];
    data.best = Math.max(data.best ?? 0, data.level - 1);
    // older saves: count already finished levels as earned stars
    if (!data.stats.starsEarned && data.best > 0) data.stats.starsEarned = data.best;
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
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
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
    if (typeof parsed.level !== 'number') return false;
    data = { ...structuredClone(DEFAULTS), ...parsed };
    save();
    return true;
  } catch {
    return false;
  }
}
