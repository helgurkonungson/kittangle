import Phaser from 'phaser';
import { Board, BOX, headDir } from '../core/board';
import {
  BREEDS, COMBO_BONUS_MAX, COMBO_WINDOW_MS, COST, DAILY_REWARD, DAILY_STREAK_BONUS, FISH_PER_CAT, levelReward, SCRATCHY,
} from '../core/content';
import { CAMPAIGN_LEVELS, chapterKey, chapterOf, dailyNumber, getDaily, getLevel, isMilestone, stepOf, CHAPTER_LEN } from '../core/levels';
import { prevDate } from '../core/save';
import { Cat, Cell, DX, DY, Level } from '../core/types';
import { addFriendship } from '../core/friend';
import { CHAPTERS, progress } from '../core/meta';
import { levelTips, pawsFor, TipKey } from '../core/tutorial';
import { t } from '../i18n';
import { drawCat, Mood } from './drawCat';
import { art, has, headKey } from './art';
import { playMusic, sfx } from './sfx';
import { betweenLevels, rewarded, rewardedReady } from './ads';
import { addFish, grantPaws, persist, platform, save, unlockBreed } from './state';
import { PAWS } from '../core/live';
import { candy, card, chip, pawBar, roundBtn, S, stage, title } from './style';
import { button, C, H, toast, txt, W, DIM, isLand } from './ui';
import { icon } from './icons';
import { fmtTime, Tap } from '../core/share';
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
  acc?: Phaser.GameObjects.Image;
  /** shared mother–kitten heart */
  mark?: Phaser.GameObjects.Graphics;
}

