import { describe, expect, it } from 'vitest';
import { Board, headDir } from '../src/core/board';
import { generateOnce } from '../src/core/generator';
import { getDaily, getLevel, levelParams } from '../src/core/levels';
import { migrate, defaultSave } from '../src/core/save';
import { metrics, solve } from '../src/core/solver';
import { Level } from '../src/core/types';

const lv = (cats: [number, number][][]): Level => ({
  id: 't', w: 4, h: 4, boxes: [],
  cats: cats.map((c, id) => ({ id, breed: 0, cells: c.map(([x, y]) => ({ x, y })) })),
});

describe('board', () => {
  it('detects head direction and blockers', () => {
    const l = lv([[[1, 1], [1, 2]], [[0, 0], [1, 0], [2, 0]]]);
    const b = new Board(l);
    expect(headDir(b.cats.get(0)!)).toBe(0);
    expect(b.check(0)).toEqual({ free: false, steps: 0, blocker: 1 });
    expect(b.check(1).free).toBe(true);
    b.remove(1);
    expect(b.check(0)).toEqual({ free: true, steps: 1, blocker: -1 });
  });

  it('solver finds deadlock', () => {
    // two cats facing each other on one row
    const l = lv([[[1, 0], [0, 0]], [[2, 0], [3, 0]]]);
    expect(solve(l).solvable).toBe(false);
  });
});

describe('levels', () => {
  it('first 300 levels are solvable, valid and deterministic', () => {
    for (let n = 1; n <= 300; n++) {
      const l = getLevel(n);
      const m = metrics(l);
      expect(m.solvable, `level ${n}`).toBe(true);
      expect(m.cats).toBeGreaterThanOrEqual(2);
      const seen = new Set<number>();
      for (const c of l.cats)
        for (const p of c.cells) {
          const k = p.y * l.w + p.x;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
          expect(p.x >= 0 && p.y >= 0 && p.x < l.w && p.y < l.h).toBe(true);
        }
    }
    const p = levelParams(50);
    expect(generateOnce(123, p, 'a')).toEqual(generateOnce(123, p, 'a'));
  }, 240_000);

  it('daily levels are solvable', () => {
    for (let d = 0; d < 60; d++) {
      const date = new Date(Date.UTC(2026, 10, 15 + d)).toISOString().slice(0, 10);
      expect(solve(getDaily(date)).solvable).toBe(true);
    }
  }, 120_000);
});

describe('save', () => {
  it('migrates garbage and partial saves', () => {
    expect(migrate(null)).toEqual(defaultSave());
    const s = migrate({ v: 6, level: 7, cafe: [[2]] });
    expect(s.level).toBe(7);
    expect(s.cafe[0][0]).toBe(-1); // a look is only kept when its renovation task is done
    expect(s.cafe[0][1]).toBe(-1);
    const t = migrate({ v: 6, cafe: [[2, 1]], tasksDone: ['hall_d0', 'hall_d1', 'hall2_d0'] });
    expect(t.cafeTier[0].slice(0, 2)).toEqual([1, 0]);
    expect(t.cafe[0].slice(0, 2)).toEqual([1, 0]);
  });
});

import { CHAPTERS, chapterCost, doTask, nextTask, progress, starsToScene } from '../src/core/meta';

describe('meta', () => {
  it('chapters cost 15 / 25 / 35 stars by stage with scenes after tasks 2, 4 and 5', () => {
    for (const c of CHAPTERS) {
      expect(chapterCost(c)).toBe([15, 25, 35][c.stage]);
      expect(c.sceneAfter).toEqual([1, 3, 4]);
      expect(c.scenes.length).toBe(3);
    }
  });

  it('walks through chapters, scenes and stars', () => {
    const st = { stars: 0, tasksDone: [] as string[] };
    expect(starsToScene(st.tasksDone, 0)).toBe(6); // 3 + 3
    expect(doTask(st)).toBeNull();
    st.stars = 500;
    const scenes: string[] = [];
    let r;
    while ((r = doTask(st))) if (r.scene >= 0) scenes.push(`${r.chapter}:${r.scene}${r.chapterDone ? '!' : ''}`);
    expect(scenes).toEqual(CHAPTERS.flatMap((_, c) => [`${c}:0`, `${c}:1`, `${c}:2!`]));
    expect(st.stars).toBe(500 - CHAPTERS.reduce((n, c) => n + chapterCost(c), 0));
    expect(nextTask(st.tasksDone)).toBeNull();
    expect(progress(st.tasksDone).chapter).toBe(CHAPTERS.length);
  });
});

