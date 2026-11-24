import Phaser from 'phaser';
import { Board, BOX, EMPTY, headDir } from '../core/board';
import {
  BREEDS, COMBO_BONUS_MAX, COMBO_WINDOW_MS, COST, DAILY_REWARD, DAILY_STREAK_BONUS, FISH_PER_CAT, levelReward, MOONY, SCRATCHY,
} from '../core/content';
import { chapterKey, chapterOf, dailyNumber, getDaily, getLevel, isMilestone, stepOf, CHAPTER_LEN } from '../core/levels';
import { prevDate } from '../core/save';
import { Cat, Cell, DX, DY, Level } from '../core/types';
import { addFriendship } from '../core/friend';
import { CHAPTERS, progress } from '../core/meta';
import { levelTips, pawsFor, TipKey } from '../core/tutorial';
import { t } from '../i18n';
import { drawCat, Mood } from './drawCat';
import { openSettings } from './settings';
import { bodyPath, drawBody, drawUnder, hasBodyArt, pathPoint } from './body';
import { art, has, headKey } from './art';
import { playMusic, sfx } from './sfx';
import { betweenLevels, rewarded, rewardedReady } from './ads';
import { addFish, grantPaws, persist, platform, save, unlockBreed } from './state';
import { PAWS } from '../core/live';
import { candy, card, chip, pawBar, roundBtn, S, stage, title } from './style';
import { button, C, H, toast, txt, W, DIM, isLand, fitCamera } from './ui';
import { icon } from './icons';
import { fmtTime, Tap } from '../core/share';
import { crawl } from '../core/scratchy';
import { hashStr, mulberry32 } from '../core/rng';
import { challenge, drawCard, prepareDailyShare, snapshot } from './share';

export type LevelData = { mode: 'level'; n: number } | { mode: 'daily'; date: string };

interface CatView {
  cat: Cat;
  g: Phaser.GameObjects.Graphics;
  awake: boolean;
  busy: boolean;
  mood: Mood;
  hint: boolean;
  zz?: Phaser.GameObjects.Text | Phaser.GameObjects.Image;
  head?: Phaser.GameObjects.Image;
  /** sprite body (art4), drawn along the path; v.g then only holds the shadow and hint glow */
  rope?: Phaser.GameObjects.Rope;
  acc?: Phaser.GameObjects.Image;
  /** shared mother–kitten heart */
  mark?: Phaser.GameObjects.Graphics;
  /** Moony before anyone bumped into him */
  hidden?: boolean;
}

/** family colors for mother–kitten pairs (never the only cue: kittens are also smaller) */
const FAMILY = [0xff3d9a, 0x22d3e6, 0xb8f52f, 0x7957f5];
/** Scratchy's reaction lasts ~0.8 s; taps during the cooldown only pulse the blocker */
const SCRATCHY_COOLDOWN = 1100;

/** Board mirrored along its diagonal (x ↔ y): directions swap with it, solvability is unchanged. */
function transpose(lv: Level): Level {
  const sw = (p: Cell) => ({ x: p.y, y: p.x });
  return { ...lv, w: lv.h, h: lv.w, cats: lv.cats.map((c) => ({ ...c, cells: c.cells.map(sw) })), boxes: lv.boxes.map(sw) };
}

/** everything that moves together when a cat bounces or shakes */
const parts = (v: CatView) => [v.g, v.rope, v.head, v.acc].filter(Boolean) as Phaser.GameObjects.GameObject[];

export class LevelScene extends Phaser.Scene {
  private d!: LevelData;
  private level!: Level;
  private board!: Board;
  private views = new Map<number, CatView>();
  /** blocked attempts (paws rating, GDD §5.3): no hearts, no fail state */
  private blocked = 0;
  private cs = 64;
  private ox = 0;
  private oy = 0;
  private combo = 0;
  private lastExit = -1e9;
  private earned = 0;
  private rescued: number[] = [];
  private startTime = 0;
  private ended = false;
  private taps: Tap[] = [];
  private boardShot: Promise<HTMLImageElement | null> = Promise.resolve(null);
  private pawIcons: Phaser.GameObjects.Image[] = [];
  private timerText?: Phaser.GameObjects.Text;
  private fishChip!: { c: Phaser.GameObjects.Container; refresh: () => void };
  private mascot?: Phaser.GameObjects.Image;
  private hintBtn!: Phaser.GameObjects.Container;
  private mask!: Phaser.Display.Masks.GeometryMask;
  private scratchyUntil = 0;
  private exits = 0;
  private cue?: Phaser.GameObjects.GameObject[];
  private tipBox?: Phaser.GameObjects.Container;
  private preview?: Phaser.GameObjects.Graphics;
  private previewId = -1;
  private freeHint = false;
  /** breeds in the order they left, for the win leap */
  private leapers: number[] = [];

  constructor() {
    super('Level');
  }

  init(d: LevelData) {
    this.d = d;
    this.views = new Map();
    this.blocked = 0;
    this.combo = 0;
    this.lastExit = -1e9;
    this.earned = 0;
    this.rescued = [];
    this.leapers = [];
    this.ended = false;
    this.timerText = undefined;
    this.taps = [];
    this.sendShare = undefined;
    this.boardShot = Promise.resolve(null);
    this.scratchyUntil = 0;
    this.exits = 0;
    this.cue = undefined;
    this.tipBox = undefined;
    this.preview = undefined;
    this.previewId = -1;
    this.freeHint = false;
    this.mascot = undefined;
  }

