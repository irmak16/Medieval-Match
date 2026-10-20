"""Headless Medieval Match simulator + greedy bot, used to tune level difficulty.

Mirrors the rules in src/game/board.ts (matching, power-ups, combos, obstacles, gravity with
diagonal fill) but resolves cascades instantly. The bot evaluates every legal move one ply ahead
(including the cascade it causes) and picks the one with the best goal progress.

Usage: python3 tools/sim.py [runs] [level numbers...]
"""
import random, re, sys, copy, statistics

COLORS = ['red', 'blue', 'green', 'yellow', 'purple']


def parse_levels(path='src/levels.ts'):
    src = open(path).read()
    body = src.split('const L: LevelDef[] = [')[1].split('\n];')[0]
    out = []
    for diff, moves, colors, items, portals, belts, goals, grid in re.findall(
            r"\{ (?:diff: '(\w+)', )?moves: (\d+), colors: (\d), (?:items: (\d+), )?(?:portals: (\[\[.*?\]\]), )?(?:belts: (\[\[.*?\]\]), )?goals: \[(.*?)\], grid: \[\s*(.*?)\] \}", body, re.S):
        rows = re.findall(r"'([^']*)'", grid)
        gl = [(t, int(c) if c else None) for t, c in re.findall(r"type: '(\w+)'(?:, count: (\d+))?", goals)]
        pt = [tuple(map(int, p)) for p in re.findall(r"\[(\d+), (\d+), (\d+), (\d+)\]", portals)] if portals else []
        bl = [tuple(map(int, p)) for p in re.findall(r"\[(\d+), (-?\d+)\]", belts)] if belts else []
        out.append(dict(diff=diff or 'normal', moves=int(moves), colors=int(colors), goals=gl, grid=rows, items=int(items or 0), portals=pt, belts=bl))
    return out


