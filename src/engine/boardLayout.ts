// Board layout: places pair values into a rectangular board.
//
// Difficulty lever: `scatterStrength`.
//   0   → every pair sits in two consecutive reading-order slots, so each pair
//         is immediately matchable (tutorial-easy, the old behaviour).
//   >0  → pairs are pushed apart along the reading order by a distance
//         proportional to the scatter, forcing the player to search. The
//         generator re-validates each board with the solver, so scatter can
//         never produce an unsolvable layout.

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

function ensureRows(board: Board, rowsNeeded: number, cols: number): void {
  while (board.length < rowsNeeded) {
    board.push(Array.from({ length: cols }, () => emptyCell()));
  }
}

export type PlacementOptions = {
  /** Board width. Defaults to the classic 9 columns. */
  cols?: number;
  /** 0..1 — how far apart the two halves of a pair are placed. */
  scatterStrength?: number;
};

/**
 * Place pairs into a fresh board sized to hold `cellCount` non-empty cells.
 *
 * Slot model: all filled positions form one reading-order sequence, and
 * consecutive entries in that sequence are always adjacent (wrap-around
 * across rows counts). A pair placed at slots (i, i+d) is therefore
 * "d-1 cells of search" away from being obvious.
 */
export function placePairs(
  rng: Rng,
  constraints: PairConstraint[],
  cellCount: number,
  options: PlacementOptions = {},
): Board {
  const cols = options.cols ?? BOARD_COLS;
  const scatter = Math.min(1, Math.max(0, options.scatterStrength ?? 0));

  const rowsNeeded = Math.ceil(cellCount / cols);
  const board: Board = [];
  ensureRows(board, rowsNeeded, cols);

  const positions: CellPosition[] = [];
  for (let r = 0; r < rowsNeeded && positions.length < cellCount; r++) {
    for (let c = 0; c < cols && positions.length < cellCount; c++) {
      positions.push({ row: r, col: c });
    }
  }

  const total = positions.length;
  const values = new Array<number | null>(total).fill(null);

  // Deterministic ordering of pairs; the seed varies the sequence.
  const pairs = constraints.slice();
  const order = shuffle(
    rng,
    Array.from({ length: pairs.length }, (_, i) => i),
  );

  // Free slots, consumed front-to-back. The first slot of a pair is always the
  // lowest free slot (keeps the board densely packed); the partner slot is
  // chosen `gap` free-slots later, where gap scales with scatterStrength.
  const free: number[] = Array.from({ length: total }, (_, i) => i);
  // Max reachable separation: at full scatter a pair can span most of the board.
  const maxGap = Math.max(1, Math.floor(total * 0.5));

  for (const pi of order) {
    if (free.length < 2) break;
    const constraint = pairs[pi];

    // Gap of 1 == adjacent. Randomise inside the level's scatter envelope so
    // boards vary without exceeding the difficulty budget.
    const envelope = 1 + Math.floor(scatter * maxGap);
    const gap = 1 + Math.floor(rng() * envelope);
    const partnerIndex = Math.min(free.length - 1, gap);

    const slotA = free.shift() as number;
    const slotB = free.splice(partnerIndex - 1 < 0 ? 0 : partnerIndex - 1, 1)[0];

    const flip = rng() < 0.5;
    values[slotA] = flip ? constraint.pair.b : constraint.pair.a;
    values[slotB] = flip ? constraint.pair.a : constraint.pair.b;
  }

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const v = values[i];
    board[pos.row][pos.col] = v === null ? emptyCell() : makeCell(v);
  }

  return board;
}