  create() {
    fitCamera(this);
    const d = this.d;
    const land = isLand();
    const lv = d.mode === 'level' ? getLevel(d.n) : getDaily(d.date);
    // tall boards lie on their side on a wide screen (a mirror image: same puzzle, same solution)
    this.level = land && lv.h > lv.w ? transpose(lv) : lv;
    this.board = new Board(this.level);
    const { w, h } = this.level;
    this.cameras.main.setBackgroundColor(C.bg);

    // board area: center column between the info panel and Scratchy in landscape, under the HUD in portrait
    const scratchy = this.level.cats.some((c) => c.breed === SCRATCHY);
    const A = land ? { x: 360, y: 40, w: W - 360 - (scratchy ? 250 : 110), h: H - 80 } : { x: 20, y: 236, w: W - 40, h: H - 236 - 226 };
    this.cs = Math.floor(Math.min(A.w / w, A.h / h, 110));
    this.ox = Math.round(A.x + (A.w - this.cs * w) / 2);
    this.oy = Math.round(A.y + (A.h - this.cs * h) / 2);
    this.drawField();
    // cats sliding off the board are clipped to the field so they never cover the HUD
    const mg = this.make.graphics({}, false);
    mg.fillStyle(0xffffff).fillRect(this.ox - 14, this.oy - 14, this.cs * w + 28, this.cs * h + 28);
    this.mask = mg.createGeometryMask();

    const pairs = [...new Set(this.level.cats.filter((c) => c.mother !== undefined).map((c) => c.mother!))];
    for (const cat of this.board.cats.values()) {
      const v: CatView = {
        cat, g: this.add.graphics().setMask(this.mask), awake: !cat.sleepy, busy: false,
        mood: cat.sleepy ? 'sleep' : 'calm', hint: false, hidden: cat.breed === MOONY,
      };
      const fam = cat.mother !== undefined ? pairs.indexOf(cat.mother) : pairs.indexOf(cat.id);
      if (fam >= 0) v.mark = this.heart(FAMILY[fam % FAMILY.length]).setMask(this.mask);
      if (cat.sleepy) {
        const hp = this.px(cat.cells[0]);
        v.zz = art(this, 'sleep_zzz', hp.x + this.cs * 0.4, hp.y - this.cs * 0.5, this.cs * 0.6, this.cs * 0.6)
          ?? txt(this, hp.x + this.cs * 0.35, hp.y - this.cs * 0.45, 'z z', Math.max(18, this.cs * 0.3), '#7957f5');
        this.tweens.add({ targets: v.zz, y: '-=8', alpha: 0.5, duration: 900, yoyo: true, repeat: -1 });
      }
      this.views.set(cat.id, v);
      this.redraw(v);
    }

    const zone = this.add.zone(this.ox - this.cs / 2, this.oy - this.cs / 2, this.cs * (w + 1), this.cs * (h + 1));
    zone.setOrigin(0).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.worldX, p.worldY));
    // mouse hover previews the exit path (GDD §14), never needed to play
    zone.on('pointermove', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.hover(p.worldX, p.worldY); });
    zone.on('pointerout', () => this.hover(-1, -1));

    this.drawHud();
    if (new URLSearchParams(location.search).has('debug')) this.exposeDebug();
    this.startTime = this.time.now;
    if (d.mode === 'level') this.time.delayedCall(2500, () => getLevel(d.n + 1));
    if (d.mode === 'level' && d.n === 1) this.time.delayedCall(300, () => this.handCue());
    else {
      const tips = levelTips({
        mode: d.mode, n: d.mode === 'level' ? d.n : 0, hard: !!this.level.hard,
        sleepy: this.level.cats.some((c) => c.sleepy), boxes: this.level.boxes.length > 0,
        scratchy: this.level.cats.some((c) => c.breed === SCRATCHY), moony: this.level.cats.some((c) => c.breed === MOONY), kittens: this.level.cats.some((c) => c.mother !== undefined),
      }, save.tipsSeen);
      if (tips.length) this.time.delayedCall(250, () => this.showTip(tips[0]));
    }
    playMusic(d.mode === 'daily' ? 'music_daily' : 'music_level');
    platform.gameplayStart();
    platform.track('level_start', { id: this.level.id });
  }

  update() {
    if (this.timerText && !this.ended) this.timerText.setText(fmtTime((this.time.now - this.startTime) / 1000));
    for (const v of this.views.values()) if (v.mark) {
      const p = v.head ?? { x: this.px(v.cat.cells[0]).x + v.g.x, y: this.px(v.cat.cells[0]).y + v.g.y };
      v.mark.setPosition(p.x + this.cs * 0.32, p.y - this.cs * 0.32);
    }
  }

  // ---------- drawing ----------

  private px(c: { x: number; y: number }) {
    return { x: this.ox + (c.x + 0.5) * this.cs, y: this.oy + (c.y + 0.5) * this.cs };
  }

  private heart(color: number) {
    const g = this.add.graphics().setDepth(5);
    const r = Math.max(7, this.cs * 0.12);
    g.fillStyle(C.inkN, 1).fillCircle(-r * 0.5, 0, r * 0.75).fillCircle(r * 0.5, 0, r * 0.75)
      .fillTriangle(-r * 1.3, r * 0.2, r * 1.3, r * 0.2, 0, r * 1.55);
    g.fillStyle(color, 1).fillCircle(-r * 0.5, 0, r * 0.55).fillCircle(r * 0.5, 0, r * 0.55)
      .fillTriangle(-r * 1.02, r * 0.18, r * 1.02, r * 0.18, 0, r * 1.25);
    return g;
  }

  private drawField() {
    const { w, h } = this.level;
    stage(this);
    const g = this.add.graphics();
    const pad = Math.max(14, this.cs * 0.28);
    card(g, this.ox - pad, this.oy - pad, this.cs * w + pad * 2, this.cs * h + pad * 2, 34, 0xf3e6ff, S.lavDeep);
    g.fillStyle(0xfff6ea, 1).fillRoundedRect(this.ox - 6, this.oy - 6, this.cs * w + 12, this.cs * h + 12, 18);
    const r = Math.max(4, this.cs * 0.12);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = this.px({ x, y });
      const sz = this.cs - 5;
      g.fillStyle((x + y) % 2 ? 0xf7ead8 : 0xfdf2e2, 1).fillRoundedRect(p.x - sz / 2, p.y - sz / 2, sz, sz, r);
    }
    for (const b of this.level.boxes) {
      const p = this.px(b);
      const s = this.cs * 0.9;
      if (art(this, `box_${(b.x * 7 + b.y * 3) % 3}`, p.x, p.y, s, s)) continue;
      g.fillStyle(0xc99d6b, 1).fillRoundedRect(p.x - s / 2, p.y - s / 2, s, s, 8);
      g.lineStyle(4, C.inkN, 1).strokeRoundedRect(p.x - s / 2, p.y - s / 2, s, s, 8);
    }
  }

  private catSize(v: CatView) {
    return v.cat.mother !== undefined ? this.cs * 0.78 : this.cs;
  }

  private redraw(v: CatView, tr?: Cell[], s = 0) {
    const cells = tr ?? [...v.cat.cells].reverse();
    const len = v.cat.cells.length;
    const p = this.pointsAt(cells, len, s);
    const size = this.catSize(v);
    const key = headKey(this, BREEDS[v.cat.breed].key, v.mood);
    const accId = save.equipped[v.cat.breed];
    const useArt = has(this, key);
    let head = p[0];
    let rot = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x) + Math.PI / 2;
    if (useArt && hasBodyArt(this, v.cat.breed)) {
      const trPx = cells.map((c) => this.px(c));
      const path = bodyPath(trPx, s, len, this.cs, 0.57 * size / this.cs);
      drawUnder(v.g, path, size, v.hint);
      v.rope = drawBody(this, v.rope, v.cat.breed, len, path, size);
      if (!v.rope.mask) v.rope.setMask(this.mask);
      v.rope.setPosition(v.g.x, v.g.y).setAlpha(v.g.alpha).setVisible(!v.hidden);
      head = path[path.length - 1];
      const neck = pathPoint(trPx, s + len - 1.4, this.cs);
      rot = Math.atan2(head.y - neck.y, head.x - neck.x) + Math.PI / 2;
    } else drawCat(v.g, p, v.cat.breed, size, v.mood, v.hint, useArt ? undefined : accId, useArt);
    v.g.setVisible(!v.hidden);
    v.head?.setVisible(!v.hidden);
    if (!useArt) return;
    // generated head looks up; rotate it toward the direction of travel
    if (!v.head) v.head = this.add.image(0, 0, key).setMask(this.mask);
    v.head.setTexture(key).setDisplaySize(size * 1.05, size * 1.05).setPosition(head.x + v.g.x, head.y + v.g.y).setRotation(rot).setVisible(!v.hidden);
    const accKey = accId ? `acc_${accId}` : '';
    if (accKey && has(this, accKey)) {
      if (!v.acc) v.acc = this.add.image(0, 0, accKey).setMask(this.mask);
      v.acc.setTexture(accKey).setDisplaySize(size * 0.9, size * 0.9).setPosition(v.head.x, v.head.y).setRotation(rot);
    } else v.acc?.setVisible(false);
  }

  /** tail..head followed by `extra` cells in front of the head */
  private trajectory(cat: Cat, extra: number): Cell[] {
    const tr = [...cat.cells].reverse();
    const d = headDir(cat);
    let { x, y } = cat.cells[0];
    for (let i = 0; i < extra; i++) {
      x += DX[d];
      y += DY[d];
      tr.push({ x, y });
    }
    return tr;
  }

  private pointsAt(tr: Cell[], len: number, s: number) {
    const out: { x: number; y: number }[] = [];
    for (let j = 0; j < len; j++) {
      const k = len - 1 - j + s;
      const i = Math.floor(k);
      const f = k - i;
      const a = tr[Math.min(i, tr.length - 1)];
      const b = tr[Math.min(i + 1, tr.length - 1)];
      out.push(this.px({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }));
    }
    return out;
  }

  private drawHud() {
    const d = this.d;
    const land = isLand();
    const lvl = d.mode === 'daily' ? t('dailyShort') : t(this.level.hard ? 'hardLevel' : 'level', { n: d.n });
    const restart = () => {
      platform.track('level_restart', { id: this.level.id });
      this.scene.restart(this.d);
    };
    let hintX: number;
    let hintY: number;
    if (land) {
      // left info panel: logo, chapter card, round buttons (style board 2026-11-23)
      art(this, 'logo', 180, 78, 300, 130) ?? title(this, 180, 78, 'Kittangle', 56, '#ffd84a');
      // card: just the level title, progress (or the daily timer), fish and paws
      const g = this.add.graphics();
      card(g, 28, 160, 304, 360, 30);
      this.levelTitle(180, 222, 270, lvl);
      this.fishChip = chip(this, 196, 382, 160, 'fish', () => String(save.fish + this.earned));
      if (d.mode === 'level') pawBar(this, 196, 302, 210, Math.max(0, stepOf(d.n) - 1), CHAPTER_LEN);
      this.pawIcons = [0, 1, 2].map((i) => icon(this, 'paw', 180 + (i - 1) * 58, 462, 50));
      roundBtn(this, W - 56, 52, 72, S.lavDeep, S.purpleLip, 'settings', () => openSettings(this));
      roundBtn(this, 76, 600, 86, S.purpleBtn, S.purpleLip, 'map', () => this.leave());
      roundBtn(this, 180, 600, 86, S.pink, S.pinkLip, '↻', restart);
      hintX = 284;
      hintY = 600;
      // Scratchy watches from the right only on levels where he is on the board
      if (this.level.cats.some((c) => c.breed === SCRATCHY))
        this.mascot = art(this, 'scratchy_idle', W - 128, H + 6, 300, 330)?.setOrigin(0.5, 1) ?? undefined;
      if (this.mascot) this.tweens.add({ targets: this.mascot, y: H + 18, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else {
      roundBtn(this, 66, 70, 84, S.purpleBtn, S.purpleLip, 'map', () => this.leave());
      roundBtn(this, 160, 70, 72, S.lavDeep, S.purpleLip, 'settings', () => openSettings(this));
      this.levelTitle(W / 2 + 20, 70, 250, lvl);
      this.fishChip = chip(this, W - 100, 70, 150, 'fish', () => String(save.fish + this.earned));
      if (d.mode === 'level') pawBar(this, W / 2 - 50, 194, 260, Math.max(0, stepOf(d.n) - 1), CHAPTER_LEN);
      this.pawIcons = [0, 1, 2].map((i) => icon(this, 'paw', W - 150 + i * 44, 194, 40));
      roundBtn(this, W / 2 - 120, H - 110, 96, S.pink, S.pinkLip, '↻', restart);
      hintX = W / 2 + 40;
      hintY = H - 110;
    }
    if (d.mode === 'daily') {
      const tx = land ? 180 : W / 2 - 50;
      const ty = land ? 302 : 194;
      icon(this, 'clock', tx - 64, ty, 44);
      this.timerText = title(this, tx + 10, ty, '', 28);
      const ch = challenge();
      if (ch && ch.date === d.date) title(this, land ? 180 : W / 2, land ? 530 : 236, t('challengeTarget', { t: fmtTime(ch.time) }), 22, '#ffd84a');
      const { w, h } = this.level;
      this.boardShot = new Promise((res) => this.time.delayedCall(80, () =>
        snapshot(this, this.ox - 30, this.oy - 30, this.cs * w + 60, this.cs * h + 72).then(res)));
    }
    // the only booster: hint (GDD §11.1); the first one after its tip is free
    this.freeHint = d.mode === 'level' && !save.tipsSeen.includes('hint');
    this.hintBtn = roundBtn(this, hintX, hintY, land ? 86 : 110, S.yellow, S.yellowLip, 'hint', () => this.useHint());
    const g = this.add.graphics();
    const bw = 96;
    const by = (land ? 43 : 55) + 8;
    g.fillStyle(C.inkN, 1).fillRoundedRect(-bw / 2 - 3, by - 3, bw + 6, 40, 20);
    g.fillStyle(0xffffff, 1).fillRoundedRect(-bw / 2, by, bw, 34, 17);
    const price = txt(this, 12, by + 17, String(COST.hint), 22);
    const fi = icon(this, 'fish', -24, by + 17, 34);
    this.hintBtn.add([g, fi, price]);
    this.hintBtn.setData('price', price).setData('fish', fi);
    this.refreshUi();
  }

  /** Level name as plain display text (no button-like plate). */
  private levelTitle(x: number, y: number, w: number, label: string) {
    const tt = title(this, x, y, label.toUpperCase(), 34);
    if (tt.width > w) tt.setScale(w / tt.width);
    if (this.level.hard) tt.setColor('#ffd84a');
  }

  private wallet() {
    return save.fish + this.earned;
  }

  /** Spends fish earned in this level first, then the saved wallet. */
  private spend(cost: number): boolean {
    if (this.wallet() < cost) return false;
    const fromEarned = Math.min(this.earned, cost);
    this.earned -= fromEarned;
    if (cost > fromEarned) addFish(-(cost - fromEarned));
    this.refreshUi();
    return true;
  }

  private refreshUi() {
    this.fishChip.refresh();
    const price = this.hintBtn.getData('price') as Phaser.GameObjects.Text;
    (this.hintBtn.getData('fish') as Phaser.GameObjects.Image).setVisible(!this.freeHint);
    price.setText(this.freeHint ? t('free') : String(COST.hint)).setX(this.freeHint ? 0 : 12);
    if (price.width > 88) price.setScale(88 / price.width);
    else price.setScale(1);
    this.hintBtn.setAlpha(this.freeHint || this.wallet() >= COST.hint ? 1 : 0.55);
  }

  private updatePaws() {
    const n = pawsFor(this.blocked);
    this.pawIcons.forEach((im, i) => {
      const on = i < n;
      if (!on && im.alpha > 0.5) this.tweens.add({ targets: im, scale: { from: im.scale * 1.4, to: im.scale }, duration: 250, ease: 'Back.Out' });
      im.setAlpha(on ? 1 : 0.25);
    });
  }

  // ---------- teaching ----------

  /** Level 1: an animated hand taps a free cat and an arrow shows its way out. No card, no lock. */
  private handCue() {
    if (this.ended) return;
    this.clearCue();
    const id = this.board.freeCats().find((i) => !this.views.get(i)?.busy);
    if (id === undefined) return;
    const cat = this.board.cats.get(id)!;
    const head = this.px(cat.cells[0]);
    const mid = this.px(cat.cells[Math.floor(cat.cells.length / 2)]);
    const d = headDir(cat);
    const a = this.add.graphics().setDepth(40);
    const ex = head.x + DX[d] * this.cs * 1.3;
    const ey = head.y + DY[d] * this.cs * 1.3;
    a.lineStyle(10, 0xff3d9a, 1).lineBetween(head.x + DX[d] * this.cs * 0.55, head.y + DY[d] * this.cs * 0.55, ex, ey);
    const ang = Math.atan2(DY[d], DX[d]);
    a.fillStyle(0xff3d9a, 1).fillTriangle(
      ex + Math.cos(ang) * 22, ey + Math.sin(ang) * 22,
      ex + Math.cos(ang + 2.4) * 20, ey + Math.sin(ang + 2.4) * 20,
      ex + Math.cos(ang - 2.4) * 20, ey + Math.sin(ang - 2.4) * 20,
    );
    this.tweens.add({ targets: a, alpha: 0.35, duration: 500, yoyo: true, repeat: -1 });
    const hand = txt(this, mid.x + 30, mid.y + 50, '👆', 64).setDepth(41);
    this.tweens.add({ targets: hand, x: mid.x + 10, y: mid.y + 30, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const land = isLand();
    const label = title(this, land ? 180 : W / 2, land ? 540 : H - 200, t('tut1'), land ? 24 : 30).setDepth(41);
    if (land) label.setWordWrapWidth(300, true);
    else if (label.width > W - 60) label.setScale((W - 60) / label.width);
    this.cue = [a, hand, label];
  }

  private clearCue() {
    for (const o of this.cue ?? []) {
      this.tweens.killTweensOf(o);
      o.destroy();
    }
    this.cue = undefined;
  }

  /** Short skippable tip card at the top: never covers the board, closes on tap or by itself. */
  private showTip(k: TipKey) {
    if (!save.tipsSeen.includes(k)) {
      save.tipsSeen.push(k);
      persist();
    }
    // portrait: over the top HUD; landscape: over the left panel. Never over the board.
    const land = isLand();
    // landscape: exactly the chapter card's rect, so no edge of the card behind peeks out
    const bw = land ? 304 : W - 40;
    const bh = land ? 360 : 150;
    const home = land ? { x: 180, y: 340 } : { x: W / 2, y: 92 };
    const c = this.add.container(home.x, land ? H + 200 : -140).setDepth(60);
    const g = this.add.graphics();
    card(g, -bw / 2, -bh / 2, bw, bh, 26);
    const ix = land ? 0 : -bw / 2 + 75;
    const iy = land ? -bh / 2 + 70 : 5;
    const ic = k === 'scratchy' ? art(this, 'scratchy_warn', ix, iy, land ? 100 : 120, land ? 100 : 120) : null;
    const iconName = ({ hint: 'hint', sleepy: 'sleep', kitten: 'family', moony: 'star', boxes: 'box', hard: 'star', daily: 'daily' } as Record<string, string>)[k];
    const im = ic ?? (iconName ? icon(this, iconName as never, ix, iy, land ? 80 : 96) : null);
    const tx = txt(this, land ? 0 : 40, land ? -8 : -28, t(`tip_${k}_t`), land ? 26 : 30);
    const body = txt(this, land ? 0 : 40, land ? 18 : 22, t(`tip_${k}`), 20, C.muted).setWordWrapWidth(land ? bw - 30 : W - 230, true);
    if (land) body.setOrigin(0.5, 0);
    const close = txt(this, bw / 2 - 28, -bh / 2 + 26, '✕', 28, C.muted);
    c.add([g, ...(im ? [im] : []), tx, body, close]);
    c.setSize(bw, bh).setInteractive();
    this.tweens.add({ targets: c, y: home.y, duration: 280, ease: 'Back.Out' });
    const hide = () => {
      if (!c.active) return;
      c.disableInteractive();
      this.tweens.add({ targets: c, y: isLand() ? H + 200 : -160, duration: 220, onComplete: () => c.destroy() });
    };
    c.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => { ev.stopPropagation(); hide(); });
    this.time.delayedCall(k === 'scratchy' || k === 'kitten' ? 8000 : 6000, hide);
    this.tipBox = c;
  }

  private exposeDebug() {
    (window as unknown as Record<string, unknown>).__ac = {
      free: () => this.board.freeCats().map((id) => {
        const p = this.px(this.board.cats.get(id)!.cells[0]);
        return { x: p.x, y: p.y };
      }),
      blocked: () => [...this.board.cats.keys()].filter((id) => !this.board.check(id).free).map((id) => {
        const p = this.px(this.board.cats.get(id)!.cells[0]);
        return { x: p.x, y: p.y };
      }),
      fish: () => this.wallet(),
      state: () => ({ ended: this.ended, blocked: this.blocked, cats: this.views.size, id: this.level.id, freeN: this.board.freeCats().length }),
      share: () => this.shareDaily(),
      leap: () => { this.leapers = [0, 4, 9]; this.celebrate(() => undefined); },
      og: async () => {
        const { w, h } = this.level;
        const board = await snapshot(this, this.ox - 30, this.oy - 30, this.cs * w + 60, this.cs * h + 72);
        return drawCard(this, {
          w: 1200, h: 630, board, title: 'Kittangle', subtitle: 'Cozy Cat Puzzle',
          extra: 'New puzzle every day 🐾', cta: 'Play free',
        }).toDataURL('image/png');
      },
    };
  }

  // ---------- input & mechanics ----------

  private catAt(px: number, py: number): number {
    const fx = (px - this.ox) / this.cs;
    const fy = (py - this.oy) / this.cs;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    let id = this.board.at(cx, cy);
    if (id < 0) {
      // generous hit area: nearest cat cell around the tap, never across a neighbour's own cell
      let bd = 0.8;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const o = this.board.at(cx + dx, cy + dy);
        if (o < 0) continue;
        const dist = Math.hypot(fx - (cx + dx + 0.5), fy - (cy + dy + 0.5));
        if (dist < bd) {
          bd = dist;
          id = o;
        }
      }
    }
    return id;
  }

  /** Mouse hover: dotted exit path up to the first blocker. */
  private hover(px: number, py: number) {
    const id = px < 0 || this.ended ? -1 : this.catAt(px, py);
    if (id === this.previewId) return;
    this.previewId = id;
    this.preview?.destroy();
    this.preview = undefined;
    const v = id >= 0 ? this.views.get(id) : undefined;
    if (!v || v.busy) return;
    if (v.hidden) return;
    let res = this.board.check(id);
    const d = headDir(v.cat);
    const g = this.add.graphics().setDepth(4);
    const h = v.cat.cells[0];
    // an invisible Moony must not show up in the preview: the path looks clear up to the next visible thing
    if (!res.free && this.views.get(res.blocker)?.hidden) {
      let k = res.steps + 1;
      for (let x = h.x + DX[d] * k, y = h.y + DY[d] * k; this.board.inside(x, y); k++, x += DX[d], y += DY[d]) {
        const o = this.board.at(x, y);
        if (o !== EMPTY && !this.views.get(o)?.hidden) break;
      }
      res = { free: !this.board.inside(h.x + DX[d] * k, h.y + DY[d] * k), steps: k - 1, blocker: EMPTY };
    }
    g.fillStyle(res.free ? 0x22d3e6 : 0xff654d, 0.85);
    for (let i = 1; i <= res.steps; i++) {
      const p = this.px({ x: h.x + DX[d] * i, y: h.y + DY[d] * i });
      g.fillCircle(p.x, p.y, Math.max(4, this.cs * 0.08));
    }
    if (!res.free && !res.mother) {
      const p = this.px({ x: h.x + DX[d] * (res.steps + 1), y: h.y + DY[d] * (res.steps + 1) });
      g.lineStyle(5, 0xff654d, 1).strokeRoundedRect(p.x - this.cs * 0.42, p.y - this.cs * 0.42, this.cs * 0.84, this.cs * 0.84, 10);
    }
    this.preview = g;
  }

  private onTap(px: number, py: number) {
    if (this.ended) return;
    const id = this.catAt(px, py);
    const v = id >= 0 ? this.views.get(id) : undefined;
    if (!v || v.busy) return;
    this.hover(-1, -1);
    if (v.hidden) return this.reveal(v);
    if (!v.awake) return this.wake(v);
    const res = this.board.check(id);
    if (!res.free && !res.mother && this.views.get(res.blocker)?.hidden) return this.bonk(v, res.steps, res.blocker);
    if (res.free) {
      this.clearCue();
      this.exit(v, res.steps);
    } else if (res.mother) this.kittenWait(v, res.blocker);
    else if (v.cat.breed === SCRATCHY) this.scratchy(v, res.steps, res.blocker, px, py);
    else this.bonk(v, res.steps, res.blocker);
  }

  /** Sleepy cat: the first tap wakes it, no penalty (GDD §7). */
  private wake(v: CatView) {
    this.board.wake(v.cat.id);
    v.awake = true;
    v.mood = 'calm';
    this.tweens.add({ targets: v.zz, alpha: 0, y: '-=30', duration: 300, onComplete: () => v.zz?.destroy() });
    this.redraw(v);
    sfx.wake();
    this.tweens.add({ targets: parts(v), y: '-=8', duration: 110, yoyo: true, repeat: 1 });
  }

  private exit(v: CatView, steps: number) {
    this.taps.push('exit');
    const cat = v.cat;
    this.leapers.push(cat.breed);
    const kittens = this.board.remove(cat.id);
    this.exits++;
    if (cat.breed !== SCRATCHY) this.time.delayedCall(260, () => this.crawlScratchy());
    v.busy = true;
    v.mood = 'happy';
    v.hint = false;
    const len = cat.cells.length;
    const total = steps + len + 1;
    const tr = this.trajectory(cat, total + 1);
    sfx.meow(cat.mother !== undefined ? 1.35 : 0.9 + Math.random() * 0.3);
    sfx.slide();
    if (cat.breed === SCRATCHY) this.time.delayedCall(150, () => this.scratchyPop('scratchy_smug', sfx.scratchySmug));
    const o = { s: 0 };
    // anticipation: a tiny pull back, then the stretch out
    this.tweens.add({
      targets: o, s: total, duration: 180 + total * 42, ease: 'Back.In', easeParams: [1.2],
      onUpdate: () => this.redraw(v, tr, Math.max(0, o.s)),
      onComplete: () => this.gone(v),
    });
    v.mark?.destroy();
    v.mark = undefined;
    for (const k of kittens) {
      const kv = this.views.get(k);
      if (!kv) continue;
      this.time.delayedCall(250, () => {
        sfx.kitten();
        this.tweens.add({ targets: parts(kv), y: '-=10', duration: 120, yoyo: true, repeat: 1 });
      });
    }

    const now = this.time.now;
    this.combo = now - this.lastExit < COMBO_WINDOW_MS ? this.combo + 1 : 1;
    this.lastExit = now;
    let gain = FISH_PER_CAT;
    if (this.combo >= 2) {
      gain += Math.min(this.combo - 1, COMBO_BONUS_MAX);
      sfx.combo(this.combo);
    }
    this.earned += gain;
    this.refreshUi();
    this.time.delayedCall(120, () => sfx.pop());
    sfx.coin();
  }

  private gone(v: CatView) {
    v.g.destroy();
    v.zz?.destroy();
    v.head?.destroy();
    v.rope?.destroy();
    v.acc?.destroy();
    v.mark?.destroy();
    this.views.delete(v.cat.id);
    if (!BREEDS[v.cat.breed].special) this.rescued.push(v.cat.breed);
    // only Moony is left and nobody found him: he shows himself
    const left = [...this.views.values()];
    if (left.length && left.every((x) => x.hidden)) left.forEach((x) => this.reveal(x));
    if (this.views.size === 0 && !this.ended) this.win();
    else if (this.d.mode === 'level' && this.d.n === 1 && this.cue === undefined) this.handCue();
  }

  /** Highlights the cell that stops a cat: the first cat or box in its way. */
  private showBlocker(cat: Cat, steps: number, blocker: number) {
    const d = headDir(cat);
    const h = cat.cells[0];
    const p = this.px({ x: h.x + DX[d] * (steps + 1), y: h.y + DY[d] * (steps + 1) });
    const g = this.add.graphics().setDepth(6);
    g.lineStyle(6, 0xff3d9a, 1).strokeRoundedRect(p.x - this.cs * 0.45, p.y - this.cs * 0.45, this.cs * 0.9, this.cs * 0.9, 12);
    this.tweens.add({ targets: g, alpha: 0, duration: 260, yoyo: true, repeat: 1, onComplete: () => g.destroy() });
    if (blocker === BOX) return sfx.box();
    const bv = this.views.get(blocker);
    if (bv) this.tweens.add({ targets: parts(bv), x: '+=5', duration: 50, yoyo: true, repeat: 3 });
  }

  private countBlocked() {
    this.blocked++;
    this.updatePaws();
    if (this.blocked === 1 && this.d.mode === 'level' && this.d.n <= 4) toast(this, t('tut2'), isLand() ? H - 40 : H - 240);
  }

  private bonk(v: CatView, steps: number, blocker: number) {
    this.taps.push('bonk');
    v.busy = true;
    v.mood = 'angry';
    const ghost = this.views.get(blocker);
    // bumping into an invisible Moony is not a mistake: he appears instead
    if (ghost?.hidden) this.time.delayedCall(80 + steps * 30, () => this.reveal(ghost));
    else this.countBlocked();
    sfx.bonk();
    const tr = this.trajectory(v.cat, steps + 1);
    const o = { s: 0 };
    this.tweens.add({
      targets: o, s: steps + 0.35, duration: 80 + steps * 30, ease: 'Sine.InOut', yoyo: true,
      onUpdate: () => this.redraw(v, tr, o.s),
      onComplete: () => {
        v.busy = false;
        this.redraw(v);
        this.time.delayedCall(300, () => {
          if (!v.g.active || v.busy) return;
          v.mood = 'calm';
          this.redraw(v);
        });
      },
    });
    this.showBlocker(v.cat, steps, blocker);
  }

  /** Moony appears: sparkle puff, fade in, a happy blink. */
  private reveal(v: CatView) {
    if (!v.hidden) return;
    v.hidden = false;
    v.mood = 'happy';
    this.redraw(v);
    const targets = parts(v);
    for (const o of targets) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
    this.tweens.add({ targets, alpha: 1, duration: 420 });
    const mid = this.px(v.cat.cells[Math.floor(v.cat.cells.length / 2)]);
    const fx = art(this, 'moony_reveal', mid.x, mid.y, this.cs * 2.4, this.cs * 2.4);
    if (fx) this.tweens.add({ targets: fx, alpha: 0, scale: fx.scale * 1.3, delay: 250, duration: 500, onComplete: () => fx.destroy() });
    else for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = this.add.circle(mid.x, mid.y, this.cs * 0.09, i % 2 ? 0xffd84a : 0xb79cf0).setDepth(30);
      this.tweens.add({ targets: s, x: mid.x + Math.cos(a) * this.cs, y: mid.y + Math.sin(a) * this.cs, alpha: 0, duration: 520, onComplete: () => s.destroy() });
    }
    sfx.kitten();
    platform.track('moony_reveal', { id: this.level.id });
    this.time.delayedCall(700, () => {
      if (!v.g.active || v.busy) return;
      v.mood = 'calm';
      this.redraw(v);
    });
  }

  /** Kitten tapped while its mother is still on the board: it mews and looks at her. */
  private kittenWait(v: CatView, mother: number) {
    this.taps.push('bonk');
    this.countBlocked();
    sfx.meow(1.5);
    this.tweens.add({ targets: parts(v), y: '-=6', duration: 90, yoyo: true, repeat: 1 });
    const mv = this.views.get(mother);
    if (mv) {
      mv.hint = true;
      this.redraw(mv);
      this.tweens.add({ targets: mv.mark, scale: 1.6, duration: 160, yoyo: true, repeat: 1 });
      this.time.delayedCall(700, () => {
        if (!mv.g.active || mv.busy) return;
        mv.hint = false;
        this.redraw(mv);
      });
    }
    toast(this, t('kittenWait'), isLand() ? H - 40 : H - 240);
  }

  /** After every cat that leaves, Scratchy crawls one cell (core/scratchy.ts keeps the level solvable). */
  private crawlScratchy() {
    if (this.ended) return;
    const v = [...this.views.values()].find((x) => x.cat.breed === SCRATCHY && !x.busy && this.board.cats.has(x.cat.id));
    if (!v) return;
    const next = crawl(this.board, v.cat.id, mulberry32(hashStr(this.level.id) + this.exits * 7919));
    if (!next) return;
    const old = this.board.cats.get(v.cat.id)!.cells;
    this.board.setCells(v.cat.id, next);
    v.cat = this.board.cats.get(v.cat.id)!;
    v.busy = true;
    v.mood = 'happy';
    // slide along: tail..head then the new head cell
    const tr = [...old].reverse().concat([next[0]]);
    const o = { s: 0 };
    sfx.slide();
    this.tweens.add({
      targets: o, s: 1, duration: 280, ease: 'Sine.InOut',
      onUpdate: () => this.redraw(v, tr, o.s),
      onComplete: () => {
        v.busy = false;
        v.mood = 'calm';
        this.redraw(v);
        this.previewId = -1;
      },
    });
  }

  /** Scratchy blocked: a playful paw swipe toward the tap, the blocker is revealed. No penalty but paws. */
  private scratchy(v: CatView, steps: number, blocker: number, px: number, py: number) {
    const now = this.time.now;
    if (now < this.scratchyUntil) {
      // spam during the reaction: only the blocker pulses
      this.showBlocker(v.cat, steps, blocker);
      return;
    }
    this.scratchyUntil = now + SCRATCHY_COOLDOWN;
    this.taps.push('bonk');
    this.countBlocked();
    platform.track('scratchy', { id: this.level.id });
    v.mood = 'angry';
    this.redraw(v);
    sfx.scratchyWarn();
    this.time.delayedCall(220, () => {
      sfx.scratchySwipe();
      const k = `fx_scratch_${Math.floor(Math.random() * 6)}`;
      const s = this.cs * 2.2;
      const fx = art(this, k, px, py, s, s)?.setDepth(30).setAlpha(0).setScale(0.2);
      if (fx) {
        const sc = Math.min(s / fx.width, s / fx.height);
        this.tweens.add({ targets: fx, alpha: 1, scale: sc, duration: 110, ease: 'Back.Out' });
        this.tweens.add({ targets: fx, alpha: 0, delay: 380, duration: 260, onComplete: () => fx.destroy() });
      }
      this.cameras.main.shake(90, 0.003);
      this.showBlocker(v.cat, steps, blocker);
    });
    this.scratchyPop('scratchy_swipe');
    this.time.delayedCall(800, () => {
      if (!v.g.active || v.busy) return;
      v.mood = 'calm';
      this.redraw(v);
    });
  }

  /** Scratchy peeks in from the bottom-left corner (never over the board center). */
  private scratchyPop(key: string, sound?: () => void) {
    if (this.mascot) {
      const m = this.mascot;
      sound?.();
      if (has(this, key)) m.setTexture(key);
      this.tweens.add({ targets: m, scaleX: m.scaleX * 1.08, scaleY: m.scaleY * 1.08, duration: 120, yoyo: true });
      this.time.delayedCall(900, () => m.active && has(this, 'scratchy_idle') && m.setTexture('scratchy_idle'));
      return;
    }
    const im = art(this, key, -100, H - 300, 200, 200);
    if (!im) return;
    im.setDepth(35);
    sound?.();
    this.tweens.add({ targets: im, x: 90, duration: 180, ease: 'Back.Out', yoyo: true, hold: 450, onComplete: () => im.destroy() });
  }

  private useHint() {
    if (this.ended) return;
    const free = this.board.freeCats().map((id) => this.views.get(id)!).filter((v) => v && !v.busy && !v.hint && !v.hidden);
    const sleepers = [...this.views.values()].filter((v) => !v.awake && !v.busy && this.board.check(v.cat.id).free);
    const v = free[0] ?? sleepers[0];
    if (!v) return;
    if (this.freeHint) this.freeHint = false;
    else if (!this.spend(COST.hint)) return toast(this, t('noFish'));
    v.hint = true;
    this.redraw(v);
    sfx.hint();
    this.tweens.add({ targets: parts(v), alpha: 0.55, duration: 250, yoyo: true, repeat: 3 });
    this.taps.push('hint');
    this.refreshUi();
    platform.track('booster_used', { type: 'hint' });
  }

  // ---------- end ----------

  private win() {
    this.ended = true;
    this.clearCue();
    this.tipBox?.destroy();
    platform.gameplayStop();
    const d = this.d;
    const paws = pawsFor(this.blocked);
    const time = (this.time.now - this.startTime) / 1000;
    const lines: string[] = [];
    let reward = 0;
    let firstClear = false;
    if (d.mode === 'level') {
      reward = levelReward(d.n, !!this.level.hard);
      firstClear = d.n === save.level;
      if (firstClear) {
        save.level = d.n + 1;
        save.stars += this.level.hard ? 2 : 1;
        grantPaws(this.level.hard ? PAWS.hard : PAWS.level);
        if (isMilestone(d.n)) {
          reward += 25;
          lines.push(t('milestone', { n: 25 }));
        }
      }
      save.best[d.n] = Math.max(save.best[d.n] ?? 0, paws);
      // the café chapter's golden frame needs perfect (3-paw) levels
      const cc = CHAPTERS[progress(save.tasksDone).chapter];
      if (cc && paws < 3) save.flawless[cc.key] = false;
      platform.track('level_complete', { id: this.level.id, paws, blocked: this.blocked, time: Math.round(time) });
    } else {
      if (!save.daily.results[d.date]) {
        save.daily.results[d.date] = { hearts: paws, time };
        save.daily.streak = save.daily.last === prevDate(d.date) ? save.daily.streak + 1 : 1;
        save.daily.last = d.date;
        const bonus = DAILY_STREAK_BONUS[save.daily.streak] ?? 0;
        reward = DAILY_REWARD + bonus;
        save.stars += 1;
        grantPaws(PAWS.daily);
        if (!save.dailyBest || time < save.dailyBest) save.dailyBest = time;
        platform.submitScore('daily', Math.round(time * 1000));
        if (bonus) lines.push(t('streakBonus', { n: bonus }));
      }
      lines.unshift(t('dailyTime', { t: fmtTime(time) }), t('streak', { n: save.daily.streak }));
      const ch = challenge();
      if (ch && ch.date === d.date) {
        const beat = paws > ch.hearts || (paws === ch.hearts && time < ch.time);
        lines.unshift(beat ? t('challengeWin', { t: fmtTime(time), f: fmtTime(ch.time) }) : t('challengeLose', { f: fmtTime(ch.time) }));
        platform.track('challenge_done', { beat });
      }
      platform.track('daily_complete', { date: d.date, paws, time });
    }
    const total = this.earned + reward;
    this.earned = 0;
    addFish(total);
    for (const b of new Set(this.rescued)) {
      if (unlockBreed(b)) lines.push(t('newBreed', { name: t('breed_' + BREEDS[b].key) }));
    }
    addFriendship(save.friend, this.rescued);
    persist();
    const chapterDone = d.mode === 'level' && firstClear && stepOf(d.n) === CHAPTER_LEN;
    if (chapterDone) {
      sfx.chapter();
      lines.unshift(t('chapterDone', { name: t('chapter_' + chapterKey(chapterOf(d.n))) }));
    } else if (d.mode === 'daily') sfx.daily();
    else sfx.win();
    this.celebrate(() => this.result(paws, total, lines));
  }

  /** Win: the last cats leap out of the board in an arc with sparkles, hearts and speed lines (art4). */
  private celebrate(done: () => void) {
    const keys = [...new Set(this.leapers.slice().reverse())].map((b) => `leap_${BREEDS[b].key}`).filter((k) => has(this, k)).slice(0, 3);
    if (!keys.length) {
      this.time.delayedCall(350, done);
      return;
    }
    const { w, h } = this.level;
    const cx = this.ox + (this.cs * w) / 2;
    const cy = this.oy + (this.cs * h) / 2;
    const size = Math.min(W, H) * 0.42;
    const ring = art(this, 'vfx_hearts', cx, cy, size * 0.6, size * 0.6)?.setDepth(89).setAlpha(0.95);
    if (ring) this.tweens.add({ targets: ring, scale: ring.scale * 2.2, alpha: 0, duration: 900, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    keys.forEach((key, i) => this.time.delayedCall(i * 260, () => {
      const right = i % 2 === 0;
      const x0 = cx + (i - 1) * this.cs * 0.8;
      const y0 = cy + this.cs * 0.5;
      const x1 = right ? W + size : -size;
      const y1 = -size * 0.3 + i * 60;
      const puff = art(this, 'vfx_puff', x0, y0 + size * 0.15, size * 0.5, size * 0.5)?.setDepth(90);
      if (puff) this.tweens.add({ targets: puff, scale: puff.scale * 1.6, alpha: 0, duration: 520, onComplete: () => puff.destroy() });
      const cat = art(this, key, x0, y0, size, size)!.setDepth(92).setFlipX(!right);
      const k = cat.scale;
      cat.setScale(k * 0.3);
      const lines = art(this, 'vfx_speed', x0, y0, size * 0.55, size * 0.55)?.setDepth(91).setFlipX(!right).setAlpha(0);
      const o = { u: 0 };
      this.tweens.add({
        targets: o, u: 1, duration: 900, ease: 'Quad.In',
        onUpdate: () => {
          const u = o.u;
          const x = x0 + (x1 - x0) * u;
          const y = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * size * 0.45;
          cat.setPosition(x, y).setScale(k * Math.min(1, 0.3 + u * 2.4)).setRotation((right ? 1 : -1) * (-0.35 + u * 0.5));
          lines?.setPosition(x - (right ? 1 : -1) * size * 0.55, y + size * 0.05).setAlpha(Math.min(1, u * 4)).setRotation(cat.rotation);
        },
        onComplete: () => { cat.destroy(); lines?.destroy(); },
      });
      this.time.delayedCall(120, () => {
        const sp = art(this, 'vfx_sparkle', x0, y0 - size * 0.1, size * 0.45, size * 0.45)?.setDepth(93);
        if (sp) this.tweens.add({ targets: sp, scale: sp.scale * 1.7, angle: 40, alpha: 0, duration: 650, ease: 'Cubic.Out', onComplete: () => sp.destroy() });
      });
      sfx.meow(1 + i * 0.15);
    }));
    this.time.delayedCall(950 + (keys.length - 1) * 260, done);
  }

  /** Compact result: paws, fish, one or two lines; Continue first, Map second (GDD §4, §8.2). */
  private result(paws: number, fish: number, lines: string[]) {
    const d = this.d;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, DIM, 0.5).setInteractive();
    const g = this.add.graphics();
    const nl = Math.min(lines.length, isLand() ? 2 : 3);
    // title, paws, fish, up to 3 lines, Continue, Map: stacked so nothing overlaps
    // vertical rhythm: tighter on landscape screens (720 px tall)
    const L = isLand() ? { paw: 148, hint: 214, fish: 262, lines: 312, step: 36, gap: 44, b2: 98 } : { paw: 170, hint: 255, fish: 315, lines: 375, step: 42, gap: 60, b2: 112 };
    const ph = L.lines + nl * L.step + L.gap + L.b2 + 80;
    const top = H / 2 - ph / 2 - 20;
    const pw = Math.min(W - 100, 620);
    card(g, W / 2 - pw / 2, top, pw, ph, 40);
    const title = d.mode === 'level' ? t('levelDone', { n: d.n }) : t('dailyDone');
    const tt = txt(this, W / 2, top + 64, title, 42);
    if (tt.width > pw - 60) tt.setScale((pw - 60) / tt.width);
    c.add([dim, g, tt]);
    for (let i = 0; i < 3; i++) {
      const im = icon(this, 'paw', W / 2 + (i - 1) * 110, top + L.paw, 96).setAlpha(i < paws ? 1 : 0.2).setScale(0);
      c.add(im);
      const sc = 96 / Math.max(im.width, im.height);
      this.tweens.add({ targets: im, scale: sc, delay: 150 + i * 160, duration: 260, ease: 'Back.Out', onStart: () => { if (i < paws) sfx.star(); } });
    }
    c.add(txt(this, W / 2, top + L.hint, t(paws === 3 ? 'pawsPerfect' : 'pawsHint'), 24, C.muted));
    c.add(icon(this, 'fish', W / 2 - 50, top + L.fish, 56));
    c.add(txt(this, W / 2 + 10, top + L.fish + 2, `+${fish}`, 44).setOrigin(0, 0.5));
    lines.slice(0, nl).forEach((l, i) => {
      const lt = txt(this, W / 2, top + L.lines + i * L.step, l, 26);
      if (lt.width > pw - 60) lt.setScale((pw - 60) / lt.width);
      c.add(lt);
    });
    const by = top + L.lines + nl * L.step + L.gap;
    let leaving = false;
    if (d.mode === 'level') {
      const next = async () => {
        if (leaving) return;
        leaving = true;
        await betweenLevels(d.n);
        this.scene.restart({ mode: 'level', n: d.n + 1 });
      };
      c.add(candy(this, W / 2, by, 440, 104, t('continue').toUpperCase(), () => void next()));
      const ad = rewardedReady() && fish > 0;
      c.add(candy(this, ad ? W / 2 - 115 : W / 2, by + L.b2, ad ? 210 : 260, 72, t('map'), () => this.scene.start('Map'), '', S.purpleBtn, S.purpleLip));
      if (ad) {
        let doubled = false;
        c.add(button(this, W / 2 + 115, by + L.b2, 210, 76, t('adDoubleShort'), async () => {
          if (doubled) return;
          doubled = true;
          if (await rewarded(this, 'win_double')) {
            addFish(fish);
            sfx.coin();
            toast(this, t('winFish', { n: fish }));
          }
        }, { color: C.gold, size: 26 }));
      }
    } else {
      const r = save.daily.results[d.date];
      void this.boardShot.then((board) => {
        this.sendShare = prepareDailyShare(this, {
          date: d.date, num: dailyNumber(d.date), time: r.time, hearts: r.hearts,
          taps: this.taps, streak: save.daily.streak, board,
        });
      });
      c.add(candy(this, W / 2, by, 440, 104, t('share'), () => this.shareDaily(), ''));
      c.add(candy(this, W / 2, by + L.b2, 260, 72, t('map'), () => this.scene.start('Map'), '', S.purpleBtn, S.purpleLip));
    }
    c.setAlpha(0).setY(40);
    this.tweens.add({ targets: c, y: 0, alpha: 1, duration: 240, ease: 'Back.Out' });
  }

  private sendShare?: () => Promise<void>;

  private shareDaily() {
    if (this.d.mode !== 'daily' || !this.sendShare) return;
    platform.track('share', { date: this.d.date });
    void this.sendShare();
  }

  private leave() {
    if (!this.ended) platform.track('level_abandon', { id: this.level.id, blocked: this.blocked, cats: this.views.size });
    platform.gameplayStop();
    this.scene.start('Map');
  }
}
