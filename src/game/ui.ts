import Phaser from 'phaser';
import { drawCat } from './drawCat';
import { has, SPEAKER_ART } from './art';
import { sfx } from './sfx';
import { icon, IconName } from './icons';

/** Design resolution: 720×1280 in portrait, 1280×720 on landscape screens (desktop, tablets). */
export let W = 720;
export let H = 1280;
export const isLand = () => W > H;
/** Render scale: the canvas has W·RES × H·RES pixels and every camera zooms by RES (sharp on 4K screens). */
export let RES = 1;
export function setRes(r: number) {
  RES = r;
}
/** Picks the render scale for this screen: up to 3× (4K), in half steps. */
export function pickRes() {
  const longest = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
  return Math.min(3, Math.max(1, Math.ceil((longest / 1280) * 2) / 2));
}
/** Every scene calls this first: design coordinates (W×H) map onto the high-resolution canvas. */
export function fitCamera(sc: Phaser.Scene, column = false) {
  const cam = sc.cameras.main;
  cam.setZoom(RES * (column ? 720 / 1280 : 1));
  cam.centerOn(column ? 360 : W / 2, column ? 640 : H / 2);
}
/** real orientation of the canvas (W/H can be portrait inside a landscape canvas, see portraitColumn) */
export let screenLand = false;
export function setOrientation(land: boolean) {
  screenLand = land;
  W = land ? 1280 : 720;
  H = land ? 720 : 1280;
}

/**
 * Scenes drawn only for portrait (café, event): on a landscape canvas they keep the 720×1280 layout and
 * are shown as a centered column; the camera zooms out and the sides show the violet stage color.
 */
export function portraitColumn(sc: Phaser.Scene) {
  if (!screenLand) return fitCamera(sc);
  W = 720;
  H = 1280;
  fitCamera(sc, true);
  sc.cameras.main.setBackgroundColor(0x7a4ae0);
  // violet stage on the sides (world space left and right of the 720-wide column)
  const g = sc.add.graphics().setDepth(-1000);
  g.fillGradientStyle(0x8b5cf6, 0xc04fe0, 0x6d3fd4, 0x8b5cf6, 1).fillRect(-900, 0, 2520, 1280);
  for (let i = 0; i < 14; i++) {
    const x = i % 2 ? -100 - ((i * 137) % 700) : 820 + ((i * 211) % 700);
    g.fillStyle(0xffffff, 0.06 + (i % 4) * 0.03).fillCircle(x, (i * 389) % 1280, 40 + ((i * 53) % 90));
  }
  sc.events.once('shutdown', () => setOrientation(screenLand));
}
/** Landscape when the window is clearly wider than tall. */
export const wantsLand = () => window.innerWidth > window.innerHeight * 1.15;
export const FONT = '"Nunito", "Trebuchet MS", "Segoe UI", Arial, sans-serif';

/**
 * Palette "Neon Candy / Arcade Pop" (GDD 2.0 §12.1): saturated accents and rewards, calm light surfaces
 * around the board, deep plum ink for outlines and text. Cat coats keep their own colors.
 */
export const C = {
  bg: 0xfff8ef, // warm light surface
  ink: '#39243f', // deep plum ink, all text and outlines
  inkN: 0x39243f,
  muted: '#6e5577', // secondary text, ≥ 4.5:1 on the light surface
  primary: 0xff3d9a, // hot pink, primary CTA
  green: 0xff3d9a, // legacy "go" buttons share the primary CTA
  blue: 0x22d3e6, // bright cyan, boosters and sharing
  pink: 0xff8fc4,
  purple: 0x7957f5, // special mechanics, rarity
  gold: 0xffd600, // sun yellow, rewards and rewarded ads
  panel: 0xfff8ef,
  latte: 0xffe9f3,
  gray: 0xf1e6f4,
  coral: 0xff654d,
};

/** Face / lip (3D bottom edge) / text style per button kind. */
type Kind = 'primary' | 'gold' | 'teal' | 'secondary';
const KIND: Record<Kind, { face: number; lip: number; top: number; text: string; stroke: boolean }> = {
  primary: { face: 0xff3d9a, lip: 0xc21f72, top: 0xff7dbb, text: '#ffffff', stroke: true },
  gold: { face: 0xffd600, lip: 0xd9a400, top: 0xffe866, text: C.ink, stroke: false },
  teal: { face: 0x22d3e6, lip: 0x1497a6, top: 0x7be6f1, text: '#ffffff', stroke: true },
  secondary: { face: 0xfff8ef, lip: 0xe3cbe8, top: 0xffffff, text: C.ink, stroke: false },
};
const kindOf = (color?: number): Kind =>
  color === C.primary || color === C.green ? 'primary' : color === C.gold ? 'gold' : color === C.blue ? 'teal' : 'secondary';