class Board:
    def __init__(self, lv, rng):
        self.rng = rng
        self.H, self.W = len(lv['grid']), len(lv['grid'][0])
        self.ncol = lv['colors']
        self.ok = [[ch != 'x' for ch in row] for row in lv['grid']]
        self.blk = [[None] * self.W for _ in range(self.H)]   # (type, hp)
        self.chain = [[False] * self.W for _ in range(self.H)]
        self.ice = [[0] * self.W for _ in range(self.H)]
        self.tile = [[None] * self.W for _ in range(self.H)]  # ('c', color) or (kind, -1)
        for r, row in enumerate(lv['grid']):
            for c, ch in enumerate(row):
                if ch in '123': self.blk[r][c] = ['crate', int(ch), False, None]
                elif ch in '7890': self.blk[r][c] = ['crate', 1, False, '7890'.index(ch)]
                elif ch == 'K': self.blk[r][c] = ['cauldron', 4, False, None]
                elif ch in '456': self.blk[r][c] = ['stone', int(ch) - 3, False, None]
                elif ch == 'v': self.blk[r][c] = ['vines', 1, False, None]
                elif ch == 'g': self.blk[r][c] = ['vines', 1, True, None]
                elif ch == 'T': self.tile[r][c] = ('gold', -1)
                elif ch in 'HVBFO':
                    self.tile[r][c] = ({'H': 'ah', 'V': 'av', 'B': 'barrel', 'F': 'falcon', 'O': 'orb'}[ch], -1)
                elif ch in 'iI':
                    self.tile[r][c] = ('c', self.safe_color(r, c)); self.ice[r][c] = 1 if ch == 'i' else 2
                elif ch in '.c':
                    self.tile[r][c] = ('c', self.safe_color(r, c))
                    if ch == 'c': self.chain[r][c] = True
        self.goals = {}
        for t, n in lv['goals']:
            if n is None:
                chars = {'crate': '1237890', 'stone': '456', 'vines': 'vg', 'chain': 'c', 'gold': 'T', 'ice': 'iI', 'cauldron': 'K'}[t]
                n = sum(ch in chars for row in lv['grid'] for ch in row) + (lv.get('items', 0) if t == 'gold' else 0)
            self.goals[t] = n
        self.items_left = lv.get('items', 0)
        self.portals = lv.get('portals', [])
        self.belts = lv.get('belts', [])
        d = lv.get('diff', 'normal')
        self.bias = -0.5 if d == 'superhard' else -0.35 if d == 'hard' else 0.12
        self.vines_broken = False
        self.ensure_moves()

    # ------------------------------------------------------------------ helpers
    def color_at(self, r, c):
        if 0 <= r < self.H and 0 <= c < self.W and self.tile[r][c] and self.tile[r][c][0] == 'c':
            return self.tile[r][c][1]
        return -2

    def safe_color(self, r, c):
        bad = set()
        a, b = self.color_at(r, c - 1), self.color_at(r, c - 2)
        if a == b and a >= 0: bad.add(a)
        a, b = self.color_at(r - 1, c), self.color_at(r - 2, c)
        if a == b and a >= 0: bad.add(a)
        opts = [k for k in range(self.ncol) if k not in bad]
        return self.rng.choice(opts)

    def done(self):
        return all(v <= 0 for v in self.goals.values())

    def collect(self, t):
        if self.goals.get(t, 0) > 0:
            self.goals[t] -= 1

    # ------------------------------------------------------------------ damage
    def damage_blocker(self, r, c, queue=None):
        b = self.blk[r][c]
        b[1] -= 1
        if b[1] <= 0:
            self.blk[r][c] = None
            if b[0] == 'vines': self.vines_broken = True
            self.collect(b[0])
            if b[0] == 'cauldron':
                q = queue if queue is not None else []
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        if dr or dc: self.hit(r + dr, c + dc, q)
                if queue is None: self.run_queue(q)

    def crack(self, r, c):
        if self.ice[r][c] > 0:
            self.ice[r][c] -= 1
            if self.ice[r][c] == 0: self.collect('ice')

    def hit(self, r, c, queue):
        if not (0 <= r < self.H and 0 <= c < self.W) or not self.ok[r][c]:
            return
        if self.blk[r][c]:
            self.damage_blocker(r, c, queue); return
        if self.chain[r][c]:
            self.chain[r][c] = False; self.collect('chain'); return
        t = self.tile[r][c]
        if not t:
            self.crack(r, c); return
        if t[0] == 'gold': return
        if t[0] != 'c':
            queue.append((r, c)); return
        self.tile[r][c] = None
        self.crack(r, c)
        self.collect(COLORS[t[1]])

    def activate(self, r, c, queue, color=None):
        t = self.tile[r][c]
        if not t or t[0] in ('c', 'gold'): return
        self.tile[r][c] = None
        self.crack(r, c)
        k = t[0]
        if k == 'ah': self.arrow(r, c, 'h', queue)
        elif k == 'av': self.arrow(r, c, 'v', queue)
        elif k == 'barrel': self.explode(r, c, 2, queue)
        elif k == 'falcon': self.falcon(r, c, None, queue)
        elif k == 'orb': self.orb(r, c, color if color is not None else self.common_color(), None, queue)

    def arrow(self, r, c, d, queue):
        if d == 'h':
            for cc in range(self.W): self.hit(r, cc, queue)
        else:
            for rr in range(self.H): self.hit(rr, c, queue)

    def explode(self, r, c, rad, queue):
        for dr in range(-rad, rad + 1):
            for dc in range(-rad, rad + 1):
                self.hit(r + dr, c + dc, queue)

    def falcon_target(self, r0, c0):
        best, bs = None, -1
        for r in range(self.H):
            for c in range(self.W):
                if not self.ok[r][c] or abs(r - r0) + abs(c - c0) <= 1: continue
                b, t = self.blk[r][c], self.tile[r][c]
                if b and self.goals.get(b[0], 0) > 0: s = 100 + (10 if b[1] == 1 else 0)
                elif self.chain[r][c] and self.goals.get('chain', 0) > 0: s = 90
                elif b: s = 20
                elif t and t[0] == 'c' and self.goals.get(COLORS[t[1]], 0) > 0: s = 40
                elif t and t[0] == 'c': s = 10
                else: continue
                s += self.rng.random() * 8
                if s > bs: best, bs = (r, c), s
        return best

    def falcon(self, r, c, carry, queue, neighbors=True):
        if neighbors:
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)): self.hit(r + dr, c + dc, queue)
        tg = self.falcon_target(r, c)
        if not tg: return
        if carry == 'arrow': self.arrow(tg[0], tg[1], 'h', queue); self.arrow(tg[0], tg[1], 'v', queue)
        elif carry == 'barrel': self.explode(tg[0], tg[1], 2, queue)
        else: self.hit(tg[0], tg[1], queue)

    def common_color(self):
        n = [0] * 5
        for row in self.tile:
            for t in row:
                if t and t[0] == 'c': n[t[1]] += 1
        return max(range(5), key=lambda i: n[i])

    def orb(self, r, c, color, convert, queue):
        targets = [(rr, cc) for rr in range(self.H) for cc in range(self.W)
                   if self.tile[rr][cc] and self.tile[rr][cc] == ('c', color)]
        if convert:
            for rr, cc in targets:
                kind = convert if convert != 'arrow' else self.rng.choice(['ah', 'av'])
                self.tile[rr][cc] = (kind, -1)
                queue.append((rr, cc))
        else:
            for rr, cc in targets: self.hit(rr, cc, queue)

    def combo(self, a, b, queue):
        (ra, ca), (rb, cb) = a, b
        ka, kb = self.tile[ra][ca][0], self.tile[rb][cb][0]
        self.tile[ra][ca] = None; self.tile[rb][cb] = None
        norm = lambda k: 'arrow' if k in ('ah', 'av') else k
        kinds = '+'.join(sorted([norm(ka), norm(kb)]))
        r, c = rb, cb
        if kinds == 'orb+orb':
            for rr in range(self.H):
                for cc in range(self.W): self.hit(rr, cc, queue)
        elif kinds.endswith('+orb') or kinds.startswith('orb+'):
            other = kinds.replace('orb', '').strip('+')
            self.orb(r, c, self.common_color(), other, queue)
        elif kinds == 'barrel+barrel': self.explode(r, c, 3, queue)
        elif kinds == 'arrow+barrel':
            for d in (-1, 0, 1):
                if 0 <= r + d < self.H: self.arrow(r + d, c, 'h', queue)
                if 0 <= c + d < self.W: self.arrow(r, c + d, 'v', queue)
        elif kinds == 'arrow+arrow': self.arrow(r, c, 'h', queue); self.arrow(r, c, 'v', queue)
        elif kinds == 'falcon+falcon':
            for i in range(3): self.falcon(r, c, None, queue, i == 0)
        elif kinds == 'arrow+falcon': self.falcon(r, c, 'arrow', queue)
        elif kinds == 'barrel+falcon': self.falcon(r, c, 'barrel', queue)

    def run_queue(self, queue):
        while queue:
            r, c = queue.pop(0)
            self.activate(r, c, queue)

    # ------------------------------------------------------------------ matching
    def find_groups(self, moved=()):
        H, W = self.H, self.W
        col = lambda r, c: self.color_at(r, c)
        runs = []
        for r in range(H):
            c = 0
            while c < W:
                k = col(r, c)
                if k < 0: c += 1; continue
                e = c
                while e + 1 < W and col(r, e + 1) == k: e += 1
                if e - c + 1 >= 3: runs.append(('h', [(r, x) for x in range(c, e + 1)]))
                c = e + 1
        for c in range(W):
            r = 0
            while r < H:
                k = col(r, c)
                if k < 0: r += 1; continue
                e = r
                while e + 1 < H and col(e + 1, c) == k: e += 1
                if e - r + 1 >= 3: runs.append(('v', [(y, c) for y in range(r, e + 1)]))
                r = e + 1
        squares = []
        for r in range(H - 1):
            for c in range(W - 1):
                k = col(r, c)
                if k >= 0 and col(r, c + 1) == k and col(r + 1, c) == k and col(r + 1, c + 1) == k:
                    squares.append([(r, c), (r, c + 1), (r + 1, c), (r + 1, c + 1)])
        shapes = [('run', d, cells) for d, cells in runs] + [('sq', None, s) for s in squares]
        if not shapes: return []
        parent = list(range(len(shapes)))
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        owner = {}
        for i, s in enumerate(shapes):
            for cell in s[2]:
                if cell in owner: parent[find(i)] = find(owner[cell])
                else: owner[cell] = i
        groups = {}
        for i, s in enumerate(shapes): groups.setdefault(find(i), []).append(s)
        out = []
        for lst in groups.values():
            cells = sorted({cell for s in lst for cell in s[2]})
            rs = [s for s in lst if s[0] == 'run']
            maxlen = max([len(s[2]) for s in rs], default=0)
            power, pool = None, cells
            if maxlen >= 5:
                power = 'orb'; pool = next(s[2] for s in rs if len(s[2]) >= 5)
            else:
                cross = None
                for h in (s for s in rs if s[1] == 'h'):
                    for v in (s for s in rs if s[1] == 'v'):
                        inter = set(h[2]) & set(v[2])
                        if inter: cross = next(iter(inter))
                if cross: power = 'barrel'; pool = [cross]
                elif maxlen == 4:
                    r4 = next(s for s in rs if len(s[2]) == 4)
                    power = 'ah' if r4[1] == 'h' else 'av'; pool = r4[2]
                elif any(s[0] == 'sq' for s in lst):
                    power = 'falcon'; pool = next(s[2] for s in lst if s[0] == 'sq')
            anchor = next((m for m in moved if m in cells), None) or pool[len(pool) // 2]
            out.append((cells, power, anchor))
        return out

    def resolve_groups(self, groups):
        queue = []
        for cells, power, anchor in groups:
            cs = set(cells)
            damaged = set()
            gcol = self.tile[cells[0][0]][cells[0][1]][1] if self.tile[cells[0][0]][cells[0][1]] else -1
            for r, c in cells:
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (r + dr, c + dc)
                    if n in cs or n in damaged: continue
                    if 0 <= n[0] < self.H and 0 <= n[1] < self.W and self.blk[n[0]][n[1]]:
                        damaged.add(n)
                        bc = self.blk[n[0]][n[1]][3]
                        if bc is not None and bc != gcol: continue
                        self.damage_blocker(n[0], n[1], queue)
            for r, c in cells:
                if self.chain[r][c]:
                    self.chain[r][c] = False; self.collect('chain'); continue
                t = self.tile[r][c]
                if t and t[0] == 'c':
                    self.collect(COLORS[t[1]]); self.tile[r][c] = None; self.crack(r, c)
            if power and not self.tile[anchor[0]][anchor[1]] and not self.chain[anchor[0]][anchor[1]]:
                self.tile[anchor[0]][anchor[1]] = (power, -1)
        self.run_queue(queue)

    # ------------------------------------------------------------------ gravity
    def settle(self):
        changed = True
        while changed:
            changed = False
            for c in range(self.W):
                for r in range(self.H - 1, -1, -1):
                    if not self.ok[r][c] or self.blk[r][c] or self.tile[r][c]: continue
                    k = r - 1
                    while k >= 0 and (not self.ok[k][c] or (not self.blk[k][c] and not self.tile[k][c])): k -= 1
                    if k < 0:
                        p = self.portal_for(r, c)
                        if p:
                            fr, fc = p[0], p[1]
                            if self.tile[fr][fc] and not self.chain[fr][fc]:
                                self.tile[r][c] = self.tile[fr][fc]; self.tile[fr][fc] = None; changed = True
                            continue
                        if self.items_left > 0 and self.rng.random() < 0.25 and not any(t and t[0] == 'gold' for row in self.tile for t in row):
                            self.items_left -= 1
                            self.tile[r][c] = ('gold', -1)
                        else:
                            self.tile[r][c] = ('c', self.spawn_color(r, c))
                        changed = True
                    elif self.tile[k][c] and not self.chain[k][c] and not self.blk[k][c]:
                        self.tile[r][c] = self.tile[k][c]; self.tile[k][c] = None; changed = True
            if changed: continue
            for r in range(self.H - 1, 0, -1):
                for c in range(self.W):
                    if not self.ok[r][c] or self.blk[r][c] or self.tile[r][c]: continue
                    for dc in (-1, 1):
                        sc = c + dc
                        if not (0 <= sc < self.W) or not self.ok[r - 1][sc] or self.blk[r - 1][sc]: continue
                        if not self.tile[r - 1][sc] or self.chain[r - 1][sc]: continue
                        if self.ok[r][sc] and not self.blk[r][sc] and not self.tile[r][sc]: continue
                        self.tile[r][c] = self.tile[r - 1][sc]; self.tile[r - 1][sc] = None; changed = True
                        break
                    if changed: break
                if changed: break

    def portal_for(self, r, c):
        for p in self.portals:
            if p[3] == c and p[2] <= r:
                if all(not self.ok[k][c] or (not self.blk[k][c] and not self.tile[k][c]) for k in range(p[2], r)):
                    return p
        return None

    def spawn_color(self, r, c):
        n = self.ncol
        col = self.color_at
        matching = set()
        for k in range(n):
            if (col(r + 1, c) == k and col(r + 2, c) == k) or (col(r, c - 1) == k and col(r, c - 2) == k) or \
               (col(r, c + 1) == k and col(r, c + 2) == k) or (col(r, c - 1) == k and col(r, c + 1) == k):
                matching.add(k)
        roll = self.rng.random()
        if self.bias > 0 and roll < self.bias and matching:
            return self.rng.choice(sorted(matching))
        if self.bias < 0 and roll < -self.bias:
            safe = [k for k in range(n) if k not in matching]
            if safe: return self.rng.choice(safe)
        return self.rng.randrange(n)

    def collect_items(self):
        got = False
        for r in range(self.H):
            for c in range(self.W):
                t = self.tile[r][c]
                if t and t[0] == 'gold' and all(not self.ok[k][c] for k in range(r + 1, self.H)):
                    self.tile[r][c] = None; self.collect('gold'); got = True
        return got

    def grow_vines(self):
        growers = [(r, c) for r in range(self.H) for c in range(self.W) if self.blk[r][c] and self.blk[r][c][2]]
        opts = []
        for r, c in growers:
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc = r + dr, c + dc
                if 0 <= rr < self.H and 0 <= cc < self.W and self.ok[rr][cc] and not self.blk[rr][cc] and not self.chain[rr][cc] \
                        and self.tile[rr][cc] and self.tile[rr][cc][0] == 'c':
                    opts.append((rr, cc))
        if not opts: return
        rr, cc = self.rng.choice(opts)
        self.tile[rr][cc] = None
        self.blk[rr][cc] = ['vines', 1, True, None]
        if 'vines' in self.goals: self.goals['vines'] += 1

    def cascade(self, moved=()):
        steps = 0
        while True:
            self.settle()
            if self.collect_items():
                continue
            g = self.find_groups(moved)
            if not g: break
            self.resolve_groups(g)
            moved = ()
            steps += 1
            if steps > 60: break

    # ------------------------------------------------------------------ moves
    def legal_moves(self):
        mv = []
        for r in range(self.H):
            for c in range(self.W):
                t = self.tile[r][c]
                if not t or self.chain[r][c]: continue
                if t[0] not in ('c', 'gold'): mv.append(('tap', (r, c)))
                for dr, dc in ((0, 1), (1, 0)):
                    r2, c2 = r + dr, c + dc
                    if r2 >= self.H or c2 >= self.W: continue
                    t2 = self.tile[r2][c2]
                    if not t2 or self.chain[r2][c2]: continue
                    if t[0] not in ('c', 'gold') or t2[0] not in ('c', 'gold'):
                        mv.append(('swap', (r, c), (r2, c2))); continue
                    self.tile[r][c], self.tile[r2][c2] = t2, t
                    ok = self.forms_match(r, c) or self.forms_match(r2, c2)
                    self.tile[r][c], self.tile[r2][c2] = t, t2
                    if ok: mv.append(('swap', (r, c), (r2, c2)))
        return mv

    def forms_match(self, r, c):
        k = self.color_at(r, c)
        if k < 0: return False
        n = 1; x = c - 1
        while self.color_at(r, x) == k: n += 1; x -= 1
        x = c + 1
        while self.color_at(r, x) == k: n += 1; x += 1
        if n >= 3: return True
        n = 1; y = r - 1
        while self.color_at(y, c) == k: n += 1; y -= 1
        y = r + 1
        while self.color_at(y, c) == k: n += 1; y += 1
        if n >= 3: return True
        for dr, dc in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            if self.color_at(r + dr, c) == k and self.color_at(r, c + dc) == k and self.color_at(r + dr, c + dc) == k: return True
        return False

    def play(self, m, shallow=False):
        """Play a move. shallow=True resolves only what a player can see (no refill/cascade)."""
        queue = []
        if m[0] == 'tap':
            self.activate(*m[1], queue); self.run_queue(queue)
            if not shallow: self.cascade(); self.after_move()
            return
        (r, c), (r2, c2) = m[1], m[2]
        a, b = self.tile[r][c], self.tile[r2][c2]
        self.tile[r][c], self.tile[r2][c2] = b, a
        pa, pb = a[0] not in ('c', 'gold'), b[0] not in ('c', 'gold')
        if pa and pb:
            self.combo((r, c), (r2, c2), queue)
        elif pa:
            self.activate(r2, c2, queue, color=b[1])
        elif pb:
            self.activate(r, c, queue, color=a[1])
        self.run_queue(queue)
        if shallow:
            g = self.find_groups(((r, c), (r2, c2)))
            if g: self.resolve_groups(g)
        else:
            self.cascade(moved=((r, c), (r2, c2)))
            self.after_move()

    def run_belts(self):
        moved = False
        for row, d in self.belts:
            cols = [c for c in range(self.W) if self.ok[row][c] and not self.blk[row][c] and not self.chain[row][c] and self.tile[row][c]]
            n = len(cols)
            if n < 2: continue
            tiles = [self.tile[row][c] for c in cols]
            for i, t in enumerate(tiles): self.tile[row][cols[(i + d) % n]] = t
            moved = True
        if moved: self.cascade()

    def after_move(self):
        if self.belts: self.run_belts()
        if not self.vines_broken: self.grow_vines()
        self.vines_broken = False

    def ensure_moves(self):
        for _ in range(50):
            if self.legal_moves(): return
            for r in range(self.H):
                for c in range(self.W):
                    if self.tile[r][c] and self.tile[r][c][0] == 'c' and not self.chain[r][c]:
                        self.tile[r][c] = ('c', self.safe_color(r, c))

    def progress(self):
        return sum(self.goals.values())

    def gold_gaps(self):
        """How far treasure items would drop (empty cells under them) — players aim below the treasure."""
        n = 0
        for r in range(self.H):
            for c in range(self.W):
                t = self.tile[r][c]
                if t and t[0] == 'gold':
                    for k in range(r + 1, self.H):
                        if self.ok[k][c] and not self.tile[k][c] and not self.blk[k][c]: n += 1
        return n

    def cauldron_hp(self):
        return sum(b[1] for row in self.blk for b in row if b and b[0] == 'cauldron')

    def power_count(self):
        return sum(1 for row in self.tile for t in row if t and t[0] not in ('c', 'gold'))


def bot_move(b, rng, skill=1.0):
    moves = b.legal_moves()
    if not moves: return None
    base = b.progress()
    scored = []
    for m in moves:
        sim = copy.deepcopy(b)
        sim.rng = random.Random(rng.random())
        sim.play(m, shallow=True)  # a human sees the immediate result, not the future cascade
        score = (base - sim.progress()) * 10 + sim.power_count() * 3 + sim.gold_gaps() * 12 - (5 if m[0] == 'tap' and not any(sim.goals[g] < b.goals[g] for g in b.goals) else 0)
        score += (b.cauldron_hp() - sim.cauldron_hp()) * 4  # filling a cauldron is visible progress
        score += rng.random() * (1.0 + (1 - skill) * 30)
        scored.append((score, m))
    scored.sort(key=lambda s: -s[0])
    return scored[0][1]


def simulate(lv, seed, cap=80, skill=1.0):
    rng = random.Random(seed)
    b = Board(lv, rng)
    for i in range(1, cap + 1):
        m = bot_move(b, rng, skill)
        if m is None:
            b.ensure_moves(); continue
        b.play(m)
        b.ensure_moves()
        if b.done(): return i
    return cap + 1


if __name__ == '__main__':
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    levels = parse_levels()
    which = [int(x) for x in sys.argv[2:]] or range(1, len(levels) + 1)
    for n in which:
        lv = levels[n - 1]
        res = sorted(simulate(lv, 1000 * n + s, skill=0.6) for s in range(runs))
        win = sum(r <= lv['moves'] for r in res) / runs
        print(f"{n:>3} {lv['diff']:10} moves={lv['moves']:>3} bot_needs median={statistics.median(res):>5} p25={res[runs//4]:>3} p75={res[(3*runs)//4]:>3} win={win:.0%}", flush=True)