import { CALENDAR, claimCalendar, streakState, tipsAvailable, tipsCap } from '../src/core/retention';

describe('retention', () => {
  it('calendar gives one reward per day and loops after 7', () => {
    const c = { day: 0, last: '' };
    expect(claimCalendar(c, '2026-11-15')?.index).toBe(0);
    expect(claimCalendar(c, '2026-11-15')).toBeNull();
    for (let d = 16; d <= 21; d++) claimCalendar(c, `2026-11-${d}`);
    expect(c.day).toBe(0);
    expect(CALENDAR[6].stars).toBe(2);
  });

  it('tips grow with comfort and stop at the 8 h cap', () => {
    const empty = [[-1, -1, -1, -1, -1]];
    const two = [[0, 1, -1, -1, -1]];
    const h = 3600000;
    expect(tipsAvailable(empty, 0, 10 * h)).toBe(0); // not started
    expect(tipsAvailable(empty, 1, 1 + 3 * h)).toBe(6);
    expect(tipsAvailable(two, 1, 1 + 3 * h)).toBe(12);
    expect(tipsAvailable(two, 1, 1 + 30 * h)).toBe(tipsCap(two));
  });

  it('streak is at risk the day after and lost after that', () => {
    expect(streakState('2026-11-15', 4, '2026-11-15')).toEqual({ streak: 4, alive: true, atRisk: false });
    expect(streakState('2026-11-14', 4, '2026-11-15').atRisk).toBe(true);
    expect(streakState('2026-11-12', 4, '2026-11-15').alive).toBe(false);
  });
});

import { addPaws, eventAt, setComplete, SETS, tagCounts, TRACK, updateVisitor } from '../src/core/live';

describe('live', () => {
  it('visitor arrives only after 2 h away and with enough tags', () => {
    const v = { visitor: -1, until: 0, lastSeen: 0 };
    const cafe = [[0, 2, -1, -1, -1]]; // slot0 v0 -> cozy, slot1 v2 -> cozy
    expect(tagCounts(cafe).cozy).toBe(2);
    expect(updateVisitor(v, cafe, [], 1000, 0)).toBe(false); // first sight only stamps time
    expect(updateVisitor(v, cafe, [], 1000 + 3600000, 0)).toBe(false); // 1 h away
    expect(updateVisitor(v, cafe, [], 1000 + 3600000 * 4, 0)).toBe(true);
    expect(v.visitor).toBe(9); // sphynx likes cozy
    updateVisitor(v, cafe, [9], 1000 + 3600000 * 5, 0);
    expect(v.visitor).toBe(-1); // adopted -> leaves
  });

  it('sets complete when all four breeds are owned', () => {
    expect(setComplete(SETS[0].breeds, [0, 1, 2])).toBe(false);
    expect(setComplete(SETS[0].breeds, [3, 2, 1, 0, 5])).toBe(true);
  });

  it('event track pays out in order and four tracks finish a season', () => {
    const ev = { id: '', paws: 0, claimed: 0 };
    const season = { id: -999, tracks: 0 };
    const weeks = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
    expect(eventAt(weeks[0]).season).toBe(eventAt(weeks[3]).season);
    let done = false;
    weeks.forEach((d, i) => {
      const r = addPaws(ev, season, d, 100);
      expect(r.steps.length).toBe(TRACK.length);
      expect(r.week).toBe(eventAt(d).week);
      if (i === 3) done = r.seasonComplete;
    });
    expect(done).toBe(true);
    expect(addPaws(ev, season, '2026-12-01', 5).steps.length).toBe(0); // same week, track already done
  });
});

import { enDict } from '../src/i18n';
import * as fs from 'fs';

