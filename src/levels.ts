// Level definitions — sawtooth difficulty curve (Royal Match style):
// tension builds over a few levels, peaks at a "Zor" (hard) or "Çok Zor" (super hard) level,
// then drops to a relief level. New mechanics are always introduced on an easy level.
//
// Grid legend:
//  .  random tile          x  no cell (hole)
//  1 2 3  wooden crate (hp)    4 5 6  stone block (hp 1..3)
//  v  thorny vines          c  chained random tile
//  H V  arrow (horizontal/vertical)   B barrel   F falcon   O crystal orb
import { EXTRA_LEVELS } from './levels_extra';

export type GoalType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'crate' | 'stone' | 'chain' | 'vines';
export type Difficulty = 'normal' | 'hard' | 'superhard';
export interface GoalDef { type: GoalType; count?: number }
export interface LevelDef { moves: number; colors: number; grid: string[]; goals: GoalDef[]; diff?: Difficulty }

export const COLOR_GOALS: GoalType[] = ['red', 'blue', 'green', 'yellow', 'purple'];

const L: LevelDef[] = [
  // ---------------------------------------------------------------- 1-5: basics
  // 1 · first steps
  { moves: 15, colors: 4, goals: [{ type: 'red', count: 20 }], grid: [
    'xx....xx', 'x......x', '........', '........', '........', '........', 'x......x', 'xx....xx'] },
  // 2 · two colors
  { moves: 15, colors: 4, goals: [{ type: 'blue', count: 28 }, { type: 'yellow', count: 28 }], grid: [
    '........', '........', '........', '........', '........', '........', '........', '........'] },
  // 3 · crates intro
  { moves: 15, colors: 4, goals: [{ type: 'crate' }, { type: 'green', count: 25 }], grid: [
    '........', '........', '........', '........', '........', '........', '11111111', '11111111'] },
  // 4 · crate pyramid + color
  { moves: 15, colors: 4, goals: [{ type: 'crate' }, { type: 'green', count: 14 }], grid: [
    '........', '........', '........', '...11...', '..1111..', '.111111.', '11....11', '1......1'] },
  // 5 · HARD: double crates at the bottom
  { diff: 'hard', moves: 16, colors: 4, goals: [{ type: 'crate' }], grid: [
    'x......x', '........', '........', '........', '........', '22222222', '22222222', '11....11'] },

  // ---------------------------------------------------------------- 6-10: chains & stone
  // 6 · relief: chains intro, barrels to play with
  { moves: 15, colors: 4, goals: [{ type: 'chain' }, { type: 'red', count: 30 }], grid: [
    '........', '........', 'cc....cc', 'cc.BB.cc', '........', '..cccc..', '........', '........'] },
  // 7 · stone intro
  { moves: 18, colors: 4, goals: [{ type: 'stone' }, { type: 'blue', count: 30 }], grid: [
    'x......x', '........', '..5555..', '..5..5..', '..5..5..', '..5555..', '........', 'x......x'] },
  // 8 · relief: vines + color
  { moves: 15, colors: 4, goals: [{ type: 'vines' }, { type: 'red', count: 40 }], grid: [
    'vvv..vvv', 'vv....vv', 'v......v', '........', '........', '........', '........', '........'] },
  // 9 · crates & chains mix
  { moves: 18, colors: 4, goals: [{ type: 'crate' }, { type: 'chain' }], grid: [
    '........', '.cc..cc.', '.cc..cc.', '........', '222..222', '1......1', '1......1', '11111111'] },
  // 10 · SUPER HARD: castle walls
  { diff: 'superhard', moves: 22, colors: 4, goals: [{ type: 'stone' }, { type: 'crate' }], grid: [
    '5.5..5.5', '55....55', '5......5', '5.2222.5', '5.2332.5', '5.2222.5', '5......5', '55555555'] },

  // ---------------------------------------------------------------- 11-15: shapes & 5 colors
  // 11 · relief: orbs on board
  { moves: 15, colors: 4, goals: [{ type: 'green', count: 55 }], grid: [
    'xx....xx', 'x......x', '........', '...OO...', '........', '........', 'x......x', 'xx....xx'] },
  // 12 · diamond of crates
  { moves: 26, colors: 4, goals: [{ type: 'crate' }], grid: [
    '........', '...11...', '..1221..', '.123321.', '.123321.', '..1221..', '...11...', '........'] },
  // 13 · relief: 5 colors for the first time, but generous
  { moves: 24, colors: 5, goals: [{ type: 'purple', count: 40 }, { type: 'blue', count: 40 }], grid: [
    '........', '........', '........', '...FF...', '........', '........', '........', '........'] },
  // 14 · stone pillars
  { moves: 18, colors: 4, goals: [{ type: 'stone' }, { type: 'blue', count: 40 }], grid: [
    '........', '.5....5.', '.5....5.', '.5....5.', '.5....5.', '.5....5.', '.5....5.', '........'] },
  // 15 · HARD: everything together
  { diff: 'hard', moves: 18, colors: 4, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'chain' }], grid: [
    '33....33', '3......3', '..cccc..', '..4444..', '..4444..', '..cccc..', '2......2', '22....22'] },

  // ---------------------------------------------------------------- 16-20: big boards
  // 16 · relief: 9x9 with power-ups
  { moves: 27, colors: 5, goals: [{ type: 'red', count: 55 }, { type: 'yellow', count: 55 }], grid: [
    '.........', '.........', '.........', '...F.F...', '....B....', '...F.F...', '.........', '.........', '.........'] },
  // 17 · crate floor
  { moves: 25, colors: 4, goals: [{ type: 'crate' }], grid: [
    '........', '........', '........', '........', '22222222', '22.22.22', '22222222', '11111111'] },
  // 18 · split board with vines
  { moves: 20, colors: 4, goals: [{ type: 'vines' }, { type: 'stone' }, { type: 'green', count: 40 }], grid: [
    '...xx...', '...xx...', '..v44v..', '..v44v..', '..v44v..', '..v44v..', '...xx...', '...xx...'] },
  // 19 · relief: chain frame with arrows
  { moves: 19, colors: 4, goals: [{ type: 'chain' }, { type: 'green', count: 45 }], grid: [
    'cc....cc', 'c......c', 'c......c', 'c..HV..c', 'c......c', 'c......c', 'c......c', 'cccccccc'] },
  // 20 · SUPER HARD: fortress
  { diff: 'superhard', moves: 22, colors: 4, goals: [{ type: 'stone' }, { type: 'crate' }, { type: 'chain' }], grid: [
    '........', '.666666.', '.6cccc6.', '.6c33c6.', '.6c33c6.', '.6cccc6.', '.666666.', '........'] },

  // ---------------------------------------------------------------- 21-25
  // 21 · relief: checker crates
  { moves: 20, colors: 4, goals: [{ type: 'crate' }, { type: 'yellow', count: 30 }], grid: [
    'x......x', '........', '2.2.2.2.', '.2.2.2.2', '2.2.2.2.', '.2.2.2.2', '........', 'x......x'] },
  // 22 · hourglass
  { moves: 20, colors: 4, goals: [{ type: 'vines' }, { type: 'chain' }, { type: 'blue', count: 40 }], grid: [
    '........', 'x......x', 'xxc..cxx', 'xxx..xxx', 'xxx..xxx', 'xxc..cxx', 'x.v..v.x', 'vv....vv'] },
  // 23 · HARD: stone bars, 5 colors
  { diff: 'hard', moves: 18, colors: 5, goals: [{ type: 'stone' }, { type: 'red', count: 20 }], grid: [
    '........', '........', '555..555', '........', '........', '55.55.55', '........', '........'] },
  // 24 · relief: barrels + vines
  { moves: 15, colors: 4, goals: [{ type: 'vines' }, { type: 'red', count: 50 }], grid: [
    'vvv..vvv', 'vv....vv', 'v......v', 'v......v', '........', '...B....', '....B...', '........'] },
  // 25 · HARD: crown of crates (9x9)
  { diff: 'hard', moves: 22, colors: 4, goals: [{ type: 'crate' }, { type: 'chain' }, { type: 'green', count: 30 }], grid: [
    '.........', '.2..2..2.', '.22.2.22.', '.2222222.', '.3333333.', '.cc.c.cc.', '.........', '.........', 'x.......x'] },

  // ---------------------------------------------------------------- 26-30: finale
  // 26 · stone X, 5 colors
  { moves: 28, colors: 5, goals: [{ type: 'red', count: 45 }, { type: 'blue', count: 45 }, { type: 'stone' }], grid: [
    '........', '........', '.4....4.', '..4..4..', '...44...', '..4..4..', '.4....4.', '........'] },
  // 27 · relief: open board with a crystal orb
  { moves: 15, colors: 4, goals: [{ type: 'crate' }, { type: 'yellow', count: 45 }], grid: [
    '........', '........', '...O....', '........', '........', '1......1', '11....11', '111..111'] },
  // 28 · towers
  { moves: 40, colors: 4, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'vines' }], grid: [
    'vv....vv', 'v.2..2.v', '..2..2..', '444..444', '........', '.3....3.', '.3....3.', '.333333.'] },
  // 29 · HARD: checkerboard of stone & crates
  { diff: 'hard', moves: 19, colors: 4, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'red', count: 30 }], grid: [
    '........', '.3.33.3.', '........', '5.5..5.5', '........', '........', '222..222', '22....22'] },
  // 30 · SUPER HARD: the king's vault
  { diff: 'superhard', moves: 29, colors: 5, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'chain' }, { type: 'vines' }], grid: [
    'vvv...vvv', 'v.......v', '..22222..', '..2ccc2..', '..2cOc2..', '..2ccc2..', '..22222..', '.........', '555...555'] },
];

