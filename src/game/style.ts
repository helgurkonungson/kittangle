import Phaser from 'phaser';
import { art } from './art';
import { icon, IconName } from './icons';
import { sfx } from './sfx';
import { C, FONT, H, RES, W } from './ui';

/**
 * Visual kit of the 2026-11-23 style board: violet stage with bokeh and tropical leaves, pink ribbon
 * headers, round candy buttons, cream cards with a lavender lip, paw progress bar.
 */
export const S = {
  violetTop: 0x8b5cf6,
  violetBottom: 0x6d3fd4,
  magenta: 0xc04fe0,
  pink: 0xff4fa3,
  pinkLip: 0xc72a7a,
  pinkHi: 0xff93c9,
  lav: 0xe9dcff,
  lavDeep: 0xb79cf0,
  cream: 0xfff6ea,
  yellow: 0xffc928,
  yellowLip: 0xd9921a,
  purpleBtn: 0x7c4dff,
  purpleLip: 0x5530c4,
  leaf: 0x3fae55,
  leafDark: 0x2a8a45,
  leafLight: 0x7ad67a,
};

/** Deterministic pseudo random for decoration layouts. */
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function leaf(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, ang: number, wid = 0.36) {
  const pts: Phaser.Math.Vector2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = Math.sin(t * Math.PI) * len * wid * (1 - t * 0.25);
    pts.push(new Phaser.Math.Vector2(t * len, -r));
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const r = Math.sin(t * Math.PI) * len * wid * (1 - t * 0.25);
    pts.push(new Phaser.Math.Vector2(t * len, r));
  }
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const tr = pts.map((p) => ({ x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c }));
  g.fillStyle(C.inkN, 0.9).fillPoints(tr.map((p) => ({ x: p.x + 2, y: p.y + 4 })), true);
  g.fillStyle(S.leaf, 1).fillPoints(tr, true);
  // lighter upper half, midrib
  const half = tr.slice(0, steps + 1).concat([{ x, y }]);
  g.fillStyle(S.leafLight, 0.55).fillPoints(half, true);
  g.lineStyle(Math.max(2, len * 0.03), S.leafDark, 1).lineBetween(x, y, x + c * len * 0.92, y + s * len * 0.92);
}