describe('i18n', () => {
  it('every locale keeps placeholders and covers the visible keys', () => {
    const unused = ['title', 'loginReward', 'room', 'buy', 'back', 'rare', 'sound', 'catsInCafe', 'task_story', 'trophyShelf'];
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const f of fs.readdirSync('src/i18n/locales')) {
      const d = JSON.parse(fs.readFileSync('src/i18n/locales/' + f, 'utf8')) as Record<string, string>;
      for (const [k, v] of Object.entries(enDict)) {
        if (unused.includes(k)) continue;
        expect(d[k], `${f}: ${k}`).toBeTypeOf('string');
        expect(ph(d[k]), `${f}: ${k}`).toBe(ph(v));
      }
    }
  });
});

import { challengeParams, parseChallenge, tapPattern } from '../src/core/share';

describe('share', () => {
  it('turns taps into emoji rows and cuts long solves', () => {
    expect(tapPattern(['exit', 'bonk', 'exit'])).toBe('🐈💥🐈');
    const long = tapPattern(Array(30).fill('exit'), 8, 3);
    expect(long.split('\n').length).toBe(3);
    expect(long.endsWith('…')).toBe(true);
  });

  it('round-trips a challenge and rejects junk', () => {
    const c = { date: '2026-11-15', time: 52, hearts: 3 };
    expect(parseChallenge(challengeParams(c))).toEqual(c);
    expect(parseChallenge({ c: '2026-11-15', t: '-1' })).toBeNull();
    expect(parseChallenge({ c: 'x', t: '50' })).toBeNull();
    expect(parseChallenge({ c: '2026-11-15', t: '50', h: '7' })).toBeNull();
    expect(parseChallenge({})).toBeNull();
  });
});

import { AD_RULES, canOfferContinue, interstitialShown, levelDone, newAdState, wantInterstitial } from '../src/core/ads';
describe('ads', () => {
  it('interstitial only from level 6, every 3 levels, 90 s apart, not after rewarded, never with No Ads', () => {
    const s = newAdState();
    let now = 1_000_000;
    for (let i = 0; i < 3; i++) levelDone(s);
    expect(wantInterstitial(s, now, 5, false)).toBe(false);
    expect(wantInterstitial(s, now, 6, false)).toBe(true);
    expect(wantInterstitial(s, now, 6, true)).toBe(false);
    interstitialShown(s, now);
    for (let i = 0; i < 3; i++) levelDone(s);
    expect(wantInterstitial(s, now + 60_000, 9, false)).toBe(false);
    now += AD_RULES.gapMs;
    s.lastRewarded = now - 10_000;
    expect(wantInterstitial(s, now, 9, false)).toBe(false);
    expect(wantInterstitial(s, now + AD_RULES.afterRewardedMs, 9, false)).toBe(true);
  });
  it('continue offer cooldown', () => {
    const s = newAdState();
    expect(canOfferContinue(s, 0)).toBe(true);
    s.lastContinue = 0;
    expect(canOfferContinue(s, 60_000)).toBe(false);
    expect(canOfferContinue(s, AD_RULES.continueGapMs)).toBe(true);
  });
});

