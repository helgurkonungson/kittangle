import { Board, EMPTY } from './board';
import { Cell, DX, DY } from './types';

/**
 * Scratchy crawls (user design 2026-11-23): after every cat that leaves, he slides one cell like a snake:
 * the head steps into a free neighbouring cell and the body follows, so his position, direction and bends
 * change but never his length. He likes to get in the way: among the moves he prefers the one that blocks
 * the most cats that could leave. He only takes moves after which the board can still be cleared, so the
 * level always stays solvable; if no such move exists he stays put.
 */
export function crawl(b: Board, id: number, rnd: () => number): Cell[] | null {
  const cat = b.cats.get(id);
  if (!cat) return null;
  const old = cat.cells;
  const head = old[0];
  const freeBefore = new Set(b.freeCats());
  let best: Cell[] | null = null;
  let bestScore = -Infinity;
  for (let d = 0; d < 4; d++) {
    const x = head.x + DX[d];
    const y = head.y + DY[d];
    if (!b.inside(x, y) || b.at(x, y) !== EMPTY) continue;
    const cells = [{ x, y }, ...old.slice(0, -1)];
    b.setCells(id, cells);
    if (b.solvable()) {
      let blocked = 0;
      for (const o of freeBefore) if (o !== id && b.cats.has(o) && !b.check(o).free) blocked++;
      const score = blocked * 2 + rnd();
      if (score > bestScore) {
        bestScore = score;
        best = cells;
      }
    }
    b.setCells(id, old);
  }
  return best;
}
