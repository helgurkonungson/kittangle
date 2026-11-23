import Phaser from 'phaser';
import { tipOnce } from './tips';
import { COLLECTIBLE, BREEDS } from '../core/content';
import { setComplete, SETS } from '../core/live';
import { rewardText } from '../core/retention';
import { t } from '../i18n';
import { drawCat } from './drawCat';
import { art } from './art';
import { addFriendship, canTreat, FRIEND_MAX, friendLevel, friendProgress, friendReward, TREAT } from '../core/friend';
import { utcDate } from '../core/levels';
import { sfx } from './sfx';
import { grant, persist, platform, save } from './state';
import { C, isLand, modal, toast, txt, W, H, fitCamera } from './ui';
import { candy, chip, ribbon, roundBtn, S, stage, title } from './style';
import { icon } from './icons';
import { mix } from './drawCat';

const CARD_COLORS = [0xffd84a, 0x5cc8ff, 0xa778ff, 0x5fe0e6, 0xff8fc4, 0xffc23d, 0x8fe36d, 0xff9f5a];

/** Album: 3 sets of 4 breeds with set rewards; tap an owned cat to choose its accessory. */
export class CollectionScene extends Phaser.Scene {
  constructor() {
    super('Collection');
  }

  private msg = '';
  init(d: { msg?: string }) {
    this.msg = d?.msg ?? '';
  }

  create() {
    fitCamera(this);
    this.time.delayedCall(350, () => tipOnce(this, 'collection'));
    if (this.msg) this.time.delayedCall(50, () => toast(this, this.msg, H - 80));
    const land = isLand();
    stage(this, { bokeh: 10 });
    roundBtn(this, 56, 56, 76, S.pink, S.pinkLip, 'back', () => this.scene.start('Map'));
    ribbon(this, W / 2, 58, land ? 520 : 440, t('collection').toUpperCase(), 'collection', 30);
    chip(this, W - (land ? 110 : 80), 58, land ? 150 : 120, '', () => `${save.breeds.filter((b) => b < COLLECTIBLE).length} / ${COLLECTIBLE}`);

    const cw = land ? 196 : 152;
    const chh = land ? 172 : 214;
    const gap = land ? 18 : 14;
    const top = land ? 130 : 150;
    const rowH = land ? 196 : 322;
    const gx = land ? 330 : W / 2 - (cw * 4 + gap * 3) / 2;
    SETS.forEach((set, si) => {
      const y0 = top + si * rowH;
      const done = setComplete(set.breeds, save.breeds);
      const claimed = save.setsClaimed.includes(set.key);
      // set label: left column in landscape, a line above the row in portrait
      const lx = land ? 165 : gx;
      const ly = land ? y0 + chh / 2 - 22 : y0 + 18;
      const lt = title(this, lx, ly, t('set_' + set.key), 26).setOrigin(land ? 0.5 : 0, 0.5);
      if (lt.width > 260) lt.setScale(260 / lt.width);
      const rx = land ? 165 : W - gx;
      const ry = land ? y0 + chh / 2 + 26 : y0 + 18;
      if (done && !claimed) {
        candy(this, land ? rx : rx - 120, ry, 240, 54, t('setClaim', { r: rewardText(set.reward) }), () => {
          save.setsClaimed.push(set.key);
          grant(set.reward);
          sfx.chest();
          platform.track('set_claim', { set: set.key });
          this.scene.restart();
        }, '', S.yellow, S.yellowLip);
      } else title(this, rx, ry, claimed ? t('setDone') : rewardText(set.reward), 22, claimed ? '#b8f52f' : '#ffe8f6').setOrigin(land ? 0.5 : 1, 0.5);
      set.breeds.forEach((b, i) => this.card(b, gx + cw / 2 + i * (cw + gap), y0 + (land ? 0 : 42) + chh / 2, cw, chh, si * 4 + i));
    });

    title(this, W / 2, H - (land ? 24 : 70), t('friendHint'), 18).setWordWrapWidth(W - 80, true);
  }

