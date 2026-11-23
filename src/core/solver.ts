import { Board } from './board';
import { Level } from './types';

/** Board as the solver sees it: sleepers cost one extra tap, they never block a solution. */
function awakeBoard(level: Level) {
  const b = new Board(level);
  b.asleep.clear();
  return b;
}

/** Greedy solver. Exact for this game because removing a cat never blocks another one. */
export function solve(level: Level) {
  const b = awakeBoard(level);
  const waves: number[][] = [];
  while (b.count) {
    const free = b.freeCats();
    if (!free.length) return { solvable: false, waves };
    free.forEach((id) => b.remove(id));
    waves.push(free);
  }
  return { solvable: true, waves };
}

export function metrics(level: Level) {
  const s = solve(level);
  const cells = level.cats.reduce((n, c) => n + c.cells.length, 0);
  return {
    solvable: s.solvable,
    depth: s.waves.length,
    narrow: s.waves.length ? Math.min(...s.waves.map((w) => w.length)) : 0,
    /** cats free at the start: the fewer, the harder to spot a move */
    first: s.waves[0]?.length ?? 0,
    /** most cats free at one moment (greedy estimate of the worst play order): 1 = strict chain */
    peak: s.solvable ? peakFree(level) : 99,
    cats: level.cats.length,
    fill: (cells + level.boxes.length) / (level.w * level.h),
  };
}

/**
 * Most cats that are free at the same time. Freeness is monotone (removal never blocks), so the
 * player can push this up by first removing cats that unlock many others; we follow exactly that
 * greedy policy (remove the free cat whose removal leaves the most free cats) and keep the max.
 */
export function peakFree(level: Level) {
  const b = awakeBoard(level);
  let peak = 0;
  while (b.count) {
    const free = b.freeCats();
    if (!free.length) break;
    peak = Math.max(peak, free.length);
    let best = free[0];
    let bestN = -1;
    for (const id of free) {
      const c = b.cats.get(id)!;
      b.remove(id);
      const n = b.freeCats().length;
      b.cats.set(id, c);
      for (const p of c.cells) b.grid[p.y * b.w + p.x] = id;
      if (n > bestN) {
        bestN = n;
        best = id;
      }
    }
    b.remove(best);
  }
  return peak;
}
