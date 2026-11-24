import Phaser from 'phaser';
import { tipOnce } from './tips';
import { CAFE_ROOMS, CAFE_SLOTS, CAFE_VARIANTS } from '../core/content';
import { chapterChest, CHAPTERS, doTask, nextTask, progress, roomChapter } from '../core/meta';
import { comfort, tipsAvailable, tipsRate } from '../core/retention';
import { tagOf, TROPHY_ICON, updateVisitor, VISITORS } from '../core/live';
import { BREEDS } from '../core/content';
import { t } from '../i18n';
import { art, sittingCat } from './art';
import { playMusic, sfx } from './sfx';
import { rewarded, rewardedReady } from './ads';
import { addFish, grantPaws, persist, platform, save, unlockBreed } from './state';
import { button, C, dialog, modal, portraitColumn, toast, txt, W, panel } from './ui';
import { chip, ribbon, roundBtn, S, title } from './style';

import { CAFE_UI, type Rect, placeOf, SEATS } from './cafeLayout';
import { icon, type IconName } from './icons';

const WALL = [0xf6dfc6, 0xe9e0ef]; // hall: peach, attic: dusty lavender (art bible color script)
const FLOOR = [0xe3c49f, 0xd8b98e]; // hall: honey wood, attic: pine

export class CafeScene extends Phaser.Scene {
  private room = 0;
  /** slot just renovated (sparkle + pop on the next draw) */
  private upgraded = -1;

  constructor() {
    super('Cafe');
  }

  init(d: { room?: number; upgraded?: number }) {
    this.room = d.room ?? CHAPTERS[Math.min(progress(save.tasksDone).chapter, CHAPTERS.length - 1)].room;
    this.upgraded = d.upgraded ?? -1;
  }

  /** A room opens when the story reaches its first chapter. */
  private roomUnlocked(r: number) {
    const first = CHAPTERS.findIndex((c) => c.room === r);
    return r === 0 || (first >= 0 && progress(save.tasksDone).chapter >= first);
  }

  /** decor images drawn this time, by slot (cats sit on them) */
  private placed = new Map<string, { im: Phaser.GameObjects.Image; v: number; k: number }>();