export function txt(s: Phaser.Scene, x: number, y: number, str: string, size = 32, color = C.ink) {
  return s.add
    .text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center', fontStyle: '800', resolution: RES })
    .setOrigin(0.5);
}

/** Card / panel with a soft 3D lip. */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r = 30, face: number = C.panel, lip = 0xe3cbe8) {
  g.fillStyle(lip, 1).fillRoundedRect(x, y + 8, w, h, r);
  g.fillStyle(face, 1).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(5, C.inkN, 1).strokeRoundedRect(x, y, w, h + 8, r);
  return g;
}

export interface BtnOpts {
  color?: number;
  size?: number;
  disabled?: boolean;
  icon?: IconName;
  /** status mark at the left edge of the button (lock / check) */
  badge?: IconName;
  /** icon after the label (e.g. the star of a price) */
  iconRight?: IconName;
}

/** Rounded 3D button. onClick is always called; disabled only changes the look. */
export function button(
  s: Phaser.Scene, x: number, y: number, w: number, h: number, label: string,
  onClick: () => void, o: BtnOpts = {},
) {
  const k = KIND[o.disabled ? 'secondary' : kindOf(o.color)];
  const c = s.add.container(x, y);
  const face = s.add.container(0, 0);
  const g = s.add.graphics();
  const r = Math.min(30, h / 2);
  const lip = Math.max(6, Math.round(h * 0.08));
  g.fillStyle(C.inkN, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + lip + 6, r + 3);
  g.fillStyle(k.lip, 1).fillRoundedRect(-w / 2, -h / 2 + lip, w, h, r);
  const fg = s.add.graphics();
  fg.fillStyle(k.face, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  fg.fillStyle(k.top, 1).fillRoundedRect(-w / 2 + 10, -h / 2 + 6, w - 20, Math.min(16, h * 0.18), 8);
  const t = txt(s, 0, 0, label, o.size ?? 34, o.disabled ? C.muted : k.text);
  if (k.stroke && !o.disabled) t.setStroke(C.ink, 6);
  face.add([fg, t]);
  if (o.icon) {
    const is = Math.min(h * 0.62, (o.size ?? 34) * 1.6);
    const im = icon(s, o.icon, 0, 0, is);
    if (label) {
      const total = is + 12 + t.width;
      im.x = -total / 2 + is / 2;
      t.x = im.x + is / 2 + 12 + t.width / 2;
    }
    if (o.disabled) im.setAlpha(0.55);
    face.add(im);
  }
  if (o.badge) face.add(icon(s, o.badge, -w / 2 + h * 0.5, 0, h * 0.56));
  if (o.iconRight) {
    const is = Math.min(h * 0.55, (o.size ?? 34) * 1.3);
    const im = icon(s, o.iconRight, 0, 0, is);
    const total = t.width + 8 + is;
    t.x = -total / 2 + t.width / 2;
    im.x = t.x + t.width / 2 + 8 + is / 2;
    if (o.disabled) im.setAlpha(0.55);
    face.add(im);
  }
  c.add([g, face]);
  c.setSize(w, h + lip);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    if (!o.disabled) {
      sfx.click();
      s.tweens.add({ targets: face, y: lip - 2, duration: 60, yoyo: true });
    } else s.tweens.add({ targets: c, x: x + 6, duration: 40, yoyo: true, repeat: 1 });
    onClick();
  });
  return c;
}

/** Round icon-only button (back, sound, arrows). */
export function iconButton(s: Phaser.Scene, x: number, y: number, name: IconName, onClick: () => void, size = 84) {
  return button(s, x, y, size, size - 8, '', onClick, { icon: name });
}

export const backButton = (s: Phaser.Scene, onClick: () => void) => iconButton(s, 64, 64, 'back', onClick);

/** Red notification dot with "!" on the top-right corner of a container. */
export function badge(s: Phaser.Scene, parent: Phaser.GameObjects.Container, dx: number, dy: number) {
  const g = s.add.graphics();
  g.fillStyle(C.inkN, 1).fillCircle(dx, dy, 22);
  g.fillStyle(C.coral, 1).fillCircle(dx, dy, 18);
  parent.add([g, txt(s, dx, dy - 1, '!', 26, '#ffffff')]);
  s.tweens.add({ targets: g, scale: 1.12, duration: 500, yoyo: true, repeat: -1 });
}

