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
import { art } from './art';
import { badge, button, C, DIM, iconButton, modal, panel, pill, tile, toast, txt, W, H } from './ui';
import { icon, IconName } from './icons';
import { challenge, challengeOffered, markChallengeOffered } from './share';
import { fmtTime } from '../core/share';

const LESSON_AT = new Map<number, IconName>([
  [LESSON.scratchy, 'scratchy'], [LESSON.sleepy, 'sleep'], [LESSON.kitten, 'family'], [LESSON.boxes, 'box'],
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
    platform.ready();
    const ch = this.ch;
    const first = ch * CHAPTER_LEN + 1;
    const vig = Math.min(ch, 3) + 1;
    this.cameras.main.setBackgroundColor(C.bg);
    art(this, ['bg_board_floor', 'bg_board_garden', 'bg_board_roof', 'bg_board_kitchen'][vig - 1], W / 2, H / 2, W, H, true);
    this.add.rectangle(W / 2, H / 2, W, H, C.bg, 0.45);
    playMusic('music_menu');

    // top bar: settings, chapter title, currencies
    iconButton(this, 60, 60, 'settings', () => this.settings(), 80);
    pill(this, W - 24, 60, 'fish', () => save.fish, 150);
    pill(this, W - 24, 122, 'star', () => save.stars, 120);

    // chapter header: vignette, name, progress
    art(this, `chapter_vig_${vig}`, W / 2, 205, 260, 190);
    const done = Math.max(0, Math.min(CHAPTER_LEN, save.level - first));
    const name = ch < 3 || first <= CAMPAIGN_LEVELS ? t('chapter_' + chapterKey(ch)) : t('endless');
    const nt = txt(this, W / 2, 322, t('chapterN', { n: ch + 1, name }), 34).setStroke('#fff8ef', 8);
    if (nt.width > W - 80) nt.setScale((W - 80) / nt.width);
    const bw = 300;
    const g = this.add.graphics();
    g.fillStyle(C.inkN, 1).fillRoundedRect(W / 2 - bw / 2 - 3, 352, bw + 6, 30, 15);
    g.fillStyle(C.panel, 1).fillRoundedRect(W / 2 - bw / 2, 355, bw, 24, 12);
    if (done) g.fillStyle(0x3478f6, 1).fillRoundedRect(W / 2 - bw / 2, 355, Math.max(24, (bw * done) / CHAPTER_LEN), 24, 12);
    txt(this, W / 2, 367, `${done}/${CHAPTER_LEN}`, 20, done > CHAPTER_LEN / 2 ? '#ffffff' : C.ink);
    if (ch > 0) iconButton(this, 70, 300, 'back', () => this.scene.restart({ ch: ch - 1 }), 76);
    if (save.level > first + CHAPTER_LEN - 1) {
      const nb = iconButton(this, W - 70, 300, 'next', () => this.scene.restart({ ch: ch + 1 }), 76);
      void nb;
    }

    this.route(first);

    // main action + destinations
    const cur = save.level;
    const play = button(this, W / 2, 1050, 520, 112, t('play', { n: cur }), () => this.start(cur), { color: C.primary, size: 42, icon: 'play' });
    this.tweens.add({ targets: play, scale: 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const today = utcDate();
    const tw = 150;
    const ty = 1190;
    const cafe = tile(this, W / 2 - (tw + 14) * 1.5, ty, tw, 136, 'cafe', t('cafe'), () => this.scene.start('Cafe'));
    const task = nextTask(save.tasksDone);
    if (task && save.stars >= task.cost) badge(this, cafe, tw / 2 - 8, -60);
    tile(this, W / 2 - (tw + 14) * 0.5, ty, tw, 136, 'collection', t('collection'), () => this.scene.start('Collection'));
    const dailyOpen = save.level >= DAILY_FROM_LEVEL;
    const daily = tile(this, W / 2 + (tw + 14) * 0.5, ty, tw, 136, dailyOpen ? 'daily' : 'lock', t('dailyShort'), () => {
      if (!dailyOpen) return toast(this, t('dailyLocked', { n: DAILY_FROM_LEVEL - 1 }));
      this.scene.start('Level', { mode: 'daily', date: today });
    });
    if (dailyOpen && !save.daily.results[today]) badge(this, daily, tw / 2 - 8, -60);
    if (!dailyOpen) daily.setAlpha(0.6);
    // the login gift is optional: a small tile, never a popup (GDD §4)
    const gift = tile(this, W / 2 + (tw + 14) * 1.5, ty, tw, 136, 'gift', t('gift'), () => this.calendar(today));
    const giftReady = save.level > 1 && save.calendar.last !== today;
    if (giftReady) badge(this, gift, tw / 2 - 8, -60);
    else gift.setAlpha(save.level > 1 ? 0.75 : 0.5);

    const st = streakState(save.daily.last, save.daily.streak, today);
    if (st.alive && dailyOpen) txt(this, W / 2, 975, st.atRisk ? t('streakRisk', { n: st.streak }) : t('streakFlame', { n: st.streak }), 22, st.atRisk ? '#ff3d9a' : C.ink);

    if (save.level > CHAPTER_LEN && !save.feedback.asked) this.time.delayedCall(500, () => this.feedback(true));
    else this.offerChallenge(today);
  }

  private start(n: number) {
    sfx.node();
    this.scene.start('Level', { mode: 'level', n });
  }

  /** 20 nodes, 4 per row, snaking up from the bottom; node state never shown by color alone. */
  private route(first: number) {
    const top = 430;
    const bottom = 930;
    const xs = [150, 290, 430, 570];
    const pos = (i: number) => {
      const row = Math.floor(i / 4);
      const col = row % 2 ? 3 - (i % 4) : i % 4;
      return { x: xs[col], y: bottom - row * ((bottom - top) / 4) };
    };
    const g = this.add.graphics();
    const pts = Array.from({ length: CHAPTER_LEN }, (_, i) => pos(i));
    for (const [wdt, col] of [[30, C.inkN], [22, 0x3478f6], [6, 0xfff8ef]] as const) {
      g.lineStyle(wdt, col, 1);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.strokePath();
    }
    pts.forEach((p, i) => {
      const n = first + i;
      const state = n < save.level ? 'done' : n === save.level ? 'current' : 'locked';
      const c = this.add.container(p.x, p.y);
      const ng = this.add.graphics();
      const r = state === 'current' ? 44 : 36;
      const face = state === 'done' ? 0xff3d9a : state === 'current' ? 0xffd600 : 0xd9cfe0;
      ng.fillStyle(C.inkN, 1).fillCircle(0, 4, r + 5);
      ng.fillStyle(face, 1).fillCircle(0, 0, r);
      ng.fillStyle(0xffffff, 0.35).fillCircle(-r * 0.3, -r * 0.35, r * 0.3);
      if (isHard(n)) ng.lineStyle(5, 0x7957f5, 1).strokeCircle(0, 0, r - 4);
      c.add(ng);
      if (state === 'locked') c.add(icon(this, 'lock', 0, 0, 40).setAlpha(0.8));
      else c.add(txt(this, 0, 0, String(n), n > 99 ? 24 : 30, state === 'done' ? '#ffffff' : C.ink).setStroke(state === 'done' ? C.ink : '#fff8ef', 5));
      if (state === 'done') {
        const paws = save.best[n] ?? 1;
        for (let k = 0; k < 3; k++) c.add(icon(this, 'paw', (k - 1) * 22, r + 12, 22).setAlpha(k < paws ? 1 : 0.25));
      }
      if (isMilestone(n)) c.add(icon(this, 'chest', r * 0.85, -r * 0.8, 40));
      const lesson = LESSON_AT.get(n);
      if (lesson) c.add(icon(this, lesson, -r * 0.85, -r * 0.8, 36));
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