  create() {
    this.placed = new Map();
    portraitColumn(this);
    this.time.delayedCall(350, () => tipOnce(this, 'cafe'));
    playMusic('music_cafe');
    const r = this.room;
    const g = this.add.graphics();
    g.fillStyle(WALL[r], 1).fillRect(0, 160, W, 500);
    g.fillStyle(FLOOR[r], 1).fillRect(0, 660, W, 460);
    g.lineStyle(6, C.inkN, 1).lineBetween(0, 660, W, 660);
    if (r === 1) {
      // sloped roof and a beam, so the attic reads differently from the hall
      g.fillStyle(0xc7b28f, 1).fillTriangle(0, 160, 200, 160, 0, 470).fillTriangle(W, 160, W - 200, 160, W, 470);
      g.lineStyle(5, C.inkN, 1).lineBetween(200, 160, 0, 470).lineBetween(W - 200, 160, W, 470);
      g.fillStyle(0xb08a5e, 1).fillRect(0, 205, W, 26).lineStyle(4, C.inkN, 1).strokeRect(-4, 205, W + 8, 26);
    }
    art(this, `cafe_room${r + 1}`, W / 2, 640, W, 960, true);

    // header stays above the decor (a hanging lamp must never cover it); the subtitle sits on a dark pill
    roundBtn(this, 60, 64, 84, S.pink, S.pinkLip, 'map', () => this.scene.start('Map')).setDepth(40);
    ribbon(this, W / 2 - 10, 64, 380, t('myCafe').toUpperCase(), 'cafe', 28).setDepth(40);
    chip(this, W - 84, 64, 124, 'star', () => String(save.stars)).c.setDepth(40);
    const sub = title(this, W / 2, 134, `${t('chapter_' + CHAPTERS[roomChapter(save.tasksDone, r)].key)} · ${t('comfort', { n: comfort(save.cafe, save.cafeTier), r: tipsRate(save.cafe, save.cafeTier) })}`, 21).setDepth(41);
    const sw = Math.min(W - 40, sub.width + 36);
    this.add.graphics().setDepth(40).fillStyle(0x4b2a86, 0.92).fillRoundedRect(W / 2 - sw / 2, 134 - 20, sw, 40, 20)
      .lineStyle(3, C.inkN, 1).strokeRoundedRect(W / 2 - sw / 2, 134 - 20, sw, 40, 20);
    // room switch arrows: up on the wall, away from decor tap areas (see cafeLayout + layout test)
    const { prevRoom: pr, nextRoom: nr } = CAFE_UI;
    // room switch = labelled pills ("◀ Hall" / "Attic ▶"); a bare chevron read as the Back button
    const roomName = (i: number) => t('chapter_' + CHAPTERS.find((c) => c.room === i)!.key);
    if (r > 0) button(this, pr.x, pr.y, pr.w, pr.h, '◀ ' + roomName(r - 1), () => this.scene.restart({ room: r - 1 }), { color: C.blue, size: 26 });
    if (r < CAFE_ROOMS - 1) {
      const open = this.roomUnlocked(r + 1);
      const nb = button(this, nr.x, nr.y, nr.w, nr.h, (open ? '' : '🔒 ') + roomName(r + 1) + ' ▶', () => {
        if (!this.roomUnlocked(r + 1)) return toast(this, t('roomLocked'));
        this.scene.restart({ room: r + 1 });
      }, { color: C.blue, size: 26 });
      if (!open) nb.setAlpha(0.6);
    }

    const task = nextTask(save.tasksDone);
    CAFE_SLOTS.forEach((key, i) => {
      const v = save.cafe[r][i];
      const rect = placeOf(r, key, v);
      if (v >= 0) {
        const im = art(this, `decor_r${r + 1}_${key}_${v}`, rect.x, rect.y, rect.w, rect.h);
        // the full scale is kept: a just-renovated piece pops in from 60 %, cats must not sit at that size
        if (im) this.placed.set(key, { im, v, k: im.scale });
        if (im && i === this.upgraded) this.celebrate(im);
        if (im && rect.anchor === 'floor') {
          im.setOrigin(0.5, 1).setY(rect.y + rect.h / 2);
          this.add.ellipse(rect.x, rect.y + rect.h / 2 - 4, im.displayWidth * 0.8, 18, C.inkN, 0.12);
          this.children.bringToTop(im);
        } else if (im && rect.anchor === 'ceiling') im.setOrigin(0.5, 0).setY(rect.y - rect.h / 2);
        if (!im) {
          this.drawItem(this.add.graphics(), key, rect, CAFE_VARIANTS[r][v], r);
        }
        // tag badge sits on the item's top-right corner, not on the empty slot box
        const top = im ? im.y - im.displayHeight * im.originY : rect.y - rect.h / 2;
        const right = im ? im.x + im.displayWidth * 0.4 : rect.x + rect.w / 2 - 6;
        // a small white badge, so it reads as a label and not as a toy lying on the furniture
        const bx = Math.min(W - 26, right);
        const by = Math.max(170, top + 10);
        this.add.circle(bx, by, 19, 0xffffff, 0.95).setStrokeStyle(3, C.inkN).setDepth(5);
        icon(this, `tag_${tagOf(i, v)}`, bx, by, 30).setDepth(6);
        const hr = rect;
        const hit = this.add.zone(hr.x, hr.y, hr.w, hr.h).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.pickVariant(i));
        // renovation task on a placed piece: a slow glow (no scaling: cats sit on it)
        if (im && task?.kind === 'decor' && task.slot === i && CHAPTERS[progress(save.tasksDone).chapter]?.room === r) {
          this.tweens.add({ targets: im, alpha: 0.72, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        }
      } else if (task?.kind === 'decor' && task.slot === i && CHAPTERS[progress(save.tasksDone).chapter]?.room === r) {
        // only the slot of the current task is shown: a pulsing "build here" spot
        const ph = this.add.container(rect.x, rect.y);
        const pg = this.add.graphics();
        pg.fillStyle(0xfff9f0, 0.55).fillRoundedRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h, 18);
        pg.lineStyle(4, C.primary, 1);
        const step = 22;
        for (let x = -rect.w / 2 + 10; x < rect.w / 2 - 10; x += step) {
          pg.lineBetween(x, -rect.h / 2, Math.min(x + 12, rect.w / 2 - 10), -rect.h / 2);
          pg.lineBetween(x, rect.h / 2, Math.min(x + 12, rect.w / 2 - 10), rect.h / 2);
        }
        for (let y = -rect.h / 2 + 10; y < rect.h / 2 - 10; y += step) {
          pg.lineBetween(-rect.w / 2, y, -rect.w / 2, Math.min(y + 12, rect.h / 2 - 10));
          pg.lineBetween(rect.w / 2, y, rect.w / 2, Math.min(y + 12, rect.h / 2 - 10));
        }
        ph.add([pg, txt(this, 0, 0, '+', 56, '#ff9e5e').setStroke(C.ink, 6)]);
        this.tweens.add({ targets: ph, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
        const hz = rect;
        const hit = this.add.zone(hz.x, hz.y, hz.w, hz.h).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => this.perform());
      }
    });

    if (r === 0 && save.trophies.length) {
      if (!art(this, 'trophy_shelf', 360, 590, 320, 90)) this.add.graphics().fillStyle(0xb98a5a, 1).fillRoundedRect(220, 585, 280, 18, 6).lineStyle(3, C.inkN, 1).strokeRoundedRect(220, 585, 280, 18, 6);
      save.trophies.forEach((tr, k) => art(this, `trophy_${tr}`, 255 + k * 70, 552, 62, 62) ?? txt(this, 255 + k * 70, 562, TROPHY_ICON[tr] ?? '🏆', 40));
    }
    this.drawVisitor();
    this.spawnCats();
    this.drawTaskPanel();
    this.chapterIntro();
    const tips = tipsAvailable(save.cafe, save.tips.since, Date.now(), save.cafeTier);
    button(this, 130, 1065, 210, 70, t('tipsLabel', { n: tips }), () => {
      const n = tipsAvailable(save.cafe, save.tips.since, Date.now(), save.cafeTier);
      if (n <= 0) return toast(this, t('tipsEmpty'), 1000);
      const collect = (got: number) => {
        save.tips.since = Date.now();
        addFish(got);
        sfx.tips();
        platform.track('tips_collect', { n: got });
        toast(this, t('tipsCollected', { n: got }), 1000);
        this.time.delayedCall(700, () => this.scene.restart({ room: this.room }));
      };
      // GDD: a rewarded ad doubles the tips bank (opt-in; skipped when ads are unavailable)
      if (!rewardedReady() || n < 10) return collect(n);
      let busy = false;
      const close = modal(this, t('tipsTitle', { n }), [t('tipsDoubleText')], [
        { label: t('tipsTake', { n }), color: C.primary, onClick: () => { if (busy) return; busy = true; close(); collect(n); } },
        {
          label: t('adDouble', { n }), color: C.gold, onClick: async () => {
            if (busy) return;
            busy = true;
            const ok = await rewarded(this, 'tips_double');
            close();
            collect(ok ? n * 2 : n);
          },
        },
      ], true);
    }, { color: C.primary, size: 28, disabled: tips <= 0 });
  }

  private drawTaskPanel() {
    const g = this.add.graphics();
    panel(g, 20, 1122, W - 40, 136, 30);
    const p = progress(save.tasksDone);
    if (p.chapter >= CHAPTERS.length) {
      txt(this, W / 2, 1195, t('allDone'), 28);
      return;
    }
    if (CHAPTERS[p.chapter].room !== this.room) {
      // the story moved on to the other room: say where and why
      const next = CHAPTERS[p.chapter];
      txt(this, W / 2 - 70, 1195, t(next.stage ? 'renovateNext' : 'nextRoom', { name: t('chapter_' + next.key) }), 26)
        .setWordWrapWidth(440, true);
      button(this, W - 120, 1195, 140, 80, '▶', () => this.scene.restart({ room: CHAPTERS[p.chapter].room }), {
        color: C.green, size: 34,
      });
      return;
    }
    const ch = CHAPTERS[p.chapter];
    const task = ch.tasks[p.task];
    txt(this, W / 2, 1152, t('chapterProgress', { name: t('chapter_' + ch.key), a: p.task, b: ch.tasks.length }), 22, C.muted);
    const name = task.kind === 'decor'
      ? t(['task_decor', 'task_decor1', 'task_decor2'][ch.stage], { name: t('slot_' + CAFE_SLOTS[task.slot!]) })
      : t('task_' + task.id);
    txt(this, 220, 1210, name, 28).setWordWrapWidth(360, true);
    button(this, W - 150, 1205, 240, 80, t('doTask', { n: task.cost }), () => this.perform(), {
      color: C.green, size: 28, disabled: save.stars < task.cost,
    });
  }

  /** Renovated piece: pop + sparkles so the change is noticed. */
  private celebrate(im: Phaser.GameObjects.Image) {
    const sc = im.scale;
    im.setScale(sc * 0.6);
    this.tweens.add({ targets: im, scale: sc, duration: 450, ease: 'Back.Out' });
    const cy = im.y - im.displayHeight * (im.originY - 0.5);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const s = txt(this, im.x, cy, '✦', 30, '#ffd23f').setStroke(C.ink, 4);
      this.tweens.add({
        targets: s, x: im.x + Math.cos(a) * 150, y: cy + Math.sin(a) * 120, alpha: 0, scale: 1.6,
        duration: 800, ease: 'Cubic.Out', onComplete: () => s.destroy(),
      });
    }
    sfx.star();
    this.upgraded = -1;
  }

