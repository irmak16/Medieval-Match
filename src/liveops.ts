// Live-ops style systems that work offline: daily reward, daily quests, weekly treasure road, win streak.
import { getSave, save } from './storage';

export type Reward = { coins?: number; hammer?: number; row?: number; col?: number; shuffle?: number };

function pad(n: number) {
  return n < 10 ? '0' + n : String(n);
}
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** ISO-like week key (year + week number), weeks start on Monday. */
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${wk}`;
}

export function grant(r: Reward) {
  const s = getSave();
  s.coins += r.coins ?? 0;
  s.inv.hammer += r.hammer ?? 0;
  s.inv.row += r.row ?? 0;
  s.inv.col += r.col ?? 0;
  s.inv.shuffle += r.shuffle ?? 0;
  save();
}

export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins} altın`);
  if (r.hammer) parts.push(`${r.hammer} çekiç`);
  if (r.row) parts.push(`${r.row} okçu`);
  if (r.col) parts.push(`${r.col} mancınık`);
  if (r.shuffle) parts.push(`${r.shuffle} soytarı`);
  return parts.join(' + ');
}

// ------------------------------------------------------------------ daily reward (7-day cycle)
export const DAILY: Reward[] = [
  { coins: 50 },
  { hammer: 1 },
  { coins: 100 },
  { row: 1, col: 1 },
  { coins: 150 },
  { shuffle: 1, coins: 50 },
  { coins: 250, hammer: 2 },
];

export function dailyAvailable(): boolean {
  return getSave().daily.last !== todayKey();
}

/** Index in DAILY of the reward that would be claimed today. */
export function dailyIndex(): number {
  const d = getSave().daily;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const consecutive = d.last === todayKey(y);
  return consecutive ? d.day % DAILY.length : 0;
}

export function claimDaily(): Reward {
  const s = getSave();
  const i = dailyIndex();
  const r = DAILY[i];
  s.daily = { last: todayKey(), day: i + 1 };
  grant(r);
  return r;
}

// ------------------------------------------------------------------ daily quests
const QUEST_POOL: { key: string; target: number; reward: number; text: string }[] = [
  { key: 'tile', target: 250, reward: 60, text: 'taş patlat' },
  { key: 'power', target: 12, reward: 70, text: 'güçlendirici oluştur' },
  { key: 'combo', target: 3, reward: 80, text: 'güçlendirici kombosu yap' },
  { key: 'crate', target: 25, reward: 60, text: 'sandık kır' },
  { key: 'stone', target: 15, reward: 60, text: 'taş blok kır' },
  { key: 'chain', target: 10, reward: 50, text: 'zincir kır' },
  { key: 'vines', target: 12, reward: 50, text: 'sarmaşık temizle' },
  { key: 'win', target: 3, reward: 100, text: 'seviye kazan' },
  { key: 'booster', target: 2, reward: 50, text: 'güçlendirici kullan' },
];
export function questText(key: string): string {
  return QUEST_POOL.find((q) => q.key === key)?.text ?? key;
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function quests() {
  const s = getSave();
  const today = todayKey();
  if (s.quests.date !== today) {
    const rnd = seeded([...today].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
    const pool = [...QUEST_POOL];
    const list = [];
    // always one "win" quest, plus two random others
    list.push(pool.splice(pool.findIndex((q) => q.key === 'win'), 1)[0]);
    for (let i = 0; i < 2; i++) list.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    s.quests = { date: today, list: list.map((q) => ({ key: q.key, target: q.target, progress: 0, reward: q.reward, claimed: false })) };
    save();
  }
  return s.quests.list;
}

export function trackQuest(key: string, n = 1) {
  const list = quests();
  let changed = false;
  for (const q of list) if (q.key === key && q.progress < q.target) {
    q.progress = Math.min(q.target, q.progress + n);
    changed = true;
  }
  if (changed) save();
}

export function questsClaimable(): number {
  return quests().filter((q) => q.progress >= q.target && !q.claimed).length;
}

// ------------------------------------------------------------------ weekly treasure road
export const ROAD: { at: number; reward: Reward }[] = [
  { at: 2, reward: { coins: 50 } },
  { at: 5, reward: { hammer: 1 } },
  { at: 9, reward: { coins: 100 } },
  { at: 14, reward: { row: 1, col: 1 } },
  { at: 20, reward: { coins: 200 } },
  { at: 28, reward: { shuffle: 1, hammer: 1 } },
  { at: 38, reward: { coins: 350 } },
  { at: 50, reward: { coins: 500, hammer: 2, row: 1, col: 1 } },
];

export function road() {
  const s = getSave();
  const wk = weekKey();
  if (s.road.week !== wk) {
    s.road = { week: wk, points: 0, claimed: [] };
    save();
  }
  return s.road;
}

export function addRoadPoints(n: number) {
  road().points += n;
  save();
}

export function roadClaimable(): number {
  const r = road();
  return ROAD.filter((t, i) => r.points >= t.at && !r.claimed.includes(i)).length;
}

// ------------------------------------------------------------------ win streak bonus
/** Free pre-level power-ups for the current win streak (like Royal Match's streak gift). */
export function streakBonus(): ('ah' | 'barrel' | 'orb')[] {
  const k = getSave().streak;
  const out: ('ah' | 'barrel' | 'orb')[] = [];
  if (k >= 1) out.push('ah');
  if (k >= 2) out.push('barrel');
  if (k >= 3) out.push('orb');
  return out;
}