/** A swaying bunch of leaves anchored at a screen corner. */
export function leaves(sc: Phaser.Scene, x: number, y: number, size: number, baseAng: number, seed = 1) {
  const r = rnd(seed * 97 + 13);
  const c = sc.add.container(x, y);
  const g = sc.add.graphics();
  for (let i = 0; i < 6; i++) leaf(g, 0, 0, size * (0.6 + r() * 0.5), baseAng + (r() - 0.5) * 1.6, 0.3 + r() * 0.12);
  c.add(g);
  sc.tweens.add({ targets: c, angle: { from: -2.5, to: 2.5 }, duration: 2600 + r() * 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  return c;
}

/** Violet stage: gradient, slow floating bokeh, leaves in the corners. */
export function stage(sc: Phaser.Scene, o: { leaves?: boolean; bokeh?: number; tint?: number } = {}) {
  const g = sc.add.graphics();
  g.fillGradientStyle(S.violetTop, S.magenta, S.violetBottom, S.violetTop, 1);
  g.fillRect(0, 0, W, H);
  const r = rnd(7);
  const n = o.bokeh ?? 16;
  for (let i = 0; i < n; i++) {
    const b = sc.add.circle(r() * W, r() * H, 18 + r() * 70, i % 3 ? 0xffffff : 0xffb3e0, 0.06 + r() * 0.1);
    sc.tweens.add({ targets: b, y: b.y - 30 - r() * 50, x: b.x + (r() - 0.5) * 40, alpha: b.alpha * 0.5, duration: 4000 + r() * 4000, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }
  if (o.leaves !== false) {
    const k = Math.min(W, H) / 720;
    leaves(sc, -10, H + 10, 230 * k, -1.1, 1);
    leaves(sc, W + 10, H + 10, 210 * k, -2.0, 2);
    leaves(sc, W + 10, -10, 170 * k, 2.3, 3);
  }
  return g;
}

/** Pink ribbon header with an optional icon medallion on the left. */
export function ribbon(sc: Phaser.Scene, x: number, y: number, w: number, text: string, ic?: IconName, size = 34) {
  const c = sc.add.container(x, y);
  const h = Math.round(size * 2.1);
  const g = sc.add.graphics();
  g.fillStyle(C.inkN, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 14, h / 2 + 4);
  g.fillStyle(S.pinkLip, 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h / 2);
  g.fillStyle(S.pink, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.fillStyle(S.pinkHi, 0.8).fillRoundedRect(-w / 2 + h * 0.3, -h / 2 + 6, w - h * 0.6, h * 0.28, h * 0.14);
  c.add(g);
  let tx = 0;
  if (ic) {
    const m = sc.add.graphics();
    m.fillStyle(C.inkN, 1).fillCircle(-w / 2 + h * 0.55, 2, h * 0.52);
    m.fillStyle(0xffffff, 1).fillCircle(-w / 2 + h * 0.55, 0, h * 0.46);
    c.add([m, icon(sc, ic, -w / 2 + h * 0.55, 0, h * 0.66)]);
    tx = h * 0.45;
  }
  const t = title(sc, tx, -2, text, size);
  const maxW = w - (ic ? h * 1.3 : h * 0.6);
  if (t.width > maxW) t.setScale(maxW / t.width);
  c.add(t);
  return c;
}

/** White display text with a thick plum outline and a drop shadow. */
export function title(sc: Phaser.Scene, x: number, y: number, text: string, size: number, color = '#ffffff') {
  return sc.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center', resolution: RES })
    .setOrigin(0.5).setStroke('#39243f', Math.max(5, size * 0.2)).setShadow(0, Math.max(3, size * 0.1), '#39243f', 0, true, true);
}

/** Round candy button with an icon (or a short label). */
export function roundBtn(
  sc: Phaser.Scene, x: number, y: number, d: number, color: number, lip: number, ic: IconName | string, onClick: () => void,
) {
  const c = sc.add.container(x, y);
  const g = sc.add.graphics();
  const r = d / 2;
  g.fillStyle(C.inkN, 1).fillCircle(0, 4, r + 4);
  g.fillStyle(lip, 1).fillCircle(0, 6, r);
  g.fillStyle(color, 1).fillCircle(0, 0, r);
  g.fillStyle(0xffffff, 0.3).fillEllipse(-r * 0.25, -r * 0.45, r * 1.1, r * 0.5);
  c.add(g);
  const isIcon = ['settings', 'map', 'hint', 'cafe', 'collection', 'daily', 'gift', 'play', 'music', 'sound', 'back', 'next', 'star', 'fish', 'paw', 'chest', 'lock', 'feedback'].includes(ic);
  c.add(isIcon ? icon(sc, ic as IconName, 0, 0, d * 0.62) : ic === '↻' ? restartIcon(sc, d * 0.62) : title(sc, 0, 0, ic, d * 0.42));
  c.setSize(d, d).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    sfx.click();
    sc.tweens.add({ targets: c, scale: 0.9, duration: 70, yoyo: true });
    onClick();
  });
  c.on('pointerover', () => c.setScale(1.06));
  c.on('pointerout', () => c.setScale(1));
  return c;
}

/** Thick white "restart" arrow, as big as the generated icons on the neighbouring buttons. */
function restartIcon(sc: Phaser.Scene, size: number) {
  const g = sc.add.graphics();
  const R = size * 0.32;
  const a0 = Phaser.Math.DegToRad(-35);
  const a1 = Phaser.Math.DegToRad(245);
  const tip = (r: number, w: number) => {
    const px = Math.cos(a1) * R;
    const py = Math.sin(a1) * R;
    const tx = -Math.sin(a1);
    const ty = Math.cos(a1);
    const nx = Math.cos(a1);
    const ny = Math.sin(a1);
    return [px + tx * r, py + ty * r, px + nx * w - tx * r * 0.15, py + ny * w - ty * r * 0.15, px - nx * w - tx * r * 0.15, py - ny * w - ty * r * 0.15];
  };
  for (const [w, col, k] of [[size * 0.24, C.inkN, 1.35], [size * 0.14, 0xffffff, 1]] as const) {
    g.lineStyle(w, col, 1).beginPath().arc(0, 0, R, a0, a1, false).strokePath();
    g.fillStyle(col, 1).fillCircle(Math.cos(a0) * R, Math.sin(a0) * R, w / 2);
    const t = tip(size * 0.2 * k, size * 0.19 * k);
    g.fillTriangle(t[0], t[1], t[2], t[3], t[4], t[5]);
  }
  return g;
}

/** Cream card with a lavender lip and plum outline. */
export function card(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 28, face = S.cream, lip = S.lavDeep) {
  g.fillStyle(C.inkN, 1).fillRoundedRect(x - 4, y - 4, w + 8, h + 14, r + 4);
  g.fillStyle(lip, 1).fillRoundedRect(x, y + 6, w, h, r);
  g.fillStyle(face, 1).fillRoundedRect(x, y, w, h, r);
  return g;
}

/** Yellow progress bar with a paw coin on the left: "8 / 20". */
export function pawBar(sc: Phaser.Scene, x: number, y: number, w: number, value: number, max: number) {
  const c = sc.add.container(x, y);
  const g = sc.add.graphics();
  const h = 34;
  g.fillStyle(C.inkN, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h / 2 + 3);
  g.fillStyle(0x5a3a8c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const fw = Math.max(h, (w * Math.min(value, max)) / Math.max(1, max));
  if (value > 0) {
    g.fillStyle(S.yellowLip, 1).fillRoundedRect(-w / 2, -h / 2, fw, h, h / 2);
    g.fillStyle(S.yellow, 1).fillRoundedRect(-w / 2, -h / 2, fw, h - 6, h / 2 - 3);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(-w / 2 + 10, -h / 2 + 4, Math.max(0, fw - 20), 7, 3);
  }
  c.add(g);
  const coin = sc.add.graphics();
  coin.fillStyle(C.inkN, 1).fillCircle(-w / 2, 0, 27);
  coin.fillStyle(S.yellow, 1).fillCircle(-w / 2, -1, 23);
  c.add([coin, icon(sc, 'paw', -w / 2, -1, 34), title(sc, 14, 0, `${value} / ${max}`, 22)]);
  return c;
}

/** Pink candy pill button with an icon and a label (main actions). */
export function candy(sc: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, ic: IconName | '' = 'play', color = S.pink, lip = S.pinkLip) {
  const c = sc.add.container(x, y);
  const g = sc.add.graphics();
  g.fillStyle(C.inkN, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 14, h / 2 + 4);
  g.fillStyle(lip, 1).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, h / 2);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.fillStyle(0xffffff, 0.3).fillRoundedRect(-w / 2 + h * 0.35, -h / 2 + 7, w - h * 0.7, h * 0.24, h * 0.12);
  c.add(g);
  const t = title(sc, ic ? -h * 0.2 : 0, -2, label, h * 0.4);
  const maxW = w - h * (ic ? 1.3 : 0.6);
  if (t.width > maxW) t.setScale(maxW / t.width);
  c.add(t);
  if (ic) {
    const tri = sc.add.graphics();
    const ax = t.x + (t.width * t.scaleX) / 2 + h * 0.32;
    tri.fillStyle(C.inkN, 1).fillTriangle(ax - h * 0.13, -h * 0.22, ax - h * 0.13, h * 0.22, ax + h * 0.22, 0);
    tri.fillStyle(0xffffff, 1).fillTriangle(ax - h * 0.09, -h * 0.15, ax - h * 0.09, h * 0.15, ax + h * 0.15, 0);
    c.add(tri);
  }
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    sfx.click();
    sc.tweens.add({ targets: c, scale: 0.95, duration: 70, yoyo: true });
    onClick();
  });
  return c;
}

/** Small counter pill (fish / stars / 6/12) on a dark violet chip. */
export function chip(sc: Phaser.Scene, x: number, y: number, w: number, ic: IconName | '', get: () => string) {
  const c = sc.add.container(x, y);
  const g = sc.add.graphics();
  g.fillStyle(C.inkN, 1).fillRoundedRect(-w / 2 - 3, -27, w + 6, 54, 27);
  g.fillStyle(0x4b2a86, 1).fillRoundedRect(-w / 2, -24, w, 48, 24);
  c.add(g);
  const t = title(sc, ic ? 18 : 0, 0, get(), 26);
  c.add(t);
  if (ic) c.add(icon(sc, ic, -w / 2 + 6, 0, 58));
  return { c, refresh: () => t.setText(get()) };
}

/** Background picture blurred and tinted violet (map backdrop). */
export function blurredBackdrop(sc: Phaser.Scene, key: string) {
  const im = art(sc, key, W / 2, H / 2, W, H, true);
  if (im && sc.game.renderer.type === Phaser.WEBGL) im.preFX?.addBlur(0, 2, 2, 1);
  sc.add.rectangle(W / 2, H / 2, W, H, 0x6d3fd4, im ? 0.35 : 1);
  return im;
}
