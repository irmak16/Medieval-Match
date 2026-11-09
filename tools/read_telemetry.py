"""Prints a per-level difficulty table from the play data the game records.

Input: the text copied with "Zorluk Verisini Kopyala" (first line starts with MMD1) or a full MM1-... save code,
given as a file path or on stdin.

Usage: python3 tools/read_telemetry.py [file]      (or: ... < file)
"""
import base64, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim  # noqa: E402

HARD_RATE = {'normal': 0.5, 'hard': 0.3, 'superhard': 0.2}


def read_levels(text):
    """-> {level: [attempts, wins, giveups, continues, left, boosters]}"""
    text = text.strip()
    if text.startswith('MM1-'):
        data = json.loads(base64.b64decode(text[4:]).decode('utf-8'))
        stats = data.get('stats', {})
        lv = {int(k): list(v) + [0] * (6 - len(v)) for k, v in (stats.get('lv') or {}).items()}
        for k, n in (stats.get('fails') or {}).items():  # saves from before per-level data: only give-ups are known
            lv.setdefault(int(k), [0, 0, int(n), 0, 0, 0])
        return lv
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines or not lines[0].startswith('MMD1'):
        raise SystemExit('Unrecognised input: expected an MMD1 text block or an MM1-... save code')
    lv = {}
    for l in lines[1:]:
        p = [int(x) for x in l.split(',')]
        lv[p[0]] = (p[1:] + [0] * 6)[:6]
    return lv


def main():
    src = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    lv = read_levels(src)
    defs = sim.parse_levels(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'levels.ts'))
    print(f"{'lvl':>4} {'tag':<9} {'moves':>5} {'att':>4} {'wins':>4} {'win%':>5} {'gaveup':>6} {'cont/att':>8} {'left@win':>8}  flag")
    for n in sorted(lv):
        att, wins, give, cont, left, boost = lv[n]
        d = defs[n - 1] if 1 <= n <= len(defs) else None
        tag, moves = (d['diff'], d['moves']) if d else ('-', 0)
        rate = f'{100 * wins / att:.0f}' if att else '-'
        avg = f'{cont / att:.2f}' if att else '-'
        lw = str(left) if wins else '-'
        flag = ''
        if att >= 3 and wins / att < HARD_RATE.get(tag, 0.5):
            flag = 'TOO HARD?'
        elif att == 1 and wins == 1 and moves and left > 0.4 * moves:
            flag = 'too easy?'
        print(f"{n:>4} {tag:<9} {moves or '-':>5} {att:>4} {wins:>4} {rate:>5} {give:>6} {avg:>8} {lw:>8}  {flag}")


main()
