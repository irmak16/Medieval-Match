"""Tune hand-made levels to a sawtooth difficulty curve using the bot simulator.

1. Scale (or add) color goals so the bot's median move count hits a target that rises
   through each 5-level block, peaks on Zor / Çok Zor levels and drops on relief levels.
2. Set the move limit from the simulated distribution:
     normal -> ~90% bot win, hard -> ~50%, super hard -> ~30%.
"""
import re, sys, json, statistics
sys.path.insert(0, 'tools')
import sim

RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 12
ONLY = [int(x) for x in sys.argv[2:]]
INTRO = {1, 2, 3, 6, 7, 8, 13, 31, 32, 33, 41}
COLORS = ['red', 'blue', 'green', 'yellow', 'purple']

def target(n, diff):
    base = 9 + min(n, 60) / 10
    if n in INTRO: return 8
    if diff == 'superhard': return base + 11
    if diff == 'hard': return base + 7
    pos = (n - 1) % 5
    return base + [-1, 0, 1, 2, 2][pos]

def run(lv, n, runs):
    return sorted(sim.simulate(lv, 9173 * n + s, cap=90, skill=0.6) for s in range(runs))

src = open('src/levels.ts').read()
head, rest = src.split('const L: LevelDef[] = [', 1)
body, tail = rest.split('\n];', 1)
parts = re.split(r'(\n  \{ )', body)
# parts: [prefix, sep, entry, sep, entry, ...]
entries = [(parts[i], parts[i + 1]) for i in range(1, len(parts), 2)]
levels = sim.parse_levels()
assert len(entries) == len(levels), (len(entries), len(levels))
report = []
for idx, (sep, text) in enumerate(entries):
    n = idx + 1
    if ONLY and n not in ONLY: continue
    lv = levels[idx]
    tgt = target(n, lv['diff'])
    res = run(lv, n, RUNS)
    med = statistics.median(res)
    for it in range(6):
        if abs(med - tgt) <= 2 or med > 80: break
        goals = lv['goals']
        cidx = [i for i, (t, c) in enumerate(goals) if t in COLORS]
        if cidx:
            # scale all color goals together (keeps them balanced)
            total = sum(goals[i][1] for i in cidx)
            k = max(0.4, min(2.5, (total + (tgt - med) * (4.2 if lv['colors'] == 4 else 3.4)) / total))
            changed = False
            for i in cidx:
                t, c = goals[i]
                nc = int(max(8, min(120, round(c * k))))
                changed |= nc != c
                goals[i] = (t, nc)
            if not changed: break
        elif med < tgt - 2:
            used = {t for t, _ in goals}
            col = next(cl for cl in COLORS[:lv['colors']] if cl not in used)
            goals.append((col, int((tgt - med) * 4)))
        else:
            break
        res = run(lv, n, RUNS)
        med = statistics.median(res)
    pct = lambda p: res[min(len(res) - 1, int(p * len(res)))]
    if lv['diff'] == 'superhard': mv = pct(0.30) + 1
    elif lv['diff'] == 'hard': mv = pct(0.50) + 1
    else: mv = pct(0.85) + 3
    mv = max(12, min(50, mv))
    lv['moves'] = mv
    win = sum(r <= mv for r in res) / len(res)
    report.append((n, lv['diff'], tgt, med, mv, win))
    print(f"{n:>3} {lv['diff']:9} target={tgt:5.1f} median={med:5.1f} moves={mv:>3} win={win:.0%}  {lv['goals']}", flush=True)
    # write back goals + moves into the entry text
    gtxt = ', '.join(f"{{ type: '{t}'" + (f", count: {c}" if c is not None else '') + ' }' for t, c in lv['goals'])
    text = re.sub(r"moves: \d+", f"moves: {mv}", text, count=1)
    text = re.sub(r"goals: \[.*?\], grid:", f"goals: [{gtxt}], grid:", text, count=1, flags=re.S)
    entries[idx] = (sep, text)
    out = parts[0] + ''.join(a + b for a, b in entries)
    open('src/levels.ts', 'w').write(head + 'const L: LevelDef[] = [' + out + '\n];' + tail)
json.dump(report, open('/tmp/tune_report.json', 'w'))
