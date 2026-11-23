import { CAFE_ROOMS, CAFE_SLOTS } from './content';
import { tiersFromTasks } from './meta';

export interface DailyResult {
  /** paws 1..3 (named hearts before GDD 2.0; kept for old saves and share links) */
  hearts: number;
  time: number;
}

export interface SaveData {
  v: 7;
  /** music toggle, separate from sound (GDD 2.0 §12.2) */
  musicOff: boolean;
  /** chapter-1 satisfaction check: shown once (GDD 2.0 §10.4) */
  feedback: { asked: boolean; answer: string };
  visit: { visitor: number; until: number; lastSeen: number };
  setsClaimed: string[];
  accessories: string[];
  /** breed -> accessory id */
  equipped: Record<number, string>;
  trophies: string[];
  event: { id: string; paws: number; claimed: number };
  season: { id: number; tracks: number };
  /** best daily puzzle time in seconds, 0 = none */
  dailyBest: number;
  calendar: { day: number; last: string };
  /** ms timestamp since tips started accumulating (0 = not started) */
  tips: { since: number };
  level: number;
  fish: number;
  stars: number;
  /** completed café task ids, see core/meta.ts */
  tasksDone: string[];
  /** best paws (1..3) per level number */
  best: Record<number, number>;
  /** chapter key -> still flawless (no lost hearts) */
  flawless: Record<string, boolean>;
  /** residents whose golden frame is unlocked */
  frames: string[];
  introSeen: boolean;
  /** mechanic explanations already shown (core/tutorial.ts) */
  tipsSeen: string[];
  breeds: number[];
  /** cafe[room][slot] = chosen variant, -1 not bought */
  cafe: number[][];
  /** cafeTier[room][slot] = highest variant unlocked by renovation chapters, -1 none */
  cafeTier: number[][];
  /** last renovation chapter whose intro was shown */
  chapterIntro: number;
  /** consecutive won levels (short loop) */
  winStreak: number;
  /** breed -> rescued cats of that breed (friendship, long loop) */
  friend: Record<number, number>;
  /** breed -> last local date it got a fish treat (fish sink, once per day per breed) */
  friendTreat: Record<number, string>;
  daily: { last: string; streak: number; results: Record<string, DailyResult> };
  login: { last: string; streak: number };
  muted: boolean;
  /** "No Ads" bought: no interstitials (rewarded stays, it is opt-in) */
  noAds: boolean;
  /** owned non-consumable product ids */
  purchases: string[];
}

export const SAVE_VERSION = 7;

export function defaultSave(): SaveData {
  return {
    v: 7,
    musicOff: false,
    feedback: { asked: false, answer: '' },
    visit: { visitor: -1, until: 0, lastSeen: 0 },
    setsClaimed: [],
    accessories: [],
    equipped: {},
    trophies: [],
    event: { id: '', paws: 0, claimed: 0 },
    season: { id: -999, tracks: 0 },
    dailyBest: 0,
    calendar: { day: 0, last: '' },
    tips: { since: 0 },
    level: 1,
    fish: 0,
    stars: 0,
    tasksDone: [],
    best: {},
    flawless: {},
    frames: [],
    introSeen: false,
    tipsSeen: [],
    breeds: [],
    cafe: Array.from({ length: CAFE_ROOMS }, () => CAFE_SLOTS.map(() => -1)),
    cafeTier: Array.from({ length: CAFE_ROOMS }, () => CAFE_SLOTS.map(() => -1)),
    chapterIntro: -1,
    winStreak: 0,
    friend: {},
    friendTreat: {},
    daily: { last: '', streak: 0, results: {} },
    login: { last: '', streak: 0 },
    muted: false,
    noAds: false,
    purchases: [],
  };
}

/** Accepts anything from storage and returns a valid current-version save. */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Omit<Partial<SaveData>, 'v'> & { v?: number };
  // v6 (2026-11-17, before release): cat count/board size, sleepy rule and art changed, testers start over.
  // Purchases are kept. After release never wipe: migrate instead.
  if ((s.v ?? 0) < 6) return { ...base, noAds: !!s.noAds, purchases: [...(s.purchases ?? [])] };
  const cafe = base.cafe.map((room, r) => room.map((v, i) => s.cafe?.[r]?.[i] ?? v));
  const tasksDone = s.tasksDone ?? [];
  const cafeTier = tiersFromTasks(tasksDone, CAFE_ROOMS, CAFE_SLOTS.length);
  cafe.forEach((room, r) => room.forEach((v, i) => {
    if (v > cafeTier[r][i]) room[i] = cafeTier[r][i];
  }));
  return {
    ...base,
    ...s,
    v: 7,
    // v7 (GDD 2.0): hearts became paws, the campaign was rebuilt; progress is kept
    feedback: { ...base.feedback, ...(s.feedback ?? {}) },
    tasksDone,
    visit: { ...base.visit, ...(s.visit ?? {}) },
    event: { ...base.event, ...(s.event ?? {}) },
    season: { ...base.season, ...(s.season ?? {}) },
    calendar: { ...base.calendar, ...(s.calendar ?? {}) },
    tips: { ...base.tips, ...(s.tips ?? {}) },
    daily: { ...base.daily, ...(s.daily ?? {}) },
    login: { ...base.login, ...(s.login ?? {}) },
    cafe,
    // looks are unlocked only by renovation tasks; a piece shown in a look not yet earned falls back
    cafeTier,
    friend: { ...(s.friend ?? {}) },
    friendTreat: { ...(s.friendTreat ?? {}) },
    tipsSeen: [...(s.tipsSeen ?? [])],
  };
}

export const prevDate = (date: string) =>
  new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
