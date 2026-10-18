"""Asset pipeline: white-background JPEGs -> trimmed transparent PNGs."""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

RAW = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def load(name):
    return np.asarray(Image.open(os.path.join(RAW, name)).convert("RGB")).astype(np.float32)


def bg_mask(rgb, tol=28, holes=False, hole_min=400):
    """Background = near-white region connected to the border (+ optional enclosed white holes)."""
    dist = 255.0 - rgb.min(axis=2)  # 0 for pure white
    near_white = dist < tol
    lab, n = ndimage.label(near_white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    border.discard(0)
    bg = np.isin(lab, list(border))
    if holes:
        very_white = dist < 10
        lab2, n2 = ndimage.label(very_white & ~bg)
        sizes = ndimage.sum(np.ones_like(lab2), lab2, range(1, n2 + 1))
        for i, s in enumerate(sizes, 1):
            if s >= hole_min:
                bg |= ndimage.binary_dilation(lab2 == i, iterations=2) & near_white
    return bg


def to_rgba(rgb, bg):
    """Un-blend edge pixels from white so outlines stay crisp without a white halo."""
    h, w, _ = rgb.shape
    alpha = np.ones((h, w), np.float32)
    # edge band: background pixels adjacent to foreground get partial alpha
    band = bg & ndimage.binary_dilation(~bg, iterations=3)
    a_est = (255.0 - rgb.min(axis=2)) / 255.0
    a_est = np.clip(a_est * 1.6, 0, 1)
    alpha[bg] = 0.0
    alpha[band] = a_est[band]
    # foreground pixels at the boundary: unblend too (removes white fringe)
    fg_edge = (~bg) & ndimage.binary_dilation(bg, iterations=1)
    alpha[fg_edge] = np.maximum(0.55, np.clip(a_est[fg_edge] * 1.8, 0, 1))
    out = rgb.copy()
    m = alpha > 0.01
    a3 = alpha[..., None]
    un = (rgb - (1 - a3) * 255.0) / np.maximum(a3, 1e-3)
    un = np.clip(un, 0, 255)
    soft = (alpha < 0.999)
    out[soft] = un[soft]
    rgba = np.dstack([out, alpha * 255.0]).astype(np.uint8)
    rgba[~m] = 0
    return rgba


def components(rgba, min_area=2000, keep_largest=False):
    a = rgba[..., 3] > 40
    a = ndimage.binary_closing(a, iterations=4)
    lab, n = ndimage.label(a)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    idx = [i + 1 for i, s in enumerate(sizes) if s >= min_area]
    if keep_largest:
        idx = [int(np.argmax(sizes)) + 1]
    boxes = []
    for i in idx:
        sl = ndimage.find_objects((lab == i).astype(int))[0]
        boxes.append((sl, lab == i))
    return boxes


def crop(rgba, sl, mask=None, pad=6):
    y0, y1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, rgba.shape[0])
    x0, x1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, rgba.shape[1])
    part = rgba[y0:y1, x0:x1].copy()
    if mask is not None:
        mm = ndimage.binary_dilation(mask, iterations=pad)[y0:y1, x0:x1]
        part[~mm] = 0
    return part


