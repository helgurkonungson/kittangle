/**
 * Mini-tutorial (GDD 2.0 §4): level 1 teaches the tap with an animated hand, no cards before the first
 * move. Every special rule gets one short, skippable tip the first time it shows up; the board is never
 * locked. Café, collection, daily and event get a card on their first visit. Pure logic.
 */
import { LESSON } from './levels';

export type TipKey =
  | 'blocked' | 'hint' | 'scratchy' | 'sleepy' | 'kitten' | 'boxes' | 'hard' | 'daily'
  | 'combo' | 'cafe' | 'collection' | 'event';

export interface LevelCtx {
  mode: 'level' | 'daily';
  n: number;
  hard: boolean;
  sleepy: boolean;
  boxes: boolean;
  scratchy: boolean;
  kittens: boolean;
}

/** The daily puzzle and the map extras open after the first five levels. */
export const DAILY_FROM_LEVEL = 6;

/** The tip to show at level start (at most one), skipping the ones already seen. */
export function levelTips(c: LevelCtx, seen: readonly string[]): TipKey[] {
  const out: TipKey[] = [];
  if (c.mode === 'daily') out.push('daily');
  if (c.scratchy) out.push('scratchy');
  if (c.kittens) out.push('kitten');
  if (c.sleepy) out.push('sleepy');
  if (c.boxes) out.push('boxes');
  if (c.hard) out.push('hard');
  if (c.mode === 'level' && c.n >= LESSON.hint) out.push('hint');
  return out.filter((k) => !seen.includes(k)).slice(0, 1);
}

/** Paws for a finished level (GDD §5.3): 3 without blocked attempts, 2 with one or two, else 1. */
export const pawsFor = (blocked: number) => (blocked === 0 ? 3 : blocked <= 2 ? 2 : 1);
