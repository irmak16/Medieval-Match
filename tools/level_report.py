"""Validate hand-made levels (used in CI): grid shape, characters, goals that exist, portals in range."""
import sys
sys.path.insert(0, 'tools')
import sim
ok = True
CHARS = set('.x1234567890vcHVBFOgTiIK')
NEED = {'cauldron': 'K', 'crate': '1237890', 'stone': '456', 'vines': 'vg', 'chain': 'c', 'ice': 'iI'}
levels = sim.parse_levels()
for n, lv in enumerate(levels, 1):
    g = lv['grid']
    W = len(g[0])
    err = []
    if any(len(r) != W for r in g): err.append('ragged grid')
    if set(''.join(g)) - CHARS: err.append(f"bad chars {set(''.join(g)) - CHARS}")
    for t, c in lv['goals']:
        if t in NEED and not any(ch in NEED[t] for ch in ''.join(g)): err.append(f'goal {t} has nothing on board')
        if t == 'gold' and 'T' not in ''.join(g) and not lv.get('items'): err.append('gold goal without treasure')
    for p in lv.get('portals', []):
        if not (0 <= p[0] < len(g) and 0 <= p[2] < len(g) and 0 <= p[1] < W and 0 <= p[3] < W): err.append(f'portal out of range {p}')
    if not 12 <= lv['moves'] <= 50: err.append(f"moves {lv['moves']} out of range")
    if err:
        ok = False
        print(f'level {n}: ' + '; '.join(err))
print(f'{len(levels)} hand-made levels checked:', 'OK' if ok else 'ERRORS')
sys.exit(0 if ok else 1)
