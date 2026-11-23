import { GenParams, generateOnce } from './generator';
import { metrics, solve } from './solver';
import { hashStr, mulberry32 } from './rng';
import { SCRATCHY } from './content';
import { Board, EMPTY, headDir } from './board';
import { Cat, Cell, DX, DY, Level } from './types';

/**
 * Campaign (GDD 2.0 §8–9): chapters of 20 levels, 60 levels for the resubmission, endless after that.
 * Levels 1–3 are hand-drawn, the rest are curated: many seeded candidates per level, filtered by cat
 * count and ranked by puzzle depth (greedy waves, few free cats at a time). Same id → same level everywhere.
 */
export const CHAPTER_LEN = 20;
export const CAMPAIGN_LEVELS = 60;
export const CHAPTER_KEYS = ['house', 'garden', 'roof', 'kitchen'] as const;
export const chapterOf = (n: number) => Math.floor((n - 1) / CHAPTER_LEN);
/** level inside its chapter, 1..20 */
export const stepOf = (n: number) => ((n - 1) % CHAPTER_LEN) + 1;
export const chapterKey = (ch: number) => CHAPTER_KEYS[Math.min(ch, CHAPTER_KEYS.length - 1)];
/** map milestones (chest nodes) inside a chapter */
export const MILESTONES = [5, 10, 15, 20];
export const isMilestone = (n: number) => MILESTONES.includes(stepOf(n));

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

type Raw = [number, number][];
const cats = (list: { b: number; c: Raw }[]): Cat[] =>
  list.map((k, id) => ({ id, breed: k.b, cells: k.c.map(([x, y]) => ({ x, y })) }));

/** Hand-drawn first levels: one obvious move, then a first ordering, then a safe blocked move. */
const HANDMADE: Level[] = [
  {
    id: 'L1', w: 5, h: 6, boxes: [],
    cats: cats([
      { b: 0, c: [[1, 2], [1, 3], [1, 4]] },
      { b: 1, c: [[3, 3], [3, 2]] },
    ]),
  },
  {
    id: 'L2', w: 5, h: 6, boxes: [],
    cats: cats([
      { b: 0, c: [[2, 3], [2, 4], [2, 5]] },
      { b: 0, c: [[0, 1], [1, 1], [2, 1]] },
      { b: 1, c: [[4, 2], [4, 3]] },
    ]),
  },
  {
    id: 'L3', w: 5, h: 6, boxes: [],
    cats: cats([
      { b: 0, c: [[2, 3], [2, 4], [2, 5]] },
      { b: 0, c: [[3, 2], [2, 2], [1, 2]] },
      { b: 1, c: [[4, 3], [4, 2], [4, 1]] },
      { b: 1, c: [[0, 4], [1, 4]] },
      { b: 0, c: [[0, 0], [1, 0]] },
    ]),
  },
];

export const HANDMADE_COUNT = HANDMADE.length;
/** every 10th level is a hard one (2× reward), the level after it is a rest level */
export const isHard = (n: number) => n > 5 && n % 10 === 0;
const isRest = (n: number) => n > 10 && n % 10 === 1;

/** Where each special rule is taught: one safe demo level, practice, combinations later (GDD §7). */
export const LESSON = { blocked: 3, hint: 7, scratchy: 14, sleepy: 21, kitten: 26, boxes: 41 } as const;

/**
 * Level where each common cat variant first appears (index = breed): the home set (0–3) is complete
 * inside chapter 1, the street set (4–7) inside chapter 2. Rare variants come from milestones and the café.
 */
export const BREED_AT = [1, 1, 6, 12, 22, 28, 34, 40];
export const breedsAt = (n: number) => BREED_AT.map((at, b) => (at <= n ? b : -1)).filter((b) => b >= 0);

/** Cat count target for a level: 3–8 early, 6–12 mid, 8–16 late (GDD §9 guardrails). */
export function catRange(n: number): [number, number] {
  const ch = chapterOf(n);
  const t = (stepOf(n) - 1) / (CHAPTER_LEN - 1);
  let c = n <= 5 ? 4 : ch === 0 ? lerp(5, 9, t) : ch === 1 ? lerp(8, 12, t) : lerp(10, 15, t);
  if (isHard(n)) c += 2;
  if (isRest(n)) c -= 2;
  const lo = Math.max(3, Math.round(c - 1));
  return [lo, Math.round(c + 1)];
}

/** Special rules used on a level. */
export interface Specials {
  scratchy: number;
  sleepy: number;
  kittens: number;
  boxes: number;
}

