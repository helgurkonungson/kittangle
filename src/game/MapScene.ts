import Phaser from 'phaser';
import {
  CAMPAIGN_LEVELS, CHAPTER_LEN, chapterKey, chapterOf, getLevel, isHard, isMilestone, LESSON, utcDate,
} from '../core/levels';
import { CALENDAR, claimCalendar, rewardText, streakState } from '../core/retention';
import { nextTask } from '../core/meta';
import { DAILY_FROM_LEVEL } from '../core/tutorial';
import { t } from '../i18n';
import { playMusic, setMusicOff, setMuted, sfx } from './sfx';
import { grant, persist, platform, save } from './state';
import { badge, button, C, DIM, isLand, modal, panel, toast, txt, W, H, fitCamera } from './ui';
import { blurredBackdrop, candy, chip, leaves, pawBar, ribbon, roundBtn, S, title } from './style';
import { icon, IconName } from './icons';
import { challenge, challengeOffered, markChallengeOffered } from './share';
import { fmtTime } from '../core/share';

const LESSON_AT = new Map<number, IconName>([
  [LESSON.scratchy, 'scratchy'], [LESSON.sleepy, 'sleep'], [LESSON.kitten, 'family'], [LESSON.moony, 'star'], [LESSON.boxes, 'box'],
]);

/**
 * Chapter map (GDD 2.0 §8.2): 20 numbered nodes on a winding route, chapter name and progress on top,
 * Play as the main action, café / collection / daily as secondary destinations. Nodes are drawn in code.
 */
export class MapScene extends Phaser.Scene {
  private ch = 0;

  constructor() {
    super('Map');
  }

  init(d: { ch?: number }) {
    this.ch = d?.ch ?? chapterOf(save.level);
  }

