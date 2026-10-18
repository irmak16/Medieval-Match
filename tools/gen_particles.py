"""Procedural particle textures (glow, sparkle, ring, smoke, streak)."""
import sys, os, math
import numpy as np
from PIL import Image
from scipy import ndimage
out = sys.argv[1]
S = 128
y, x = np.mgrid[0:S, 0:S].astype(np.float32)
cx = cy = (S - 1) / 2
r = np.hypot(x - cx, y - cy) / (S / 2)
ang = np.arctan2(y - cy, x - cx)
def save(a, name, rgb=(255, 255, 255)):
    a = np.clip(a, 0, 1)
    img = np.dstack([np.full_like(a, rgb[0]), np.full_like(a, rgb[1]), np.full_like(a, rgb[2]), a * 255]).astype(np.uint8)
    Image.fromarray(img).save(os.path.join(out, name + '.png'), optimize=True)
save(np.clip(1 - r, 0, 1) ** 2.2, 'p_glow')
save(np.exp(-((r - 0.78) / 0.09) ** 2) * (r < 1), 'p_ring')
# 4-point sparkle
spark = np.maximum(np.exp(-np.abs(x - cx) / 3.0) * np.exp(-np.abs(y - cy) / 26.0), np.exp(-np.abs(y - cy) / 3.0) * np.exp(-np.abs(x - cx) / 26.0))
spark = np.maximum(spark, np.clip(1 - r * 3.2, 0, 1))
save(spark, 'p_sparkle')
# soft smoke puff (noisy)
rng = np.random.default_rng(3)
n = ndimage.gaussian_filter(rng.random((S, S)), 6)
n = (n - n.min()) / (n.max() - n.min())
save(np.clip(1 - r, 0, 1) ** 1.3 * (0.55 + 0.6 * n), 'p_smoke')
# horizontal streak (for arrow trail)
st = np.exp(-((y - cy) / 10) ** 2) * np.clip(x / S, 0, 1) ** 1.5
save(st, 'p_streak')
# star (5-point) for rewards
k = 5
rr = 0.55 + 0.45 * np.cos(k * (ang + math.pi / 2)) 
star = (r < (0.42 + 0.5 * np.clip(np.cos(k * (ang + math.pi/2) / 1) , 0, 1) ** 3)).astype(np.float32)
save(ndimage.gaussian_filter(star, 1.0), 'p_star')
print('ok')