import { chapterChest, CHAPTERS as CH, roomChapter } from '../src/core/meta';
import { addFriendship, FRIEND_MAX, FRIEND_STEPS, friendLevel, friendProgress } from '../src/core/friend';
describe('loops', () => {
  it('renovation chapters: rooms alternate, stages 0..2, costs grow, enough for ~100+ levels', () => {
    expect(CH.map((c) => c.stage)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(CH.map((c) => c.room)).toEqual([0, 1, 0, 1, 0, 1]);
    const costs = CH.map(chapterCost);
    for (let i = 2; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 2]);
    expect(costs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(120);
    expect(new Set(CH.flatMap((c) => c.tasks.map((t) => t.id))).size).toBe(CH.length * 5);
    expect(chapterChest(5).fish).toBeGreaterThan(chapterChest(0).fish);
    expect(roomChapter([], 0)).toBe(0);
    expect(roomChapter([], 1)).toBe(1);
  });
  it('friendship levels and rewards', () => {
    expect(friendLevel(0)).toBe(0);
    expect(friendLevel(FRIEND_STEPS[0])).toBe(1);
    expect(friendLevel(10_000)).toBe(FRIEND_MAX);
    expect(friendProgress(10_000)).toBe(1);
    const f: Record<number, number> = {};
    const ups = addFriendship(f, [0, 0, 0, 0, 0, 1]);
    expect(f[0]).toBe(5);
    expect(ups).toEqual([[0, 1]]);
  });
});

describe('fish sink and board ramp (2026-11-16)', () => {
  it('treat adds friendship once per day', async () => {
    const { addFriendship, canTreat, TREAT } = await import('../src/core/friend');
    const f: Record<number, number> = {};
    expect(addFriendship(f, [2], TREAT.points)).toEqual([[2, 1]]);
    expect(f[2]).toBe(5);
    expect(canTreat({ 2: '2026-11-16' }, 2, '2026-11-16')).toBe(false);
    expect(canTreat({ 2: '2026-11-15' }, 2, '2026-11-16')).toBe(true);
  });
});

describe('GDD 2.0 campaign (2026-11-23)', () => {
  it('board sizes and cat counts follow the guardrails (3–8 early, ≤ 18 late, ≤ 12×14)', async () => {
    const { getLevel } = await import('../src/core/levels');
    for (let n = 1; n <= 60; n++) {
      const lv = getLevel(n);
      expect(lv.w, `level ${n}`).toBeLessThanOrEqual(12);
      expect(lv.h, `level ${n}`).toBeLessThanOrEqual(14);
      if (n <= 10) expect(lv.cats.length, `level ${n}`).toBeLessThanOrEqual(10);
      expect(lv.cats.length, `level ${n}`).toBeLessThanOrEqual(18);
    }
  }, 60000);
  it('sleepy cats: a tap wakes them, they never make a level unsolvable', async () => {
    const { getLevel, LESSON } = await import('../src/core/levels');
    const lv = getLevel(LESSON.sleepy);
    expect(lv.cats.filter((c) => c.sleepy).length).toBe(1);
    const b = new Board(lv);
    const id = [...b.asleep][0];
    expect(b.freeCats()).not.toContain(id);
    expect(b.wake(id)).toBe(true);
    expect(b.asleep.has(id)).toBe(false);
    expect(solve(lv).solvable).toBe(true);
  }, 60000);
  it('kittens leave only after their mother; the lesson has one pair', async () => {
    const { getLevel, LESSON } = await import('../src/core/levels');
    const lv = getLevel(LESSON.kitten);
    const kits = lv.cats.filter((c) => c.mother !== undefined);
    expect(kits.length).toBe(1);
    const k = kits[0];
    expect(k.cells.length).toBeLessThanOrEqual(3);
    expect(k.breed).toBe(lv.cats.find((c) => c.id === k.mother)!.breed);
    const b = new Board(lv);
    const r = b.check(k.id);
    expect(r.free).toBe(false);
    expect(r.mother).toBe(true);
    expect(r.blocker).toBe(k.mother);
    expect(solve(lv).solvable).toBe(true);
  }, 60000);
  it('one new rule per lesson level, never before its lesson', async () => {
    const { getLevel, LESSON } = await import('../src/core/levels');
    const { SCRATCHY } = await import('../src/core/content');
    const rules = (n: number) => {
      const lv = getLevel(n);
      return {
        scratchy: lv.cats.some((c) => c.breed === SCRATCHY), sleepy: lv.cats.some((c) => c.sleepy),
        kitten: lv.cats.some((c) => c.mother !== undefined), boxes: lv.boxes.length > 0,
      };
    };
    for (let n = 1; n < LESSON.scratchy; n++) expect(Object.values(rules(n)).some(Boolean), `level ${n}`).toBe(false);
    expect(rules(LESSON.scratchy)).toEqual({ scratchy: true, sleepy: false, kitten: false, boxes: false });
    expect(rules(LESSON.sleepy)).toEqual({ scratchy: false, sleepy: true, kitten: false, boxes: false });
    expect(rules(LESSON.kitten)).toEqual({ scratchy: false, sleepy: false, kitten: true, boxes: false });
    expect(rules(LESSON.boxes)).toEqual({ scratchy: false, sleepy: false, kitten: false, boxes: true });
    for (let n = 1; n < LESSON.boxes; n++) expect(getLevel(n).boxes.length).toBe(0);
  }, 60000);
  it('one tip per level, the daily only teaches the daily', async () => {
    const { levelTips } = await import('../src/core/tutorial');
    const base = { mode: 'level' as const, n: 3, hard: false, sleepy: false, boxes: false, scratchy: false, kittens: false };
    expect(levelTips(base, [])).toEqual([]);
    expect(levelTips({ ...base, n: 14, scratchy: true }, [])).toEqual(['scratchy']);
    expect(levelTips({ ...base, n: 14, scratchy: true }, ['scratchy'])).toEqual(['hint']);
    expect(levelTips({ ...base, mode: 'daily' }, [])).toEqual(['daily']);
  });
  it('paws: 3 without blocked attempts, 2 with one or two, else 1', async () => {
    const { pawsFor } = await import('../src/core/tutorial');
    expect([0, 1, 2, 3, 9].map(pawsFor)).toEqual([3, 2, 2, 1, 1]);
  });
  it('chapters of 20, milestones at 5/10/15/20, daily is core-only and home cats only', async () => {
    const { chapterOf, stepOf, isMilestone, getDaily, BREED_AT } = await import('../src/core/levels');
    expect([1, 20, 21, 60].map(chapterOf)).toEqual([0, 0, 1, 2]);
    expect(stepOf(45)).toBe(5);
    expect([5, 10, 15, 20, 25, 7].map(isMilestone)).toEqual([true, true, true, true, true, false]);
    expect(BREED_AT.slice(0, 4).every((n) => n <= 20)).toBe(true);
    const d = getDaily('2026-11-16');
    expect(d.cats.every((c) => c.breed < 4 && !c.sleepy && c.mother === undefined)).toBe(true);
    expect(d.boxes.length).toBe(0);
  }, 60000);
  it('v6 saves keep their progress in v7', async () => {
    const { migrate } = await import('../src/core/save');
    const s = migrate({ v: 6, level: 35, fish: 300, best: { 1: 3 } });
    expect(s.v).toBe(7);
    expect(s.level).toBe(35);
    expect(s.fish).toBe(300);
    expect(s.musicOff).toBe(false);
    expect(s.feedback.asked).toBe(false);
  });
});

describe('Scratchy crawls (2026-11-23)', () => {
  it('keeps his length, moves like a snake and never makes a level unsolvable', async () => {
    const { getLevel } = await import('../src/core/levels');
    const { SCRATCHY } = await import('../src/core/content');
    const { crawl } = await import('../src/core/scratchy');
    const { mulberry32 } = await import('../src/core/rng');
    let moved = 0;
    for (let n = 14; n <= 60; n++) {
      const lv = getLevel(n);
      const sc = lv.cats.find((c) => c.breed === SCRATCHY);
      if (!sc) continue;
      for (let run = 0; run < 3; run++) {
        const r = mulberry32(n * 31 + run);
        const b = new Board(lv);
        b.asleep.clear();
        for (let step = 0; step < 200 && b.cats.size; step++) {
          const free = b.freeCats();
          expect(free.length, `level ${n} run ${run}: stuck`).toBeGreaterThan(0);
          b.remove(free[Math.floor(r() * free.length)]);
          if (!b.cats.has(sc.id)) continue;
          const len = b.cats.get(sc.id)!.cells.length;
          const next = crawl(b, sc.id, r);
          if (!next) continue;
          moved++;
          b.setCells(sc.id, next);
          const cells = b.cats.get(sc.id)!.cells;
          expect(cells.length).toBe(len);
          for (let i = 1; i < cells.length; i++) expect(Math.abs(cells[i].x - cells[i - 1].x) + Math.abs(cells[i].y - cells[i - 1].y)).toBe(1);
          expect(b.solvable()).toBe(true);
        }
        expect(b.cats.size, `level ${n} run ${run}`).toBe(0);
      }
    }
    expect(moved).toBeGreaterThan(20);
  }, 120000);
});