/** Square menu tile: big icon on top, label below. */
export function tile(s: Phaser.Scene, x: number, y: number, w: number, h: number, name: IconName, label: string, onClick: () => void) {
  const b = button(s, x, y, w, h, '', onClick);
  const face = b.list[1] as Phaser.GameObjects.Container;
  face.add(icon(s, name, 0, -h * 0.13, h * 0.5));
  const t = txt(s, 0, h * 0.3, label, 26);
  if (t.width > w - 16) t.setScale((w - 16) / t.width);
  face.add(t);
  return b;
}

/** One toast at a time per scene: a new one replaces the previous instantly (no stacking). */
export function toast(s: Phaser.Scene, msg: string, y = 230) {
  const prev = s.data.get('toast') as Phaser.GameObjects.GameObject[] | undefined;
  if (prev) {
    s.tweens.killTweensOf(prev);
    prev.forEach((o) => o.destroy());
  }
  const t = txt(s, W / 2, y, msg, 30, '#fff9f0').setDepth(200);
  t.setWordWrapWidth(Math.min(W, 720) - 120, true);
  const bg = s.add.graphics().setDepth(199);
  s.data.set('toast', [t, bg]);
  s.tweens.add({ targets: t, scale: { from: 1.15, to: 1 }, duration: 120 });
  const b = t.getBounds();
  const r = Math.min(34, (b.height + 28) / 2);
  bg.fillStyle(C.inkN, 0.94).fillRoundedRect(b.x - 30, b.y - 14, b.width + 60, b.height + 28, r);
  s.tweens.add({
    targets: [t, bg], alpha: 0, y: '-=40', delay: 1300, duration: 400,
    onComplete: () => { t.destroy(); bg.destroy(); },
  });
}

export interface ModalBtn {
  label: string;
  onClick: () => void;
  color?: number;
  disabled?: boolean;
  icon?: IconName;
  badge?: IconName;
}

export const DIM = 0x2a1530; // plum scrim instead of black

function scrim(s: Phaser.Scene, alpha = 0.55) {
  const dim = s.add.rectangle(W / 2, H / 2, W, H, DIM, alpha).setInteractive();
  dim.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation());
  return dim;
}

/**
 * Full-screen modal; returns close(). Buttons do not close it automatically.
 * `closable` adds a ✕ in the corner and closes on a tap anywhere outside the window.
 */
export function modal(s: Phaser.Scene, title: string, lines: string[], buttons: ModalBtn[], closable = false) {
  const c = s.add.container(0, 0).setDepth(100);
  // the window keeps the portrait width, centered on landscape screens
  const MW = Math.min(W, 720);
  const L = (W - MW) / 2;
  const dim = scrim(s);
  const close = () => c.destroy();
  const box = { y: 0, h: 0 };
  if (closable)
    dim.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.worldY < box.y || p.worldY > box.y + box.h || p.worldX < L + 60 || p.worldX > L + MW - 60) close();
    });
  const ph0 = 190 + lines.length * 52 + buttons.length * 118;
  let top = H / 2 - ph0 / 2;
  const g = s.add.graphics();
  const tt = txt(s, W / 2, 0, title, 46);
  const maxTitle = closable ? MW - 260 : MW - 180;
  if (tt.width > maxTitle) tt.setScale(maxTitle / tt.width);
  c.add([dim, g, tt]);
  // lines may wrap: stack them by their real height
  const texts = lines.map((l) => txt(s, W / 2, 0, l, 32).setWordWrapWidth(MW - 180, true).setOrigin(0.5, 0));
  const extra = texts.reduce((n, tx) => n + Math.max(0, tx.height - 44), 0);
  top -= extra / 2;
  let ly = top + 128;
  texts.forEach((tx) => { tx.y = ly; ly += Math.max(52, tx.height + 8); });
  c.add(texts);
  const by = top + 160 + lines.length * 52 + extra + 46;
  const ph = ph0 + extra;
  panel(g, L + 60, top, MW - 120, ph, 40);
  g.fillStyle(C.latte, 1).fillRoundedRect(L + 63, top + 3, MW - 126, 104, { tl: 37, tr: 37, bl: 0, br: 0 });
  g.lineStyle(3, 0xe3cbe8, 1).lineBetween(L + 64, top + 107, L + MW - 64, top + 107);
  tt.y = top + 56;
  box.y = top;
  box.h = ph;
  if (closable) {
    const x = s.add.container(L + MW - 84, top + 56);
    const xg = s.add.graphics();
    xg.fillStyle(C.coral, 1).fillCircle(0, 0, 30).lineStyle(4, C.inkN, 1).strokeCircle(0, 0, 30);
    const xt = txt(s, 0, -2, '✕', 30, '#ffffff');
    x.add([xg, xt]).setSize(76, 76).setInteractive({ useHandCursor: true });
    x.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); close(); });
    c.add(x);
  }
  buttons.forEach((b, i) =>
    c.add(button(s, W / 2, by + i * 118, 460, i === 0 ? 96 : 84, b.label, b.onClick, {
      color: b.color, disabled: b.disabled, size: i === 0 ? 36 : 32, icon: b.icon, badge: b.badge,
    })),
  );
  c.setAlpha(0).setY(30);
  s.tweens.add({ targets: c, y: 0, alpha: 1, duration: 180, ease: 'Back.Out' });
  return close;
}

