// Legal move detection with "skip empties along the line" adjacency.
// Directions: horizontal reading-order (wraps last cell of row → first cell of next row),
// vertical, diagonal down-right, diagonal down-left.

import type { Board, CellPosition, Move } from "./types";

export function isMatchPair(a: number, b: number): boolean {
  return a === b || a + b === 10;
}

export function cellAt(board: Board, pos: CellPosition): number | null {
  const row = board[pos.row];
  if (!row) return null;
  const cell = row[pos.col];
  if (!cell) return null;
  return cell.value;
}

/**
 * Sequence of non-empty positions in reading order (row-major).
 * Consecutive positions in this list are horizontally adjacent, and the last
 * cell of one row is adjacent to the first cell of the next row (wrap-around).
 */
function readingOrder(board: Board): CellPosition[] {
  const out: CellPosition[] = [];
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] && row[c].value !== null) out.push({ row: r, col: c });
    }
  }
  return out;
}

/** For each column, the sequence of non-empty positions top→bottom. */
function verticalOrder(board: Board): CellPosition[][] {
  const cols = board[0]?.length ?? 0;
  const columns: CellPosition[][] = Array.from({ length: cols }, () => []);
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] && row[c].value !== null) columns[c].push({ row: r, col: c });
    }
  }
  return columns;
}

/**
 * Walk each diagonal (dr=+1, dc=+1) and collect non-empty positions in order.
 * A diagonal is grouped by (r - c).
 */
function diagonalDROrder(board: Board): CellPosition[][] {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const groups = new Map<number, CellPosition[]>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (!cell || cell.value === null) continue;
      const key = r - c;
      const g = groups.get(key);
      if (g) g.push({ row: r, col: c });
      else groups.set(key, [{ row: r, col: c }]);
    }
  }
  return Array.from(groups.values());
}

/** Walk each anti-diagonal (dr=+1, dc=-1) grouped by (r + c). */
function diagonalDLOrder(board: Board): CellPosition[][] {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const groups = new Map<number, CellPosition[]>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      if (!cell || cell.value === null) continue;
      const key = r + c;
      const g = groups.get(key);
      if (g) g.push({ row: r, col: c });
      else groups.set(key, [{ row: r, col: c }]);
    }
  }
  return Array.from(groups.values());
}

/**
 * All adjacency pairs (unordered) across every line, honoring skip-empties.
 */
function adjacencyPairs(board: Board): Array<[CellPosition, CellPosition]> {
  const pairs: Array<[CellPosition, CellPosition]> = [];
  const lines: CellPosition[][] = [
    readingOrder(board),
    ...verticalOrder(board),
    ...diagonalDROrder(board),
    ...diagonalDLOrder(board),
  ];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      pairs.push([line[i - 1], line[i]]);
    }
  }
  return pairs;
}

export function areAdjacent(board: Board, a: CellPosition, b: CellPosition): boolean {
  for (const [p, q] of adjacencyPairs(board)) {
    if (
      (p.row === a.row && p.col === a.col && q.row === b.row && q.col === b.col) ||
      (p.row === b.row && p.col === b.col && q.row === a.row && q.col === a.col)
    ) {
      return true;
    }
  }
  return false;
}

export function isLegalMove(board: Board, a: CellPosition, b: CellPosition): boolean {
  if (a.row === b.row && a.col === b.col) return false;
  const va = cellAt(board, a);
  const vb = cellAt(board, b);
  if (va === null || vb === null) return false;
  if (!isMatchPair(va, vb)) return false;
  return areAdjacent(board, a, b);
}

export function findAllLegalMoves(board: Board): Move[] {
  const out: Move[] = [];
  for (const [a, b] of adjacencyPairs(board)) {
    const va = cellAt(board, a);
    const vb = cellAt(board, b);
    if (va !== null && vb !== null && isMatchPair(va, vb)) {
      out.push({ from: a, to: b });
    }
  }
  return out;
}

/** Adjacency direction classes used by the difficulty model. */
export type DirectionClass = "horizontal" | "vertical" | "wrap" | "diagonal";

/**
 * Classify the line that connects two cells. Vertical (same column) wins,
 * then diagonal (shared r-c or r+c line), then wrap (reading-order boundary
 * between two rows), then plain horizontal reading-order. Two adjacent cells
 * can lie on several lines; this returns the dominant one.
 */
export function classifyMove(board: Board, a: CellPosition, b: CellPosition): DirectionClass {
  if (a.col === b.col) return "vertical";
  if (a.row - a.col === b.row - b.col || a.row + a.col === b.row + b.col) return "diagonal";
  // Wrap: consecutive in reading order across a row boundary. A same-row
  // pair is horizontal; anything else that is adjacent must cross rows.
  const order = readingOrder(board);
  for (let i = 1; i < order.length; i++) {
    const p = order[i - 1];
    const q = order[i];
    const isPair =
      (p.row === a.row && p.col === a.col && q.row === b.row && q.col === b.col) ||
      (p.row === b.row && p.col === b.col && q.row === a.row && q.col === a.col);
    if (isPair) {
      if (p.row !== q.row) return "wrap";
      return "horizontal";
    }
  }
  // Shouldn't happen for adjacent cells; fall back conservatively.
  return a.row === b.row ? "horizontal" : "diagonal";
}

/** Weighted count of available matches by direction type. */
export const DIRECTION_WEIGHTS: Record<DirectionClass, number> = {
  horizontal: 1.0,
  vertical: 1.4,
  wrap: 1.8,
  diagonal: 2.4,
};
