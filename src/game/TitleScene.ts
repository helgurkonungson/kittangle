import Phaser from 'phaser';
import { BREEDS, SCRATCHY } from '../core/content';
import { utcDate } from '../core/levels';
import { DAILY_FROM_LEVEL } from '../core/tutorial';
import { t } from '../i18n';
import { art, has, headKey } from './art';
import { drawCat, Mood } from './drawCat';
import { playMusic, sfx } from './sfx';
import { platform, save } from './state';
import { candy, chip, roundBtn, S, stage, title } from './style';
import { H, isLand, toast, W } from './ui';

type Pt = { x: number; y: number };
interface Mover {
  path: Pt[];
  len: number;
  s: number;
  speed: number;
  breed: number;
  mood: Mood;
  g: Phaser.GameObjects.Graphics;
  head?: Phaser.GameObjects.Image;
}

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/**
 * Main menu with a living background: stretchy cats wander across the violet stage, a tap on a cat
 * makes it meow and dash, a tap on empty space leaves paw prints, Scratchy peeks from the corner.
 * First-time players skip it and land straight in level 1 (GDD 2.0 §4).
 */
export class TitleScene extends Phaser.Scene {
  private movers: Mover[] = [];
  private cs = 90;
  private layer!: Phaser.GameObjects.Container;
  private scratchy?: Phaser.GameObjects.Image;

  constructor() {
    super('Title');
  }

  create() {
    platform.ready();
    this.movers = [];
    this.cs = Math.round(Math.min(W, H) / 8);
    stage(this, { bokeh: 22 });
    this.layer = this.add.container(0, 0).setDepth(2);
    playMusic('music_menu');

    // the interactive background catches taps that miss the buttons
    const bg = this.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(p.x, p.y));