  /** Bright card: colored burst background and the portrait; locked = violet silhouette with a lock. */
  private card(b: number, cx: number, cy: number, w: number, h: number, k: number) {
    const breed = BREEDS[b];
    const have = save.breeds.includes(b);
    const g = this.add.graphics();
    const col = breed.rare ? 0xffd23f : CARD_COLORS[k % CARD_COLORS.length];
    const x = cx - w / 2;
    const y = cy - h / 2;
    g.fillStyle(C.inkN, 1).fillRoundedRect(x - 4, y - 4, w + 8, h + 14, 26);
    g.fillStyle(have ? mix(col, 0x39243f, 0.25) : 0x7a5aa6, 1).fillRoundedRect(x, y + 6, w, h, 22);
    g.fillStyle(have ? col : 0xb79cf0, 1).fillRoundedRect(x, y, w, h, 22);
    // sun-burst rays and sparkles behind the portrait
    g.fillStyle(0xffffff, have ? 0.22 : 0.12);
    for (let r = 0; r < 8; r++) {
      const a = (r / 8) * Math.PI * 2;
      g.fillTriangle(cx, cy - 6, cx + Math.cos(a - 0.15) * w, cy - 6 + Math.sin(a - 0.15) * w, cx + Math.cos(a + 0.15) * w, cy - 6 + Math.sin(a + 0.15) * w);
    }
    const mask = this.make.graphics({}, false).fillRoundedRect(x, y, w, h, 22).createGeometryMask();
    g.setMask(mask);
    const ps = Math.min(w, h) * 0.95;
    const im = art(this, `portrait_${breed.key}`, cx, cy + (have ? -4 : 4), ps, ps);
    if (have) {
      if (!im) drawCat(this.add.graphics(), [{ x: cx + 25, y: cy - 10 }, { x: cx - 25, y: cy - 10 }], b, 72, 'happy', false, save.equipped[b]);
      const nm = title(this, cx, y + h - 22, t('breed_' + breed.key), 20);
      if (nm.width > w - 16) nm.setScale((w - 16) / nm.width);
      const pts = save.friend[b] ?? 0;
      const lv = friendLevel(pts);
      title(this, x + 26, y + 22, `♥${lv}`, 18, lv >= FRIEND_MAX ? '#ffd84a' : '#ffffff');
      if (canTreat(save.friendTreat, b, utcDate())) txt(this, x + w - 24, y + 22, '🐟', 24);
      const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.cardMenu(b));
      void friendProgress;
    } else {
      im?.setTintFill(0x7a52c7).setAlpha(0.9);
      icon(this, 'lock', cx, cy + 10, Math.min(w, h) * 0.32);
    }
    if (breed.rare) title(this, x + w - 22, y + 22, '★', 26, '#ffd84a');
  }

  /** Card menu: daily fish treat (fish sink, grows friendship) or accessory. */
  private cardMenu(b: number) {
    const name = t('breed_' + BREEDS[b].key);
    const today = utcDate();
    const can = canTreat(save.friendTreat, b, today);
    const close = modal(this, name, [t('treatText', { p: TREAT.points })], [
      {
        label: can ? t('treatBtn', { n: TREAT.cost, p: TREAT.points }) : t('treatDone'),
        color: C.green,
        disabled: !can,
        onClick: () => {
          if (!can) return;
          if (save.fish < TREAT.cost) return toast(this, t('noFish'), 1150);
          save.fish -= TREAT.cost;
          save.friendTreat[b] = today;
          let msg = t('treatThanks', { name, p: TREAT.points });
          for (const [, lv] of addFriendship(save.friend, [b], TREAT.points)) {
            const r = friendReward(lv);
            save.fish += r.fish;
            save.stars += r.stars;
            msg = t('friendUp', { name, n: lv, r: r.fish + ' 🐟' + (r.stars ? ` +${r.stars} ⭐` : '') });
          }
          persist();
          sfx.star();
          close();
          this.scene.restart({ msg });
        },
      },
      { label: t('chooseAccessory'), color: C.blue, onClick: () => { close(); this.pickAccessory(b); } },
    ], true);
  }

  private pickAccessory(b: number) {
    if (!save.accessories.length) return toast(this, `${t('chooseAccessory')}: 🐾 ${t('event')}`, 1150);
    const close = modal(this, t('chooseAccessory'), [], [
      ...save.accessories.map((a) => ({
        label: (save.equipped[b] === a ? '✓ ' : '') + t('acc_' + a),
        color: C.blue,
        onClick: () => {
          save.equipped[b] = a;
          persist();
          close();
          this.scene.restart();
        },
      })),
      {
        label: t('none'), color: C.gray,
        onClick: () => {
          delete save.equipped[b];
          persist();
          close();
          this.scene.restart();
        },
      },
    ], true);
  }
}
