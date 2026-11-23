#!/usr/bin/env python3
"""Turns generated images from Art/<folder>/*.png into game-ready files in public/art + manifest.json.

Usage (from the repo folder):  python3 tools/art/process.py ../Art
Needs: pip install pillow rembg numpy scipy   (rembg downloads its background-removal model on first run)
Sprite sheets: Art/sheets/<ID>.png or Art/<ID>.png (newest wins) is cut by the grid in tools/art/sheets.json first; then any single file
in Art/<folder>/ with the same name overrides the sheet result (used to redo one bad item).
Full-frame folders (backgrounds, cafe rooms, story covers, store) keep their background;
everything else gets the background removed, is trimmed to content and resized.
"""
import json, sys
from pathlib import Path
from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '../Art')
DST = Path(__file__).resolve().parents[2] / 'public' / 'art'
# folder -> (max size in px, remove background)
RULES = {
    # 2026-11-23: sized for high-DPI rendering (game renders up to 3x); sources smaller than this stay native
    'heads': (384, True), 'tails': (384, True), 'portraits': (640, True), 'obstacles': (256, True),
    'overlays': (384, True), 'ui': (256, True), 'accessories': (384, True), 'story': (768, True),
    'cafe': (768, True), 'backgrounds': (2160, False), 'kittens': (512, True), 'map': (512, True),
}
FULL_FRAME = ('cafe_room', 'bg_', 'chapter', 'cover')

try:
    from rembg import remove
except ImportError:
    remove = None
    print('rembg not installed: backgrounds will be kept (pip install rembg)')

# imports are additive: keys from earlier batches stay unless this batch replaces them
_mf = DST / 'manifest.json'
manifest = json.loads(_mf.read_text()) if _mf.exists() else {}
# hosted Qwen stamps a small "Qwen" logo in the bottom-right corner: blobs fully inside this zone are dropped,
# full-frame images are cropped so the zone never shows
WM = (0.86, 0.90)
# full-frame images in the Art root: key -> (folder, target aspect w/h, output width, horizontal focus 0..1)
FRAMES = {
    'bg_board_floor': ('backgrounds', 9 / 16, 720, 0.5), 'bg_board_roof': ('backgrounds', 9 / 16, 720, 0.5),
    'bg_board_kitchen': ('backgrounds', 9 / 16, 720, 0.35), 'bg_board_garden': ('backgrounds', 9 / 16, 720, 0.5),
    'bg_menu': ('backgrounds', 9 / 16, 720, 0.5), 'bg_album': ('backgrounds', 9 / 16, 720, 0.5),
    'bg_board_nursery': ('backgrounds', 9 / 16, 720, 0.5), 'bg_board_winter': ('backgrounds', 9 / 16, 720, 0.5),
    'cafe_room1': ('backgrounds', 3 / 4, 720, 0.5), 'cafe_room2': ('backgrounds', 3 / 4, 720, 0.5),
    'cafe_room3': ('backgrounds', 3 / 4, 720, 0.5), 'cafe_room4': ('backgrounds', 3 / 4, 720, 0.5),
    'chapter1_cover': ('story', 4 / 3, 720, 0.5), 'chapter2_cover': ('story', 4 / 3, 720, 0.5),
}


def frame(im, aspect, width, focus):
    """Crops to the aspect (focus = horizontal position 0..1), keeping out of the watermark corner."""
    W, H = im.size
    h = H
    w = min(W, int(h * aspect))
    if w == W:  # wider target than the source: cut height instead, from the top
        h = min(int(H * WM[1]), int(w / aspect))
        w = int(h * aspect)
    x = int((W - w) * focus)
    if x + w > W * WM[0] and h > H * WM[1]:
        x = max(0, int(W * WM[0]) - w)
        if x + w > W * WM[0]:  # still overlaps: lose the bottom strip
            h = int(H * WM[1])
            w = int(h * aspect)
            x = max(0, min(int((W - w) * focus), int(W * WM[0]) - w))
    im = im.crop((x, 0, x + w, h))
    return im.resize((width, int(width / aspect)), Image.LANCZOS)


def save(im, folder, stem, size):
    box = im.getbbox()
    if box:
        im = im.crop(box)
    im.thumbnail((size, size), Image.LANCZOS)
    out = DST / folder / (stem + '.webp')  # WebP with alpha: ~5x smaller than PNG, keeps first load small
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, 'WEBP', quality=88, method=6)
    manifest[stem] = f'{folder}/{stem}.webp'
    print('ok', folder, stem, im.size)


