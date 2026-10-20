"""Variety report: mechanics, board shape, colors and difficulty per hand-made level."""
import sys
sys.path.insert(0, 'tools')
import sim
MECH = {'cauldron': 'K', 'ccrate': '7890', 'crate': '123', 'stone': '456', 'vines': 'v', 'grow': 'g', 'chain': 'c', 'ice': 'iI', 'gold': 'T', 'holes': 'x', 'power': 'HVBFO'}
for n, lv in enumerate(sim.parse_levels(), 1):
    g = ''.join(lv['grid'])
    used = [k for k, ch in MECH.items() if any(c in ch for c in g)]
    if lv.get('items'): used.append('gold') if 'gold' not in used else None
    if lv.get('portals'): used.append('portal')
    if lv.get('belts'): used.append('belt')
    goals = ','.join(t + (f':{c}' if c else '') for t, c in lv['goals'])
    size = f"{len(lv['grid'][0])}x{len(lv['grid'])}"
    print(f"{n:>3} {lv['diff']:9} {size} c{lv['colors']} mv{lv['moves']:>3}  {' '.join(used):40} | {goals}")
