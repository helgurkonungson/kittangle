import Phaser from 'phaser';
import { BREEDS } from '../core/content';

export type Mood = 'calm' | 'happy' | 'angry' | 'sleep';
type P = { x: number; y: number };

const OUTLINE = 0x39243f; // deep plum ink (GDD 2.0 Neon Candy palette)
const INK = OUTLINE;

/** Mix two RGB colors. */
export function mix(a: number, b: number, t: number) {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh;
  return ch(16) | ch(8) | ch(0);
}
/** Art bible rule: shadows shift toward plum, highlights toward warm cream. */
export const shade = (c: number) => mix(c, 0x6b3f5e, 0.24);
export const light = (c: number) => mix(c, 0xfff6e5, 0.45);

/** Draws a stretchy cat along points (pts[0] = head) in pixel space. */
export function drawCat(
  g: Phaser.GameObjects.Graphics, pts: P[], breed: number, size: number,
  mood: Mood = 'calm', highlight = false, acc?: string, skipHead = false,
) {
  g.clear();
  const b = BREEDS[breed] ?? BREEDS[0];
  const w = size * 0.56;
  const n = pts.length;

  const stroke = (width: number, color: number) => {
    g.lineStyle(width, color, 1);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
    g.fillStyle(color, 1);
    for (const p of pts) g.fillCircle(p.x, p.y, width / 2);
  };

  // tail sticking out of the last segment
  const t1 = pts[n - 1];
  const t0 = pts[n - 2] ?? t1;
  const tl = Math.hypot(t1.x - t0.x, t1.y - t0.y) || 1;
  const tail = { x: t1.x + ((t1.x - t0.x) / tl) * size * 0.45, y: t1.y + ((t1.y - t0.y) / tl) * size * 0.45 };

  const off = (dx: number, dy: number) => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const path = (ps: P[], width: number, color: number, alpha = 1) => {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(ps[0].x, ps[0].y);
    for (let i = 1; i < ps.length; i++) g.lineTo(ps[i].x, ps[i].y);
    g.strokePath();
    g.fillStyle(color, alpha);
    for (const p of ps) g.fillCircle(p.x, p.y, width / 2);
  };
  const ol = Math.max(6, size * 0.11);

  // soft contact shadow, offset down-right (light comes from the top-left)
  path(off(size * 0.05, size * 0.09), w + ol, OUTLINE, 0.16);
  if (highlight) {
    path([...pts, tail], w + ol + 30, 0xffe27a, 0.35);
    path([...pts, tail], w + ol + 14, 0xfff3b0, 0.8);
  }
  g.lineStyle(size * 0.2, OUTLINE, 1).lineBetween(t1.x, t1.y, tail.x, tail.y);
  g.fillStyle(OUTLINE, 1).fillCircle(tail.x, tail.y, size * 0.1);
  g.lineStyle(size * 0.12, b.accent, 1).lineBetween(t1.x, t1.y, tail.x, tail.y);
  g.fillStyle(b.accent, 1).fillCircle(tail.x, tail.y, size * 0.06);

  stroke(w + ol, OUTLINE);
  // two-tone cel shading: shade tone, base shifted to the lit side, thin rim highlight
  stroke(w, shade(b.body));
  path(off(-w * 0.07, -w * 0.07), w * 0.8, b.body);
  // stripes / spots
  g.fillStyle(b.accent, 1);
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const c = pts[i];
    g.fillCircle((a.x + c.x) / 2 - w * 0.04, (a.y + c.y) / 2 - w * 0.04, w * 0.2);
  }

  if (skipHead) return;
  // head
  const h = pts[0];
  const nx = pts[1] ?? { x: h.x, y: h.y + 1 };
  const ang = Math.atan2(h.y - nx.y, h.x - nx.x);
  const R = size * 0.43;
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);
  const sx = -fy;
  const sy = fx;

  for (const s of [-1, 1]) {
    const a1 = ang + s * 0.35;
    const a2 = ang + s * 1.15;
    const tipA = ang + s * 0.8;
    const tri = [
      { x: h.x + Math.cos(a1) * R * 0.8, y: h.y + Math.sin(a1) * R * 0.8 },
      { x: h.x + Math.cos(tipA) * R * 1.55, y: h.y + Math.sin(tipA) * R * 1.55 },
      { x: h.x + Math.cos(a2) * R * 0.8, y: h.y + Math.sin(a2) * R * 0.8 },
    ];
    g.fillStyle(b.body, 1).fillTriangle(tri[0].x, tri[0].y, tri[1].x, tri[1].y, tri[2].x, tri[2].y);
    g.lineStyle(ol * 0.6, OUTLINE, 1).strokeTriangle(tri[0].x, tri[0].y, tri[1].x, tri[1].y, tri[2].x, tri[2].y);
  }
  for (const s of [-1, 1]) {
    const tipA = ang + s * 0.8;
    g.fillStyle(0xf4a7b4, 1).fillCircle(h.x + Math.cos(tipA) * R * 1.12, h.y + Math.sin(tipA) * R * 1.12, R * 0.17);
  }
  g.fillStyle(OUTLINE, 1).fillCircle(h.x, h.y, R + ol / 2);
  g.fillStyle(shade(b.body), 1).fillCircle(h.x, h.y, R);
  g.fillStyle(b.body, 1).fillCircle(h.x - R * 0.08, h.y - R * 0.08, R * 0.9);
  g.fillStyle(light(b.body), 0.8).fillCircle(h.x - R * 0.45, h.y - R * 0.45, R * 0.14);

  // face: eyes are ahead of center and spread sideways
  const ex = (s: number) => h.x + fx * R * 0.25 + sx * s * R * 0.4;
  const ey = (s: number) => h.y + fy * R * 0.25 + sy * s * R * 0.4;
  const er = R * 0.13;
  for (const s of [-1, 1]) {
    const x = ex(s);
    const y = ey(s);
    if (mood === 'calm') {
      g.fillStyle(OUTLINE, 1).fillCircle(x, y, er);
      g.fillStyle(0xffffff, 1).fillCircle(x + er * 0.35, y - er * 0.35, er * 0.35);
    } else if (mood === 'sleep' || mood === 'happy') {
      g.lineStyle(4, OUTLINE, 1).lineBetween(x - sx * er, y - sy * er, x + sx * er, y + sy * er);
    } else {
      g.fillStyle(OUTLINE, 1).fillCircle(x, y, er);
      // angry brows tilted towards the center
      const bx = x + fx * er * 2;
      const by = y + fy * er * 2;
      g.lineStyle(4, OUTLINE, 1).lineBetween(
        bx + sx * s * er * 1.4, by + sy * s * er * 1.4,
        bx - sx * s * er * 0.6 - fx * er, by - sy * s * er * 0.6 - fy * er,
      );
    }
  }
  // nose
  g.fillStyle(0xf08a9a, 1).fillCircle(h.x + fx * R * 0.6, h.y + fy * R * 0.6, R * 0.1);
  if (b.special) drawAccessory(g, 'neckerchief', h, R, fx, fy, sx, sy);
  if (acc) drawAccessory(g, acc, h, R, fx, fy, sx, sy);
}

