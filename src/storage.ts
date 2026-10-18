export interface SaveData {
  level: number; // next level to play (1-based)
  stars: number;
  coins: number;
  sound: boolean;
  music: boolean;
  seen: string[]; // tutorial tips already shown
  best: number; // highest level completed
}

const KEY = 'medieval-match-save-v1';
const DEFAULTS: SaveData = { level: 1, stars: 0, coins: 300, sound: true, music: true, seen: [], best: 0 };

let data: SaveData = { ...DEFAULTS };
/** Set when the page was opened with ?level=N (testing): tutorials and start popups are skipped. */
export const DEV = { on: false };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = { ...DEFAULTS, ...JSON.parse(raw) };
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