export function specialsFor(n: number): Specials {
  const s: Specials = { scratchy: 0, sleepy: 0, kittens: 0, boxes: 0 };
  if (n === LESSON.scratchy) return { ...s, scratchy: 1 };
  if (n === LESSON.sleepy) return { ...s, sleepy: 1 };
  if (n === LESSON.kitten) return { ...s, kittens: 1 };
  if (n === LESSON.boxes) return { ...s, boxes: 2 };
  // practice right after each lesson, combinations later; never two new rules at once
  if (n > LESSON.scratchy && n % 3 === 2) s.scratchy = 1;
  if (n > LESSON.sleepy) s.sleepy = n < LESSON.kitten ? 2 : n % 2 ? 1 + (n % 3) : 0;
  if (n > LESSON.kitten) s.kittens = n < 32 ? 1 : n % 2 ? 1 : 2;
  if (n > LESSON.boxes) s.boxes = n < 46 ? 1 + (n % 2) : n % 3 ? 2 : 0;
  if (n > LESSON.kitten && n < 32) s.sleepy = 0; // kitten practice alone
  if (n > LESSON.boxes && n < 44) s.sleepy = s.kittens = 0; // box practice alone
  return s;
}

export function levelParams(n: number): GenParams {
  const ch = chapterOf(n);
  const t = (stepOf(n) - 1) / (CHAPTER_LEN - 1);
  const hard = isHard(n);
  const [lo, hi] = catRange(n);
  const w = Math.round(n <= 5 ? 5 : ch === 0 ? lerp(6, 8, t) : ch === 1 ? lerp(7, 9, t) : lerp(8, 11, t));
  const h = Math.round(n <= 5 ? 6 : ch === 0 ? lerp(7, 9, t) : ch === 1 ? lerp(9, 11, t) : lerp(10, 13, t));
  const avgLen = Math.min(6, 3 + ch + t * 1.5);
  const sp = specialsFor(n);
  return {
    w, h,
    fill: clamp((((lo + hi) / 2) * avgLen) / (w * h), 0.3, 0.75),
    minLen: 2,
    maxLen: clamp(Math.round(avgLen + 2), 3, 8),
    turn: clamp(0.3 + ch * 0.1 + t * 0.1, 0.3, 0.6),
    tangle: hard ? 1 : clamp(0.6 + t * 0.3, 0.6, 0.9),
    boxes: sp.boxes,
    sleepy: 0,
    breeds: breedsAt(n),
    depth: hi,
    // a few free cats at once: the player has to find the move, not just tap anything
    maxFree: hard ? 1 : n <= 5 ? 2 : stepOf(n) % 3 === 0 ? 1 : 2,
    sparse: true,
  };
}

/** Puzzle-depth score of a candidate (higher is better): many waves, few free cats per wave. */
function depthScore(lv: Level, p: GenParams, range: [number, number]) {
  const m = metrics(lv);
  if (!m.solvable || m.cats < range[0] || m.cats > range[1]) return -Infinity;
  const over = Math.max(0, m.peak - (p.maxFree ?? 9));
  return m.depth * 4 / m.cats * 10 - over * 8 - m.first * 3 - m.peak;
}

/** Puts the special rules on a curated board; every step keeps it solvable. */
function applySpecials(lv: Level, sp: Specials, seed: number) {
  const r = mulberry32(seed ^ 0x5bd1e995);
  const wave = new Map<number, number>();
  solve(lv).waves.forEach((ids, i) => ids.forEach((id) => wave.set(id, i)));
  const used = new Set<number>();
  const pick = (ok: (c: Cat) => boolean) => {
    const opts = lv.cats.filter((c) => !used.has(c.id) && ok(c));
    if (!opts.length) return undefined;
    const c = opts[Math.floor(r() * opts.length)];
    used.add(c.id);
    return c;
  };
  // Scratchy: a cat that is blocked at the start, so the player is likely to try him early
  for (let i = 0; i < sp.scratchy; i++) {
    const c = pick((c) => (wave.get(c.id) ?? 0) >= 1 && c.cells.length >= 3) ?? pick((c) => (wave.get(c.id) ?? 0) >= 1);
    if (c) c.breed = SCRATCHY;
  }
  for (let i = 0; i < sp.kittens; i++) addKitten(lv, wave, used, r);
  for (let i = 0; i < sp.sleepy; i++) {
    const c = pick((c) => c.mother === undefined && c.breed !== SCRATCHY);
    if (c) c.sleepy = true;
  }
}