  create() {
    fitCamera(this);
    platform.ready();
    const ch = this.ch;
    const first = ch * CHAPTER_LEN + 1;
    const land = isLand();
    // backdrop: the chapter's room, softly blurred and tinted violet (style board 2026-11-23)
    blurredBackdrop(this, ch % 2 ? 'cafe_room2' : 'cafe_room1');
    leaves(this, -10, H + 10, 200, -1.1, 4);
    leaves(this, W + 10, H + 10, 190, -2.0, 5);
    playMusic('music_menu');

    const done = Math.max(0, Math.min(CHAPTER_LEN, save.level - first));
    const name = first <= CAMPAIGN_LEVELS ? t('chapter_' + chapterKey(ch)) : t('endless');
    ribbon(this, land ? W / 2 : 322, 62, land ? 560 : 400, name.toUpperCase(), 'paw', name.length > 16 && !land ? 26 : 30);
    pawBar(this, W / 2 + 20, 140, 230, done, CHAPTER_LEN);
    roundBtn(this, 56, 56, 76, S.purpleBtn, S.purpleLip, 'back', () => this.scene.start('Title'));
    chip(this, land ? W - 100 : W - 92, land ? 56 : 62, land ? 160 : 150, 'fish', () => String(save.fish));
    if (ch > 0) roundBtn(this, W / 2 - 190, 140, 60, S.lavDeep, S.purpleLip, '◀', () => this.scene.restart({ ch: ch - 1 }));
    if (save.level > first + CHAPTER_LEN - 1) roundBtn(this, W / 2 + 230, 140, 60, S.lavDeep, S.purpleLip, '▶', () => this.scene.restart({ ch: ch + 1 }));

    this.route(first, land);

    // main action + destinations
    const cur = save.level;
    const play = candy(this, W / 2, land ? H - 62 : 1030, land ? 400 : 480, land ? 88 : 108, t('play', { n: cur }).toUpperCase(), () => this.start(cur));
    this.tweens.add({ targets: play, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const today = utcDate();
    const dailyOpen = save.level >= DAILY_FROM_LEVEL;
    const task = nextTask(save.tasksDone);
    const giftReady = save.level > 1 && save.calendar.last !== today;
    // the streak lives on the Daily button label, never as loose text over the road
    const st = streakState(save.daily.last, save.daily.streak, today);
    const flame = st.alive && dailyOpen ? ` 🔥${st.streak}` : '';
    const items: [IconName, string, number, number, () => void, boolean][] = [
      ['cafe', t('cafe'), S.pink, S.pinkLip, () => this.scene.start('Cafe'), !!task && save.stars >= task.cost],
      ['collection', t('collection'), 0x22c3e6, 0x1590a8, () => this.scene.start('Collection'), false],
      [dailyOpen ? 'daily' : 'lock', t('dailyShort') + flame, S.yellow, S.yellowLip, () => {
        if (!dailyOpen) return toast(this, t('dailyLocked', { n: DAILY_FROM_LEVEL - 1 }));
        this.scene.start('Level', { mode: 'daily', date: today });
      }, dailyOpen && !save.daily.results[today]],
      // the login gift is optional: a small button, never a popup (GDD §4)
      ['gift', t('gift'), S.purpleBtn, S.purpleLip, () => this.calendar(today), giftReady],
      ['settings', t('settings'), S.lavDeep, S.purpleLip, () => this.settings(), false],
    ];
    items.forEach(([ic, label, col, lip, fn, dot], i) => {
      // landscape: two side columns; portrait: a row at the bottom
      const x = land ? (i < 3 ? 90 : W - 90) : W / 2 + (i - 2) * 132;
      const y = land ? (i < 3 ? 250 + i * 150 : 250 + (i - 3) * 150) : 1170;
      const b = roundBtn(this, x, y, land ? 92 : 96, col, lip, ic, fn);
      const l = title(this, x, y + 64, label, 20);
      if (ic === 'daily' && st.atRisk) l.setColor('#ffd84a');
      if (dot) badge(this, b, 34, -34);
    });


    if (save.level > CHAPTER_LEN && !save.feedback.asked) this.time.delayedCall(500, () => this.feedback(true));
    else this.offerChallenge(today);
  }

  private start(n: number) {
    sfx.node();
    this.scene.start('Level', { mode: 'level', n });
  }

  /** 20 nodes on a winding cream road: 4 rows of 5 (landscape) or 5 rows of 4 (portrait), snaking up. */
  private route(first: number, land: boolean) {
    const cols = land ? 5 : 4;
    const rows = CHAPTER_LEN / cols;
    const x0 = land ? 290 : 110;
    const x1 = land ? W - 290 : W - 110;
    const yTop = land ? 215 : 330;
    const yBot = land ? H - 150 : 880;
    const pos = (i: number) => {
      const row = Math.floor(i / cols);
      const col = row % 2 ? cols - 1 - (i % cols) : i % cols;
      return { x: x0 + (col * (x1 - x0)) / (cols - 1), y: yBot - (row * (yBot - yTop)) / (rows - 1) };
    };
    const pts = Array.from({ length: CHAPTER_LEN }, (_, i) => pos(i));
    // smooth road through the nodes, bulging out at the row ends
    const ctrl: Phaser.Math.Vector2[] = [];
    pts.forEach((p, i) => {
      ctrl.push(new Phaser.Math.Vector2(p.x, p.y));
      if (i % cols === cols - 1 && i < pts.length - 1) {
        const q = pts[i + 1];
        const out = (Math.floor(i / cols) % 2 ? -1 : 1) * (land ? 70 : 55);
        ctrl.push(new Phaser.Math.Vector2(p.x + out, (p.y + q.y) / 2));
      }
    });
    const road = new Phaser.Curves.Spline(ctrl).getPoints(260);
    const g = this.add.graphics();
    for (const [wd, col] of [[56, C.inkN], [46, 0xf2d9b8], [32, 0xfff3df]] as const) {
      g.lineStyle(wd, col, 1);
      g.strokePoints(road, false);
    }
    pts.forEach((p, i) => {
      const n = first + i;
      const state = n < save.level ? 'done' : n === save.level ? 'current' : 'locked';
      const c = this.add.container(p.x, p.y);
      const ng = this.add.graphics();
      const r = state === 'current' ? 46 : 38;
      const face = state === 'done' ? S.yellow : state === 'current' ? S.pink : S.lav;
      const lip = state === 'done' ? S.yellowLip : state === 'current' ? S.pinkLip : S.lavDeep;
      if (state === 'current') {
        const glow = this.add.circle(0, 0, r + 18, 0xffe066, 0.45);
        c.add(glow);
        this.tweens.add({ targets: glow, scale: 1.25, alpha: 0.1, duration: 900, yoyo: true, repeat: -1 });
      }
      ng.fillStyle(C.inkN, 1).fillCircle(0, 4, r + 4);
      ng.fillStyle(lip, 1).fillCircle(0, 5, r);
      ng.fillStyle(face, 1).fillCircle(0, 0, r);
      ng.fillStyle(0xffffff, 0.35).fillEllipse(-r * 0.2, -r * 0.5, r * 1.1, r * 0.45);
      if (isHard(n)) ng.lineStyle(5, S.purpleBtn, 1).strokeCircle(0, 0, r - 5);
      c.add(ng);
      const label = state === 'current' ? String(n).padStart(2, '0') : String(n);
      const ty = state === 'current' ? 0 : -9;
      c.add(title(this, 0, ty, label, n > 99 ? 24 : state === 'current' ? 34 : 28).setStroke(state === 'locked' ? '#7a5aa6' : '#39243f', 6));
      if (state === 'done') c.add(icon(this, 'paw', 0, r * 0.48, r * 0.6).setAlpha((save.best[n] ?? 1) === 3 ? 1 : 0.7));
      if (state === 'locked') c.add(icon(this, 'lock', 0, r * 0.5, r * 0.55));
      // badges sit outside the circle so they never cover the number
      if (isMilestone(n)) c.add(icon(this, 'chest', r * 1.12, -r * 1.02, 44));
      const lesson = LESSON_AT.get(n);
      if (lesson) {
        c.add(this.add.circle(-r * 1.1, -r * 1.0, 22, 0xffffff, 1).setStrokeStyle(3, C.inkN));
        c.add(icon(this, lesson, -r * 1.1, -r * 1.0, 34));
      }
      if (state === 'current') {
        this.tweens.add({ targets: c, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        // the board of the next level is generated while the player looks at the map
        this.time.delayedCall(200, () => getLevel(n));
      }
      c.setSize(r * 2 + 20, r * 2 + 20).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => {
        if (state === 'locked') return toast(this, t('nodeLocked'));
        this.start(n);
      });
    });
  }

  private settings() {
    const close = modal(this, t('settings'), [], [
      { label: `${t('sound')}: ${t(save.muted ? 'off' : 'on')}`, color: C.panel, onClick: () => { save.muted = !save.muted; setMuted(save.muted); persist(); close(); this.settings(); } },
      { label: `${t('music')}: ${t(save.musicOff ? 'off' : 'on')}`, color: C.panel, onClick: () => { save.musicOff = !save.musicOff; setMusicOff(save.musicOff); persist(); close(); this.settings(); } },
      { label: t('sendFeedback'), color: C.blue, onClick: () => { close(); this.feedback(false); } },
    ], true);
  }

  /** One optional satisfaction check after chapter 1 (GDD §10.4); never rewarded, never blocking. */
  private feedback(auto: boolean) {
    save.feedback.asked = true;
    persist();
    const answer = (a: string) => {
      save.feedback.answer = a;
      persist();
      platform.track('feedback', { answer: a, level: save.level, auto });
      close();
      if (a !== 'later') toast(this, t('feedbackThanks'));
    };
    const close = modal(this, t('feedbackQ'), [], [
      { label: t('feedbackGood'), color: C.primary, onClick: () => answer('good') },
      { label: t('feedbackOk'), color: C.panel, onClick: () => answer('ok') },
      { label: t('feedbackBad'), color: C.panel, onClick: () => answer('bad') },
      { label: t('later'), color: C.panel, onClick: () => answer('later') },
    ], true);
  }

  /** Opened from a friend's share link: invite straight into today's puzzle. */
  private offerChallenge(today: string) {
    const ch = challenge();
    if (!ch || challengeOffered() || save.daily.results[today] || save.level < DAILY_FROM_LEVEL) return;
    markChallengeOffered();
    platform.track('challenge_open', { sameDay: ch.date === today });
    const close = modal(this, t('challengeTitle'), [ch.date === today ? t('challengeText', { t: fmtTime(ch.time) }) : t('challengeTextOld')], [
      { label: t('challengeAccept'), color: C.primary, onClick: () => { close(); this.scene.start('Level', { mode: 'daily', date: today }); } },
      { label: t('later'), color: C.gray, onClick: () => close() },
    ], true);
  }

  /** 7-day gift, opened only from its tile. */
  private calendar(today: string) {
    if (save.level <= 1) return toast(this, t('giftLater'));
    const claim = claimCalendar(save.calendar, today);
    if (claim) grant(claim.reward);
    persist();
    const idx = claim ? claim.index : (save.calendar.day + 6) % 7;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(W / 2, H / 2, W, H, DIM, 0.55).setInteractive();
    const g = this.add.graphics();
    const top = H / 2 - 250;
    panel(g, 30, top, W - 60, 510, 40);
    c.add([dim, g, txt(this, W / 2, top + 60, t('calendarTitle'), 40)]);
    CALENDAR.forEach((r, i) => {
      const x = W / 2 + (i - 3) * 88;
      const y = top + 190;
      const cell = this.add.graphics();
      cell.fillStyle(i === idx && claim ? 0xffd600 : i <= idx ? 0xd8f5b0 : C.latte, 1).fillRoundedRect(x - 38, y - 70, 76, 140, 16);
      cell.lineStyle(3, C.inkN, 1).strokeRoundedRect(x - 38, y - 70, 76, 140, 16);
      c.add([cell, txt(this, x, y - 45, String(i + 1), 24), icon(this, i === 6 ? 'gift' : r.stars ? 'star' : r.paws ? 'paw' : 'fish', x, y + 5, 46),
        txt(this, x, y + 48, String(r.fish ?? r.stars ?? r.paws), 22)]);
    });
    c.add(txt(this, W / 2, top + 320, claim ? '+' + rewardText(CALENDAR[claim.index]) : t('giftTaken'), 34));
    c.add(txt(this, W / 2, top + 370, t('tomorrow', { r: rewardText(CALENDAR[save.calendar.day % 7]) }), 26, C.muted));
    c.add(button(this, W / 2, top + 445, 320, 88, claim ? t('claim') : t('gotIt'), () => {
      if (claim) (claim.index === 6 ? sfx.chest : sfx.coin)();
      c.destroy();
      this.scene.restart({ ch: this.ch });
    }, { color: C.primary, size: 38 }));
  }
}
