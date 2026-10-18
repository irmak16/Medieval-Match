"""Validate levels.ts and print a difficulty report (moves vs. estimated work)."""
import re, sys
src = open(sys.argv[1] if len(sys.argv) > 1 else 'src/levels.ts').read()
body = src.split('const L: LevelDef[] = [')[1].split('\n];')[0]
levels = re.findall(r"\{ (diff: '(\w+)', )?moves: (\d+), colors: (\d), goals: \[(.*?)\], grid: \[\s*(.*?)\] \}", body, re.S)
print(f"{'#':>3} {'diff':10} {'mv':>3} {'col':>3} {'work':>6} {'ratio':>6}  goals")
for i, (_, diff, moves, colors, goals, grid) in enumerate(levels, 1):
    rows = re.findall(r"'([^']*)'", grid)
    W = len(rows[0]); assert all(len(r) == W for r in rows), f'level {i} ragged'
    assert all(ch in '.x123456vcHVBFO' for r in rows for ch in r), f'level {i} bad char'
    hp = lambda chars: sum(((int(ch) - 1) % 3) + 1 if ch.isdigit() else 1 for r in rows for ch in r if ch in chars)
    work = 0.0
    gl = []
    colorTotal = []
    for t, c in re.findall(r"type: '(\w+)'(?:, count: (\d+))?", goals):
        if t == 'crate': w = hp('123') / 1.3
        elif t == 'stone': w = hp('456') / 1.1
        elif t == 'vines': w = hp('v') / 1.6
        elif t == 'chain': w = hp('c') / 1.8
        else:
            colorTotal.append(int(c)); w = 0
        work += w; gl.append(f'{t}:{c or "all"}')
    if colorTotal:
        rate = 1.2 if colors == '4' else 1.0  # tiles of one color collected per move
        work += sum(colorTotal) / (rate * len(colorTotal))
    # every row needs a passable cell so tiles can flow down
    passable = lambda r: any(ch in '.HVBFO' for ch in r)
    for ri, r in enumerate(rows):
        if not passable(r) and any(passable(q) for q in rows[ri + 1:]):
            print(f'  ! level {i} row {ri} blocks everything below until cleared')
    print(f"{i:>3} {diff or 'normal':10} {moves:>3} {colors:>3} {work:6.1f} {int(moves)/work:6.2f}  {' '.join(gl)}")