    // Scratchy peeks from the bottom-right corner and reacts to taps on him
    this.scratchy = art(this, 'scratchy_idle', W - 120, H + 10, isLand() ? 300 : 260, isLand() ? 300 : 260)?.setOrigin(0.5, 1).setDepth(5) ?? undefined;
    if (this.scratchy) {
      this.scratchy.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.poke());
      this.tweens.add({ targets: this.scratchy, y: H + 22, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    this.menu();
    for (let i = 0; i < 3; i++) this.time.delayedCall(i * 700, () => this.spawn());
    this.time.addEvent({ delay: 2300, loop: true, callback: () => this.movers.length < 6 && this.spawn() });
  }

  update(_t: number, dt: number) {
    for (const m of [...this.movers]) {
      m.s += (m.speed * dt) / 1000;
      if (m.s >= m.path.length - 1) {
        m.g.destroy();
        m.head?.destroy();
        this.movers.splice(this.movers.indexOf(m), 1);
        continue;
      }
      this.draw(m);
    }
  }

  private menu() {
    const land = isLand();
    const cx = W / 2;
    const logoY = land ? 170 : 300;
    const logo = art(this, 'logo', cx, logoY, land ? 620 : 640, land ? 300 : 340)?.setDepth(10);
    if (logo) this.tweens.add({ targets: logo, scale: logo.scale * 1.04, angle: { from: -1.2, to: 1.2 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    else title(this, cx, logoY, 'Kittangle', 110, '#ffd84a').setDepth(10);
    title(this, cx, logoY + (land ? 150 : 175), t('tagline'), land ? 28 : 30).setDepth(10);

    const playY = land ? 470 : 760;
    const play = candy(this, cx, playY, 440, 116, t('play', { n: save.level }), () => {
      sfx.node();
      this.scene.start('Level', { mode: 'level', n: save.level });
    }).setDepth(10);
    this.tweens.add({ targets: play, scale: 1.04, duration: 850, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    const today = utcDate();
    const items: [string, number, number, () => void][] = [
      ['map', S.purpleBtn, S.purpleLip, () => this.scene.start('Map')],
      ['cafe', S.pink, S.pinkLip, () => this.scene.start('Cafe')],
      ['collection', 0x22c3e6, 0x1590a8, () => this.scene.start('Collection')],
      ['daily', S.yellow, S.yellowLip, () => {
        if (save.level < DAILY_FROM_LEVEL) return toast(this, t('dailyLocked', { n: DAILY_FROM_LEVEL - 1 }));
        this.scene.start('Level', { mode: 'daily', date: today });
      }],
    ];
    const rowY = playY + (land ? 130 : 150);
    items.forEach(([ic, col, lip, fn], i) => {
      const x = cx + (i - 1.5) * 128;
      roundBtn(this, x, rowY, 100, col, lip, ic, fn).setDepth(10);
      title(this, x, rowY + 72, t(ic === 'daily' ? 'dailyShort' : ic), 22).setDepth(10);
    });
    chip(this, W - 110, 52, 170, 'fish', () => String(save.fish)).c.setDepth(10);
  }

  /** Random walk across the screen on a coarse grid: from one edge to another, a few turns. */
  private spawn() {
    const cs = this.cs;
    const cols = Math.ceil(W / cs);
    const rows = Math.ceil(H / cs);
    const side = Phaser.Math.Between(0, 3);
    let d = (side + 2) % 4; // walk inward
    let x = side === 1 ? cols + 1 : side === 3 ? -2 : Phaser.Math.Between(1, cols - 2);
    let y = side === 0 ? -2 : side === 2 ? rows + 1 : Phaser.Math.Between(1, rows - 2);
    const len = Phaser.Math.Between(3, 6);
    const cells: Pt[] = [];
    // tail starts outside the screen: prepend the cells behind the start
    for (let i = len; i > 0; i--) cells.push({ x: x - DX[d] * i, y: y - DY[d] * i });
    for (let step = 0; step < 80; step++) {
      cells.push({ x, y });
      const inside = x >= 0 && y >= 0 && x < cols && y < rows;
      if (!inside && step > 4) {
        for (let i = 1; i <= len + 1; i++) cells.push({ x: x + DX[d] * i, y: y + DY[d] * i });
        break;
      }
      if (inside && step > 1 && Math.random() < 0.22) d = (d + (Math.random() < 0.5 ? 1 : 3)) % 4;
      x += DX[d];
      y += DY[d];
    }
    const pool = save.breeds.length ? save.breeds : [0, 1];
    const breed = Math.random() < 0.1 ? SCRATCHY : pool[Phaser.Math.Between(0, pool.length - 1)];
    const m: Mover = {
      path: cells.map((c) => ({ x: (c.x + 0.5) * cs, y: (c.y + 0.5) * cs })),
      len, s: 0, speed: 1.6 + Math.random() * 1.2, breed, mood: 'calm', g: this.add.graphics().setAlpha(0.95),
    };
    this.layer.add(m.g);
    this.movers.push(m);
  }

  private points(m: Mover) {
    const out: Pt[] = [];
    for (let j = 0; j < m.len; j++) {
      const k = m.s + (m.len - 1 - j);
      const i = Math.min(Math.floor(k), m.path.length - 1);
      const f = k - i;
      const a = m.path[i];
      const b = m.path[Math.min(i + 1, m.path.length - 1)];
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    }
    return out;
  }

  private draw(m: Mover) {
    const p = this.points(m);
    const key = headKey(this, BREEDS[m.breed].key, m.mood);
    const useArt = has(this, key);
    drawCat(m.g, p, m.breed, this.cs * 0.9, m.mood, false, undefined, useArt);
    if (!useArt) return;
    if (!m.head) {
      m.head = this.add.image(0, 0, key);
      this.layer.add(m.head);
    }
    const rot = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x) + Math.PI / 2;
    m.head.setTexture(key).setDisplaySize(this.cs * 0.95, this.cs * 0.95).setPosition(p[0].x, p[0].y).setRotation(rot);
  }

  private tap(x: number, y: number) {
    const hit = this.movers.find((m) => this.points(m).some((q) => Math.hypot(q.x - x, q.y - y) < this.cs * 0.55));
    if (hit) {
      hit.mood = 'happy';
      hit.speed = 7;
      sfx.meow(0.9 + Math.random() * 0.4);
      this.burst(x, y, '💗');
      return;
    }
    sfx.pop();
    this.burst(x, y, '🐾');
  }

  /** a few paw prints / hearts pop around the tap */
  private burst(x: number, y: number, ch: string) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random();
      const o = this.add.text(x, y, ch, { fontSize: '34px' }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: o, x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70, alpha: 0, scale: 1.4,
        duration: 650, ease: 'Cubic.Out', onComplete: () => o.destroy(),
      });
    }
  }

  private poke() {
    const sc = this.scratchy;
    if (!sc || sc.getData('busy')) return;
    sc.setData('busy', true);
    sfx.scratchySwipe();
    sc.setTexture(has(this, 'scratchy_swipe') ? 'scratchy_swipe' : sc.texture.key);
    const fx = art(this, `fx_scratch_${Phaser.Math.Between(0, 5)}`, sc.x - 160, sc.y - 220, 260, 260)?.setDepth(30);
    if (fx) this.tweens.add({ targets: fx, alpha: 0, delay: 350, duration: 400, onComplete: () => fx.destroy() });
    this.cameras.main.shake(100, 0.004);
    this.time.delayedCall(700, () => {
      if (has(this, 'scratchy_smug')) sc.setTexture('scratchy_smug');
      sfx.scratchySmug();
    });
    this.time.delayedCall(1600, () => {
      if (has(this, 'scratchy_idle')) sc.setTexture('scratchy_idle');
      sc.setData('busy', false);
    });
  }
}