def save(arr, name, size=None, square=True):
    im = Image.fromarray(arr, "RGBA")
    if square:
        s = max(im.size)
        canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        canvas.paste(im, ((s - im.size[0]) // 2, (s - im.size[1]) // 2))
        im = canvas
    if size:
        if isinstance(size, int):
            if square:
                im = im.resize((size, size), Image.LANCZOS)
            else:
                r = size / max(im.size)
                im = im.resize((round(im.size[0] * r), round(im.size[1] * r)), Image.LANCZOS)
    im.save(os.path.join(OUT, name + ".png"), optimize=True)
    print("saved", name, im.size)


def sort_boxes(boxes, rows=False, H=1024):
    if rows:
        # 2-row sheets: row = which half of the image the box center is in
        return sorted(boxes, key=lambda b: ((b[0][0].start + b[0][0].stop) / 2 > H / 2, b[0][1].start))
    return sorted(boxes, key=lambda b: b[0][1].start)


def single(src, name, size, holes=False, largest=True, square=True):
    rgb = load(src)
    rgba = to_rgba(rgb, bg_mask(rgb, holes=holes))
    b = components(rgba, keep_largest=largest)[0]
    save(crop(rgba, b[0], b[1] if largest else None), name, size, square)


TILE = 192

# tiles 2x2: shield, potion, leaf, crown
rgb = load("01_tiles.jpeg")
rgba = to_rgba(rgb, bg_mask(rgb))
bx = sort_boxes(components(rgba), rows=True)
for b, n in zip(bx, ["tile_red", "tile_blue", "tile_green", "tile_yellow"]):
    save(crop(rgba, b[0], b[1]), n, TILE)

single("02_book_v2.jpeg", "tile_purple", TILE)
single("03_arrow_v2.jpeg", "pw_arrow", TILE)
single("04_barrel_v2.jpeg", "pw_barrel", TILE)
single("05_falcon_v3.jpeg", "pw_falcon", TILE)
single("06_orb_v2.jpeg", "pw_orb", TILE)  # largest component drops droplets & sparkles
single("08_chain.jpeg", "ob_chain", TILE, holes=True)
single("10_vines.jpeg", "ob_vines", TILE)

rgb = load("07_crate.jpeg")
rgba = to_rgba(rgb, bg_mask(rgb))
bx = sort_boxes(components(rgba, min_area=20000))
for b, n in zip(bx, ["ob_crate1", "ob_crate2", "ob_crate3"]):
    save(crop(rgba, b[0], b[1]), n, TILE)

rgb = load("09_stone_v2.jpeg")
rgba = to_rgba(rgb, bg_mask(rgb))
bx = sort_boxes(components(rgba, min_area=20000), rows=True)
# order: TL intact, TR cracked, BL intact dup, BR shattered
names = {0: "ob_stone1", 1: "ob_stone2", 3: "ob_stone3"}
for i, b in enumerate(bx):
    if i in names:
        save(crop(rgba, b[0]), names[i], TILE)

# board frame: keep full size, inner area transparent
rgb = load("11_board_frame.jpeg")
rgba = to_rgba(rgb, bg_mask(rgb, holes=True, hole_min=5000))
b = components(rgba, keep_largest=True)[0]
save(crop(rgba, b[0], pad=0), "ui_frame", None, square=False)

# background: just recompress
Image.open(os.path.join(RAW, "12_background.jpeg")).convert("RGB").save(os.path.join(OUT, "bg_game.jpg"), quality=88)

single("13_panel.jpeg", "ui_panel", 900, square=False)

rgb = load("14_buttons.jpeg")
rgba = to_rgba(rgb, bg_mask(rgb))
bx = sort_boxes(components(rgba, min_area=10000))
for b, n in zip(bx, ["ui_btn_green", "ui_btn_red", "ui_btn_round"]):
    save(crop(rgba, b[0], b[1]), n, 420 if n != "ui_btn_round" else 160, square=False)

single("15_popup.jpeg", "ui_popup", 900, square=False)

rgb = load("16_stars.jpeg")
rgba = to_rgba(rgb, bg_mask(rgb))
bx = sort_boxes(components(rgba, min_area=10000))
star = crop(rgba, bx[0][0], bx[0][1])
save(star, "ui_star", 256)
# empty star: dark carved silhouette derived from the gold star
emp = star.copy().astype(np.float32)
lum = emp[..., :3].mean(axis=2, keepdims=True) / 255.0
base = np.array([62, 36, 20], np.float32)
emp[..., :3] = base * (0.55 + 0.6 * lum)
inner = ndimage.binary_erosion(star[..., 3] > 128, iterations=10)
emp[inner, :3] *= 0.75
save(emp.astype(np.uint8), "ui_star_empty", 256)

rgb = load("17_icons.jpeg")
rgba = to_rgba(rgb, bg_mask(rgb, holes=True, hole_min=600))
bx = sort_boxes(components(rgba, min_area=10000), rows=True)
for b, n in zip(bx, ["ic_heart", "ic_coin", "ic_gear", "ic_lock"]):
    save(crop(rgba, b[0], b[1]), n, 128)


# large UI textures -> WebP (much smaller downloads)
for n in ["ui_frame", "ui_popup", "ui_panel", "ui_btn_green", "ui_btn_red"]:
    src = os.path.join(OUT, n + ".png")
    Image.open(src).save(os.path.join(OUT, n + ".webp"), "WEBP", quality=90, method=6)
    os.remove(src)
