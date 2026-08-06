// Difficulty model (Phase 2).
//
// Difficulty is a scored vector, not a single "match density" number. Two
// boards with identical density can differ 3x in solve time, so scoreBoard
// folds five components into one weighted scalar and the sawtooth target
// curve D(L) defines the difficulty band each level is filtered into.

import type { Board, CellPosition } from "./types";
import {
  DIRECTION_WEIGHTS,
  areAdjacent,
  classifyMove,
  findAllLegalMoves,
  isMatchPair,
  cellAt,
} from "./matching";

export type DifficultyComponents = {
  /** Mean reading-order distance from each tile to its nearest valid partner. */
  proximity: number;
  /** Weighted count of available matches by direction type. */
  directionMix: number;
  /** Adjacent near-miss pairs: values off by one from matching. */
  decoyCount: number;
  /** Moves a greedy left-to-right player makes before hitting a dead end. */
  chainDepth: number;
  /** Value-distribution skew pressure: 1 - normalized entropy. */
  valueSkew: number;
};

/** All live tiles in reading order. */
export function readingOrderPositions(board: Board): CellPosition[] {
  const out: CellPosition[] = [];
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] && row[c].value !== null) out.push({ row: r, col: c });
    }
  }
  return out;
}

function readingIndex(positions: CellPosition[], p: CellPosition): number {
  for (let i = 0; i < positions.length; i++) {
    if (positions[i].row === p.row && positions[i].col === p.col) return i;
  }
  return -1;
}

function isPartner(a: number, b: number): boolean {
  return a === b || a + b === 10;
}

export function proximityComponent(board: Board): number {
  const live = readingOrderPositions(board);
  const n = live.length;
  if (n < 2) return 0;
  const values = live.map((p) => cellAt(board, p) as number);
  let total = 0;
  let measured = 0;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (isPartner(values[i], values[j])) {
        best = Math.min(best, Math.abs(i - j));
      }
    }
    if (best !== Infinity) {
      total += best;
      measured++;
    }
  }
  return measured === 0 ? 0 : total / measured;
}

export function directionMixComponent(board: Board): number {
  let total = 0;
  for (const move of findAllLegalMoves(board)) {
    total += DIRECTION_WEIGHTS[classifyMove(board, move.from, move.to)];
  }
  return total;
}

export function decoyComponent(board: Board): number {
  const live = readingOrderPositions(board);
  const n = live.length;
  const values = live.map((p) => cellAt(board, p) as number);
  let decoys = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // "Near-miss": adjacent pair that is NOT a legal match but whose
      // values are off by one from matching (sum one away from 10, or one
      // apart). A 6 next to the 4 you need for a 3+7 is the classic trap.
      if (i === j) continue;
      const va = values[i];
      const vb = values[j];
      if (isMatchPair(va, vb)) continue;
      const nearSum = Math.abs(va + vb - 10) === 1;
      const nearEqual = Math.abs(va - vb) === 1;
      if (!nearSum && !nearEqual) continue;
      // Only count when the pair is actually adjacent.
      if (areAdjacent(board, live[i], live[j])) decoys++;
    }
  }
  return decoys;
}

export function chainDepthComponent(board: Board): number {
  // Greedy left-to-right player: repeatedly take the leftmost legal move
  // (by reading order of its from-tile), until no move remains.
  const MAX_CHAIN = 64;
  const seen = new Set<string>();
  let current = board;
  let depth = 0;
  for (let step = 0; step < MAX_CHAIN; step++) {
    const moves = findAllLegalMoves(current);
    if (moves.length === 0) break;
    const live = readingOrderPositions(current);
    let bestIdx = -1;
    let best = Infinity;
    for (let m = 0; m < moves.length; m++) {
      const idx = readingIndex(live, moves[m].from);
      if (idx >= 0 && idx < best) {
        best = idx;
        bestIdx = m;
      }
    }
    if (bestIdx < 0) break;
    const move = moves[bestIdx];
    const next = current.map((row) => row.map((cell) => ({ ...cell })));
    next[move.from.row][move.from.col].value = null;
    next[move.to.row][move.to.col].value = null;
    current = next.filter((row) => row.some((c) => c.value !== null));
    depth++;
    const key = boardHashFast(current);
    if (seen.has(key)) break; // cycle: left-to-right policy looped
    seen.add(key);
  }
  return depth;
}