  /** First visit of a renovation chapter: one short explanation. */
  private chapterIntro() {
    const p = progress(save.tasksDone);
    const ch = CHAPTERS[p.chapter];
    if (!ch || !ch.stage || p.task !== 0 || ch.room !== this.room || save.chapterIntro >= p.chapter) return;
    save.chapterIntro = p.chapter;
    persist();
    const close = modal(this, t('chapter_' + ch.key), [t(ch.stage === 1 ? 'renovIntro1' : 'renovIntro2')], [
      { label: t('next'), color: C.green, onClick: () => close() },
    ]);
  }

  private perform() {
    const task = nextTask(save.tasksDone);
    if (!task) return;
    if (save.stars < task.cost) return toast(this, t('noStars'), 1060);
    const res = doTask(save)!;
    const ch = CHAPTERS[res.chapter];
    if (task.kind === 'decor') {
      // each stage unlocks the next look of the piece and puts it in place (the player can switch back)
      save.cafeTier[ch.room][task.slot!] = Math.max(save.cafeTier[ch.room][task.slot!], ch.stage);
      save.cafe[ch.room][task.slot!] = ch.stage;
    }
    persist();
    sfx.task();
    platform.track('cafe_task', { id: task.id });
    const upgraded = task.kind === 'decor' ? task.slot! : -1;
    if (task.kind === 'story') toast(this, `${t('done_story')} ${t('task_' + task.id)}`, 1060);

    const finish = () => {
      if (!res.chapterDone) return this.scene.restart({ room: ch.room, upgraded });
      const lines = [t('roomDone', { name: t('chapter_' + ch.key) })];
      const chest = chapterChest(res.chapter);
      save.fish += chest.fish;
      const pawLines = grantPaws(chest.paws);
      lines.push(t('chestText', { f: chest.fish, p: chest.paws }), ...pawLines);
      if (save.flawless[ch.key] !== false && !save.frames.includes(ch.resident)) {
        save.frames.push(ch.resident);
        lines.push(t('goldenFrame', { name: t('who_' + ch.resident) }));
      }
      persist();
      sfx.win();
      const close = modal(this, '🎉', lines, [{
        label: 'OK', color: C.green,
        onClick: () => {
          close();
          this.scene.restart({ room: CHAPTERS[res.chapter + 1]?.room ?? ch.room });
        },
      }]);
    };
    this.time.delayedCall(450, () => {
      if (res.scene < 0) return finish();
      const lines = ch.scenes[res.scene].map((who, i) => ({
        who, name: t('who_' + who), text: t(`story_${ch.key}_${res.scene}_${i}`),
      }));
      sfx.scene();
      dialog(this, lines, t('tapToContinue'), finish, `chapter${ch.room + 1}_cover`);
    });
  }