def key_background(im):
    """Sheets are drawn on one flat color: remove everything of that color connected to the image border.
    Enclosed light areas (white fur, window glass) stay because the outline separates them.
    Edges get a soft alpha and the background color is unmixed from the edge pixels (no halo, no jaggies)."""
    import numpy as np
    from scipy import ndimage
    a = np.array(im.convert('RGBA')).astype(np.float64)
    rgb = a[:, :, :3]
    corners = np.array([rgb[2, 2], rgb[2, -3], rgb[-3, 2], rgb[-3, -3]])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    lab, _ = ndimage.label(dist < 48)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bgmask = np.isin(lab, edge[edge > 0])
    # edge band next to the background: alpha from the color distance, 0 at the bg color, 1 well away from it
    band = ndimage.binary_dilation(bgmask, iterations=3) & ~bgmask
    soft = np.clip((dist - 40) / 90, 0, 1)
    alpha = np.where(bgmask, 0.0, np.where(band, soft, 1.0))
    # light smoothing of the matte, only around the edge band
    near = ndimage.binary_dilation(band, iterations=1)
    alpha = np.where(near, ndimage.gaussian_filter(alpha, 0.7), alpha)
    # unmix: observed = a*fg + (1-a)*bg  ->  fg = (observed - (1-a)*bg) / a
    al = np.maximum(alpha, 1e-3)[..., None]
    fg = np.clip((rgb - (1 - al) * bg) / al, 0, 255)
    rgb = np.where((alpha < 0.999)[..., None], fg, rgb)
    out = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
    return Image.fromarray(out)


def cut_sheet(path, rows, cols):
    """Keys out the flat sheet background, then gives every blob to the grid cell holding its center,
    so items slightly off-grid or made of several parts (Zzz, fairy lights) still land in the right file."""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cw, ch = W / cols, H / rows
    try:
        import numpy as np
        from scipy import ndimage
    except ImportError:  # plain equal split, background removed per cell
        cells = [im.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch))) for r in range(rows) for c in range(cols)]
        return [remove(c) if remove else c for c in cells]
    a = np.array(key_background(im))
    lab, _ = ndimage.label(a[:, :, 3] > 8)
    cells = [np.zeros(lab.shape, bool) for _ in range(rows * cols)]
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        part = lab[sl] == i
        if part.sum() < 40:  # specks
            continue
        if sl[1].start > W * WM[0] and sl[0].start > H * WM[1]:  # generator watermark in the corner
            continue
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        k = min(int(cy // ch), rows - 1) * cols + min(int(cx // cw), cols - 1)
        cells[k][sl] |= part
    out = []
    for m in cells:
        b = a.copy()
        b[:, :, 3] = np.where(m, b[:, :, 3], 0)
        out.append(Image.fromarray(b))
    return out


SHEETS = json.loads((Path(__file__).with_name('sheets.json')).read_text())
for sid, spec in SHEETS.items():
    # newest of Art/sheets/<ID>.png and Art/<ID>.png
    cands = [p for p in (SRC / 'sheets' / f'{sid}.png', SRC / f'{sid}.png') if p.exists()]
    if not cands:
        continue
    f = max(cands, key=lambda p: p.stat().st_mtime)
    if 'frame' in spec:  # full-frame cells (backgrounds, rooms): exact grid crop, kept opaque, saved as JPEG
        src = Image.open(f).convert('RGB')
        W, H = src.size
        cw, ch = W / spec['cols'], H / spec['rows']
        inset = spec.get('inset', 0)
        for i, name in enumerate(spec['names']):
            if not name:
                continue
            r, c = divmod(i, spec['cols'])
            cell = src.crop((int(c * cw) + inset, int(r * ch) + inset, int((c + 1) * cw) - inset, int((r + 1) * ch) - inset))
            w = spec['frame']
            cell = cell.resize((w, int(w * cell.height / cell.width)), Image.LANCZOS)
            folder, stem = name.split('/')
            out = DST / folder / (stem + '.jpg')
            out.parent.mkdir(parents=True, exist_ok=True)
            cell.save(out, quality=86, optimize=True)
            manifest[stem] = f'{folder}/{stem}.jpg'
            print('ok frame cell', stem, cell.size)
        continue
    for name, im in zip(spec['names'], cut_sheet(f, spec['rows'], spec['cols'])):
        if not name:
            continue
        folder, stem = name.split('/')
        save(im, folder, stem, RULES[folder][0])

for stem, (folder, aspect, width, focus) in FRAMES.items():
    f = SRC / f'{stem}.png'
    if not f.exists():
        continue
    out = DST / folder / (stem + '.jpg')
    out.parent.mkdir(parents=True, exist_ok=True)
    frame(Image.open(f).convert('RGB'), aspect, width, focus).save(out, quality=86, optimize=True)
    manifest[stem] = f'{folder}/{stem}.jpg'
    print('ok frame', stem)

# single transparent items in the Art root (logo, shelf): flat background keyed like sheets
SINGLES = {'logo': ('ui', 1600), 'trophy_shelf': ('cafe', 480)}
for stem, (folder, size) in SINGLES.items():
    f = SRC / f'{stem}.png'
    if f.exists():
        save(cut_sheet(f, 1, 1)[0], folder, stem, size)

for folder, (size, cut) in RULES.items():
    for f in sorted((SRC / folder).glob('*.png')):
        im = Image.open(f).convert('RGBA')
        full = f.stem.startswith(FULL_FRAME)
        if cut and not full and remove:
            im = remove(im)
        if full:
            im.thumbnail((1280, 1280), Image.LANCZOS)
            out = DST / folder / (f.stem + '.png')
            out.parent.mkdir(parents=True, exist_ok=True)
            im.save(out, optimize=True)
            manifest[f.stem] = f'{folder}/{f.stem}.png'
            print('ok', folder, f.stem, im.size)
        else:
            save(im, folder, f.stem, size)

(DST / 'manifest.json').write_text(json.dumps(manifest, indent=1))
print(f'{len(manifest)} images -> {DST}')
