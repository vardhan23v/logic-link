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

export type PlacePairsOptions = {
  /** When true, ignore `buried` hints and place every pair adjacent
   *  (solvable by construction). Used as a generation fallback. */
  safe?: boolean;
  /**
   * Singleton value emitted once at a random boundary between pair
   * placements (so no direct pair is split). Used by odd-sized boards
   * (e.g. the 27-cell 3-row start): its partner arrives via Add Row.
   */
  extraValue?: number;
  /**
   * Max number of foreign values dropped between the halves of a buried
   * pair (1..9). 1 keeps partners effectively adjacent; 6+ scatters them.
   */
  burialDepth?: number;
};

/**
 * Place pairs into a fresh board sized to hold `cellCount` non-empty cells.
 *
 * Direct pairs occupy two consecutive reading-order slots, which makes them
 * immediately matchable (consecutive filled slots are always adjacent,
 * including the row wrap-around). Pairs whose constraint is `buried` are
 * split: the partner value is deferred by 1–3 slots so other pairs' values
 * sit between the two halves. A buried pair only becomes matchable once the
 * values between its halves are cleared (or via an accidental vertical or
 * diagonal adjacency), which is the core scanning/ordering difficulty of
 * harder levels.
 *
 * Burial trades away solvability-by-construction, so callers gate the result
 * with the validator (solver + fairness) and retry on a new seed. Pass
 * `safe: true` to force all-direct placement as a guaranteed-solvable
 * fallback.
 */
export function placePairs(
  rng: Rng,
  constraints: PairConstraint[],
  cellCount: number,
  opts: PlacePairsOptions = {},
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

  const pairs = constraints.slice();
  const totalPositions = positions.length;
  const values = new Array<number | null>(totalPositions).fill(null);

  // Deterministic ordering of pairs; seeds vary the sequence.
  const order = shuffle(
    rng,
    Array.from({ length: pairs.length }, (_, i) => i),
  );

  // Emit values into consecutive slots; buried partners wait in a deferral
  // queue until `countdown` other values have been placed between them.
  let cursor = 0;
  const deferred: Array<{ value: number; countdown: number }> = [];
  const emit = (v: number): void => {
    if (cursor >= totalPositions) return;
    values[cursor] = v;
    cursor += 1;
    for (const d of deferred) d.countdown -= 1;
  };
  const flushDue = (): void => {
    let i = 0;
    while (i < deferred.length) {
      if (deferred[i].countdown <= 0) {
        const [d] = deferred.splice(i, 1);
        emit(d.value);
        i = 0; // emitting decrements countdowns; rescan from the start
      } else {
        i += 1;
      }
    }
  };

  // Pick the pair-boundary turn at which the singleton (if any) is emitted.
  const extraTurn = opts.extraValue !== undefined ? Math.floor(rng() * (order.length + 1)) : -1;

  let turn = 0;
  for (const pi of order) {
    flushDue();
    if (turn === extraTurn && opts.extraValue !== undefined) emit(opts.extraValue);
    turn += 1;
    if (cursor >= totalPositions) break;
    const constraint = pairs[pi];
    // Randomize the intra-pair order for variety (a,b) vs (b,a).
    const flip = rng() < 0.5;
    const first = flip ? constraint.pair.b : constraint.pair.a;
    const second = flip ? constraint.pair.a : constraint.pair.b;
    if (!opts.safe && constraint.buried) {
      emit(first);
      // 1..burialDepth foreign values between the halves.
      const depth = Math.max(1, opts.burialDepth ?? 3);
      deferred.push({ value: second, countdown: 1 + Math.floor(rng() * depth) });
    } else {
      emit(first);
      emit(second);
    }
  }

  // Emit the singleton if its turn never came up inside the loop.
  if (extraTurn >= order.length && opts.extraValue !== undefined) emit(opts.extraValue);

  // Flush any partners still pending once all pairs have been started.
  while (deferred.length > 0 && cursor < totalPositions) {
    deferred.sort((a, b) => a.countdown - b.countdown);
    const d = deferred.shift();
    if (d) emit(d.value);
  }

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const v = values[i];
    board[pos.row][pos.col] = v === null ? emptyCell() : makeCell(v);
  }

  return board;
}