/** Currency capsule: icon overlapping the left end, value right-aligned. Right edge at x. */
export function pill(s: Phaser.Scene, x: number, y: number, name: IconName, get: () => number, w = 156) {
  const g = s.add.graphics();
  const l = x - w;
  g.fillStyle(C.inkN, 1).fillRoundedRect(l - 3, y - 27, w + 6, 54, 27);
  g.fillStyle(C.panel, 1).fillRoundedRect(l, y - 24, w, 48, 24);
  icon(s, name, l + 6, y, 62);
  const t = txt(s, x - 22, y + 1, '', 32).setOrigin(1, 0.5);
  const refresh = () => t.setText(String(get()));
  refresh();
  return { text: t, refresh };
}

export const fishLabel = (s: Phaser.Scene, x: number, y: number, get: () => number) => pill(s, x, y, 'fish', get);

const SPEAKER_BREED: Record<string, number> = { murr: 1, bun: 0, luna: 2 };

export interface DialogLine {
  who: string;
  name: string;
  text: string;
}

/** Story dialog at the bottom of the screen; tap anywhere to advance. */
/** Story dialog; `backdrop` = generated chapter illustration shown above the text box when present. */
export function dialog(s: Phaser.Scene, lines: DialogLine[], hint: string, onDone: () => void, backdrop?: string) {
  const c = s.add.container(0, 0).setDepth(150);
  const dim = s.add.rectangle(W / 2, H / 2, W, H, DIM, backdrop && has(s, backdrop) ? 0.7 : 0.4).setInteractive();
  const g = s.add.graphics();
  const top = H - 430;
  panel(g, 30, top, W - 60, 350, 36);
  const tag = s.add.graphics();
  const pg = s.add.graphics();
  const name = txt(s, 200, top, '', 32, '#ffffff').setOrigin(0, 0.5).setStroke(C.ink, 6);
  const body = s.add.text(64, top + 150, '', {
    fontFamily: FONT, fontStyle: '800', fontSize: '31px', color: C.ink, wordWrap: { width: W - 120, useAdvancedWrap: true }, lineSpacing: 6,
  });
  const tip = txt(s, W / 2, H - 112, hint, 22, C.muted);
  const face = s.add.image(105, top + 30, '__DEFAULT').setVisible(false);
  c.add([dim]);
  if (backdrop && has(s, backdrop)) {
    // framed illustration card above the text box
    const bw = W - 60, bh = Math.round(bw * 0.75), by = 70;
    const fr = s.add.graphics();
    fr.fillStyle(C.inkN, 0.25).fillRoundedRect(30 + 6, by + 10, bw, bh, 28);
    fr.fillStyle(C.inkN, 1).fillRoundedRect(30 - 5, by - 5, bw + 10, bh + 10, 32);
    const im = s.add.image(W / 2, by + bh / 2, backdrop).setDisplaySize(bw, bh);
    const mk = s.make.graphics({}, false).fillStyle(0xffffff).fillRoundedRect(30, by, bw, bh, 28);
    im.setMask(mk.createGeometryMask());
    c.add([fr, im]);
  }
  c.add([g, tag, pg, face, name, body, tip]);
  let i = 0;
  const show = () => {
    const l = lines[i];
    name.setText(l.name);
    tag.clear().fillStyle(C.inkN, 1).fillRoundedRect(178, top - 29, name.width + 50, 58, 29);
    tag.fillStyle(C.primary, 1).fillRoundedRect(181, top - 26, name.width + 44, 52, 26);
    body.setText(l.text);
    const key = SPEAKER_ART[l.who];
    if (key && has(s, key)) {
      pg.clear();
      face.setTexture(key).setDisplaySize(170, 170).setVisible(true);
      return;
    }
    face.setVisible(false);
    drawCat(pg, [{ x: 105, y: top + 45 }, { x: 105, y: top + 62 }], SPEAKER_BREED[l.who] ?? 0, 90, 'happy');
    if (l.who === 'murr') {
      pg.lineStyle(4, 0x8a6a2a, 1).strokeCircle(92, top + 40, 10).strokeCircle(118, top + 40, 10).lineBetween(102, top + 40, 108, top + 40);
    }
  };
  show();
  dim.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    sfx.click();
    i++;
    if (i >= lines.length) {
      c.destroy();
      onDone();
    } else show();
  });
}
