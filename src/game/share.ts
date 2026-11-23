import Phaser from 'phaser';
import { Challenge, challengeParams, fmtTime, parseChallenge, Tap, tapPattern } from '../core/share';
import { t } from '../i18n';
import { iconKey } from './icons';
import { platform } from './state';
import { C, FONT, RES, toast } from './ui';

/** Friend challenge from the link the game was opened with (null when none). */
let cached: Challenge | null | undefined;
export const challenge = () => (cached === undefined ? (cached = parseChallenge(platform.launchParams())) : cached);
let offered = false;
export const challengeOffered = () => offered;
export const markChallengeOffered = () => { offered = true; };

/** Snapshot of a screen area as an image (used for the untouched daily board). */
export function snapshot(s: Phaser.Scene, x: number, y: number, w: number, h: number): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    try {
      s.game.renderer.snapshotArea(Math.max(0, x) * RES, Math.max(0, y) * RES, w * RES, h * RES, (img) => res(img instanceof HTMLImageElement ? img : null));
    } catch {
      res(null);
    }
  });
}

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke?: string, maxW = 2000) {
  g.font = `900 ${size}px ${FONT}`;
  const k = Math.min(1, maxW / g.measureText(text).width);
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = size * 0.22;
    g.strokeText(text, 0, 0);
  }
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

/** Apricot 3D pill like the in-game primary button. */
function pillButton(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, text: string) {
  const ink = C.ink;
  rr(g, cx - w / 2 - 5, cy - h / 2 - 5, w + 10, h + 22, h / 2 + 5);
  g.fillStyle = ink; g.fill();
  rr(g, cx - w / 2, cy - h / 2 + 12, w, h, h / 2);
  g.fillStyle = '#d9713a'; g.fill();
  rr(g, cx - w / 2, cy - h / 2, w, h, h / 2);
  g.fillStyle = hex(C.primary); g.fill();
  rr(g, cx - w / 2 + 24, cy - h / 2 + 10, w - 48, h * 0.18, 10);
  g.fillStyle = '#ffb985'; g.fill();
  label(g, text, cx, cy + 2, h * 0.42, '#ffffff', ink, w - 60);
}

function framed(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, bx: number, by: number, bw: number, bh: number) {
  const k = Math.min(bw / img.width, bh / img.height);
  const w = img.width * k;
  const h = img.height * k;
  const x = bx + (bw - w) / 2;
  const y = by + (bh - h) / 2;
  rr(g, x - 8, y - 8, w + 16, h + 30, 34);
  g.fillStyle = C.ink; g.fill();
  rr(g, x, y + 10, w, h + 12, 28);
  g.fillStyle = '#e2c7a4'; g.fill();
  g.save();
  rr(g, x, y, w, h, 28);
  g.clip();
  g.drawImage(img, x, y, w, h);
  g.restore();
  return { x, y, w, h };
}

/** Round tilted sticker with the result, stuck on the board corner. */
function sticker(g: CanvasRenderingContext2D, x: number, y: number, r: number, text: string) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.14);
  g.beginPath(); g.arc(0, 6, r + 6, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = hex(C.gold); g.fill();
  g.beginPath(); g.arc(-r * 0.2, -r * 0.2, r * 0.75, 0, Math.PI * 2); g.fillStyle = '#ffdb80'; g.fill();
  label(g, text, 0, 4, r * 0.62, C.ink, '#fff9f0', r * 1.6);
  g.restore();
}

export interface CardOpts {
  w: number;
  h: number;
  board: HTMLImageElement | null;
  title: string;
  subtitle: string;
  stickerText?: string;
  hearts?: number;
  extra?: string;
  cta: string;
}

/**
 * Share / preview card drawn from live game pieces (board snapshot, palette, icon textures),
 * so it follows the art automatically when the art style changes.
 */
