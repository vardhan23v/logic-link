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
