export interface Breed {
  key: string;
  body: number;
  accent: number;
  rare?: boolean;
  /** recurring character, not a collectible variant (GDD 2.0 §6) */
  special?: boolean;
}

export const BREEDS: Breed[] = [
  { key: 'ginger', body: 0xf2a65a, accent: 0xd9822b },
  { key: 'gray', body: 0x9aa5b1, accent: 0x6b7785 },
  { key: 'black', body: 0x45414a, accent: 0x5f5a66 },
  { key: 'white', body: 0xf7f3ec, accent: 0xddd6cb },
  { key: 'calico', body: 0xf5efe6, accent: 0xe08a3c },
  { key: 'siamese', body: 0xeadbc4, accent: 0x6b4f3a },
  { key: 'british', body: 0x8c9bb0, accent: 0x76859b },
  { key: 'tabby', body: 0xc9a27e, accent: 0x8a6a4c },
  { key: 'mainecoon', body: 0x9b6b43, accent: 0x5c3d24, rare: true },
  { key: 'sphynx', body: 0xf2c6c2, accent: 0xe0a8a2, rare: true },
  { key: 'bengal', body: 0xe8b35a, accent: 0x7a4b1e, rare: true },
  { key: 'golden', body: 0xffd54a, accent: 0xf0a500, rare: true },
  // Scratchy: charcoal blue-gray, coral neckerchief (drawn in drawCat)
  { key: 'scratchy', body: 0x5b6577, accent: 0x454d5c, special: true },
  // Moony: midnight indigo with a gold crescent on the forehead; invisible until something bumps into him
  { key: 'moony', body: 0x2a2858, accent: 0x1b1a3d, special: true },
];
/** index of Scratchy in BREEDS */
export const SCRATCHY = 12;
/** index of Moony in BREEDS */
export const MOONY = 13;
/** the twelve collectible variants */
export const COLLECTIBLE = BREEDS.filter((b) => !b.special).length;

// GDD 2.0 §11: hint is the only booster (feed and hearts are gone); boards are small again
export const COST = { hint: 30 };
export const FISH_PER_CAT = 1;
export const levelReward = (n: number, hard: boolean) => (hard ? 40 : 10 + ((n * 7) % 11));
export const DAILY_REWARD = 30;
export const DAILY_STREAK_BONUS: Record<number, number> = { 3: 50, 7: 150, 30: 500 };
export const loginReward = (streak: number) => Math.min(10 + streak * 10, 70);
export const COMBO_WINDOW_MS = 1500;
/** extra fish per cat during a combo is capped (uncapped combos flooded the wallet on big boards) */
export const COMBO_BONUS_MAX = 2;

export const CAFE_SLOTS = ['window', 'lamp', 'post', 'sofa', 'counter'] as const;
export const CAFE_ROOMS = 2;
export const CAFE_VARIANTS = [
  [0xe9a6a6, 0xa6c8e9, 0xb5e3b0],
  [0xf3d27a, 0xc9b3e6, 0x9fd8d2],
];
export const slotCost = (room: number, slot: number) => (100 + slot * 50) * (room + 1);
