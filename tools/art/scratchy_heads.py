#!/usr/bin/env python3
"""Cuts Scratchy's board heads out of the A07 pose sheet (front-facing heads, like the other cats' heads).
Usage: python3 tools/art/scratchy_heads.py <path to A07_scratchy_states.png>"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

DST = Path(__file__).resolve().parents[2] / 'public' / 'art'
# head boxes in the 1254 px sheet: calm = idle pose, offended = swipe pose, happy = smug pose, sleep = smug (eyes closed)
BOXES = {'calm': (138, 25, 496, 333), 'offended': (75, 677, 433, 985), 'happy': (784, 652, 1104, 941)}
sheet = Image.open(sys.argv[1]).convert('RGBA')
k = sheet.width / 1254
mf = DST / 'manifest.json'
manifest = json.loads(mf.read_text())
for mood, box in {**BOXES, 'sleep': BOXES['happy']}.items():
    im = sheet.crop(tuple(int(v * k) for v in box))
    a = np.array(im).astype(np.int32)
    rgb = a[:, :, :3]
    bg = np.array(sheet.getpixel((4, 4))[:3])  # the flat chroma green
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    # green screen: everything green-ish and connected to the border goes
    lab, _ = ndimage.label(dist < 60)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    mask = np.isin(lab, edge[edge > 0])
    ring = ndimage.binary_dilation(mask, iterations=2) & ~mask & (dist < 120)
    a[:, :, 3] = np.where(mask | ring, 0, 255)
    out = Image.fromarray(a.astype(np.uint8))
    out = out.crop(out.getbbox())
    out.thumbnail((192, 192), Image.LANCZOS)
    name = f'head_scratchy_{mood}'
    out.save(DST / 'heads' / f'{name}.webp', 'WEBP', quality=88, method=6)
    manifest[name] = f'heads/{name}.webp'
    print('ok', name, out.size)
mf.write_text(json.dumps(manifest, indent=1))
