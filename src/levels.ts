// Level definitions — sawtooth difficulty curve (Royal Match style):
// tension builds over a few levels, peaks at a "Zor" (hard) or "Çok Zor" (super hard) level,
// then drops to a relief level. New mechanics are always introduced on an easy level.
//
// Grid legend:
//  .  random tile          x  no cell (hole)
//  1 2 3  wooden crate (hp)    4 5 6  stone block (hp 1..3)
//  v  thorny vines          c  chained random tile
//  H V  arrow (horizontal/vertical)   B barrel   F falcon   O crystal orb
//  i I  ice floor under a tile (1 / 2 hits)
//  g  growing vines (spread when you don't clear vines in a move)   T treasure (bring it to the bottom)
//  K  witch's cauldron (fills up with 4 hits, then boils over and hits everything around it)
//  7 8 9 0  coloured crate (red / blue / green / yellow): only a match of its colour (or a power-up) breaks it
import { EXTRA_LEVELS } from './levels_extra';

export type GoalType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'crate' | 'stone' | 'chain' | 'vines' | 'gold' | 'ice' | 'cauldron';
export type Difficulty = 'normal' | 'hard' | 'superhard';
export interface GoalDef { type: GoalType; count?: number }
export interface LevelDef {
  moves: number; colors: number; grid: string[]; goals: GoalDef[]; diff?: Difficulty;
  /** extra treasure items that drop in during play (on top of 'T' cells in the grid) */
  items?: number;
  /** portals: [fromRow, fromCol, toRow, toCol] — tiles leaving the bottom of "from" enter the top of "to" */
  portals?: [number, number, number, number][];
  /** conveyor belts: [row, direction] — after every move the row's tiles slide one cell (1 = right, -1 = left) */
  belts?: [number, number][];
}

export const COLOR_GOALS: GoalType[] = ['red', 'blue', 'green', 'yellow', 'purple'];

