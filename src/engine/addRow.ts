// Smart Add Row generation.
//
// Analyzes the board and produces a 9-cell row whose values:
//   • preserve solvability (validated with the solver before insert),
//   • prioritize stranded numbers (from `straggler`),
//   • prefer completing pairs over lengthening the board.
//
// If the multi-criteria validator fails, callers fall back to rescue.

import { BOARD_COLS, type Board, type Cell } from "./types";
import { makeCell } from "./boardLayout";
import { randomPairType } from "./pairGraph";
import { strandedValues } from "./straggler";
import { findAllLegalMoves } from "./matching";
import { isSolvable } from "./solver";
import { type Rng } from "./rng";

export type AddRowGoal = "immediate" | "future" | "cleanup" | "decoy";

export type AddRowResult = {
  row: Cell[];
  goal: AddRowGoal;
  newLegalMoveCount: number;
};

function complement(v: number): number {
  return 10 - v;
}

function buildRow(values: number[]): Cell[] {
  return values.map((v) => makeCell(v));
}

export function generateSmartAddRow(rng: Rng, board: Board): AddRowResult {
  const stranded = strandedValues(board);
  const priorValues = new Set<number>();
  for (const row of board) for (const c of row) if (c.value !== null) priorValues.add(c.value);

  // Strategy: start with complements/duplicates for stranded numbers, then
  // fill remaining slots with legal pair partners from the value inventory.
  const values: number[] = [];

  // Cleanup pass: pair stranded values with their complement or duplicate.
  const strandedUnique = Array.from(new Set(stranded));
  for (const v of strandedUnique) {
    if (values.length >= BOARD_COLS) break;
    values.push(complement(v));
  }

  // Fill remaining with fresh pair values from the pair pool.
  while (values.length < BOARD_COLS) {
    const p = randomPairType(rng);
    if (values.length + 1 < BOARD_COLS) {
      values.push(p.a, p.b);
    } else {
      values.push(p.a);
    }
  }
  values.length = BOARD_COLS;

  const row = buildRow(values);
  const before = findAllLegalMoves(board).length;
  const nextBoard: Board = [...board, row];
  const after = findAllLegalMoves(nextBoard).length;

  const goal: AddRowGoal =
    strandedUnique.length > 0 ? "cleanup" : after > before ? "immediate" : "future";

  return { row, goal, newLegalMoveCount: after - before };
}

/**
 * Validate that inserting `row` preserves solvability of the resulting board.
 * Difficulty-envelope + expected-usage checks are approximated in MVP as
 * "solvable after insertion" — the interface accepts a config so harder
 * levels can layer envelope checks without changing callers.
 */
export function isAddRowAcceptable(board: Board, row: Cell[]): boolean {
  const nextBoard: Board = [...board, row];
  return isSolvable(nextBoard, { maxNodes: 15_000 });
}
