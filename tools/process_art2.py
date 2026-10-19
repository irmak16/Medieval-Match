"""Second art batch: booster icons, treasure chest, growing vines, castle scenes."""
import sys, os
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2]]
RAW2, OUT = sys.argv[1], sys.argv[2]
from PIL import Image
import importlib.util
# reuse helpers from process_art without running its batch
src = open(os.path.join(os.path.dirname(__file__), 'process_art.py')).read().split('TILE = 192')[0]
ns = {}
exec(compile(src.replace("RAW = sys.argv[1]", f"RAW = {RAW2!r}").replace("OUT = sys.argv[2]", f"OUT = {OUT!r}"), 'process_art', 'exec'), ns)
single = ns['single']
for n in ['bt_hammer', 'bt_row', 'bt_col', 'bt_shuffle']:
    single(n + '.jpeg', n, 160, holes=(n == 'bt_row'))
single('it_chest.jpeg', 'it_chest', 192)
single('ob_vines_grow.jpeg', 'ob_vines_grow', 192, holes=True, largest=False)
for i in [1, 2, 3, 4, 5, 6]:
    p = os.path.join(RAW2, f'castle_{i}.jpeg')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB')
    im.thumbnail((960, 960), Image.LANCZOS)
    im.save(os.path.join(OUT, f'castle_{i}.jpg'), quality=86)
    print('saved castle', i, im.size)