/**
 * Adds a 2-cell kitten in an empty spot: its own way out is clear from the start (it looks free), but it
 * has to wait for its mother, a cat from the deepest wave. Its cells lie in no other cat's exit lane, so
 * it never blocks anyone and the level stays solvable.
 */
function addKitten(lv: Level, wave: Map<number, number>, used: Set<number>, r: () => number) {
  const b = new Board(lv);
  const lane = new Set<number>();
  for (const c of lv.cats) {
    const d = headDir(c);
    let { x, y } = c.cells[0];
    for (x += DX[d], y += DY[d]; b.inside(x, y); x += DX[d], y += DY[d]) lane.add(y * lv.w + x);
  }
  const mothers = lv.cats
    .filter((m) => !used.has(m.id) && m.breed !== SCRATCHY && !m.sleepy && m.mother === undefined)
    .sort((a, z) => (wave.get(z.id) ?? 0) - (wave.get(a.id) ?? 0));
  const mother = mothers[0];
  if (!mother) return;
  const spots: Cell[][] = [];
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) for (let d = 0; d < 4; d++) {
    const tx = x - DX[d];
    const ty = y - DY[d];
    if (!b.inside(tx, ty) || b.at(x, y) !== EMPTY || b.at(tx, ty) !== EMPTY) continue;
    if (lane.has(y * lv.w + x) || lane.has(ty * lv.w + tx)) continue;
    let clear = true;
    for (let px = x + DX[d], py = y + DY[d]; b.inside(px, py); px += DX[d], py += DY[d]) if (b.at(px, py) !== EMPTY) clear = false;
    if (clear) spots.push([{ x, y }, { x: tx, y: ty }]);
  }
  if (!spots.length) return;
  used.add(mother.id);
  const id = lv.cats.length;
  lv.cats.push({ id, breed: mother.breed, mother: mother.id, cells: spots[Math.floor(r() * spots.length)] });
  used.add(id);
}

const cache = new Map<string, Level>();

/** Builds a curated level: best of many seeded candidates, then its special rules. */
function curated(seedKey: string, n: number, id: string, p: GenParams = levelParams(n), sp: Specials = specialsFor(n)) {
  const range = catRange(n);
  const seed = hashStr(seedKey);
  let best: Level | null = null;
  let bestScore = -Infinity;
  const fills = [p.fill, p.fill * 1.25, p.fill * 0.8];
  for (let i = 0; i < 36; i++) {
    const q = { ...p, fill: clamp(fills[i % 3], 0.25, 0.85) };
    const lv = generateOnce(seed + i * 7919, q, id);
    const s = depthScore(lv, q, range);
    if (s > bestScore) {
      bestScore = s;
      best = lv;
    }
    if (i >= 11 && best) break; // enough candidates once one fits the range
  }
  // fallback: no candidate hit the cat range, take a plain one
  const lv = best ?? generateOnce(seed, { ...p, sparse: false, maxFree: undefined }, id);
  applySpecials(lv, sp, seed);
  return lv;
}

export function getLevel(n: number): Level {
  if (n <= HANDMADE_COUNT) return HANDMADE[n - 1];
  const key = 'L' + n;
  let lv = cache.get(key);
  if (!lv) {
    lv = curated('lvl' + n, n, key);
    lv.hard = isHard(n);
    // a new variant shows up on the level where it is introduced
    const nb = BREED_AT.indexOf(n);
    const plain = lv.cats.filter((c) => c.breed !== SCRATCHY && c.mother === undefined);
    if (nb >= 0 && plain.length && !lv.cats.some((c) => c.breed === nb)) plain[plain.length - 1].breed = nb;
    cache.set(key, lv);
  }
  return lv;
}

/** 'YYYY-MM-DD' in UTC */
export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

const DAILY_EPOCH = Date.UTC(2026, 10, 15);
export const dailyNumber = (date: string) =>
  Math.max(1, Math.round((Date.parse(date + "T00:00:00Z") - DAILY_EPOCH) / 86400000) + 1);

/** One shared board per UTC date: core rule only (fair for everyone, whatever chapter they are in). */
export function getDaily(date: string): Level {
  const key = 'D' + date;
  let lv = cache.get(key);
  if (!lv) {
    const p = { ...levelParams(16), breeds: [0, 1, 2, 3], boxes: 0 };
    lv = curated('daily' + date, 16, key, p, { scratchy: 0, sleepy: 0, kittens: 0, boxes: 0 });
    cache.set(key, lv);
  }
  return lv;
}

