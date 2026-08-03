// Smart Add Row generation.
//
// Analyzes the board and produces a 9-cell row whose values:
//   • preserve solvability (validated with bounded playouts before insert),
//   • create guaranteed matches by placing complements directly below the
//     bottom-most live cell of chosen columns (vertical adjacency),
//   • prioritize columns whose bottom value is stranded (row cleanup),
//   • scale the number of guaranteed helpers with the level's
//     `helperStrength` — harder levels get fewer freebies (friction).
//
// If the multi-criteria validator fails, callers fall back to rescue.

import { BOARD_COLS, type Board, type Cell } from "./types";
import { makeCell } from "./boardLayout";
import { randomPairType } from "./pairGraph";
import { strandedValues } from "./straggler";
import { findAllLegalMoves } from "./matching";
import { isWinnableByPlayouts } from "./solver";
import { mulberry32, type Rng } from "./rng";

export type AddRowGoal = "immediate" | "future" | "cleanup" | "decoy";

export type AddRowResult = {
  row: Cell[];
  goal: AddRowGoal;
  newLegalMoveCount: number;
};

export type SmartAddRowOptions = {
  /** 0..1 — scales how many cells are guaranteed helpers (default 0.8). */
  helperStrength?: number;
};

function complement(v: number): number {
  return 10 - v;
}

export function generateSmartAddRow(
  rng: Rng,
  board: Board,
  opts: SmartAddRowOptions = {},
): AddRowResult {
  // Bottom-most live value per column: a new row's cell at that column is
  // vertically adjacent to it (empties are skipped), so placing its
  // complement there guarantees a legal match.
  const bottom: Array<number | null> = Array.from({ length: BOARD_COLS }, () => null);
  for (let c = 0; c < BOARD_COLS; c++) {
    for (let r = board.length - 1; r >= 0; r--) {
      const v = board[r]?.[c]?.value ?? null;
      if (v !== null) {
        bottom[c] = v;
        break;
      }
    }
  }

  const stranded = new Set(strandedValues(board));
  const strength = opts.helperStrength ?? 0.8;
  const helperCount = Math.max(1, Math.round(strength * 4));

  // Choose helper columns: stranded-value columns first (cleanup priority),
  // then a deterministic shuffle of the rest.
  const liveCols = [];
  for (let c = 0; c < BOARD_COLS; c++) if (bottom[c] !== null) liveCols.push(c);
  liveCols.sort((a, b) => {
    const sa = stranded.has(bottom[a] as number) ? 1 : 0;
    const sb = stranded.has(bottom[b] as number) ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return rng() < 0.5 ? -1 : 1;
  });

  const values: Array<number | null> = Array.from({ length: BOARD_COLS }, () => null);
  let helpers = 0;
  let cleanupHelpers = 0;
  for (const c of liveCols) {
    if (helpers >= helperCount) break;
    values[c] = complement(bottom[c] as number);
    helpers++;
    if (stranded.has(bottom[c] as number)) cleanupHelpers++;
  }

  // Fill remaining slots left-to-right with self-pair values so the row
  // itself clears cleanly once the helpers are consumed.
  let pending: number | null = null;
  for (let c = 0; c < BOARD_COLS; c++) {
    if (values[c] !== null) continue;
    if (pending !== null) {
      values[c] = pending;
      pending = null;
    } else {
      const p = randomPairType(rng);
      values[c] = p.a;
      pending = p.b;
    }
  }

  const row = (values as number[]).map((v) => makeCell(v));
  const before = findAllLegalMoves(board).length;
  const nextBoard: Board = [...board, row];
  const after = findAllLegalMoves(nextBoard).length;

  const goal: AddRowGoal = cleanupHelpers > 0 ? "cleanup" : after > before ? "immediate" : "future";

  return { row, goal, newLegalMoveCount: after - before };
}

/**
 * Validate that inserting `row` preserves solvability of the resulting board.
 * Uses bounded greedy playouts as a constructive witness (a playout reaching
 * the pairing residual proves solvability) instead of the exhaustive DFS, so
 * add-row latency stays bounded on hard boards; when no witness is found the
 * caller falls back to the rescue row, which guarantees fresh legal moves.
 */
export function isAddRowAcceptable(board: Board, row: Cell[], rng?: Rng): boolean {
  const nextBoard: Board = [...board, row];
  const rand = rng ?? mulberry32(0x5eed ^ (board.length * 2654435761));
  return isWinnableByPlayouts(nextBoard, rand, 16);
}
