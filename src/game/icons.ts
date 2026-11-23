import Phaser from 'phaser';

/**
 * Vector icon set drawn once into textures (`i_<name>`), same rules as the art bible:
 * cocoa outline, flat base + one shade tone, light from the top-left.
 * When generated art `icon_<name>` exists it wins (see iconKey).
 */
export const INK = 0x39243f;
const S = 96; // texture size
const OL = 6; // outline width

export type IconName =
  | 'fish' | 'next' | 'star' | 'heart' | 'heart_empty' | 'paw' | 'back' | 'sound' | 'mute' | 'hint' | 'feed'
  | 'daily' | 'cafe' | 'collection' | 'gift' | 'play' | 'clock' | 'check' | 'lock' | 'flame'
  // art-only icons (GDD 2.0 sheets A10–A12); fall back to a drawn icon when the art is missing
  | 'map' | 'music' | 'settings' | 'chest' | 'medal' | 'sleep' | 'family' | 'box' | 'flag' | 'feedback' | 'badge' | 'scratchy';

/** Generated-art key used when the file exists (Art/PROMPTS.md 1.5 / 1.12). */
const ART: Partial<Record<IconName, string>> = {
  fish: 'icon_fish', star: 'icon_star', heart: 'icon_heart_full', heart_empty: 'icon_heart_empty',
  paw: 'icon_paw_token', hint: 'icon_hint', feed: 'icon_feed', gift: 'icon_gift',
  sound: 'icon_sound_on', mute: 'icon_sound_off', daily: 'icon_daily', cafe: 'icon_cafe',
  collection: 'icon_collection', lock: 'icon_lock', flame: 'icon_streak',
  map: 'icon_map', music: 'icon_music', settings: 'icon_settings', chest: 'icon_chest', medal: 'icon_paw_medal',
  sleep: 'sleep_zzz', family: 'family_link', box: 'box_0', flag: 'icon_flag', feedback: 'icon_feedback', badge: 'icon_chapter_badge', scratchy: 'scratchy_idle',
};
/** drawn stand-ins for art-only icons */
const FALLBACK: Partial<Record<IconName, IconName>> = {
  map: 'play', music: 'sound', settings: 'sound', chest: 'gift', medal: 'paw', sleep: 'clock', family: 'heart', box: 'lock',
  flag: 'star', feedback: 'heart', badge: 'star', scratchy: 'paw',
};

export function iconKey(s: Phaser.Scene, n: IconName): string {
  const a = ART[n];
  if (a && s.textures.exists(a)) return a;
  if (s.textures.exists(`i_${n}`)) return `i_${n}`;
  const f = FALLBACK[n];
  return f ? iconKey(s, f) : `i_${n}`;
}

/** Icon fitted into a size×size box (art is trimmed, so it is not always square). */
export function icon(s: Phaser.Scene, n: IconName, x: number, y: number, size: number) {
  const im = s.add.image(x, y, iconKey(s, n));
  return im.setScale(size / Math.max(im.width, im.height));
}

type G = Phaser.GameObjects.Graphics;
const c = S / 2;

/** Draws circles as an outlined blob: outline pass first, then fills. */
function blob(g: G, circles: [number, number, number][], fill: number, shade?: number) {
  g.fillStyle(INK, 1);
  for (const [x, y, r] of circles) g.fillCircle(x, y, r + OL);
  if (shade !== undefined) {
    g.fillStyle(shade, 1);
    for (const [x, y, r] of circles) g.fillCircle(x, y, r);
    g.fillStyle(fill, 1);
    for (const [x, y, r] of circles) g.fillCircle(x - r * 0.12, y - r * 0.12, r * 0.86);
  } else {
    g.fillStyle(fill, 1);
    for (const [x, y, r] of circles) g.fillCircle(x, y, r);
  }
}

function poly(g: G, pts: { x: number; y: number }[], fill: number) {
  g.fillStyle(fill, 1).fillPoints(pts, true);
  g.lineStyle(OL, INK, 1).strokePoints(pts, true, true);
  g.fillStyle(INK, 1);
  for (const p of pts) g.fillCircle(p.x, p.y, OL / 2);
}

function line(g: G, pts: [number, number][], w: number, color = INK) {
  g.lineStyle(w, color, 1);
  for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  g.fillStyle(color, 1);
  for (const [x, y] of pts) g.fillCircle(x, y, w / 2);
}

