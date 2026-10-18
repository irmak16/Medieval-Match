"""Pre-generate + simulate levels 31..130 and write them (with tuned move counts) to src/levels_extra.ts."""
import json, sys
sys.path.insert(0, 'tools'); import sim
L = json.load(open(sys.argv[1]))
RUNS = int(sys.argv[2]) if len(sys.argv) > 2 else 12
out = []
for i, lv in enumerate(L, 31):
    lv2 = dict(diff=lv.get('diff', 'normal'), moves=lv['moves'], colors=lv['colors'], grid=lv['grid'],
               goals=[(g['type'], g.get('count')) for g in lv['goals']])
    res = sorted(sim.simulate(lv2, 131 * i + s, cap=90, skill=0.6) for s in range(RUNS))
    pct = lambda p: res[min(len(res) - 1, int(p * len(res)))]
    if lv2['diff'] == 'superhard': m = pct(0.30) + 1
    elif lv2['diff'] == 'hard': m = pct(0.50) + 1
    else: m = max(15, pct(0.85) + 3)
    if pct(0.5) > 60:  # practically unwinnable layout: skip it
        print(i, 'SKIP', res); continue
    lv['moves'] = min(m, 50)
    out.append(lv)
    print(i, lv2['diff'], 'median', pct(0.5), '->', lv['moves'], flush=True)
with open('src/levels_extra.ts', 'w') as f:
    f.write('// Levels 31+ : procedurally generated, then tuned with tools/sim.py (do not edit by hand).\n')
    f.write("import type { LevelDef } from './levels';\n\n")
    f.write('export const EXTRA_LEVELS: LevelDef[] = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print('written', len(out))
