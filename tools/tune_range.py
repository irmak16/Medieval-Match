"""Tune move counts for a range of hand-made levels (includes the safety margin used for the browser).

usage: python3 tools/tune_range.py RUNS FIRST LAST
normal    -> p85 + 3 + 2      hard -> median + 1 + 2      superhard -> p30 + 1 + 1
"""
import re, sys
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, 'tools')
import sim

RUNS, FIRST, LAST = map(int, sys.argv[1:4])
levels = sim.parse_levels()


def run(n):
    lv = levels[n - 1]
    res = sorted(sim.simulate(lv, 7777 * n + s, cap=90, skill=0.6) for s in range(RUNS))
    pct = lambda p: res[min(len(res) - 1, int(p * len(res)))]
    if lv['diff'] == 'superhard': m = pct(0.30) + 2
    elif lv['diff'] == 'hard': m = pct(0.50) + 3
    else: m = max(15, pct(0.85) + 5)
    return n, m, res


if __name__ == '__main__':
    with ProcessPoolExecutor() as ex:
        out = {n: (m, res) for n, m, res in ex.map(run, range(FIRST, LAST + 1))}
    src = open('src/levels.ts').read()
    head, rest = src.split('const L: LevelDef[] = [', 1)
    body, tail = rest.split('\n];', 1)
    idx = [0]
    def sub(mo):
        idx[0] += 1
        n = idx[0]
        if n in out: return f"moves: {out[n][0]}"
        return mo.group(0)
    body = re.sub(r"moves: \d+", sub, body)
    open('src/levels.ts', 'w').write(head + 'const L: LevelDef[] = [' + body + '\n];' + tail)
    for n in sorted(out):
        m, res = out[n]
        lv = levels[n - 1]
        win = sum(r <= m for r in res) / RUNS
        print(f"{n:>3} {lv['diff']:10} median={res[len(res)//2]:>3} p85={res[int(.85*len(res))]:>3} -> moves {m:>3}  bot win {win:.0%}", flush=True)
