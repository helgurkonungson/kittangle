import Phaser from 'phaser';
import { utcDate } from '../core/levels';
import { DAILY_FROM_LEVEL } from '../core/tutorial';
import { t } from '../i18n';
import { art, has } from './art';
import { playMusic, sfx } from './sfx';
import { platform, save } from './state';
import { candy, chip, roundBtn, S, stage, title } from './style';
import { fitCamera, H, isLand, RES, toast, W } from './ui';

type Img = Phaser.GameObjects.Image;

/**
 * Main menu: the café room (art4) with three living cats. The white cat watches the window and wags
 * her tail, the gray and the calico breathe in their sleep, the ginger lies on the rug and bats a yarn
 * ball. A tap on a cat makes it react; a tap elsewhere leaves paw prints.
 * First-time players skip it and land straight in level 1 (GDD 2.0 §4).
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    fitCamera(this);
    platform.ready();
    playMusic('music_menu');
    const land = isLand();
    const room = has(this, land ? 'room_land' : 'room_port') ? (land ? 'room_land' : 'room_port') : '';
    // the room is toned down a little so the menu reads as the foreground
    if (room) art(this, room, W / 2, H / 2, W, H, true)?.setTint(0xd8cce4);
    else stage(this, { bokeh: 22 });

    const bg = this.add.zone(0, 0, W, H).setOrigin(0).setInteractive();
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => this.paws(p.worldX, p.worldY));
    if (room) this.cats(land);
    this.menu(land);
  }

  // ---------- the living room ----------

  private cats(land: boolean) {
    // positions are tuned to the two room pictures (screen units after the cover fit)
    const P = land
      ? { white: [600, 338, 175], tree: [210, 205, 112], sofa: [668, 508, 128], rug: [560, 640, 240] }
      : { white: [420, 552, 122], tree: [86, 492, 92], sofa: [462, 818, 118], rug: [250, 928, 205] };

    // white cat on the windowsill, seen from behind; the tail sways from its base
    const [wx, wy, wh] = P.white;
    const white = this.piece('menu_white_back', wx, wy, wh, 0.5, 1);
    if (white) {
      const tail = this.piece('menu_white_tail', wx + white.displayWidth * 0.2, wy - white.displayHeight * 0.13, wh * 0.62, 0.45, 0.97);
      if (tail) {
        tail.setDepth(white.depth + 1);
        this.tweens.add({ targets: tail, angle: { from: -9, to: 13 }, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        // now and then a quick flick
        this.time.addEvent({ delay: 4200, loop: true, callback: () => this.tweens.add({ targets: tail, scaleY: tail.scaleY * 1.08, duration: 160, yoyo: true }) });
      }
      this.tweens.add({ targets: white, scaleY: white.scaleY * 1.012, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tappable(white, () => this.tweens.add({ targets: white, angle: { from: -3, to: 3 }, duration: 90, yoyo: true, repeat: 2, onComplete: () => white.setAngle(0) }));
    }

    // two sleepers breathing out of phase, with drifting z's
    const sleeper = (key: string, [x, y, w]: number[], period: number, delay: number) => {
      const im = this.piece(key, x, y, w, 0.5, 1);
      if (!im) return;
      this.tweens.add({ targets: im, scaleY: im.scaleY * 1.05, scaleX: im.scaleX * 1.015, duration: period, delay, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.time.addEvent({ delay: period * 2, startAt: delay, loop: true, callback: () => this.zzz(x + im.displayWidth * 0.25, y - im.displayHeight * 0.85) });
      this.tappable(im, () => this.tweens.add({ targets: im, y: y - 14, duration: 120, yoyo: true, ease: 'Quad.Out' }));
    };
    sleeper('menu_gray_sleep', P.sofa, 1700, 0);
    sleeper('menu_calico_sleep', P.tree, 1500, 600);

    // ginger on her back: the raised paw bats the yarn ball
    const [gx, gy, gw] = P.rug;
    const paw = this.piece('menu_ginger_paw', 0, 0, gw * 0.3, 0.5, 0.93);
    const ginger = this.piece('menu_ginger_play', gx, gy, gw, 0.5, 0.5, true);
    if (ginger && paw) {
      // the paw grows out of the stump on the chest (sprite point 0.453, 0.5) and is drawn in front of it
      const sx = gx + (0.453 - 0.5) * ginger.displayWidth;
      const sy = gy + (0.53 - 0.5) * ginger.displayHeight;
      paw.setPosition(sx, sy).setAngle(-25).setDepth(ginger.depth + 1);
      const yarn = this.piece('menu_yarn', sx - gw * 0.2, sy - gw * 0.42, gw * 0.3, 0.5, 0.5);
      const fish = this.piece('menu_fish', gx + gw * 0.55, gy + gw * 0.12, gw * 0.3, 0.5, 0.5);
      fish?.setAngle(-14);
      const yx = yarn?.x ?? 0;
      const yy = yarn?.y ?? 0;
      const bat = (hard = false) => {
        // every bat starts from the rest pose, so fast taps never walk the ball away
        this.tweens.killTweensOf(paw);
        paw.setAngle(-25);
        this.tweens.add({ targets: paw, angle: 18, duration: hard ? 140 : 220, yoyo: true, ease: 'Quad.Out' });
        if (!yarn) return;
        this.tweens.killTweensOf(yarn);
        yarn.setPosition(yx, yy);
        this.tweens.add({
          targets: yarn, y: yy - (hard ? 60 : 30), angle: yarn.angle + (hard ? 200 : 90), duration: hard ? 260 : 300,
          delay: 120, yoyo: true, ease: 'Quad.Out', onComplete: () => yarn.setPosition(yx, yy),
        });
      };
      this.time.addEvent({ delay: 1900, loop: true, callback: () => bat() });
      this.tweens.add({ targets: ginger, angle: { from: -2, to: 2 }, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.tappable(ginger, () => bat(true));
      if (yarn) this.tappable(yarn, () => bat(true));
    }
  }

  /** Image with its height (or width) fitted, origin given; null without the art. */
  private piece(key: string, x: number, y: number, size: number, ox: number, oy: number, byWidth = false): Img | null {
    if (!has(this, key)) return null;
    const im = this.add.image(x, y, key).setOrigin(ox, oy).setDepth(2);
    im.setScale(size / (byWidth ? im.width : im.height));
    return im;
  }

  private tappable(im: Img, react: () => void) {
    im.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 40 }).on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.meow(0.85 + Math.random() * 0.4);
      react();
      this.burst(p.worldX, p.worldY, '💗');
    });
  }

  private zzz(x: number, y: number) {
    const z = this.add.text(x, y, 'z', { fontFamily: 'Nunito, sans-serif', fontStyle: '900', fontSize: '30px', color: '#ffffff', stroke: '#7957f5', strokeThickness: 6, resolution: RES })
      .setOrigin(0.5).setDepth(3).setAlpha(0);
    this.tweens.add({ targets: z, alpha: { from: 0, to: 1 }, duration: 400, yoyo: true, hold: 600 });
    this.tweens.add({ targets: z, x: x + 26, y: y - 60, scale: 1.4, duration: 1400, onComplete: () => z.destroy() });
  }

  private paws(x: number, y: number) {
    sfx.pop();
    this.burst(x, y, '🐾');
  }

  /** a few paw prints / hearts pop around the tap */
  private burst(x: number, y: number, ch: string) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random();
      const o = this.add.text(x, y, ch, { fontSize: '34px', resolution: RES }).setOrigin(0.5).setDepth(20);
      this.tweens.add({
        targets: o, x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70, alpha: 0, scale: 1.4,
        duration: 650, ease: 'Cubic.Out', onComplete: () => o.destroy(),
      });
    }
  }

  // ---------- menu ----------

  /** Dark violet rounded plate behind menu items (contrast over the picture). */
  private plate(x: number, y: number, w: number, h: number, r: number, a: number) {
    this.add.graphics().setDepth(8)
      .fillStyle(0x2a1250, a).fillRoundedRect(x - w / 2, y - h / 2, w, h, r)
      .lineStyle(4, 0xffffff, 0.55).strokeRoundedRect(x - w / 2, y - h / 2, w, h, r);
  }

  private menu(land: boolean) {
    // landscape: a column on the right (over the counter), portrait: logo on top, buttons on the floor
    const cx = land ? 1030 : W / 2;
    const logoY = land ? 160 : 232;
    const logo = art(this, 'logo', cx, logoY, land ? 470 : 500, land ? 290 : 330)?.setDepth(10);
    if (logo) this.tweens.add({ targets: logo, scale: logo.scale * 1.03, angle: { from: -1, to: 1 }, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    else title(this, cx, logoY, 'Kittangle', 100, '#ffd84a').setDepth(10);
    const tag = title(this, cx, logoY + (land ? 168 : 188), t('tagline'), land ? 26 : 28).setDepth(11);
    tag.setStroke('#39243f', 8);
    this.plate(cx, tag.y, tag.width + 44, 50, 25, 0.82);

    const playY = land ? 450 : 1058;
    const play = candy(this, cx, playY, land ? 400 : 440, land ? 104 : 112, t('play', { n: save.level }), () => {
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
    const rowY = playY + (land ? 125 : 112);
    const step = land ? 108 : 124;
    // a violet plate under the buttons separates them from the busy room
    const top = playY - (land ? 76 : 82);
    const bottom = rowY + (land ? 88 : 92);
    this.plate(cx, (top + bottom) / 2, land ? 470 : 560, bottom - top, 40, 0.78);
    items.forEach(([ic, col, lip, fn], i) => {
      const x = cx + (i - 1.5) * step;
      const d = land ? 88 : 96;
      this.add.circle(x, rowY + 2, d / 2 + 7, 0xffffff, 0.95).setDepth(9);
      roundBtn(this, x, rowY, d, col, lip, ic, fn).setDepth(10);
      const l = title(this, x, rowY + (land ? 62 : 64), t(ic === 'daily' ? 'dailyShort' : ic), 21).setDepth(10);
      l.setStroke('#39243f', 7);
    });
    chip(this, land ? 110 : W - 110, 52, 170, 'fish', () => String(save.fish)).c.setDepth(10);
  }
}