function shine(g: G, x: number, y: number, r: number) {
  g.fillStyle(0xfff6e5, 0.85).fillCircle(x, y, r);
}

const star = (cx: number, cy: number, R: number, r: number) =>
  Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r : R;
    return { x: cx + Math.cos(a) * k, y: cy + Math.sin(a) * k };
  });

const DRAW: Partial<Record<IconName, (g: G) => void>> = {
  fish: (g) => {
    poly(g, [{ x: 58, y: 48 }, { x: 88, y: 26 }, { x: 88, y: 70 }], 0x5ec4b8);
    g.fillStyle(INK, 1).fillEllipse(40, 48, 64 + OL * 2, 46 + OL * 2);
    g.fillStyle(0x3f958d, 1).fillEllipse(40, 48, 64, 46);
    g.fillStyle(0x5ec4b8, 1).fillEllipse(38, 45, 58, 38);
    g.fillStyle(INK, 1).fillCircle(22, 44, 5);
    shine(g, 40, 34, 5);
  },
  star: (g) => {
    poly(g, star(c, c + 3, 40, 19), 0xe2a12a);
    g.fillStyle(0xffc94a, 1).fillPoints(star(c - 2, c + 1, 33, 15), true);
    shine(g, 38, 32, 5);
  },
  heart: (g) => heart(g, 0xf0606e, 0xc94455),
  heart_empty: (g) => heart(g, 0xeadbc6, 0xd9c4a8),
  paw: (g) => {
    blob(g, [[c, 60, 20]], 0xb79be3, 0x8e6fc6);
    blob(g, [[24, 38, 9], [40, 24, 9], [56, 24, 9], [72, 38, 9]], 0xb79be3);
  },
  back: (g) => line(g, [[58, 22], [34, 48], [58, 74]], 14),
  next: (g) => line(g, [[38, 22], [62, 48], [38, 74]], 14),
  play: (g) => poly(g, [{ x: 30, y: 18 }, { x: 78, y: 48 }, { x: 30, y: 78 }], 0xfff9f0),
  sound: (g) => {
    poly(g, [{ x: 14, y: 36 }, { x: 30, y: 36 }, { x: 50, y: 18 }, { x: 50, y: 78 }, { x: 30, y: 60 }, { x: 14, y: 60 }], 0xfff9f0);
    g.lineStyle(8, INK, 1).beginPath().arc(54, 48, 16, -0.9, 0.9).strokePath();
    g.beginPath().arc(54, 48, 32, -0.9, 0.9).strokePath();
  },
  mute: (g) => {
    poly(g, [{ x: 14, y: 36 }, { x: 30, y: 36 }, { x: 50, y: 18 }, { x: 50, y: 78 }, { x: 30, y: 60 }, { x: 14, y: 60 }], 0xeadbc6);
    line(g, [[62, 36], [84, 60]], 8);
    line(g, [[84, 36], [62, 60]], 8);
  },
  hint: (g) => {
    g.fillStyle(INK, 1).fillRoundedRect(34 - OL, 62 - OL, 28 + OL * 2, 22 + OL * 2, 8);
    g.fillStyle(0xb8a690, 1).fillRoundedRect(34, 62, 28, 22, 6);
    blob(g, [[c, 40, 26]], 0xffd75e, 0xf0b12e);
    shine(g, 38, 30, 6);
  },
  feed: (g) => {
    blob(g, [[34, 40, 9], [48, 34, 10], [62, 40, 9]], 0xc98a55);
    g.fillStyle(INK, 1).fillRoundedRect(12 - OL, 46 - OL, 72 + OL * 2, 32 + OL * 2, 14);
    g.fillStyle(0xd9566a, 1).fillRoundedRect(12, 46, 72, 32, 12);
    g.fillStyle(0xf0606e, 1).fillRoundedRect(12, 46, 72, 18, 10);
  },
  daily: (g) => {
    g.fillStyle(INK, 1).fillRoundedRect(14 - OL, 20 - OL, 68 + OL * 2, 62 + OL * 2, 14);
    g.fillStyle(0xfff9f0, 1).fillRoundedRect(14, 20, 68, 62, 12);
    g.fillStyle(0xf0606e, 1).fillRoundedRect(14, 20, 68, 20, { tl: 12, tr: 12, bl: 0, br: 0 });
    line(g, [[32, 12], [32, 26]], 8);
    line(g, [[64, 12], [64, 26]], 8);
    g.fillStyle(INK, 1).fillCircle(36, 58, 5).fillCircle(60, 58, 5);
  },
  cafe: (g) => {
    g.lineStyle(9, INK, 1).strokeCircle(72, 54, 12);
    g.fillStyle(INK, 1).fillRoundedRect(16 - OL, 36 - OL, 54 + OL * 2, 46 + OL * 2, 16);
    g.fillStyle(0xff9e5e, 1).fillRoundedRect(16, 36, 54, 46, 14);
    g.fillStyle(0xffb985, 1).fillRoundedRect(16, 36, 54, 16, 8);
    line(g, [[34, 26], [38, 16]], 6, 0xb8a690);
    line(g, [[50, 26], [54, 16]], 6, 0xb8a690);
  },
  collection: (g) => {
    poly(g, [{ x: 18, y: 44 }, { x: 22, y: 12 }, { x: 44, y: 30 }], 0xff9e5e);
    poly(g, [{ x: 78, y: 44 }, { x: 74, y: 12 }, { x: 52, y: 30 }], 0xff9e5e);
    blob(g, [[c, 54, 32]], 0xffa964, 0xe07f45);
    g.fillStyle(INK, 1).fillCircle(37, 52, 5).fillCircle(59, 52, 5);
    g.fillStyle(0xf08a9a, 1).fillCircle(48, 62, 4);
  },
  gift: (g) => {
    g.fillStyle(INK, 1).fillRoundedRect(14 - OL, 36 - OL, 68 + OL * 2, 46 + OL * 2, 10);
    g.fillStyle(0xf0606e, 1).fillRoundedRect(14, 36, 68, 46, 8);
    g.fillStyle(0xffc94a, 1).fillRect(42, 36, 12, 46);
    blob(g, [[36, 28, 10], [60, 28, 10]], 0xffc94a);
  },
  clock: (g) => {
    blob(g, [[c, c, 34]], 0xfff9f0);
    line(g, [[c, c], [c, 28]], 7);
    line(g, [[c, c], [64, 56]], 7);
  },
  check: (g) => line(g, [[20, 50], [40, 70], [76, 28]], 14, 0x4e9a49),
  lock: (g) => {
    g.lineStyle(10, INK, 1).beginPath().arc(c, 40, 18, Math.PI, 0).strokePath();
    g.fillStyle(INK, 1).fillRoundedRect(20 - OL, 40 - OL, 56 + OL * 2, 44 + OL * 2, 12);
    g.fillStyle(0xb8a690, 1).fillRoundedRect(20, 40, 56, 44, 10);
  },
  flame: (g) => {
    poly(g, [{ x: 48, y: 10 }, { x: 74, y: 48 }, { x: 70, y: 72 }, { x: 48, y: 86 }, { x: 26, y: 72 }, { x: 22, y: 48 }], 0xff8a4c);
    g.fillStyle(0xffc94a, 1).fillCircle(48, 66, 14);
  },
};

function heart(g: G, fill: number, shade: number) {
  const tri = (k: number) => [
    { x: 12 - k, y: 42 }, { x: 84 + k, y: 42 }, { x: 48, y: 84 + k * 1.4 },
  ];
  g.fillStyle(INK, 1).fillCircle(32, 36, 22 + OL).fillCircle(64, 36, 22 + OL).fillPoints(tri(OL), true);
  g.fillStyle(shade, 1).fillCircle(32, 36, 22).fillCircle(64, 36, 22).fillPoints(tri(0), true);
  g.fillStyle(fill, 1).fillCircle(30, 34, 19).fillCircle(61, 34, 19).fillPoints(
    [{ x: 13, y: 40 }, { x: 80, y: 40 }, { x: 46, y: 76 }], true);
  shine(g, 26, 28, 6);
}

/** Bakes every icon into a texture once per game. */
export function bakeIcons(s: Phaser.Scene) {
  for (const [n, draw] of Object.entries(DRAW) as [string, (g: G) => void][]) {
    const key = `i_${n}`;
    if (s.textures.exists(key)) continue;
    const g = s.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, S, S);
    g.destroy();
  }
}
