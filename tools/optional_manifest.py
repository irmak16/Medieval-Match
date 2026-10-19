"""Write public/assets/optional.json listing which optional art files exist."""
import os, json, sys
d = sys.argv[1] if len(sys.argv) > 1 else 'public/assets'
out = {}
for f in sorted(os.listdir(d)):
    n, ext = os.path.splitext(f)
    if ext in ('.png', '.jpg', '.webp') and (n.startswith(('bt_', 'it_', 'castle_', 'pip_', 'card_', 'trophy', 'dungeon')) or n == 'ob_vines_grow'):
        out[n] = f
json.dump(out, open(os.path.join(d, 'optional.json'), 'w'), indent=0)
print(len(out), 'optional assets')
