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
}

const KEY = 'medieval-match-save-v1';
const DEFAULTS: SaveData = {
  level: 1, stars: 0, coins: 300, sound: true, music: true, seen: [], best: 0, streak: 0,
  inv: { hammer: 2, row: 1, col: 1, shuffle: 1 },
  daily: { last: '', day: 0 },
  quests: { date: '', list: [] },
  road: { week: '', points: 0, claimed: [] },
  castle: { done: [] },
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
    if (!Array.isArray(data.seen)) data.seen = [];
    data.best = Math.max(data.best ?? 0, data.level - 1);
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
