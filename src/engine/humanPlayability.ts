// Human playability: separates "mathematically solvable" from "a normal
// human can see and play the board". The solver proves a clearing sequence
// exists; this module scores how discoverable those moves are to human eyes
// and rejects boards that are only solvable via deep planning, wrap-only
// matches, or a single forced sequence.

import { cellAt, classifyMove, findAllLegalMoves, type DirectionClass } from "./matching";
import type { Board, CellPosition, Move } from "./types";

/**
 * Per-move quality table (assignment §4). Geometry + value + visibility:
 * - horizontal same-value pair: 10 + 8 = 18 (the most eye-catching pattern)
 * - vertical: 17, diagonal: 15, wrap: 13 (visible but harder to notice)
 * - gap-skip moves (only possible after removals): 2 + value − visibility
 */
export const MATCH_QUALITY = {
  geometry: { horizontal: 10, vertical: 9, diagonal: 7, wrap: 5 } satisfies Record<
    DirectionClass,
    number
  >,
  value: 8, // same-value and sum-to-10 both score 8
  gapSkip: -7, // empty cells sit between the pair: needs prior removals
  straggler: 8, // clears a row down to ≤2 live cells
} as const;

export const OBVIOUS_THRESHOLD = 15; // direct non-wrap adjacency with a value match

/** True when at least one empty cell lies strictly between a and b along
 *  their dominant line (the move is only visible after prior removals). */
function hasGap(board: Board, a: CellPosition, b: CellPosition): boolean {
  const dr = Math.sign(b.row - a.row);
  const dc = Math.sign(b.col - a.col);
  let r = a.row + dr;
  let c = a.col + dc;
  let moved = false;
  while (r !== b.row || c !== b.col) {
    moved = true;
    if (r < 0 || r >= board.length || c < 0 || c >= (board[r]?.length ?? 0)) return false;
    if (board[r][c] && board[r][c].value !== null) return false;
    r += dr;
    c += dc;
  }
  return moved;
}

/** Human-visibility score of one legal move (higher = easier to spot). */
export function matchQuality(board: Board, a: CellPosition, b: CellPosition): number {
  const va = cellAt(board, a);
  const vb = cellAt(board, b);
  if (va === null || vb === null) return 0;
  const dir = classifyMove(board, a, b);
  let score = MATCH_QUALITY.geometry[dir] + MATCH_QUALITY.value;
  if (hasGap(board, a, b)) score += MATCH_QUALITY.gapSkip;
  return score;
}

export type PlayabilityMetrics = {
  liveTiles: number;
  legalMoves: number;
  obviousMoves: number;
  obviousTiles: number;
  obviousDensity: number; // obviousTiles / liveTiles — assignment §3 target 0.65–0.75
  matchDensity: number; // tiles inside any legal match (spec's "70% match density")
  decoyTiles: number; // live tiles in NO legal move (dead weight / near-misses)
  wrapShare: number; // fraction of legal moves that are wrap-only geometry
  horizontalSamePairs: number; // instantly visible same-value side-by-side pairs
  independentChoices: number; // tile-disjoint obvious moves (multi-option freedom)
  playabilityScore: number; // composite, higher = easier for humans
  qualityHistogram: number[]; // counts by integer quality bucket 0..24
};

export function humanPlayabilityMetrics(board: Board): PlayabilityMetrics {
  const live: CellPosition[] = [];
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] && row[c].value !== null) live.push({ row: r, col: c });
    }
  }
  const moves = findAllLegalMoves(board);
  const touched = new Set<string>();
  const obviousTouched = new Set<string>();
  let obviousMoves = 0;
  let wrapOnly = 0;
  let horizontalSame = 0;
  const hist = new Array<number>(25).fill(0);
  const key = (p: CellPosition) => `${p.row},${p.col}`;

  for (const m of moves) {
    const q = matchQuality(board, m.from, m.to);
    hist[Math.max(0, Math.min(24, q))]++;
    touched.add(key(m.from));
    touched.add(key(m.to));
    if (q >= OBVIOUS_THRESHOLD) {
      obviousMoves++;
      obviousTouched.add(key(m.from));
      obviousTouched.add(key(m.to));
    }
    if (classifyMove(board, m.from, m.to) === "wrap") wrapOnly++;
    if (classifyMove(board, m.from, m.to) === "horizontal") {
      const va = cellAt(board, m.from);
      const vb = cellAt(board, m.to);
      if (va !== null && vb !== null && va === vb) horizontalSame++;
    }
  }

  const liveCount = live.length;
  const obviousTiles = obviousTouched.size;
  const obviousDensity = liveCount > 0 ? obviousTiles / liveCount : 0;
  const matchDensity = liveCount > 0 ? touched.size / liveCount : 0;
  const decoyTiles = liveCount - touched.size;
  const wrapShare = moves.length > 0 ? wrapOnly / moves.length : 0;

  const independentChoices = greedyIndependentChoices(board, moves);
  const playabilityScore =
    40 * obviousDensity +
    3 * horizontalSame +
    2 * independentChoices -
    4 * decoyTiles -
    30 * wrapShare;

  return {
    liveTiles: liveCount,
    legalMoves: moves.length,
    obviousMoves,
    obviousTiles,
    obviousDensity,
    matchDensity,
    decoyTiles,
    wrapShare,
    horizontalSamePairs: horizontalSame,
    independentChoices,
    playabilityScore,
    qualityHistogram: hist,
  };
}

/** Maximal tile-disjoint set of obvious moves (greedy by quality): how many
 *  independent match options exist right now. */
function greedyIndependentChoices(board: Board, moves: Move[]): number {
  const sorted = [...moves].sort(
    (a, b) => matchQuality(board, b.from, b.to) - matchQuality(board, a.from, a.to),
  );
  const used = new Set<string>();
  const key = (p: CellPosition) => `${p.row},${p.col}`;
  let count = 0;
  for (const m of sorted) {
    const kf = key(m.from);
    const kt = key(m.to);
    if (used.has(kf) || used.has(kt)) continue;
    if (matchQuality(board, m.from, m.to) < OBVIOUS_THRESHOLD) break;
    used.add(kf);
    used.add(kt);
    count++;
  }
  return count;
}

/** Assignment §5: reject boards that only a solver could love. */
export function isHumanPlayable(board: Board, minObviousDensity: number): boolean {
  const m = humanPlayabilityMetrics(board);
  return (
    m.obviousDensity >= minObviousDensity &&
    m.horizontalSamePairs >= 3 &&
    m.independentChoices >= 2 &&
    m.decoyTiles <= 1 &&
    m.wrapShare <= 0.15
  );
}