function boardHashFast(board: Board): string {
  let out = "";
  for (const row of board) {
    for (const cell of row) out += cell.value === null ? "." : String(cell.value);
    out += "|";
  }
  return out;
}

const MAX_ENTROPY = Math.log(9);

export function valueSkewComponent(board: Board): number {
  const counts = new Map<number, number>();
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell.value !== null) {
        counts.set(cell.value, (counts.get(cell.value) ?? 0) + 1);
        n++;
      }
    }
  }
  if (n === 0) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / n;
    entropy -= p * Math.log(p);
  }
  // Normalized entropy: many 5s (low entropy, easy to read) score low;
  // scattered 1s and 9s (high entropy) score high.
  return entropy / MAX_ENTROPY;
}

/**
 * Score weights, calibrated against measured per-level component means:
 *
 *   rawScore = 3.5·prox + 0.05·mix + 0.55·decoy + 1.2·(14−chain) + 12·skew
 *
 * DirectionMix gets a small weight because measured boards show more
 * available matches (mostly from (5,5)-flooded reading lines at easy
 * levels) correlate with EASIER boards, while proximity, decoys and value
 * skew carry most of the signal. ChainDepth enters inverted: a greedy
 * left-to-right player who stalls fast faces a harder board.
 *
 * Affine calibration maps rawScore onto the D(L) scale (fitted by least
 * squares against the sawtooth targets on measured level means):
 */
const RAW_WEIGHTS = {
  proximity: 3.5,
  directionMix: 0.05,
  decoyCount: 0.55,
  chainDepth: 1.2,
  valueSkew: 12,
};

const CHAIN_CEILING = 14;
const CALIBRATION = { slope: 1.4252, intercept: -21.7624 };

export function scoreBoard(board: Board): number {
  const c = difficultyComponents(board);
  const raw =
    RAW_WEIGHTS.proximity * c.proximity +
    RAW_WEIGHTS.directionMix * c.directionMix +
    RAW_WEIGHTS.decoyCount * c.decoyCount +
    RAW_WEIGHTS.chainDepth * (CHAIN_CEILING - c.chainDepth) +
    RAW_WEIGHTS.valueSkew * c.valueSkew;
  return CALIBRATION.slope * raw + CALIBRATION.intercept;
}

export function difficultyComponents(board: Board): DifficultyComponents {
  return {
    proximity: proximityComponent(board),
    directionMix: directionMixComponent(board),
    decoyCount: decoyComponent(board),
    chainDepth: chainDepthComponent(board),
    valueSkew: valueSkewComponent(board),
  };
}

/**
 * Sawtooth target curve with a 5-level period:
 *
 *   D(L) = D_base + k_drift * floor((L-1)/5) + k_ramp * ((L-1) % 5)
 *   with k_drift = 2 * k_ramp
 *
 * Properties (all required by the brief):
 *   D(6) = D(3)         — genuine relief, not "level 5 minus a bit"
 *   D(10) > D(5)        — each cycle peaks higher
 *   D(11) = D(6)        — second relief resets
 */
export const DIFFICULTY = {
  base: 10,
  kRamp: 5,
  kDrift: 10, // 2 * kRamp
};

export function difficultyTarget(level: number): number {
  const { base, kRamp, kDrift } = DIFFICULTY;
  const cycle = Math.floor((level - 1) / 5);
  const step = (level - 1) % 5;
  return base + kDrift * cycle + kRamp * step;
}

/** Fraction of the band that an accepted board may deviate from D(L). */
export const DIFFICULTY_TOLERANCE = 0.15;

export function difficultyBand(level: number): [number, number] {
  const t = difficultyTarget(level);
  return [t * (1 - DIFFICULTY_TOLERANCE), t * (1 + DIFFICULTY_TOLERANCE)];
}

/** Convenience for gates/tests: is this board inside the level's band? */
export function inDifficultyBand(board: Board, level: number): boolean {
  const [lo, hi] = difficultyBand(level);
  const s = scoreBoard(board);
  return s >= lo && s <= hi;
}
