import { CAFE_SLOTS } from '../core/content';

/**
 * Café screen layout (pure data, no Phaser) so tests can check that tappable things never overlap.
 * Coordinates are in the 720×1280 game space; the room art fills it 1:1. Hall: ceiling beam ends at
 * y≈100, wall to y≈525, wainscot to y≈690, then floor. Attic: wall triangle under the roof slopes
 * (apex ≈ 240,115; right slope ≈ y = 115 + 0.74·(x − 240)), baseboard ≈ 630..680, then floor.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Slot = (typeof CAFE_SLOTS)[number];
/** floor: art stands on the bottom edge; ceiling: hangs from the top edge; wall: centered */
export type Anchor = 'floor' | 'ceiling' | 'wall';
export type Place = Rect & { anchor: Anchor };

const P = (x: number, y: number, w: number, h: number, anchor: Anchor): Place => ({ x, y, w, h, anchor });
/** box from its bottom edge (things standing on the floor) */
const onFloor = (x: number, bottom: number, w: number, h: number) => P(x, bottom - h / 2, w, h, 'floor');
/** box from its top edge (things hanging from the ceiling) */
const hanging = (x: number, top: number, w: number, h: number) => P(x, top + h / 2, w, h, 'ceiling');

/**
 * Where each decor piece goes, per room and slot; one entry per variant when variants differ in kind
 * (a ceiling pendant and a floor lamp cannot share a spot). The art is fitted into the box.
 */
export const PLACES: Record<Slot, Place[]>[] = [
  { // hall
    window: [P(500, 385, 270, 270, 'wall')],
    lamp: [hanging(215, 100, 200, 230), onFloor(78, 790, 130, 340), onFloor(78, 790, 130, 200)],
    post: [onFloor(620, 850, 190, 330)],
    sofa: [onFloor(310, 900, 330, 230)],
    counter: [onFloor(520, 1090, 330, 190)],
  },
  { // attic
    window: [P(220, 430, 240, 240, 'wall')],
    lamp: [hanging(450, 290, 160, 200), hanging(450, 285, 200, 120), hanging(450, 290, 160, 200)],
    post: [P(630, 520, 150, 200, 'wall')],
    sofa: [onFloor(230, 900, 320, 230)],
    counter: [onFloor(520, 1090, 330, 190)],
  },
];

/** Placement of a slot's variant (an empty slot uses the first spot). */
export function placeOf(room: number, slot: Slot, variant: number): Place {
  const list = PLACES[room][slot];
  return list[Math.min(Math.max(variant, 0), list.length - 1)];
}

const btn = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** Fixed controls on the café screen. */
export const CAFE_UI = {
  back: btn(64, 64, 96, 96),
  stars: btn(720 - 24 - 65, 64, 130, 56),
  // labelled pills ("◀ Hall" / "Attic ▶") so they never read as the Back button
  prevRoom: btn(96, 215, 168, 64),
  nextRoom: btn(720 - 96, 215, 168, 64),
  tips: btn(130, 1065, 210, 70),
  taskPanel: btn(360, 1190, 680, 136),
  visitor: btn(250, 975, 140, 110),
};

export const overlaps = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
