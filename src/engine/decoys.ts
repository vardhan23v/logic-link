// Decoy injector: scrambles a controlled fraction of cell values so the board
// stops reading as a neat sequence of ready-made pairs.
//
// Swapping the *positions* of two values preserves the board's value multiset
// (every value keeps a partner somewhere), so global pairability is intact;
// what changes is which values are adjacent right now. The generator's
// validator (solver + fairness gate) re-checks the scrambled board and the
// generator retries on a fresh seed if a scramble breaks solvability, so this
// pass does not need to prove solvability itself.

import type { Board, CellPosition } from "./types";
import type { Rng } from "./rng";
import { areAdjacent } from "./matching";

/** Scale factor: fraction of live cells swapped per unit of decoyWeight. */
const SWAPS_PER_CELL_PER_WEIGHT = 0.4;

export function injectDecoys(board: Board, rng: Rng, decoyWeight: number): Board {
  if (decoyWeight <= 0) return board;

  const live: CellPosition[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c].value !== null) live.push({ row: r, col: c });
    }
  }
  if (live.length < 4) return board;

  const swapCount = Math.round(live.length * decoyWeight * SWAPS_PER_CELL_PER_WEIGHT);
  if (swapCount <= 0) return board;

  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  for (let i = 0; i < swapCount; i++) {
    const a = live[Math.floor(rng() * live.length)];
    const b = live[Math.floor(rng() * live.length)];
    if (a.row === b.row && a.col === b.col) continue;
    const va = next[a.row][a.col].value;
    next[a.row][a.col].value = next[b.row][b.col].value;
    next[b.row][b.col].value = va;
  }
  return next;
}

/**
 * Deliberate near-miss decoys: swap a fraction of live cells' values so they
 * sit one value away from matching one of their neighbors (6 next to the 4
 * you need for a 3+7). A swap only applies when it strictly increases that
 * cell's local near-miss count — otherwise every nudge would destroy as many
 * decoys as it creates.
 *
 * The swap (not an assignment) preserves the board's value multiset, so no
 * value is ever orphaned: every value keeps a partner somewhere, exactly like
 * the plain decoy scrambler. The validator still re-checks solvability and
 * the generator retries on a fresh seed.
 */
export function injectNearMissDecoys(board: Board, rng: Rng, decoyWeight: number): Board {
  if (decoyWeight <= 0) return board;

  const live: CellPosition[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c].value !== null) live.push({ row: r, col: c });
    }
  }
  if (live.length < 4) return board;

  const nudgeCount = Math.round(live.length * decoyWeight * 0.6);
  if (nudgeCount <= 0) return board;

  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const done = new Set<string>();

  const nearMissScore = (pos: CellPosition): number => {
    const v = next[pos.row][pos.col].value;
    if (v === null) return 0;
    let s = 0;
    for (const n of live) {
      if (n.row === pos.row && n.col === pos.col) continue;
      const nv = next[n.row][n.col].value;
      if (nv === null || !areAdjacent(next, pos, n)) continue;
      if (v === nv || v + nv === 10) continue; // real match, not a decoy
      if (Math.abs(v + nv - 10) === 1 || Math.abs(v - nv) === 1) s++;
    }
    return s;
  };

  const valueOf = (pos: CellPosition): number => next[pos.row][pos.col].value as number;

  for (let i = 0; i < nudgeCount; i++) {
    const pos = live[Math.floor(rng() * live.length)];
    const key = `${pos.row}:${pos.col}`;
    if (done.has(key)) continue;
    const cell = next[pos.row][pos.col];
    if (cell.value === null) continue;
    let target: CellPosition | null = null;
    for (const n of live) {
      if (n.row === pos.row && n.col === pos.col) continue;
      if (areAdjacent(next, pos, n)) {
        target = n;
        break;
      }
    }
    if (!target) continue;
    const neighborValue = valueOf(target);
    const candidates = [
      10 - neighborValue + 1,
      10 - neighborValue - 1,
      neighborValue + 1,
      neighborValue - 1,
    ].filter((v) => v >= 1 && v <= 9 && v !== neighborValue && v !== 10 - neighborValue);
    if (candidates.length === 0) continue;

    const before = nearMissScore(pos);
    const original = cell.value;
    let best: number | null = null;
    let bestGain = -Infinity;
    for (const cand of candidates) {
      cell.value = cand;
      const gain = nearMissScore(pos) - before;
      if (gain > bestGain) {
        bestGain = gain;
        best = cand;
      }
      cell.value = original;
    }
    if (best === null || bestGain <= 0) continue;

    // Swap with another live cell that currently holds the best value so the
    // multiset is preserved (nothing orphaned) and pos ends on `best`.
    const partners = live.filter(
      (n) => n.row !== pos.row && n.col !== pos.col && valueOf(n) === best,
    );
    if (partners.length === 0) continue;
    const partner = partners[Math.floor(rng() * partners.length)];
    next[pos.row][pos.col].value = best;
    next[partner.row][partner.col].value = original;
    done.add(key);
  }
  return next;
}