/** Procedural seasonal accessories (replaced by generated art later). Forward = (fx, fy), side = (sx, sy). */
function drawAccessory(g: Phaser.GameObjects.Graphics, acc: string, h: P, R: number, fx: number, fy: number, sx: number, sy: number) {
  const bx = h.x - fx * R * 0.35;
  const by = h.y - fy * R * 0.35;
  g.lineStyle(3, OUTLINE, 1);
  if (acc === 'pompom_hat') {
    g.fillStyle(0xe2556b, 1).fillCircle(bx, by, R * 0.5).strokeCircle(bx, by, R * 0.5);
    g.fillStyle(0xfff6e8, 1).fillCircle(bx - fx * R * 0.35, by - fy * R * 0.35, R * 0.22).strokeCircle(bx - fx * R * 0.35, by - fy * R * 0.35, R * 0.22);
  } else if (acc === 'earmuffs') {
    for (const s of [-1, 1]) {
      const x = h.x + sx * s * R * 0.95;
      const y = h.y + sy * s * R * 0.95;
      g.fillStyle(0xf6b3c4, 1).fillCircle(x, y, R * 0.3).strokeCircle(x, y, R * 0.3);
    }
  } else if (acc === 'scarf') {
    const cx = h.x - fx * R * 0.95;
    const cy = h.y - fy * R * 0.95;
    g.lineStyle(R * 0.38, 0x7fcfb8, 1).lineBetween(cx - sx * R * 0.8, cy - sy * R * 0.8, cx + sx * R * 0.8, cy + sy * R * 0.8);
    g.lineStyle(R * 0.12, 0xffffff, 1).lineBetween(cx - sx * R * 0.2, cy - sy * R * 0.2, cx + sx * R * 0.2, cy + sy * R * 0.2);
  } else if (acc === 'neckerchief') {
    // Scratchy's coral neckerchief: a band behind the head with a small knot
    const cx = h.x - fx * R * 0.95;
    const cy = h.y - fy * R * 0.95;
    g.lineStyle(R * 0.42, INK, 1).lineBetween(cx - sx * R * 0.85, cy - sy * R * 0.85, cx + sx * R * 0.85, cy + sy * R * 0.85);
    g.lineStyle(R * 0.3, 0xff654d, 1).lineBetween(cx - sx * R * 0.78, cy - sy * R * 0.78, cx + sx * R * 0.78, cy + sy * R * 0.78);
    g.fillStyle(0xff654d, 1).fillTriangle(cx, cy, cx - fx * R * 0.55 + sx * R * 0.25, cy - fy * R * 0.55 + sy * R * 0.25,
      cx - fx * R * 0.55 - sx * R * 0.25, cy - fy * R * 0.55 - sy * R * 0.25);
  } else if (acc === 'snow_crown') {
    g.fillStyle(0xa8dcf5, 1);
    for (const s of [-1, 0, 1]) {
      const x = bx + sx * s * R * 0.28;
      const y = by + sy * s * R * 0.28;
      g.fillTriangle(x - sx * R * 0.14, y - sy * R * 0.14, x + sx * R * 0.14, y + sy * R * 0.14, x - fx * R * 0.4, y - fy * R * 0.4);
    }
  }
}
