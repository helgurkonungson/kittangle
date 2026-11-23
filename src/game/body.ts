import Phaser from 'phaser';
import { BREEDS } from '../core/content';
import { has } from './art';

/** Sprite cat bodies (art4): a strip texture mapped along the cat's path with a Rope.
 *  Strips are STRIP px tall = one cell; the tail cap center sits TAIL_E cells from the nub tip. */
const STRIP = 256;
const TAIL_E = 0.57;
/** samples per cell along the path */
const PER = 8;

type P = { x: number; y: number };

export function hasBodyArt(s: Phaser.Scene, breed: number) {
  const k = BREEDS[breed]?.key;
  return s.game.renderer.type === Phaser.WEBGL && has(s, `body_${k}_s`) && has(s, `body_${k}_t`);
}

const made: string[] = [];
/** tail strip, then the seamless straight strip repeated; the tail fades into it (no visible seam) */
function texture(s: Phaser.Scene, breed: number, len: number) {
  const k = BREEDS[breed].key;
  const key = `bodytex_${k}_${len}`;
  if (s.textures.exists(key)) return key;
  const tail = s.textures.get(`body_${k}_t`).getSourceImage() as HTMLImageElement;
  const st = s.textures.get(`body_${k}_s`).getSourceImage() as HTMLImageElement;
  const w = Math.ceil((len - 1 + TAIL_E) * STRIP);
  const tw = Math.min(tail.width, Math.round(STRIP * 0.95), w);
  const fade = Math.round(tw * 0.3);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = STRIP;
  const c = cv.getContext('2d')!;
  for (let x = tw - fade; x < w; x += st.width) c.drawImage(st, x, 0);
  // tail with its right edge faded out, on a scratch canvas
  const tc = document.createElement('canvas');
  tc.width = tw;
  tc.height = STRIP;
  const t = tc.getContext('2d')!;
  t.drawImage(tail, 0, 0, tw, STRIP, 0, 0, tw, STRIP);
  t.globalCompositeOperation = 'destination-in';
  const gr = t.createLinearGradient(tw - fade, 0, tw, 0);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  t.fillStyle = gr;
  t.fillRect(0, 0, tw, STRIP); // one rect: destination-in clears everything outside the shape
  c.drawImage(tc, 0, 0);
  s.textures.addCanvas(key, cv);
  made.push(key);
  // keep a bounded cache (each texture is up to ~2.4 MB of VRAM)
  while (made.length > 48) {
    const old = made.shift()!;
    if (s.textures.exists(old)) s.textures.remove(old);
  }
  return key;
}

/**
 * Point at parameter t along a path of cell centers (one cell apart), with 90° turns rounded
 * by a quarter circle of half a cell. t < 0 or t > n-1 extends the first / last segment.
 */
export function pathPoint(tr: P[], t: number, cs: number): P {
  const n = tr.length;
  if (n === 1) return tr[0];
  if (t <= 0 || t >= n - 1) {
    const [a, b] = t <= 0 ? [tr[0], tr[1]] : [tr[n - 2], tr[n - 1]];
    const base = t <= 0 ? a : b;
    const u = t <= 0 ? t : t - (n - 1);
    return { x: base.x + (b.x - a.x) * u, y: base.y + (b.y - a.y) * u };
  }
  const i = Math.round(t);
  const u = t - i; // -0.5..0.5 around vertex i
  if (i > 0 && i < n - 1) {
    const p = tr[i];
    const d1 = { x: (p.x - tr[i - 1].x) / cs, y: (p.y - tr[i - 1].y) / cs };
    const d2 = { x: (tr[i + 1].x - p.x) / cs, y: (tr[i + 1].y - p.y) / cs };
    if (Math.abs(d1.x * d2.y - d1.y * d2.x) > 0.5) {
      const r = cs / 2;
      const c = { x: p.x + (d2.x - d1.x) * r, y: p.y + (d2.y - d1.y) * r };
      const th = (u + 0.5) * Math.PI / 2;
      return { x: c.x - d2.x * r * Math.cos(th) + d1.x * r * Math.sin(th), y: c.y - d2.y * r * Math.cos(th) + d1.y * r * Math.sin(th) };
    }
  }
  const j = Math.min(Math.floor(t), n - 2);
  const f = t - j;
  return { x: tr[j].x + (tr[j + 1].x - tr[j].x) * f, y: tr[j].y + (tr[j + 1].y - tr[j].y) * f };
}

/** Dense body path tail→head for a cat of `len` cells whose tail sits at parameter `s` of `tr` (tail..head..beyond). */
export function bodyPath(tr: P[], s: number, len: number, cs: number, tailExt = TAIL_E) {
  const from = s - tailExt;
  const to = s + len - 1;
  const n = Math.ceil((to - from) * PER);
  const out: P[] = [];
  for (let k = 0; k <= n; k++) out.push(pathPoint(tr, from + ((to - from) * k) / n, cs));
  return out;
}

/** Creates or updates the rope that draws the body. `size` = rendered cell size (kittens are smaller). */
export function drawBody(s: Phaser.Scene, rope: Phaser.GameObjects.Rope | undefined, breed: number, len: number,
  path: P[], size: number) {
  const key = texture(s, breed, len);
  const k = size / STRIP;
  const pts = path.map((p) => ({ x: p.x / k, y: p.y / k }));
  if (!rope) {
    rope = s.add.rope(0, 0, key, undefined, pts as Phaser.Types.Math.Vector2Like[]).setScale(k);
  } else {
    if (rope.texture.key !== key) rope.setTexture(key);
    rope.setScale(k);
    rope.setPoints(pts as Phaser.Types.Math.Vector2Like[]);
  }
  return rope;
}

/** Soft contact shadow and the hint glow under a sprite body (same look as the procedural cat). */
export function drawUnder(g: Phaser.GameObjects.Graphics, path: P[], size: number, highlight: boolean) {
  g.clear();
  const line = (w: number, color: number, a: number, dx = 0, dy = 0) => {
    g.lineStyle(w, color, a).beginPath();
    g.moveTo(path[0].x + dx, path[0].y + dy);
    for (let i = 1; i < path.length; i++) g.lineTo(path[i].x + dx, path[i].y + dy);
    g.strokePath();
    g.fillStyle(color, a).fillCircle(path[0].x + dx, path[0].y + dy, w / 2).fillCircle(path[path.length - 1].x + dx, path[path.length - 1].y + dy, w / 2);
  };
  const w = size * 0.72;
  const full = path;
  path = full.slice(Math.min(full.length - 2, Math.round(PER * 0.5))); // no shadow block around the thin tail nub
  line(w, 0x39243f, 0.16, size * 0.05, size * 0.09);
  path = full;
  if (highlight) {
    line(w + 30, 0xffe27a, 0.35);
    line(w + 14, 0xfff3b0, 0.8);
  }
}