/** family colors for mother–kitten pairs (never the only cue: kittens are also smaller) */
const FAMILY = [0xff3d9a, 0x22d3e6, 0xb8f52f, 0x7957f5];
/** Scratchy's reaction lasts ~0.8 s; taps during the cooldown only pulse the blocker */
const SCRATCHY_COOLDOWN = 1100;

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
  private cue?: Phaser.GameObjects.GameObject[];
  private tipBox?: Phaser.GameObjects.Container;
  private preview?: Phaser.GameObjects.Graphics;
  private previewId = -1;
  private freeHint = false;

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
    this.ended = false;
    this.timerText = undefined;
    this.taps = [];
    this.sendShare = undefined;
    this.boardShot = Promise.resolve(null);
    this.scratchyUntil = 0;
    this.cue = undefined;
    this.tipBox = undefined;
    this.preview = undefined;
    this.previewId = -1;
    this.freeHint = false;
    this.mascot = undefined;
  }

  create() {
    const d = this.d;
    this.level = d.mode === 'level' ? getLevel(d.n) : getDaily(d.date);
    this.board = new Board(this.level);
    const { w, h } = this.level;
    this.cameras.main.setBackgroundColor(C.bg);

    // board area: center column between the info panel and Scratchy in landscape, under the HUD in portrait
    const land = isLand();
    const A = land ? { x: 360, y: 46, w: W - 360 - 250, h: H - 92 } : { x: 28, y: 240, w: W - 56, h: H - 240 - 230 };
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
        mood: cat.sleepy ? 'sleep' : 'calm', hint: false,
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
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
    // mouse hover previews the exit path (GDD §14), never needed to play
    zone.on('pointermove', (p: Phaser.Input.Pointer) => { if (!p.wasTouch) this.hover(p.x, p.y); });
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
        scratchy: this.level.cats.some((c) => c.breed === SCRATCHY), kittens: this.level.cats.some((c) => c.mother !== undefined),
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

  private redraw(v: CatView, pts?: { x: number; y: number }[]) {
    const p = pts ?? v.cat.cells.map((c) => this.px(c));
    const size = this.catSize(v);
    const key = headKey(this, BREEDS[v.cat.breed].key, v.mood);
    const accId = save.equipped[v.cat.breed];
    const useArt = has(this, key);
    drawCat(v.g, p, v.cat.breed, size, v.mood, v.hint, useArt ? undefined : accId, useArt);
    if (!useArt) return;
    // generated head looks up; rotate it toward the direction of travel
    const rot = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x) + Math.PI / 2;
    if (!v.head) v.head = this.add.image(0, 0, key).setMask(this.mask);
    v.head.setTexture(key).setDisplaySize(size * 1.05, size * 1.05).setPosition(p[0].x + v.g.x, p[0].y + v.g.y).setRotation(rot);
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
    const name = d.mode === 'daily' ? t('dailyTitle', { n: dailyNumber(d.date) })
      : d.n <= CAMPAIGN_LEVELS ? t('chapter_' + chapterKey(chapterOf(d.n))) : t('endless');
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
      const g = this.add.graphics();
      card(g, 28, 160, 304, 360, 30);
      icon(this, 'cafe', 76, 212, 62);
      const nt = txt(this, 200, 212, name, 26).setWordWrapWidth(180, true);
      if (nt.height > 70) nt.setScale(70 / nt.height);
      this.levelPill(180, 282, 250, lvl);
      this.fishChip = chip(this, 180, 408, 150, 'fish', () => String(save.fish + this.earned));
      if (d.mode === 'level') pawBar(this, 196, 346, 210, Math.max(0, stepOf(d.n) - 1), CHAPTER_LEN);
      this.pawIcons = [0, 1, 2].map((i) => icon(this, 'paw', 180 + (i - 1) * 54, 474, 46));
      roundBtn(this, 76, 600, 86, S.purpleBtn, S.purpleLip, 'map', () => this.leave());
      roundBtn(this, 180, 600, 86, S.pink, S.pinkLip, '↻', restart);
      hintX = 284;
      hintY = 600;
      // Scratchy hangs around on the right and reacts to the board
      this.mascot = art(this, 'scratchy_idle', W - 128, H + 6, 300, 330)?.setOrigin(0.5, 1) ?? undefined;
      if (this.mascot) this.tweens.add({ targets: this.mascot, y: H + 18, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    } else {
      roundBtn(this, 66, 70, 84, S.purpleBtn, S.purpleLip, 'map', () => this.leave());
      this.levelPill(W / 2, 70, 270, lvl);
      this.fishChip = chip(this, W - 100, 70, 150, 'fish', () => String(save.fish + this.earned));
      const nt = title(this, W / 2, 138, name, 24);
      if (nt.width > 380) nt.setScale(380 / nt.width);
      if (d.mode === 'level') pawBar(this, W / 2 - 50, 194, 260, Math.max(0, stepOf(d.n) - 1), CHAPTER_LEN);
      this.pawIcons = [0, 1, 2].map((i) => icon(this, 'paw', W - 150 + i * 44, 194, 40));
      roundBtn(this, W / 2 - 120, H - 110, 96, S.pink, S.pinkLip, '↻', restart);
      hintX = W / 2 + 40;
      hintY = H - 110;
    }
    if (d.mode === 'daily') {
      const tx = land ? 180 : W / 2 - 50;
      const ty = land ? 346 : 194;
      icon(this, 'clock', tx - 70, ty, 34);
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

  /** Violet "LEVEL 8" plate. */
  private levelPill(x: number, y: number, w: number, label: string) {
    const g = this.add.graphics();
    g.fillStyle(C.inkN, 1).fillRoundedRect(x - w / 2 - 3, y - 29, w + 6, 64, 30);
    g.fillStyle(S.purpleLip, 1).fillRoundedRect(x - w / 2, y - 26 + 5, w, 52, 26);
    g.fillStyle(S.purpleBtn, 1).fillRoundedRect(x - w / 2, y - 26, w, 52, 26);
    const tt = title(this, x, y - 1, label.toUpperCase(), 28);
    if (tt.width > w - 30) tt.setScale((w - 30) / tt.width);
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
    const bw = land ? 300 : W - 40;
    const bh = land ? 300 : 150;
    const home = land ? { x: 180, y: 340 } : { x: W / 2, y: 92 };
    const c = this.add.container(home.x, land ? H + 200 : -140).setDepth(60);
    const g = this.add.graphics();
    card(g, -bw / 2, -bh / 2, bw, bh, 26);
    const ix = land ? 0 : -bw / 2 + 75;
    const iy = land ? -bh / 2 + 62 : 5;
    const ic = k === 'scratchy' ? art(this, 'scratchy_warn', ix, iy, land ? 100 : 120, land ? 100 : 120) : null;
    const iconName = ({ hint: 'hint', sleepy: 'sleep', kitten: 'family', boxes: 'box', hard: 'star', daily: 'daily' } as Record<string, string>)[k];
    const im = ic ?? (iconName ? icon(this, iconName as never, ix, iy, land ? 80 : 96) : null);
    const tx = txt(this, land ? 0 : 40, land ? 10 : -28, t(`tip_${k}_t`), land ? 26 : 30);
    const body = txt(this, land ? 0 : 40, land ? 80 : 22, t(`tip_${k}`), 20, C.muted).setWordWrapWidth(land ? bw - 30 : W - 230, true);
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
    const res = this.board.check(id);
    const d = headDir(v.cat);
    const g = this.add.graphics().setDepth(4);
    const h = v.cat.cells[0];
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
    if (!v.awake) return this.wake(v);
    const res = this.board.check(id);
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
    this.tweens.add({ targets: [v.g, v.head].filter(Boolean), y: '-=8', duration: 110, yoyo: true, repeat: 1 });
  }

  private exit(v: CatView, steps: number) {
    this.taps.push('exit');
    const cat = v.cat;
    const kittens = this.board.remove(cat.id);
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
      onUpdate: () => this.redraw(v, this.pointsAt(tr, len, Math.max(0, o.s))),
      onComplete: () => this.gone(v),
    });
    v.mark?.destroy();
    v.mark = undefined;
    for (const k of kittens) {
      const kv = this.views.get(k);
      if (!kv) continue;
      this.time.delayedCall(250, () => {
        sfx.kitten();
        this.tweens.add({ targets: [kv.g, kv.head].filter(Boolean), y: '-=10', duration: 120, yoyo: true, repeat: 1 });
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
    v.acc?.destroy();
    v.mark?.destroy();
    this.views.delete(v.cat.id);
    if (v.cat.breed !== SCRATCHY) this.rescued.push(v.cat.breed);
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
    if (bv) this.tweens.add({ targets: [bv.g, bv.head].filter(Boolean), x: '+=5', duration: 50, yoyo: true, repeat: 3 });
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
    this.countBlocked();
    sfx.bonk();
    const len = v.cat.cells.length;
    const tr = this.trajectory(v.cat, steps + 1);
    const o = { s: 0 };
    this.tweens.add({
      targets: o, s: steps + 0.35, duration: 80 + steps * 30, ease: 'Sine.InOut', yoyo: true,
      onUpdate: () => this.redraw(v, this.pointsAt(tr, len, o.s)),
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

  /** Kitten tapped while its mother is still on the board: it mews and looks at her. */
  private kittenWait(v: CatView, mother: number) {
    this.taps.push('bonk');
    this.countBlocked();
    sfx.meow(1.5);
    this.tweens.add({ targets: [v.g, v.head].filter(Boolean), y: '-=6', duration: 90, yoyo: true, repeat: 1 });
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
    const free = this.board.freeCats().map((id) => this.views.get(id)!).filter((v) => v && !v.busy && !v.hint);
    const sleepers = [...this.views.values()].filter((v) => !v.awake && !v.busy && this.board.check(v.cat.id).free);
    const v = free[0] ?? sleepers[0];
    if (!v) return;
    if (this.freeHint) this.freeHint = false;
    else if (!this.spend(COST.hint)) return toast(this, t('noFish'));
    v.hint = true;
    this.redraw(v);
    sfx.hint();
    this.tweens.add({ targets: v.g, alpha: 0.55, duration: 250, yoyo: true, repeat: 3 });
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
    this.time.delayedCall(350, () => this.result(paws, total, lines));
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
