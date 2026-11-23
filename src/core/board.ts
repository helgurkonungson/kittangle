import { Cat, Dir, DX, DY, Level } from './types';

export const EMPTY = -1;
export const BOX = -2;

export function headDir(c: Cat): Dir {
  const a = c.cells[0];
  const b = c.cells[1];
  if (a.x > b.x) return 1;
  if (a.x < b.x) return 3;
  if (a.y > b.y) return 2;
  return 0;
}

export interface CheckResult {
  free: boolean;
  /** empty cells in front of the head before the edge or the obstacle */
  steps: number;
  /** EMPTY if free, BOX or id of the blocking cat (the mother when `mother` is set) */
  blocker: number;
  /** the way out is clear, but this kitten's mother is still on the board */
  mother?: boolean;
}

/**
 * Mutable play state. Removing a cat only frees cells (and lets kittens follow their mother),
 * so it never blocks anyone: the greedy solver is exact.
 */
export class Board {
  readonly w: number;
  readonly h: number;
  readonly grid: Int32Array;
  readonly cats = new Map<number, Cat>();
  /** sleepy cats: a tap wakes them (GDD 2.0 §7), only then can they leave */
  asleep = new Set<number>();

  constructor(level: Level) {
    this.w = level.w;
    this.h = level.h;
    this.grid = new Int32Array(level.w * level.h).fill(EMPTY);
    for (const b of level.boxes) this.grid[b.y * this.w + b.x] = BOX;
    for (const c of level.cats) {
      const copy: Cat = { ...c, cells: c.cells.map((p) => ({ ...p })) };
      this.cats.set(c.id, copy);
      if (c.sleepy) this.asleep.add(c.id);
      for (const p of copy.cells) this.grid[p.y * this.w + p.x] = c.id;
    }
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x: number, y: number): number {
    return this.inside(x, y) ? this.grid[y * this.w + x] : EMPTY;
  }

  check(id: number): CheckResult {
    const c = this.cats.get(id)!;
    const d = headDir(c);
    let x = c.cells[0].x + DX[d];
    let y = c.cells[0].y + DY[d];
    let steps = 0;
    while (this.inside(x, y)) {
      const o = this.grid[y * this.w + x];
      if (o !== EMPTY) return { free: false, steps, blocker: o };
      steps++;
      x += DX[d];
      y += DY[d];
    }
    if (c.mother !== undefined && this.cats.has(c.mother)) return { free: false, steps, blocker: c.mother, mother: true };
    return { free: true, steps, blocker: EMPTY };
  }

  /** Wakes a sleepy cat; false if it was awake. */
  wake(id: number) {
    return this.asleep.delete(id);
  }

  /** Removes a cat; returns the kittens whose mother it was (they may follow now). */
  remove(id: number): number[] {
    const c = this.cats.get(id);
    if (!c) return [];
    for (const p of c.cells) this.grid[p.y * this.w + p.x] = EMPTY;
    this.cats.delete(id);
    this.asleep.delete(id);
    return [...this.cats.values()].filter((k) => k.mother === id).map((k) => k.id);
  }

  /** Cats sharing a cell edge with this one. */
  neighbours(id: number): number[] {
    const out = new Set<number>();
    for (const p of this.cats.get(id)?.cells ?? [])
      for (let d = 0; d < 4; d++) {
        const o = this.at(p.x + DX[d], p.y + DY[d]);
        if (o >= 0 && o !== id) out.add(o);
      }
    return [...out];
  }

  /** Cats that can leave right now: clear way out, awake, no mother waiting on the board. */
  freeCats(): number[] {
    return [...this.cats.keys()].filter((id) => !this.asleep.has(id) && this.check(id).free);
  }

  get count() {
    return this.cats.size;
  }
}