const L: LevelDef[] = [
  // ---------------------------------------------------------------- 1-5: basics
  // 1 · first steps
  { moves: 15, colors: 4, goals: [{ type: 'red', count: 25 }], grid: [
    'xx....xx', 'x......x', '........', '........', '........', '........', 'x......x', 'xx....xx'] },
  // 2 · two colors
  { moves: 15, colors: 4, goals: [{ type: 'blue', count: 25 }, { type: 'yellow', count: 25 }], grid: [
    '........', '........', '........', '........', '........', '........', '........', '........'] },
  // 3 · crates intro
  { moves: 15, colors: 4, goals: [{ type: 'crate' }, { type: 'green', count: 25 }], grid: [
    '........', '........', '........', '........', '........', '........', '11111111', '11111111'] },
  // 4 · crate pyramid + color
  { moves: 16, colors: 4, goals: [{ type: 'crate' }, { type: 'green', count: 65 }], grid: [
    '........', '........', '........', '...11...', '..1111..', '.111111.', '11....11', '1......1'] },
  // 5 · HARD: double crates at the bottom
  { diff: 'hard', moves: 24, colors: 4, goals: [{ type: 'crate' }], grid: [
    'x......x', '........', '........', '........', '........', '22222222', '22222222', '11....11'] },

  // ---------------------------------------------------------------- 6-10: chains & stone
  // 6 · relief: chains intro, barrels to play with
  { moves: 15, colors: 4, goals: [{ type: 'chain' }, { type: 'red', count: 30 }], grid: [
    '........', '........', 'cc....cc', 'cc.BB.cc', '........', '..cccc..', '........', '........'] },
  // 7 · stone intro
  { moves: 20, colors: 4, goals: [{ type: 'stone' }, { type: 'blue', count: 30 }], grid: [
    'x......x', '........', '..5555..', '..5..5..', '..5..5..', '..5555..', '........', 'x......x'] },
  // 8 · relief: vines + color
  { moves: 15, colors: 4, goals: [{ type: 'vines' }, { type: 'red', count: 35 }], grid: [
    'vvv..vvv', 'vv....vv', 'v......v', '........', '........', '........', '........', '........'] },
  // 9 · crates & chains mix
  { moves: 19, colors: 4, goals: [{ type: 'crate' }, { type: 'chain' }], grid: [
    '........', '.cc..cc.', '.cc..cc.', '........', '222..222', '1......1', '1......1', '11111111'] },
  // 10 · SUPER HARD: castle walls
  { diff: 'superhard', moves: 24, colors: 4, goals: [{ type: 'stone' }, { type: 'crate' }], grid: [
    '5.5..5.5', '55....55', '5......5', '5.2222.5', '5.2332.5', '5.2222.5', '5......5', '55555555'] },

  // ---------------------------------------------------------------- 11-15: shapes & 5 colors
  // 11 · relief: orbs on board
  { moves: 14, colors: 4, goals: [{ type: 'green', count: 60 }], grid: [
    'xx....xx', 'x......x', '........', '...OO...', '........', '........', 'x......x', 'xx....xx'] },
  // 12 · diamond of crates
  { moves: 23, colors: 4, goals: [{ type: 'crate' }], grid: [
    '........', '...11...', '..1221..', '.123321.', '.123321.', '..1221..', '...11...', '........'] },
  // 13 · relief: 5 colors for the first time, but generous
  { moves: 17, colors: 5, goals: [{ type: 'purple', count: 20 }, { type: 'blue', count: 20 }], grid: [
    '........', '........', '........', '...FF...', '........', '........', '........', '........'] },
  // 14 · stone pillars
  { moves: 21, colors: 4, goals: [{ type: 'stone' }, { type: 'blue', count: 65 }], grid: [
    '........', '.5....5.', '.5....5.', '.5....5.', '.5....5.', '.5....5.', '.5....5.', '........'] },
  // 15 · HARD: everything together
  { diff: 'hard', moves: 27, colors: 4, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'chain' }], grid: [
    '33....33', '3......3', '..cccc..', '..4444..', '..4444..', '..cccc..', '2......2', '22....22'] },

  // ---------------------------------------------------------------- 16-20: big boards
  // 16 · relief: 9x9 with power-ups
  { moves: 21, colors: 5, goals: [{ type: 'red', count: 55 }, { type: 'yellow', count: 55 }], grid: [
    '.........', '.........', '.........', '...F.F...', '....B....', '...F.F...', '.........', '.........', '.........'] },
  // 17 · crate floor
  { moves: 29, colors: 4, goals: [{ type: 'crate' }], grid: [
    '........', '........', '........', '........', '22222222', '22.22.22', '22222222', '11111111'] },
  // 18 · split board with vines
  { moves: 20, colors: 4, goals: [{ type: 'vines' }, { type: 'stone' }, { type: 'green', count: 50 }], grid: [
    '...xx...', '...xx...', '..v44v..', '..v44v..', '..v44v..', '..v44v..', '...xx...', '...xx...'] },
  // 19 · relief: chain frame with arrows
  { moves: 16, colors: 4, goals: [{ type: 'chain' }, { type: 'green', count: 65 }], grid: [
    'cc....cc', 'c......c', 'c......c', 'c..HV..c', 'c......c', 'c......c', 'c......c', 'cccccccc'] },
  // 20 · SUPER HARD: fortress
  { diff: 'superhard', moves: 29, colors: 4, goals: [{ type: 'stone' }, { type: 'crate' }, { type: 'chain' }], grid: [
    '........', '.666666.', '.6cccc6.', '.6c33c6.', '.6c33c6.', '.6cccc6.', '.666666.', '........'] },

  // ---------------------------------------------------------------- 21-25
  // 21 · relief: checker crates
  { moves: 19, colors: 4, goals: [{ type: 'crate' }, { type: 'yellow', count: 30 }], grid: [
    'x......x', '........', '2.2.2.2.', '.2.2.2.2', '2.2.2.2.', '.2.2.2.2', '........', 'x......x'] },
  // 22 · hourglass
  { moves: 20, colors: 4, goals: [{ type: 'vines' }, { type: 'chain' }, { type: 'blue', count: 40 }], grid: [
    '........', 'x......x', 'xxc..cxx', 'xxx..xxx', 'xxx..xxx', 'xxc..cxx', 'x.v..v.x', 'vv....vv'] },
  // 23 · HARD: stone bars, 5 colors
  { diff: 'hard', moves: 19, colors: 5, goals: [{ type: 'stone' }], grid: [
    '........', '........', '555..555', '........', '........', '55.55.55', '........', '........'] },
  // 24 · relief: barrels + vines
  { moves: 18, colors: 4, goals: [{ type: 'vines' }, { type: 'red', count: 65 }], grid: [
    'vvv..vvv', 'vv....vv', 'v......v', 'v......v', '........', '...B....', '....B...', '........'] },
  // 25 · HARD: crown of crates (9x9)
  { diff: 'hard', moves: 28, colors: 4, goals: [{ type: 'crate' }, { type: 'chain' }], grid: [
    '.........', '.2..2..2.', '.22.2.22.', '.2222222.', '.3333333.', '.cc.c.cc.', '.........', '.........', 'x.......x'] },

  // ---------------------------------------------------------------- 26-30: finale
  // 26 · stone X, 5 colors
  { moves: 24, colors: 5, goals: [{ type: 'red', count: 40 }, { type: 'blue', count: 40 }, { type: 'stone' }], grid: [
    '........', '........', '.4....4.', '..4..4..', '...44...', '..4..4..', '.4....4.', '........'] },
  // 27 · relief: open board with a crystal orb
  { moves: 17, colors: 4, goals: [{ type: 'crate' }, { type: 'yellow', count: 70 }], grid: [
    '........', '........', '...O....', '........', '........', '1......1', '11....11', '111..111'] },
  // 28 · towers
  { moves: 31, colors: 4, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'vines' }], grid: [
    'vv....vv', 'v.2..2.v', '..2..2..', '444..444', '........', '.3....3.', '.3....3.', '.33..33.'] },
  // 29 · HARD: checkerboard of stone & crates
  { diff: 'hard', moves: 23, colors: 4, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'red', count: 50 }], grid: [
    '........', '.3.33.3.', '........', '5.5..5.5', '........', '........', '222..222', '22....22'] },
  // 30 · SUPER HARD: the king's vault
  { diff: 'superhard', moves: 28, colors: 5, goals: [{ type: 'crate' }, { type: 'stone' }, { type: 'chain' }, { type: 'vines' }], grid: [
    'vvv...vvv', 'v.......v', '..22222..', '..2ccc2..', '..2cOc2..', '..2ccc2..', '..22222..', '.........', '555...555'] },

  // ---------------------------------------------------------------- 31-40: treasure, portals, growing vines
  // 31 · treasure intro
  { moves: 21, colors: 4, items: 2, goals: [{ type: 'gold' }], grid: [
    '...TT...', '........', '........', '........', '........', '........', '........', '........'] },
  // 32 · portals intro
  { moves: 16, colors: 4, portals: [[7, 0, 1, 4], [7, 1, 1, 5], [7, 2, 1, 6], [7, 3, 1, 7]], goals: [{ type: 'crate' }], grid: [
    '....xxxx', '........', '........', '........', '........', '.....222', '....2222', '....1111'] },
  // 33 · growing vines intro
  { moves: 15, colors: 4, goals: [{ type: 'vines' }, { type: 'blue', count: 35 }], grid: [
    '........', '........', '........', '........', '...gg...', '........', 'g......g', 'gg....gg'] },
  // 34 · treasure + crates
  { moves: 22, colors: 4, items: 1, goals: [{ type: 'gold' }, { type: 'crate' }], grid: [
    '..T..T..', '........', '........', '........', '........', '1......1', '11....11', '111..111'] },
  // 35 · HARD: growing vines + chains
  { diff: 'hard', moves: 16, colors: 4, goals: [{ type: 'vines' }, { type: 'chain' }, { type: 'green', count: 50 }], grid: [
    '........', '.cc..cc.', '........', '...gg...', '..gggg..', '........', 'cc....cc', 'gg....gg'] },
  // 36 · treasure through portals
  { moves: 18, colors: 4, items: 2, portals: [[7, 0, 1, 4], [7, 1, 1, 5], [7, 2, 1, 6], [7, 3, 1, 7]], goals: [{ type: 'gold' }, { type: 'crate' }], grid: [
    '....xxxx', '.....TT.', '........', '........', '........', '........', '....2..2', '....2222'] },
  // 37 · relief: orbs and treasure
  { moves: 15, colors: 4, items: 2, goals: [{ type: 'gold' }, { type: 'green', count: 70 }], grid: [
    '........', '..T..T..', '........', '...OO...', '........', '........', '........', '........'] },
  // 38 · stone pillars + growing vines
  { moves: 15, colors: 4, goals: [{ type: 'stone' }, { type: 'vines' }, { type: 'red', count: 60 }], grid: [
    '........', '.4....4.', '.4.gg.4.', '.4....4.', '.4....4.', '........', 'g......g', 'gg....gg'] },
  // 39 · deep treasure (9x9)
  { moves: 22, colors: 4, items: 2, goals: [{ type: 'gold' }, { type: 'stone' }], grid: [
    '...T.T...', '.........', '.........', '5.......5', '55.....55', '.........', '.........', '..55555..', 'x.......x'] },
  // 40 · SUPER HARD: the royal treasury
  { diff: 'superhard', moves: 14, colors: 4, items: 1, goals: [{ type: 'gold' }, { type: 'vines' }, { type: 'stone' }, { type: 'crate' }, { type: 'red', count: 40 }], grid: [
    'g..TT..g', '........', '.cc..cc.', '...44...', '..4554..', '........', '2......2', '22g..g22'] },

  // ---------------------------------------------------------------- 41-50: ice floor
  // 41 · ice intro
  { moves: 15, colors: 4, goals: [{ type: 'ice' }], grid: [
    '........', '........', '........', '........', '........', '........', 'iiiiiiii', 'iiiiiiii'] },
  // 42 · ice heart
  { moves: 14, colors: 4, goals: [{ type: 'ice' }, { type: 'red', count: 70 }], grid: [
    '.ii..ii.', 'iiiiiiii', 'iiiiiiii', '.iiiiii.', '..iiii..', '...ii...', '........', '........'] },
  // 43 · thick ice + crates
  { moves: 17, colors: 4, goals: [{ type: 'ice' }, { type: 'crate' }, { type: 'yellow', count: 35 }], grid: [
    'xx....xx', 'x......x', '..IIII..', '..IIII..', '........', '1......1', '11....11', '111..111'] },
  // 44 · tall tower (7x9)
  { moves: 21, colors: 4, goals: [{ type: 'ice' }, { type: 'chain' }], grid: [
    '.......', '.......', '..ccc..', '.......', 'i.....i', 'ii...ii', 'iii.iii', 'iiiiiii', 'IIIIIII'] },
  // 45 · HARD: frozen courtyard
  { diff: 'hard', moves: 16, colors: 4, goals: [{ type: 'stone' }, { type: 'ice' }, { type: 'blue', count: 40 }], grid: [
    '........', '.55..55.', '.5IIII5.', '.5IIII5.', '.5IIII5.', '.555555.', '........', '........'] },
  // 46 · relief: treasure on ice
  { moves: 17, colors: 4, goals: [{ type: 'gold' }, { type: 'ice' }, { type: 'green', count: 35 }], grid: [
    '..T..T..', '........', '........', '........', '........', 'iiiiiiii', 'iiiiiiii', '........'] },
  // 47 · diamond garden
  { moves: 20, colors: 4, goals: [{ type: 'vines' }, { type: 'blue', count: 55 }], grid: [
    'xxx..xxx', 'xx....xx', 'x..vv..x', '..vvvv..', '..vvvv..', 'x..vv..x', 'xx....xx', 'xxx..xxx'] },
  // 48 · frozen pond with growing vines
  { moves: 20, colors: 5, goals: [{ type: 'vines' }, { type: 'ice' }], grid: [
    'g......g', '........', '..iiii..', '..iIIi..', '..iIIi..', '..iiii..', '........', 'gg....gg'] },
  // 49 · checkered crates (9x9)
  { moves: 21, colors: 4, goals: [{ type: 'gold' }, { type: 'crate' }, { type: 'ice' }, { type: 'green', count: 40 }], grid: [
    '...T.T...', '.........', '2.2...2.2', '.........', '.2.2.2.2.', '.........', '2.2...2.2', '.........', 'iiiiiiiii'] },
  // 50 · SUPER HARD: the frozen keep
  { diff: 'superhard', moves: 19, colors: 4, goals: [{ type: 'gold' }, { type: 'vines' }, { type: 'ice' }, { type: 'stone' }, { type: 'crate' }], grid: [
    'g..TTT..g', '.........', '.ccc.ccc.', '.5.....5.', '.5IIIII5.', '.5IIIII5.', '.555.555.', '.........', '222...222'] },

  // ---------------------------------------------------------------- 51-60: everything combined
  // 51 · relief: crystal orbs, 5 colors
  { moves: 23, colors: 5, goals: [{ type: 'purple', count: 50 }, { type: 'green', count: 50 }], grid: [
    '........', '........', '..O..O..', '........', '........', '........', '........', '........'] },
  // 52 · portals into the ice cellar
  { moves: 20, colors: 4, portals: [[7, 0, 1, 4], [7, 1, 1, 5], [7, 2, 1, 6], [7, 3, 1, 7]], goals: [{ type: 'ice' }], grid: [
    '....xxxx', '........', '....iiii', '....iiii', '....iiii', '....iiii', '....IIII', '....IIII'] },
  // 53 · chained X
  { moves: 16, colors: 4, goals: [{ type: 'chain' }, { type: 'yellow', count: 55 }], grid: [
    'c......c', '.c....c.', '..c..c..', '...cc...', '...cc...', '..c..c..', '.c....c.', 'c......c'] },
  // 54 · stone stairs and vines
  { moves: 20, colors: 4, goals: [{ type: 'stone' }, { type: 'vines' }], grid: [
    '........', '........', '4.......', '44......', '444....v', '4444..vv', '44444vvv', '5555vvvv'] },
  // 55 · HARD: crate vault (9x9)
  { diff: 'hard', moves: 20, colors: 4, goals: [{ type: 'crate' }, { type: 'ice' }, { type: 'yellow', count: 40 }], grid: [
    'x.......x', '.........', '..33333..', '..2III2..', '..2III2..', '..2III2..', '..22222..', '.........', 'x.......x'] },
  // 56 · relief: falcon party
  { moves: 14, colors: 4, goals: [{ type: 'ice' }, { type: 'red', count: 60 }], grid: [
    '........', '.F....F.', '........', '...BB...', '........', '.F....F.', '........', 'iiiiiiii'] },
  // 57 · treasure in the overgrown hall (9x8)
  { moves: 27, colors: 4, items: 1, goals: [{ type: 'gold' }, { type: 'vines' }], grid: [
    'T...T...T', '.........', '.........', 'g.......g', 'gg.....gg', '.........', '.........', '.........'] },
  // 58 · portal pillars
  { moves: 14, colors: 4, portals: [[7, 0, 1, 7], [7, 1, 1, 6]], goals: [{ type: 'stone' }, { type: 'ice' }, { type: 'blue', count: 45 }], grid: [
    '......xx', '........', '.4....4.', '.4.ii.4.', '.4.ii.4.', '.4....4.', '........', '........'] },
  // 59 · HARD: the chained treasury
  { diff: 'hard', moves: 15, colors: 4, goals: [{ type: 'gold' }, { type: 'chain' }, { type: 'ice' }, { type: 'red', count: 40 }], grid: [
    '..T..T..', '........', 'cccccccc', '........', 'iiiiiiii', 'iiiiiiii', 'IIIIIIII', '........'] },
  // 60 · SUPER HARD: the dragon's lair (9x9)
  { diff: 'superhard', moves: 15, colors: 4, items: 1, goals: [{ type: 'gold' }, { type: 'vines' }, { type: 'stone' }, { type: 'ice' }, { type: 'crate' }], grid: [
    '.g.TTT.g.', '.........', 'cc.666.cc', '..I666I..', '..IIIII..', '2.......2', '22.....22', '222.O.222', 'iiiiiiiii'] },
  // ---------------------------------------------------------------- 61-70: cauldrons, coloured crates, conveyor belts
  // 61 · cauldron intro
  { moves: 15, colors: 4, goals: [{ type: 'cauldron' }], grid: [
    '........', '........', '........', '.K....K.', '........', '...KK...', '........', '........'] },
  // 62 · cauldrons boil over the crates
  { moves: 18, colors: 4, goals: [{ type: 'cauldron' }, { type: 'crate' }], grid: [
    'x......x', '........', '..K..K..', '........', '11....11', '111..111', '1K1..1K1', '11111111'] },
  // 63 · chain reaction ring
  { moves: 15, colors: 4, goals: [{ type: 'cauldron' }, { type: 'yellow', count: 50 }], grid: [
    '........', '........', '...KK...', '..K..K..', '..K..K..', '...KK...', '........', '........'] },
  // 64 · coloured crates intro
  { moves: 18, colors: 4, goals: [{ type: 'crate' }], grid: [
    '........', '........', '........', '........', '........', '7..88..7', '77.88.77', '77788777'] },
  // 65 · HARD: frozen colour vault
  { diff: 'hard', moves: 16, colors: 4, goals: [{ type: 'crate' }, { type: 'ice' }, { type: 'yellow', count: 40 }], grid: [
    '........', '........', '..9999..', '..9II9..', '..9II9..', '..9999..', '........', '00....00'] },
  // 66 · relief: conveyor belt intro
  { moves: 15, colors: 4, belts: [[4, 1]], goals: [{ type: 'blue', count: 40 }], grid: [
    '........', '........', '........', '........', '........', '........', '........', '........'] },
  // 67 · two belts over the crates
  { moves: 16, colors: 4, belts: [[2, 1], [4, -1]], goals: [{ type: 'crate' }, { type: 'green', count: 60 }], grid: [
    '........', '........', '........', '........', '........', '1......1', '22....22', '222..222'] },
  // 68 · treasure rides the belts
  { moves: 16, colors: 4, items: 2, belts: [[3, 1], [5, 1]], goals: [{ type: 'gold' }, { type: 'red', count: 50 }], grid: [
    '..T..T..', '........', '........', '........', '........', '........', '........', 'x......x'] },
  // 69 · cauldrons in the colour cellar
  { moves: 18, colors: 4, goals: [{ type: 'cauldron' }, { type: 'crate' }], grid: [
    '........', '........', '..K..K..', '........', '........', '8......7', '88.KK.77', '87788778'] },
  // 70 · SUPER HARD: the alchemist's workshop
  { diff: 'superhard', moves: 13, colors: 4, belts: [[2, 1], [3, -1]], goals: [{ type: 'cauldron' }, { type: 'ice' }, { type: 'crate' }, { type: 'red', count: 70 }], grid: [
    '........', '.K....K.', '........', '...KK...', 'IIIIIIII', 'IIIIIIII', '9......0', '99K..K00'] },

  // ---------------------------------------------------------------- 71-80: mixing it all
  // 71 · relief: cauldron party
  { moves: 15, colors: 4, goals: [{ type: 'cauldron' }, { type: 'blue', count: 60 }], grid: [
    '........', '.K....K.', '........', 'K..BB..K', '........', '.K....K.', '........', '........'] },
  // 72 · three belts (9x9)
  { moves: 16, colors: 5, belts: [[2, 1], [4, -1], [6, 1]], goals: [{ type: 'yellow', count: 60 }, { type: 'red', count: 60 }], grid: [
    'x.......x', '.........', '.........', '.........', '.........', '.........', '.........', '.........', 'x.......x'] },
  // 73 · four-colour wall (9x8)
  { moves: 16, colors: 4, goals: [{ type: 'crate' }], grid: [
    '.........', '.........', '.........', '0.......7', '00.9.8.77', '.........', '7..8.9..0', '77.898.00'] },
  // 74 · belts between the chains
  { moves: 15, colors: 4, belts: [[3, 1], [5, -1]], goals: [{ type: 'chain' }, { type: 'yellow', count: 60 }], grid: [
    'c......c', '........', 'cc.cc.cc', '........', '.cccccc.', '........', 'cc.cc.cc', '........'] },
  // 75 · HARD: cauldrons in the stone hall
  { diff: 'hard', moves: 17, colors: 4, goals: [{ type: 'cauldron' }, { type: 'stone' }, { type: 'green', count: 50 }], grid: [
    '........', '........', '.5K..K5.', '.5....5.', '.5....5.', '.5K..K5.', '.55..55.', '........'] },
  // 76 · relief: orbs on the belts
  { moves: 16, colors: 5, belts: [[2, -1], [5, 1]], goals: [{ type: 'green', count: 60 }, { type: 'purple', count: 60 }], grid: [
    '........', '........', '........', '...OO...', '........', '........', '........', '........'] },
  // 77 · coloured crates in the thorns
  { moves: 15, colors: 4, goals: [{ type: 'crate' }, { type: 'vines' }], grid: [
    'g......g', '........', '........', '..8..9..', '........', '........', '8.9..8.9', 'gg8998gg'] },
  // 78 · frozen potion room (9x9)
  { moves: 20, colors: 4, goals: [{ type: 'cauldron' }, { type: 'ice' }, { type: 'red', count: 40 }], grid: [
    '.........', '.........', '...K.K...', '..IIIII..', '..KIIIK..', '..IIIII..', '...K.K...', '.........', 'IIIIIIIII'] },
  // 79 · HARD: the sorting belts
  { diff: 'hard', moves: 13, colors: 4, belts: [[2, 1], [4, -1]], goals: [{ type: 'crate' }, { type: 'blue', count: 70 }], grid: [
    '........', '........', '........', '7......8', '77....88', '8......7', '78.99.87', '87788778'] },
  // 80 · SUPER HARD: the wizard's tower (9x9)
  { diff: 'superhard', moves: 13, colors: 4, belts: [[2, 1], [4, -1]], goals: [{ type: 'gold' }, { type: 'cauldron' }, { type: 'crate' }, { type: 'ice' }, { type: 'vines' }], grid: [
    'g..TTT..g', '.........', '.........', '.K..K..K.', '.........', '7.cc.cc.8', '77.....88', '7K.....K8', 'IIIIIIIII'] },
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
