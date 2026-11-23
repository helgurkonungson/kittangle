import { sittingCat } from './art';
import Phaser from 'phaser';
import { tipOnce } from './tips';
import { ACCESSORIES, eventAt, SEASON_WEEKS, TRACK, TROPHY_ICON, TROPHIES } from '../core/live';
import { utcDate } from '../core/levels';
import { rewardText } from '../core/retention';
import { t } from '../i18n';
import { save } from './state';
import { C, txt, W, portraitColumn } from './ui';
import { card, chip, ribbon, roundBtn, S, stage, title } from './style';

/** Weekly event track + season progress. Rewards are paid automatically when paws reach a step. */
export class EventScene extends Phaser.Scene {
  constructor() {
    super('Event');
  }

  create() {
    portraitColumn(this);
    this.time.delayedCall(350, () => tipOnce(this, 'event'));
    const e = eventAt(utcDate());
    const cur = save.event.id === e.id;
    const paws = cur ? save.event.paws : 0;
    const claimed = cur ? save.event.claimed : 0;
    const tracks = save.season.id === e.season ? save.season.tracks : 0;
    const acc = ACCESSORIES[e.week];
    const trophy = TROPHIES[e.week];

    stage(this, { bokeh: 14 });
    roundBtn(this, 60, 64, 84, S.purpleBtn, S.purpleLip, 'back', () => this.scene.start('Map'));
    ribbon(this, W / 2 + 30, 64, 440, t('event').toUpperCase(), 'gift', 26);
    title(this, W / 2, 150, t('eventTitle', { name: t('acc_' + acc) }), 30);
    chip(this, W / 2 - 120, 206, 190, 'paw', () => String(paws));
    chip(this, W / 2 + 130, 206, 210, '', () => t('eventDays', { n: e.daysLeft }));
    title(this, W / 2, 262, t('eventHow'), 20, '#ffe8f6');

    const max = TRACK[TRACK.length - 1].paws;
    const g = this.add.graphics();
    const fill = Math.min(1, paws / max);
    g.fillStyle(C.inkN, 1).fillRoundedRect(107, 327, 36, 736, 18);
    g.fillStyle(0x4b2a86, 1).fillRoundedRect(110, 330, 30, 730, 15);
    if (fill > 0) g.fillStyle(S.yellow, 1).fillRoundedRect(110, 330 + 730 * (1 - fill), 30, 730 * fill, 15);
    TRACK.forEach((st, i) => {
      const y = 1060 - (680 * st.paws) / max;
      const done = i < claimed;
      card(g, 180, y - 46, 470, 88, 24, done ? 0xe6f9cf : S.cream, done ? 0x8fcf6f : S.lavDeep);
      g.fillStyle(C.inkN, 1).fillCircle(125, y, 29);
      g.fillStyle(done ? S.yellow : S.lav, 1).fillCircle(125, y, 26);
      txt(this, 125, y, String(st.paws), 20);
      const label = st.reward
        ? rewardText(st.reward)
        : st.trophy
          ? `${TROPHY_ICON[trophy]} ${t('trophy_' + trophy)}`
          : `🎩 ${t('acc_' + acc)}`;
      txt(this, 415, y - 2, (done ? '✓ ' : '') + label, 28);
    });

    const fg = this.add.graphics();
    card(fg, 30, 1100, W - 60, 150, 30);
    txt(this, W / 2 + 60, 1140, t('seasonTitle', { n: tracks }), 24);
    sittingCat(this, 11, 120, 1175, 120).setAlpha(tracks >= SEASON_WEEKS ? 1 : 0.6);
    txt(this, W / 2 + 60, 1200, t('seasonPrize'), 24, '#b0700a');
  }
}