export function drawCard(s: Phaser.Scene, o: CardOpts): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = o.w;
  cv.height = o.h;
  const g = cv.getContext('2d')!;
  g.fillStyle = hex(C.bg);
  g.fillRect(0, 0, o.w, o.h);
  // soft paw dots in the background
  g.fillStyle = '#f1e0c8';
  for (let i = 0; i < 40; i++) {
    const x = ((i * 397) % o.w) + 20;
    const y = ((i * 263) % o.h) + 20;
    g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
  }
  const heart = (full: boolean) => s.textures.get(iconKey(s, full ? 'heart' : 'heart_empty')).getSourceImage() as CanvasImageSource;
  const landscape = o.w > o.h * 1.3;
  if (landscape) {
    const bw = o.w * 0.48;
    const fr = o.board ? framed(g, o.board, 40, 40, bw, o.h - 90) : { x: 40, y: 40, w: bw, h: o.h - 90 };
    if (o.stickerText) sticker(g, fr.x + fr.w - 20, fr.y + 40, 70, o.stickerText);
    const cx = bw + 40 + (o.w - bw - 40) / 2;
    const cw = o.w - bw - 100;
    label(g, o.title, cx, o.h * 0.27, 100, C.ink, '#fff9f0', cw);
    label(g, o.subtitle, cx, o.h * 0.45, 40, C.muted, undefined, cw);
    if (o.extra) label(g, o.extra, cx, o.h * 0.58, 36, C.ink, undefined, cw);
    pillButton(g, cx, o.h * 0.76, Math.min(cw, 460), 100, o.cta);
    return cv;
  }
  const u = o.w / 1080;
  label(g, o.title, o.w / 2, 110 * u, 104 * u, C.ink, '#fff9f0', o.w - 100 * u);
  label(g, o.subtitle, o.w / 2, 196 * u, 44 * u, C.muted, undefined, o.w - 100 * u);
  const top = 250 * u;
  const bh = o.h - top - 330 * u;
  // the result sticker sits beside the board, not on it: a wide board is narrowed to make room
  const r = 105 * u;
  const bx = 70 * u;
  let bw = o.w - 140 * u;
  if (o.board) {
    const nat = o.board.width * Math.min(bw / o.board.width, bh / o.board.height);
    const side = (o.w - nat) / 2;
    if (o.stickerText && side < 2 * r + 30 * u) bw = Math.max(o.w - 140 * u - (2 * r + 30 * u - side) * 2, o.w * 0.5);
  }
  const fr = o.board ? framed(g, o.board, bx, top, bw, bh) : { x: bx, y: top, w: bw, h: bh };
  if (o.stickerText) sticker(g, Math.min(fr.x + fr.w + r - 10 * u, o.w - r - 20 * u), fr.y + r + 10 * u, r, o.stickerText);
  const ry = o.h - 230 * u;
  if (o.hearts !== undefined) {
    const hs = 84 * u;
    for (let i = 0; i < 3; i++) g.drawImage(heart(i < o.hearts), o.w / 2 - hs * 1.6 + i * hs * 1.1 - (o.extra ? 120 * u : 0), ry - hs / 2, hs, hs);
  }
  if (o.extra) label(g, o.extra, o.w / 2 + (o.hearts !== undefined ? 190 * u : 0), ry + 4 * u, 44 * u, C.ink);
  pillButton(g, o.w / 2, o.h - 100 * u, 760 * u, 120 * u, o.cta);
  return cv;
}

const toBlob = (cv: HTMLCanvasElement) => new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'));

export interface DailyShare {
  date: string;
  num: number;
  time: number;
  hearts: number;
  taps: Tap[];
  streak: number;
  board: HTMLImageElement | null;
}

/** Message text: brag, replay pattern, streak, call to action, challenge link. */
export function dailyText(d: DailyShare) {
  const hearts = '❤️'.repeat(d.hearts) + '🤍'.repeat(3 - d.hearts);
  return [
    `🐱 Kittangle · ${t('dailyTitle', { n: d.num })}`,
    `${t(d.hearts === 3 ? 'shareBrag3' : 'shareBrag', { t: fmtTime(d.time) })} ${hearts}`,
    tapPattern(d.taps),
    d.streak > 1 ? t('shareStreak', { n: d.streak }) : '',
    '',
    t('shareCta'),
    platform.shareUrl(challengeParams({ date: d.date, time: d.time, hearts: d.hearts })),
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}

/** Builds the card ahead of the tap (iOS needs share() right inside the gesture). */
export function prepareDailyShare(s: Phaser.Scene, d: DailyShare) {
  const text = dailyText(d);
  const card = drawCard(s, {
    w: 1080, h: 1080, board: d.board, title: 'Kittangle', subtitle: t('dailyTitle', { n: d.num }),
    stickerText: fmtTime(d.time), hearts: d.hearts, extra: d.streak > 1 ? `🔥 ${d.streak}` : undefined,
    cta: t('shareCardCta', { t: fmtTime(d.time) }),
  });
  let blob: Blob | null = null;
  void toBlob(card).then((b) => { blob = b; });
  return () => send(s, text, blob);
}

async function send(s: Phaser.Scene, text: string, blob: Blob | null) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = blob ? new File([blob], 'kittangle.png', { type: 'image/png' }) : null;
  try {
    if (file && nav.share && nav.canShare?.({ files: [file] })) return await nav.share({ files: [file], text });
    if (nav.share) return await nav.share({ text });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return; // user closed the sheet
  }
  // desktop: picture and text to the clipboard, ready to paste into a chat
  try {
    if (blob && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob, 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return toast(s, t('copiedImage'));
    }
  } catch { /* fall through to text */ }
  navigator.clipboard?.writeText(text).then(() => toast(s, t('copied')), () => toast(s, text));
}
