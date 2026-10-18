"""Set each level's move count from simulated play (sawtooth targets).

normal    -> ~90% bot win rate (p85 + 3)
hard      -> ~50% bot win rate (median + 1)
superhard -> ~30% bot win rate (p30 + 1)
"""
import re, sys
sys.path.insert(0, 'tools')
import sim

RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 24
levels = sim.parse_levels()
src = open('src/levels.ts').read()
head, rest = src.split('const L: LevelDef[] = [', 1)
body, tail = rest.split('\n];', 1)
entries = list(re.finditer(r"moves: (\d+)", body))
assert len(entries) == len(levels)
new_moves = []
for n, lv in enumerate(levels, 1):
    res = sorted(sim.simulate(lv, 7777 * n + s, cap=90, skill=0.6) for s in range(RUNS))
    pct = lambda p: res[min(len(res) - 1, int(p * len(res)))]
    if lv['diff'] == 'superhard': m = pct(0.30) + 1
    elif lv['diff'] == 'hard': m = pct(0.50) + 1
    else: m = max(15, pct(0.85) + 3)
    new_moves.append(m)
    win = sum(r <= m for r in res) / RUNS
    print(f"{n:>3} {lv['diff']:10} median={pct(0.5):>3}  moves {lv['moves']:>3} -> {m:>3}  bot win {win:.0%}", flush=True)
i = iter(new_moves)
body = re.sub(r"moves: \d+", lambda _: f"moves: {next(i)}", body)
open('src/levels.ts', 'w').write(head + 'const L: LevelDef[] = [' + body + '\n];' + tail)
