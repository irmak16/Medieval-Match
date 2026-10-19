"""Third art batch: castle ruins, Pip mascot poses, card sets, trophy, card pack, dungeon."""
import sys, os
RAW3, OUT = sys.argv[1], sys.argv[2]
from PIL import Image
src = open(os.path.join(os.path.dirname(__file__), 'process_art.py')).read().split('TILE = 192')[0]
ns = {}
exec(compile(src.replace("RAW = sys.argv[1]", f"RAW = {RAW3!r}").replace("OUT = sys.argv[2]", f"OUT = {OUT!r}"), 'process_art', 'exec'), ns)
single, load, to_rgba, bg_mask, components, crop, save, sort_boxes = (ns[k] for k in ['single', 'load', 'to_rgba', 'bg_mask', 'components', 'crop', 'save', 'sort_boxes'])

for i in range(1, 7):
    p = os.path.join(RAW3, f'castle_{i}_ruin.jpeg')
    if os.path.exists(p):
        im = Image.open(p).convert('RGB')
        im.thumbnail((960, 960), Image.LANCZOS)
        im.save(os.path.join(OUT, f'castle_{i}_ruin.jpg'), quality=86)
        print('ruin', i, im.size)

for pose in ['wave', 'happy', 'sad', 'scared', 'build']:
    p = f'pip_{pose}.jpeg'
    if os.path.exists(os.path.join(RAW3, p)):
        single(p, f'pip_{pose}', 420, holes=(pose != 'build'), largest=False, square=False)

single('trophy.jpeg', 'trophy', 220, holes=True)
# the pack has a soft grey shadow: use a looser tolerance
rgb = load('card_pack.jpeg')
rgba = to_rgba(rgb, bg_mask(rgb, tol=60))
b = components(rgba, keep_largest=True)[0]
save(crop(rgba, b[0], b[1]), 'card_pack', 240)

for s in 'abc':
    rgb = load(f'cards_{s}.jpeg')
    rgba = to_rgba(rgb, bg_mask(rgb, tol=20))
    bx = sort_boxes(components(rgba, min_area=30000), rows=False)
    # sort into 3 rows by center y, then x
    bx = sorted(bx, key=lambda q: ((q[0][0].start + q[0][0].stop) // 2 // (1024 // 3), q[0][1].start))
    assert len(bx) == 9, (s, len(bx))
    for i, q in enumerate(bx):
        save(crop(rgba, q[0], q[1], pad=0), f'card_{s}{i + 1}', 256)

im = Image.open(os.path.join(RAW3, 'dungeon.jpeg')).convert('RGB')
im.thumbnail((900, 900), Image.LANCZOS)
im.save(os.path.join(OUT, 'dungeon.jpg'), quality=85)
print('done')
