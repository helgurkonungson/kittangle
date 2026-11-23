#!/usr/bin/env python3
"""Imports the art4 batch (ChatGPT images with real alpha) into public/art + manifest.json.

Usage (from the repo folder):  python3 tools/art/art4.py <path to art4>
Needs: pip install pillow numpy scipy

- bodies/<breed>.png: 3 tiles (straight, corner, tail). Exported as two strips per breed with the body
  centered at BODY of the strip height: body_<breed>_s (straight, made seamless so it repeats) and
  body_<breed>_t (tail end, mirrored so the tail nub points left). The game maps them along the cat path.
- leap/*.png 2x2 sheets -> leap_<breed>; leap/vfx.png -> vfx_sparkle, vfx_hearts, vfx_puff, vfx_speed
- logo/logo.png -> logo; moony/face.png -> head_moony_*; moony/moony_vfx -> portrait_moony, leap_moony, moony_reveal
- menu/menu1.png, menu2.png -> room_land, room_port (full frame); menu cats -> menu_* pieces
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = Path(sys.argv[1])
DST = Path(__file__).resolve().parents[2] / 'public' / 'art'
MF = DST / 'manifest.json'
manifest = json.loads(MF.read_text()) if MF.exists() else {}
STRIP_H = 256          # body strip height in px (= one board cell)
BODY = 0.74            # body thickness (with outline) as share of the strip height


def save(im, folder, key, size=None, q=90):
    box = im.getbbox()
    if box:
        im = im.crop(box)
    if size:
        im.thumbnail((size, size), Image.LANCZOS)
    out = DST / folder / f'{key}.webp'
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, 'WEBP', quality=q, method=6)
    manifest[key] = f'{folder}/{key}.webp'
    print('ok', key, im.size)


def pieces(im, n):
    """The n biggest alpha blobs (small sparkles near a blob join it), sorted top-to-bottom, left-to-right."""
    a = np.array(im)[:, :, 3] > 24
    lab, cnt = ndimage.label(ndimage.binary_dilation(a, iterations=14))
    sizes = ndimage.sum(a, lab, range(1, cnt + 1))
    keep = np.argsort(sizes)[::-1][:n] + 1
    boxes = []
    for k in keep:
        ys, xs = np.where(lab == k)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, k))
    rowh = im.height / (2 if n == 4 else 1)
    boxes.sort(key=lambda b: (int(((b[1] + b[3]) / 2) // rowh), b[0]))
    out = []
    for x0, y0, x1, y1, k in boxes:
        arr = np.array(im)
        arr[:, :, 3] = np.where(lab == k, arr[:, :, 3], 0)
        out.append(Image.fromarray(arr).crop((x0, y0, x1, y1)))
    return out


def body(path, breed):
    im = Image.open(path).convert('RGBA')
    T = im.width // 3
    straight = im.crop((0, 0, T, im.height))
    tail = im.crop((2 * T, 0, 3 * T, im.height))

    def rows(t):
        a = np.array(t)[:, :, 3]
        col = a[:, int(t.width * 0.3):int(t.width * 0.5)].max(axis=1)
        ys = np.where(col > 128)[0]
        return ys.min(), ys.max() + 1

    # straight: drop soft/blurred ends, keep the solid body
    a = np.array(straight)[:, :, 3]
    y0, y1 = rows(straight)
    mid = (y0 + y1) // 2
    xs = np.where(a[mid] > 200)[0]
    x0, x1 = xs.min(), xs.max() + 1
    cut = int((x1 - x0) * 0.04)
    s = straight.crop((x0 + cut, 0, x1 - cut, straight.height))
    th = y1 - y0
    k = STRIP_H * BODY / th
    cy = (y0 + y1) / 2
    def strip(img, x_from=0, x_to=None):
        x_to = img.width if x_to is None else x_to
        top = cy - STRIP_H / 2 / k
        c = img.crop((x_from, int(round(top)), x_to, int(round(top + STRIP_H / k))))
        return c.resize((max(1, round(c.width * k)), STRIP_H), Image.LANCZOS)
    s = strip(s)
    # seamless: blend the last `o` columns into the first ones, then drop them
    arr = np.array(s).astype(np.float32)
    o = int(s.width * 0.18)
    w = np.linspace(0, 1, o)[None, :, None]
    arr[:, :o] = arr[:, -o:] * (1 - w) + arr[:, :o] * w
    s = Image.fromarray(arr[:, :-o].clip(0, 255).astype(np.uint8))
    out = DST / 'bodies' / f'body_{breed}_s.webp'
    out.parent.mkdir(parents=True, exist_ok=True)
    s.save(out, 'WEBP', quality=90, method=6)
    manifest[f'body_{breed}_s'] = f'bodies/body_{breed}_s.webp'

    # tail: from the solid left part to the tip of the nub, mirrored (nub on the left)
    ta = np.array(tail)[:, :, 3]
    xs = np.where(ta.max(axis=0) > 24)[0]
    solid = np.where(ta[mid] > 200)[0]
    t = strip(tail, solid.min() + cut, xs.max() + 1).transpose(Image.FLIP_LEFT_RIGHT)
    t.save(DST / 'bodies' / f'body_{breed}_t.webp', 'WEBP', quality=90, method=6)
    manifest[f'body_{breed}_t'] = f'bodies/body_{breed}_t.webp'
    print('ok body', breed, s.size, t.size)


for p in sorted((SRC / 'bodies').glob('*.png')):
    body(p, p.stem)

LEAPS = {'leap1-4': ['ginger', 'gray', 'black', 'white'], 'leap5-8': ['calico', 'siamese', 'british', 'tabby'],
         'leap9-12': ['mainecoon', 'sphynx', 'bengal', 'golden']}
for f, names in LEAPS.items():
    for im, n in zip(pieces(Image.open(SRC / 'leap' / f'{f}.png').convert('RGBA'), 4), names):
        save(im, 'leap', f'leap_{n}', 512)
for im, n in zip(pieces(Image.open(SRC / 'leap' / 'vfx.png').convert('RGBA'), 4), ['sparkle', 'hearts', 'puff', 'speed']):
    save(im, 'vfx', f'vfx_{n}', 384)

save(Image.open(SRC / 'logo' / 'logo.png').convert('RGBA'), 'ui', 'logo', 1200)

for im, m in zip(pieces(Image.open(SRC / 'moony' / 'face.png').convert('RGBA'), 4), ['calm', 'happy', 'offended', 'sleep']):
    save(im, 'heads', f'head_moony_{m}', 384)
mv = pieces(Image.open(SRC / 'moony' / 'moony_vfx').convert('RGBA'), 3)
save(mv[0], 'portraits', 'portrait_moony', 640)
save(mv[1], 'leap', 'leap_moony', 512)
save(mv[2], 'vfx', 'moony_reveal', 384)

for name, key in [('menu1', 'room_land'), ('menu2', 'room_port')]:
    im = Image.open(SRC / 'menu' / f'{name}.png').convert('RGB')
    out = DST / 'backgrounds' / f'{key}.webp'
    im.save(out, 'WEBP', quality=86, method=6)
    manifest[key] = f'backgrounds/{key}.webp'
    print('ok', key, im.size)
for im, n in zip(pieces(Image.open(SRC / 'menu' / 'menu_white_cat.png').convert('RGBA'), 2), ['white_back', 'white_tail']):
    save(im, 'menu', f'menu_{n}', 512)
for im, n in zip(pieces(Image.open(SRC / 'menu' / 'menu_sleepy_cats.png').convert('RGBA'), 2), ['gray_sleep', 'calico_sleep']):
    save(im, 'menu', f'menu_{n}', 512)
for im, n in zip(pieces(Image.open(SRC / 'menu' / 'menu_playing_cat.png').convert('RGBA'), 4), ['ginger_play', 'ginger_paw', 'yarn', 'fish']):
    save(im, 'menu', f'menu_{n}', 512)

MF.write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
