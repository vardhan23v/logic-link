// Decoy injection — visual noise that is provably solvability-safe.
//
// Both "equal values" and "values summing to 10" are legal matches. That means
// flipping a single cell from v to 10-v keeps every pair legal:
//
//   (v, v)      → (v, 10-v)   still legal (sums to 10)
//   (v, 10-v)   → (10-v, 10-v) still legal (equal)
//
// So we can flip any cell, in any quantity, without touching solvability —
// while dramatically increasing how hard the board is to read, because the
// player can no longer pattern-match on repeated digits alone.
//
// Cells holding 5 are skipped (10-5 = 5, a no-op).

import type { Board } from "./types";
import type { Rng } from "./rng";

export function injectDecoys(board: Board, rng: Rng, decoyWeight: number): Board {
  const ratio = Math.min(1, Math.max(0, decoyWeight));
  if (ratio <= 0) return board;

  return board.map((row) =>
    row.map((cell) => {
      if (cell.value === null || cell.value === 5) return cell;
      if (rng() >= ratio) return cell;
      return { ...cell, value: 10 - cell.value };
    }),
  );
}
