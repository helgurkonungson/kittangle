#!/usr/bin/env python3
"""Imports art/cafe_icons1.png (2026-11-24, ChatGPT): 3x2 sheet of UI icons -> public/art/ui + manifest.
Usage: python3 tools/art/cafe_icons.py <path to cafe_icons1.png>"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

DST = Path(__file__).resolve().parents[2] / 'public' / 'art'
MF = DST / 'manifest.json'
manifest = json.loads(MF.read_text())
NAMES = ['icon_streak', 'icon_lock', 'icon_tag_sun', 'icon_tag_cozy', 'icon_check', 'icon_tag_play']

im = Image.open(sys.argv[1]).convert('RGBA')
a = np.array(im)[:, :, 3] > 24
lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=12))
sizes = ndimage.sum(a, lab, range(1, n + 1))
keep = list(np.argsort(sizes)[::-1][:6] + 1)
boxes = []
for k in keep:
    ys, xs = np.where(lab == k)
    boxes.append((int(((ys.min() + ys.max()) / 2) // (im.height / 2)), xs.min(), k, (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)))
boxes.sort()
arr = np.array(im)
for (row, _, k, box), name in zip(boxes, NAMES):
    one = arr.copy()
    one[:, :, 3] = np.where(lab == k, one[:, :, 3], 0)
    piece = Image.fromarray(one).crop(box)
    piece.thumbnail((256, 256), Image.LANCZOS)
    piece.save(DST / 'ui' / f'{name}.webp', 'WEBP', quality=90, method=6)
    manifest[name] = f'ui/{name}.webp'
    print('ok', name, piece.size)
MF.write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