/** Deterministic pseudo-random generator for endless levels after the hand-made ones. */
function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sawtooth difficulty for generated levels: every 5th is hard, every 10th super hard. */
export function difficultyFor(n: number): Difficulty {
  if (n % 10 === 0) return 'superhard';
  if (n % 5 === 0) return 'hard';
  return 'normal';
}

function generate(n: number): LevelDef {
  const r = mulberry(n * 7919);
  const diff = difficultyFor(n);
  const w = r() < 0.3 ? 9 : 8, h = w;
  const g: string[][] = Array.from({ length: h }, () => Array(w).fill('.'));
  const kinds = diff === 'normal' ? ['1', '2', '4', 'v', 'c'] : ['2', '3', '5', '6', 'v', 'c'];
  const patterns = diff === 'normal' ? 2 : 3;
  const half = Math.floor(w / 2) - 1; // keep the two center columns open so tiles can always fall
  for (let p = 0; p < patterns; p++) {
    const k = kinds[Math.floor(r() * kinds.length)];
    const y0 = 1 + Math.floor(r() * (h - 3)), x0 = Math.floor(r() * half);
    const ph = 1 + Math.floor(r() * 3), pw = 1 + Math.floor(r() * (half - x0));
    for (let y = y0; y < Math.min(h, y0 + ph); y++)
      for (let x = x0; x < Math.min(x0 + pw, half); x++) {
        g[y][x] = k;
        g[y][w - 1 - x] = k; // mirror
      }
  }
  if (r() < 0.4) { g[0][0] = 'x'; g[0][w - 1] = 'x'; g[h - 1][0] = 'x'; g[h - 1][w - 1] = 'x'; }
  // hit points per goal kind
  const hp = new Map<string, number>();
  for (const row of g) for (const ch of row) {
    const v = ch >= '1' && ch <= '6' ? ((+ch - 1) % 3) + 1 : 1;
    hp.set(ch, (hp.get(ch) ?? 0) + v);
  }
  const sum = (chars: string) => [...chars].reduce((a, ch) => a + (hp.get(ch) ?? 0), 0);
  const goals: GoalDef[] = [];
  let work = 0;
  if (sum('123')) { goals.push({ type: 'crate' }); work += sum('123') / 2.2; }
  if (sum('456')) { goals.push({ type: 'stone' }); work += sum('456') / 2.0; }
  if (sum('v')) { goals.push({ type: 'vines' }); work += sum('v') / 2.5; }
  if (sum('c')) { goals.push({ type: 'chain' }); work += sum('c') / 3; }
  // every generated level also has a color goal so it lasts a satisfying number of moves
  const count = 35 + Math.floor(r() * 20) + Math.min(40, Math.floor(n / 4)) + (diff === "normal" ? 0 : 10);
  goals.push({ type: COLOR_GOALS[Math.floor(r() * 4)], count });
  work += count / 3.3;
  const slack = diff === 'normal' ? 1.6 : diff === 'hard' ? 1.25 : 1.1;
  return {
    diff,
    moves: Math.max(18, Math.min(45, Math.round(work * slack + 4))),
    colors: diff === 'superhard' && r() < 0.5 ? 5 : 4,
    goals,
    grid: g.map((row) => row.join('')),
  };
}

export function getLevel(n: number): LevelDef {
  if (n <= L.length) return L[n - 1];
  if (n <= L.length + EXTRA_LEVELS.length) return EXTRA_LEVELS[n - L.length - 1];
  return generate(n);
}

export const LEVEL_COUNT = L.length;
