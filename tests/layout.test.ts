import { describe, expect, it } from 'vitest';
import { CAFE_SLOTS } from '../src/core/content';
import { CAFE_UI, overlaps, PLACES } from '../src/game/cafeLayout';

/** Every variant combination: tap areas never overlap, never hit screen controls, stay in the picture. */
describe('café layout', () => {
  const ui = Object.entries(CAFE_UI);
  PLACES.forEach((room, r) => {
    const all = CAFE_SLOTS.flatMap((s) => room[s].map((p, v) => ({ s, v, p })));
    it(`room ${r + 1}: pieces of different slots never overlap`, () => {
      for (const a of all) for (const b of all)
        if (a.s < b.s) expect(overlaps(a.p, b.p), `${a.s}${a.v} × ${b.s}${b.v}`).toBe(false);
    });
    it(`room ${r + 1}: pieces do not overlap screen controls`, () => {
      // the first room has no "previous room" pill
      for (const a of all) for (const [name, rect] of ui)
        if (!(r === 0 && name === 'prevRoom')) expect(overlaps(a.p, rect), `${a.s}${a.v} × ${name}`).toBe(false);
    });
    it(`room ${r + 1}: pieces stay inside the room, windows on the wall, floor pieces on the floor`, () => {
      for (const { s, v, p } of all) {
        expect(p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= 720 && p.y - p.h / 2 >= 100 && p.y + p.h / 2 <= 1120, `${s}${v}`).toBe(true);
        if (s === 'window') expect(p.y + p.h / 2, 'window above the wainscot/baseboard').toBeLessThanOrEqual(r ? 630 : 525);
        if (p.anchor === 'floor') expect(p.y + p.h / 2, `${s}${v} stands on the floor`).toBeGreaterThanOrEqual(r ? 680 : 690);
        if (p.anchor === 'ceiling') expect(p.y + p.h / 2, `${s}${v} hangs above the floor`).toBeLessThan(r ? 630 : 525);
      }
    });
  });
  it('screen controls do not overlap each other', () => {
    for (let i = 0; i < ui.length; i++)
      for (let j = i + 1; j < ui.length; j++) expect(overlaps(ui[i][1], ui[j][1]), `${ui[i][0]} × ${ui[j][0]}`).toBe(false);
  });
});
