// Depth-first solver with transposition table, plus bounded playout-based
// checks. "Solved" means the board is cleared down to its pairing remainder:
// an even number of live cells clears to empty, an odd count (e.g. the
// 27-cell initial board) clears to a single leftover cell whose partner must
// arrive via Add Row.

import { findAllLegalMoves } from "./matching";
import type { Board, Move } from "./types";

export function boardHash(board: Board): string {
  // Canonical hash: row-major values, "." for empty, "|" row separator.
  let out = "";
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      out += cell && cell.value !== null ? String(cell.value) : ".";
      out += ",";
    }
    out += "|";
  }
  return out;
}

export function isBoardEmpty(board: Board): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.value !== null) return false;
    }
  }
  return true;
}

export function liveCellCount(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.value !== null) n++;
    }
  }
  return n;
}

/** Cells that can never pair off: live-count parity (0 for even, 1 for odd). */
export function pairingResidual(board: Board): number {
  return liveCellCount(board) % 2;
}

export function applyMoveToBoard(board: Board, move: Move): Board {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  next[move.from.row][move.from.col].value = null;
  next[move.to.row][move.to.col].value = null;
  return removeEmptyRows(next);
}

export function removeEmptyRows(board: Board): Board {
  return board.filter((row) => row.some((cell) => cell.value !== null));
}

export type SolveOptions = {
  maxNodes?: number;
};

/**
 * DFS solver with memoization. Returns `true` if a sequence of legal moves
 * clears the board down to its pairing residual (empty for even boards, one
 * leftover cell for odd boards).
 */
export function isSolvable(board: Board, opts: SolveOptions = {}): boolean {
  const maxNodes = opts.maxNodes ?? 25_000;
  const residual = pairingResidual(board);
  const seen = new Set<string>();
  let nodes = 0;

  function search(b: Board): boolean {
    if (liveCellCount(b) <= residual) return true;
    const key = boardHash(b);
    if (seen.has(key)) return false;
    seen.add(key);
    nodes++;
    if (nodes > maxNodes) return false;

    const moves = findAllLegalMoves(b);
    if (moves.length === 0) return false;
    for (const move of moves) {
      const next = applyMoveToBoard(b, move);
      if (search(next)) return true;
    }
    return false;
  }

  return search(board);
}

/**
 * Cheap constructive solvability check: play up to `samples` random greedy
 * playouts and return true as soon as one clears the board to its pairing
 * residual. A successful playout is a witness that the board is solvable;
 * failing to find one is NOT a proof of unsolvability (use `isSolvable` for
 * that). Unlike the exhaustive DFS, cost is strictly bounded, so this is safe
 * on the gameplay path.
 */
export function isWinnableByPlayouts(
  board: Board,
  rng: () => number,
  samples: number,
  maxDepth = 200,
): boolean {
  const residual = pairingResidual(board);
  for (let s = 0; s < samples; s++) {
    let current = board;
    for (let d = 0; d < maxDepth; d++) {
      if (liveCellCount(current) <= residual) return true;
      const moves = findAllLegalMoves(current);
      if (moves.length === 0) break;
      current = applyMoveToBoard(current, moves[Math.floor(rng() * moves.length)]);
    }
    if (liveCellCount(current) <= residual) return true;
  }
  return false;
}

/**
 * Fairness sampler: play greedy random orderings from the board and count
 * how many of them reach the pairing residual. Returns the ratio 0..1.
 */
export function estimateFairness(
  board: Board,
  rng: () => number,
  samples: number,
  maxDepth = 200,
): number {
  const residual = pairingResidual(board);
  let successes = 0;
  for (let s = 0; s < samples; s++) {
    let current = board;
    let stuck = false;
    for (let d = 0; d < maxDepth; d++) {
      if (liveCellCount(current) <= residual) break;
      const moves = findAllLegalMoves(current);
      if (moves.length === 0) {
        stuck = true;
        break;
      }
      const pick = moves[Math.floor(rng() * moves.length)];
      current = applyMoveToBoard(current, pick);
    }
    if (!stuck && liveCellCount(current) <= residual) successes++;
  }
  return successes / samples;
}