  private pickVariant(slot: number) {
    const r = this.room;
    // the tag icons are on the buttons, so the hint line drops its emoji
    const hint = t('visitorHint').replace(/[🧶🛋☀]\uFE0F?\s?/gu, '');
    const close = modal(this, t('slot_' + CAFE_SLOTS[slot]), [t('chooseVariant'), hint],
      CAFE_VARIANTS[r].map((color, v) => ({
        // same name whether open or locked: look name + what guests like about it; lock / check as a badge
        label: `${t(['variantBasic', 'variantCozy', 'variantDeluxe'][v])} · ${t('tag_' + tagOf(slot, v))}`,
        icon: `tag_${tagOf(slot, v)}` as IconName,
        badge: (v > save.cafeTier[r][slot] ? 'lock' : save.cafe[r][slot] === v ? 'check' : undefined) as IconName | undefined,
        color,
        disabled: v > save.cafeTier[r][slot],
        onClick: () => {
          if (v > save.cafeTier[r][slot]) return toast(this, t('variantLocked'));
          save.cafe[r][slot] = v;
          persist();
          close();
          this.scene.restart({ room: r });
        },
      })), true);
  }

  /** Guests appear after 2+ hours away if the café has the tags they like. */
  private drawVisitor() {
    if (updateVisitor(save.visit, save.cafe, save.breeds, Date.now(), Math.random())) sfx.chest();
    persist();
    const b = save.visit.visitor;
    if (b < 0) return;
    const vis = VISITORS.find((v) => v.breed === b)!;
    const vz0 = CAFE_UI.visitor;
    sittingCat(this, b, vz0.x, vz0.y, 120);
    this.add.circle(vz0.x + 58, vz0.y - 52, 22, 0xffffff, 0.95).setStrokeStyle(3, C.inkN).setDepth(6);
    const bell = txt(this, vz0.x + 58, vz0.y - 52, '🔔', 28).setDepth(7);
    this.tweens.add({ targets: bell, angle: 15, duration: 300, yoyo: true, repeat: -1 });
    const vz = CAFE_UI.visitor;
    const zone = this.add.zone(vz.x, vz.y, vz.w, vz.h).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      const name = t('breed_' + BREEDS[b].key);
      const close = modal(this, t('visitorTitle', { name }), [t('visitorText')], [
        {
          label: t('visitorTreat', { n: vis.treat }), color: C.green, disabled: save.fish < vis.treat,
          onClick: () => {
            if (save.fish < vis.treat) return toast(this, t('noFish'));
            addFish(-vis.treat);
            unlockBreed(b);
            save.visit.visitor = -1;
            persist();
            sfx.purr();
            platform.track('visitor_adopt', { breed: b });
            close();
            toast(this, t('visitorAdopted', { name }), 1000);
            this.time.delayedCall(900, () => this.scene.restart({ room: this.room }));
          },
        },
        { label: t('visitorLater'), color: C.gray, onClick: () => close() },
      ], true);
    });
  }

  private spawnCats() {
    // cats use the furniture first (seats per piece and variant, see SEATS), the rest sit on the floor
    // left of the counter; spots never overlap each other, the tips button or the guest
    const r = this.room;
    const seats: { x: number; y: number; s: number; floor: boolean }[] = [];
    for (const key of CAFE_SLOTS) {
      const p = this.placed.get(key);
      if (!p) continue;
      const { im, v, k } = p;
      const w = im.width * k;
      const h = im.height * k;
      const left = im.x - w * im.originX;
      const top = im.y - h * im.originY;
      for (const st of SEATS[r][key][v] ?? []) seats.push({ x: left + st.fx * w, y: top + st.fy * h, s: st.s, floor: false });
    }
    const floor = save.visit.visitor >= 0 ? [{ x: 80, y: 1020 }] : [{ x: 80, y: 1020 }, { x: 196, y: 1032 }, { x: 312, y: 1020 }];
    for (const f of floor) seats.push({ ...f, s: 118, floor: true });
    save.breeds.slice(0, seats.length)
      .map((b, i) => ({ b, i, ...seats[i] }))
      .sort((a, z) => a.y - z.y)
      .forEach(({ b, i, x, y, s: size, floor: onFloor }) => {
        if (onFloor) this.add.ellipse(x, y - 4, size * 0.62, size * 0.14, C.inkN, 0.12);
        const cat = sittingCat(this, b, x, y, size);
        if (cat instanceof Phaser.GameObjects.Image) cat.setOrigin(0.5, 1).setPosition(x, y);
        if (i % 2) cat.setScale(-cat.scaleX, cat.scaleY);
        this.tweens.add({ targets: cat, scaleY: cat.scaleY * 1.03, duration: 1400 + i * 170, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      });
  }

  private drawItem(g: Phaser.GameObjects.Graphics, key: string, r: Rect, col: number, room: number) {
    const L = r.x - r.w / 2;
    const T = r.y - r.h / 2;
    g.lineStyle(4, C.inkN, 1);
    if (room === 1) return this.drawAtticItem(g, key, r, col, L, T);
    switch (key) {
      case 'window':
        g.fillStyle(0xffffff, 1).fillRoundedRect(L, T, r.w, r.h, 12).strokeRoundedRect(L, T, r.w, r.h, 12);
        g.fillStyle(col, 1).fillRect(L + 14, T + 14, r.w - 28, r.h - 28);
        g.lineBetween(r.x, T + 14, r.x, T + r.h - 14).lineBetween(L + 14, r.y, L + r.w - 14, r.y);
        break;
      case 'lamp':
        g.lineBetween(r.x, T + 50, r.x, T + r.h);
        g.fillStyle(col, 1).fillTriangle(r.x - 40, T + 60, r.x + 40, T + 60, r.x, T);
        g.strokeTriangle(r.x - 40, T + 60, r.x + 40, T + 60, r.x, T);
        g.fillStyle(0xfff2a8, 1).fillCircle(r.x, T + 68, 12);
        break;
      case 'post':
        g.fillStyle(col, 1).fillRoundedRect(L + 20, T + 30, r.w - 40, r.h - 30, 8).strokeRoundedRect(L + 20, T + 30, r.w - 40, r.h - 30, 8);
        for (let y = T + 50; y < T + r.h - 10; y += 22) g.lineBetween(L + 20, y, L + r.w - 20, y + 8);
        g.fillStyle(0xd9b48a, 1).fillRoundedRect(L, T, r.w, 34, 8).strokeRoundedRect(L, T, r.w, 34, 8);
        break;
      case 'sofa':
        g.fillStyle(col, 1).fillRoundedRect(L, T, r.w, r.h * 0.55, 20).strokeRoundedRect(L, T, r.w, r.h * 0.55, 20);
        g.fillRoundedRect(L, T + r.h * 0.4, r.w, r.h * 0.6, 20).strokeRoundedRect(L, T + r.h * 0.4, r.w, r.h * 0.6, 20);
        break;
      default:
        g.fillStyle(col, 1).fillRoundedRect(L, T, r.w, r.h, 10).strokeRoundedRect(L, T, r.w, r.h, 10);
        g.fillStyle(0xffffff, 0.6).fillRect(L + 6, T + 6, r.w - 12, 16);
        g.fillStyle(0xffffff, 1).fillCircle(r.x + 60, T - 12, 16).strokeCircle(r.x + 60, T - 12, 16);
    }
  }

  /** Attic fallback shapes (until decor_r2_* art exists): dormer, lantern, shelves, armchair, bar with stools. */
  private drawAtticItem(g: Phaser.GameObjects.Graphics, key: string, r: Rect, col: number, L: number, T: number) {
    switch (key) {
      case 'window': {
        g.fillStyle(0xb08a5e, 1).fillTriangle(L - 16, T + 50, r.x, T - 30, L + r.w + 16, T + 50).strokeTriangle(L - 16, T + 50, r.x, T - 30, L + r.w + 16, T + 50);
        g.fillStyle(0xfff9f0, 1).fillRoundedRect(L, T + 30, r.w, r.h - 30, { tl: r.w / 2, tr: r.w / 2, bl: 10, br: 10 });
        g.strokeRoundedRect(L, T + 30, r.w, r.h - 30, { tl: r.w / 2, tr: r.w / 2, bl: 10, br: 10 });
        g.fillStyle(0xbfe3f2, 1).fillRoundedRect(L + 16, T + 46, r.w - 32, r.h - 62, { tl: r.w / 2 - 16, tr: r.w / 2 - 16, bl: 6, br: 6 });
        g.fillStyle(col, 1).fillRect(L + 6, T + 70, 26, r.h - 80).fillRect(L + r.w - 32, T + 70, 26, r.h - 80);
        g.strokeRect(L + 6, T + 70, 26, r.h - 80).strokeRect(L + r.w - 32, T + 70, 26, r.h - 80);
        break;
      }
      case 'lamp':
        g.lineBetween(r.x, 232, r.x, T + 64); // hangs from the beam
        g.fillStyle(col, 1).fillCircle(r.x, T + 110, 46).strokeCircle(r.x, T + 110, 46);
        g.lineStyle(3, C.inkN, 0.5).lineBetween(r.x - 44, T + 96, r.x + 44, T + 96).lineBetween(r.x - 44, T + 124, r.x + 44, T + 124);
        g.fillStyle(0xfff2a8, 0.5).fillCircle(r.x, T + 110, 70);
        break;
      case 'post':
        for (let k = 0; k < 3; k++) {
          const x = L + (k % 2 ? 50 : 0);
          const y = T + k * 60;
          g.fillStyle(col, 1).fillRoundedRect(x, y, r.w - 50, 22, 8).strokeRoundedRect(x, y, r.w - 50, 22, 8);
        }
        g.lineStyle(3, 0x9c7449, 1).lineBetween(L + 40, T + 22, L + 80, T + 60).lineBetween(L + 80, T + 82, L + 40, T + 120);
        break;
      case 'sofa':
        g.fillStyle(col, 1).fillRoundedRect(L + 20, T, r.w - 40, r.h * 0.7, 30).strokeRoundedRect(L + 20, T, r.w - 40, r.h * 0.7, 30);
        g.fillRoundedRect(L, T + r.h * 0.35, 50, r.h * 0.65, 20).strokeRoundedRect(L, T + r.h * 0.35, 50, r.h * 0.65, 20);
        g.fillRoundedRect(L + r.w - 50, T + r.h * 0.35, 50, r.h * 0.65, 20).strokeRoundedRect(L + r.w - 50, T + r.h * 0.35, 50, r.h * 0.65, 20);
        g.fillRoundedRect(L + 40, T + r.h * 0.55, r.w - 80, r.h * 0.4, 14).strokeRoundedRect(L + 40, T + r.h * 0.55, r.w - 80, r.h * 0.4, 14);
        break;
      default:
        g.fillStyle(0xb08a5e, 1).fillRoundedRect(L, T, r.w, r.h * 0.65, 8).strokeRoundedRect(L, T, r.w, r.h * 0.65, 8);
        g.fillStyle(col, 1).fillRoundedRect(L - 10, T - 12, r.w + 20, 22, 8).strokeRoundedRect(L - 10, T - 12, r.w + 20, 22, 8);
        for (const sx of [L + 50, L + r.w - 50]) {
          g.lineBetween(sx, T + r.h * 0.75, sx, T + r.h);
          g.fillStyle(col, 1).fillEllipse(sx, T + r.h * 0.72, 56, 22).strokeEllipse(sx, T + r.h * 0.72, 56, 22);
        }
        g.fillStyle(0xfff2a8, 1).fillRoundedRect(r.x - 14, T - 52, 28, 40, 8).strokeRoundedRect(r.x - 14, T - 52, 28, 40, 8);
    }
  }
}
