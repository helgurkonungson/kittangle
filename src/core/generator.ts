import { mulberry32, randInt, shuffle } from './rng';
import { metrics } from './solver';
import { Cat, Cell, Dir, DX, DY, Level } from './types';

/** share of the board the chain itself fills when maxFree is set (sweep 2026-11-16: 0.6 → 88% levels
 *  meet the limit, ~86% fill after tail growth; 1.0 → none meet it) */
const FILL_K = 0.5;

export interface GenParams {
  w: number;
  h: number;
  fill: number;
  minLen: number;
  maxLen: number;
  /** chance to turn on each body step */
  turn: number;
  boxes: number;
  sleepy: number;
  breeds: number[];
  rare?: number;
  /** target number of greedy waves */
  depth: number;
  /** 0..1: how hard placement tries to block cats that are still free (tangled, few exits at a time) */
  tangle?: number;
  /** max cats free at one moment (2026-11-16 playtest: 3 early → 1 late); undefined = no limit */
  maxFree?: number;
  /** GDD 2.0: leave holes instead of filling the board with many tiny cats */
  sparse?: boolean;
}

/**
 * Reverse construction: every new cat gets a head direction whose exit path is clear
 * of all cats placed before it. Removing cats in reverse placement order always works.
 */
export function generateOnce(seed: number, p: GenParams, id: string): Level {
  const r = mulberry32(seed);
  const { w, h } = p;
  const occ = new Int32Array(w * h).fill(-1);
  const idx = (x: number, y: number) => y * w + x;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  const boxes: Cell[] = [];
  for (let t = 0; boxes.length < p.boxes && t < 50; t++) {
    const x = randInt(r, 1, w - 2);
    const y = randInt(r, 1, h - 2);
    if (occ[idx(x, y)] === -1) {
      occ[idx(x, y)] = -2;
      boxes.push({ x, y });
    }
  }

  const cats: Cat[] = [];
  // with a free-cat limit the chain is built sparse (lanes stay long), fillGaps grows tails into the rest
  const target = Math.floor(p.fill * w * h * (p.maxFree && !p.sparse ? FILL_K : 1));
  let filled = boxes.length;
  let fails = 0;

  // exit lanes of placed cats: cell -> cats whose way out crosses it; blocked[c] = cats sitting in c's lane
  const laneOf = new Map<number, number[]>();
  const blocked: number[] = [];

  /** One random cat with its head at (x, y), or null. */
  const tryCat = (x: number, y: number): { cells: Cell[]; lane: number[] } | null => {
    for (const d of shuffle(r, [0, 1, 2, 3] as Dir[])) {
      const path = new Set<number>();
      let px = x + DX[d];
      let py = y + DY[d];
      let ok = true;
      while (inb(px, py)) {
        if (occ[idx(px, py)] !== -1) {
          ok = false;
          break;
        }
        path.add(idx(px, py));
        px += DX[d];
        py += DY[d];
      }
      if (!ok) continue;
      const bx = x - DX[d];
      const by = y - DY[d];
      if (!inb(bx, by) || occ[idx(bx, by)] !== -1) continue;

      const len = randInt(r, p.minLen, p.maxLen);
      const cells: Cell[] = [{ x, y }, { x: bx, y: by }];
      const used = new Set([idx(x, y), idx(bx, by)]);
      let cx = bx;
      let cy = by;
      let md = d; // direction of travel along this body segment
      while (cells.length < len) {
        const perp = shuffle(r, [((md + 1) % 4) as Dir, ((md + 3) % 4) as Dir]);
        const order = r() < p.turn ? [...perp, md] : [md, ...perp];
        let moved = false;
        for (const nd of order) {
          const nx = cx - DX[nd];
          const ny = cy - DY[nd];
          const k = idx(nx, ny);
          if (!inb(nx, ny) || occ[k] !== -1 || used.has(k) || path.has(k)) continue;
          cells.push({ x: nx, y: ny });
          used.add(k);
          cx = nx;
          cy = ny;
          md = nd;
          moved = true;
          break;
        }
        if (!moved) break;
      }
      if (cells.length >= p.minLen) return { cells, lane: [...path] };
    }
    return null;
  };

  /** How many still-free cats this body would block (more = deeper, more tangled puzzle). */
  const blocksFree = (cells: Cell[]) => {
    const hit = new Set<number>();
    for (const c of cells) for (const o of laneOf.get(idx(c.x, c.y)) ?? []) if (!blocked[o]) hit.add(o);
    return hit.size;
  };

  const K = p.maxFree ?? 99;
  /** cats whose way out is clear right now (in reverse-order play this is what the player sees) */
  let freeNow = 0;
  /** empty cells in the exit lanes of free cats: a new cat placed there blocks one of them */
  const freeLaneCells = () => {
    const out: number[] = [];
    for (const [k, owners] of laneOf) {
      if (occ[k] !== -1 || !owners.some((o) => !blocked[o])) continue;
      out.push(k, k); // the lane cell itself (twice: preferred) and its neighbours (body crosses the lane)
      const x = k % w;
      const y = Math.floor(k / w);
      for (let d = 0; d < 4; d++) if (inb(x + DX[d], y + DY[d])) out.push(idx(x + DX[d], y + DY[d]));
    }
    return out;
  };
  /** Adds the cat: marks its cells, blocks the cats whose lanes it crosses, registers its own lane. */
  const place = (made: { cells: Cell[]; lane: number[] }, sleepy: boolean) => {
    const cid = cats.length;
    freeNow += 1 - blocksFree(made.cells);
    for (const c of made.cells) {
      const k = idx(c.x, c.y);
      occ[k] = cid;
      for (const o of laneOf.get(k) ?? []) blocked[o] = (blocked[o] ?? 0) + 1;
    }
    blocked[cid] = 0;
    for (const k of made.lane) laneOf.set(k, [...(laneOf.get(k) ?? []), cid]);
    cats.push({ id: cid, cells: made.cells, breed: p.breeds[Math.floor(r() * p.breeds.length)], sleepy });
  };
  const tries = Math.max(1, Math.round(1 + (p.tangle ?? 0) * 11)) + (K < 99 ? 40 : 0);
  while (filled < target && fails < 1500) {
    let made: { cells: Cell[]; lane: number[] } | null = null;
    let bestScore = -Infinity;
    const lanes = K < 99 && freeNow >= K ? freeLaneCells() : [];
    for (let t = 0; t < tries; t++) {
      // with a free-cat limit, half the tries start inside a free cat's lane (so the new cat blocks it)
      const k = lanes.length && t % 3 !== 0 ? lanes[Math.floor(r() * lanes.length)] : randInt(r, 0, w * h - 1);
      const x = k % w;
      const y = Math.floor(k / w);
      if (occ[idx(x, y)] !== -1) continue;
      const c = tryCat(x, y);
      if (!c) continue;
      // keep the free-cat limit, then prefer blocking free cats, then longer bodies; random tie-break
      const bf = blocksFree(c.cells);
      const over = Math.max(0, freeNow - bf + 1 - Math.max(K, freeNow)); // never grow past the limit
      // a cat with no lane (head on the edge, facing out) can never be blocked later: with a limit it
      // would stay free for the whole level, so it counts as going over
      const dead = K < 99 && c.lane.length < 2 ? 2 : 0;
      // with a limit a longer lane is easier to block later
      const laneBonus = K < 99 ? Math.min(c.lane.length, 8) * 4 : 0;
      const score = -(over + dead) * 1000 + bf * 10 + laneBonus + c.cells.length + r();
      if (score > bestScore) {
        bestScore = score;
        made = c;
      }
    }
    // over the free-cat limit: retry; every 50th miss accept it rather than leave the board half empty
    if (!made || (bestScore < -500 && ++fails % 150 !== 0)) {
      if (!made) fails++;
      continue;
    }
    place(made, made.cells.length >= 3 && r() < p.sleepy);
    filled += made.cells.length;
  }
  if (!p.sparse) fillGaps();
  if (p.rare !== undefined && cats.length) cats[Math.floor(r() * cats.length)].breed = p.rare;
  return { id, w, h, cats, boxes };

  /**
   * Leaves no empty cells (playtest: holes look unfinished). Keeps solvability: removal order is the
   * reverse of placement, so a cell may join cat A only if every cat whose exit lane crosses it was
   * placed before A (A is gone by the time they leave). Steps: grow tails into free neighbours, then
   * drop short new cats whose way out is already clear (they leave first); leftovers become boxes.
   */
  function fillGaps() {
    const maxLen = Math.min(p.maxLen + 3, 8); // short cats: late levels hold 40+ of them
    const canTake = (k: number, owner: number) => (laneOf.get(k) ?? []).every((b) => b < owner);
    for (let round = 0; round < 40; round++) {
      let changed = false;
      // 1) tail growth
      for (const cat of cats) {
        while (cat.cells.length < maxLen) {
          const t = cat.cells[cat.cells.length - 1];
          const opts = ([0, 1, 2, 3] as Dir[])
            .map((d) => ({ x: t.x + DX[d], y: t.y + DY[d] }))
            .filter((c) => inb(c.x, c.y) && occ[idx(c.x, c.y)] === -1 && canTake(idx(c.x, c.y), cat.id));
          if (!opts.length) break;
          const c = opts[Math.floor(r() * opts.length)];
          occ[idx(c.x, c.y)] = cat.id;
          for (const o of laneOf.get(idx(c.x, c.y)) ?? []) {
            if (!blocked[o]) freeNow--;
            blocked[o] = (blocked[o] ?? 0) + 1;
          }
          cat.cells.push(c);
          changed = true;
        }
      }
      // 2) new short cats in what is left (placed last = leave first, so their lane must be empty)
      for (let k = 0; k < w * h; k++) {
        if (occ[k] !== -1) continue;
        const x = k % w;
        const y = Math.floor(k / w);
        const made = tryCat(x, y);
        if (!made) continue;
        const bf = blocksFree(made.cells);
        if (freeNow - bf + 1 > Math.max(K, freeNow)) continue; // would show too many moves at once: leave the hole
        place(made, false);
        changed = true;
      }
      if (!changed) break;
    }
    // 3) empty cells outside every exit lane become boxes (lane cells must stay open)
    if (!p.boxes) return; // boxes are a mechanic from level 31; before that small holes may stay
    for (let k = 0; k < w * h; k++) if (occ[k] === -1 && !(laneOf.get(k) ?? []).length) {
      occ[k] = -2;
      boxes.push({ x: k % w, y: Math.floor(k / w) });
    }
  }
}

/** Builds several candidates and keeps the one closest to the target depth. */
export function generateLevel(seed: number, p: GenParams, id: string): Level {
  let best: Level | null = null;
  let bestScore = -Infinity;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const lv = generateOnce(seed + i * 7919, p, id);
    const m = metrics(lv);
    if (!m.solvable || m.cats < 2) continue;
    const over = p.maxFree ? Math.max(0, m.peak - p.maxFree) : 0;
    const score = -over * 100 - Math.abs(m.depth - p.depth) * 10 + m.fill * 40 - m.narrow * 0.5 - (m.first / m.cats) * 20;
    if (score > bestScore) {
      bestScore = score;
      best = lv;
    }
    if (p.maxFree && !over && m.fill > 0.78) break; // good enough
  }
  return best ?? generateOnce(seed, p, id);
}
