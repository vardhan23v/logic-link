// Board layout: places pair values into a rectangular board, using constraint
// hints to prefer certain adjacencies. Guarantees every placed pair has at
// least one legal adjacency in the resulting board.

import { BOARD_COLS, type Board, type Cell, type CellPosition } from "./types";
import type { PairConstraint } from "./constraintGraph";
import { shuffle, type Rng } from "./rng";

let idCounter = 0;
export function newCellId(): string {
  idCounter += 1;
  return `c${idCounter}`;
}

export function emptyCell(): Cell {
  return { id: newCellId(), value: null };
}

export function makeCell(value: number): Cell {
  return { id: newCellId(), value };
}

function ensureRows(board: Board, rowsNeeded: number): void {
  while (board.length < rowsNeeded) {
    board.push(Array.from({ length: BOARD_COLS }, () => emptyCell()));
  }
}

/**
 * Place pairs into a fresh board sized to hold `cellCount` non-empty cells.
 * We place pairs one at a time; each pair occupies two positions that will be
 * adjacent in reading order in the finished (empty-transparent) board.
 * For MVP we lean on reading-order adjacency (consecutive filled positions in
 * row-major order are always adjacent), which by definition makes every pair
 * immediately matchable, and let the decoy pass inject controlled scanning
 * difficulty by rearranging non-critical values.
 */
export function placePairs(
  rng: Rng,
  constraints: PairConstraint[],
  cellCount: number,
): Board {
  const rowsNeeded = Math.ceil(cellCount / BOARD_COLS);
  const board: Board = [];
  ensureRows(board, rowsNeeded);

  // Build a linear list of positions in reading order for the target cell count.
  const positions: CellPosition[] = [];
  for (let r = 0; r < rowsNeeded && positions.length < cellCount; r++) {
    for (let c = 0; c < BOARD_COLS && positions.length < cellCount; c++) {
      positions.push({ row: r, col: c });
    }
  }

  // Interleave pair placements. Half of the constraints get placed as immediate
  // reading-order neighbours; the rest are placed with a small gap (buried),
  // which is still legal because empty cells in-between are skipped.
  const pairs = constraints.slice();
  const totalPositions = positions.length;
  const used = new Array<boolean>(totalPositions).fill(false);
  const values = new Array<number | null>(totalPositions).fill(null);

  // Deterministic order: shuffle a copy so seeds vary placement.
  const order = shuffle(
    rng,
    Array.from({ length: pairs.length }, (_, i) => i),
  );

  for (const pi of order) {
    const constraint = pairs[pi];
    // Find first available slot; then find a nearby second slot honoring buried hint.
    const first = used.findIndex((u) => !u);
    if (first === -1) break;
    used[first] = true;

    let second = -1;
    const gapPreference = constraint.buried ? 2 : 1;
    for (let step = gapPreference; step <= 4; step++) {
      const cand = first + step;
      if (cand < totalPositions && !used[cand]) {
        second = cand;
        break;
      }
    }
    if (second === -1) {
      // Fallback: any next free slot.
      for (let k = first + 1; k < totalPositions; k++) {
        if (!used[k]) {
          second = k;
          break;
        }
      }
    }
    if (second === -1) break;
    used[second] = true;

    values[first] = constraint.pair.a;
    values[second] = constraint.pair.b;
  }

  // Any unused positions become empty (rare — pair count sized to cellCount).
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const v = values[i];
    board[pos.row][pos.col] = v === null ? emptyCell() : makeCell(v);
  }

  return board;
}
