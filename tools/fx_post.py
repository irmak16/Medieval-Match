"""Add a cartoon outline + slight contrast to Blender debris renders."""
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage
src, dst = sys.argv[1], sys.argv[2]
for f in sorted(glob.glob(os.path.join(src, '*.png'))):
    im = np.asarray(Image.open(f).convert('RGBA')).astype(np.float32)
    a = im[..., 3] / 255.0
    ring = ndimage.grey_dilation(a, footprint=np.ones((5, 5))) 
    ring = ndimage.gaussian_filter(ring, 0.6)
    out = np.zeros_like(im)
    outline = np.array([38, 20, 10], np.float32)
    out[..., :3] = outline
    out[..., 3] = ring * 255
    # composite object over outline
    oa = a[..., None]
    rgb = im[..., :3] * oa + out[..., :3] * (1 - oa)
    alpha = np.maximum(a, ring)
    res = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(res).save(os.path.join(dst, os.path.basename(f)), optimize=True)
    print('post', os.path.basename(f))
