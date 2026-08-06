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

/** Phase 4 bucket: what a press is meant to deliver. */
export type AddRowBucket = "immediate" | "deferred" | "decoy";

/**
 * Phase 4 safety valve: when the player is this many presses from the end of
 * the budget, every press switches to the completion row so the board can
 * fully clear without any further presses. 2 covers presses 5 and 6 of the
 * standard 6-press budget.
 */
export const VALVE_PRESSES_LEFT = 2;

export type AddRowResult = {
  row: Cell[];
  goal: AddRowGoal;
  newLegalMoveCount: number;
};

export type SmartAddRowOptions = {
  /** 0..1 — scales how many cells are guaranteed helpers (default 0.8). */
  helperStrength?: number;
  /** Preferred number of tiles to inject (default 9, clamped to 6..9 and to
   *  a parity that keeps the total live count even, so the board can fully
   *  clear after any number of presses — no odd-count dead ends). */
  targetLength?: number;
};

function complement(v: number): number {
  return 10 - v;
}

/** Number of tiles an Add Row batch should inject.
 *
 * Parity constraint: every match removes 2 tiles, so a board can only clear
 * to empty when the live count is even. With a 27-tile start, batches must
 * alternate parity — 9 tiles when the count is odd, 8 when it is even
 * (preferring a full row whenever parity allows). This is what makes
 * "2–3 presses" / "2–4 presses" distributions actually reachable.
 */
export function batchLengthFor(remainingTiles: number, preferred: number): number {
  const lo = 6;
  const hi = 9;
  const want = Math.min(hi, Math.max(lo, Math.floor(preferred)));
  const wantParity = (remainingTiles + want) % 2;
  if (wantParity === 0) return want;
  // Flip parity toward the nearest full row (9), else toward 6.
  const flippedUp = want < hi && want + 1 >= lo ? want + 1 : -1;
  const flippedDown = want > lo && want - 1 >= lo ? want - 1 : -1;
  if (flippedUp - want <= want - flippedDown || flippedDown === -1) {
    if (flippedUp !== -1) return flippedUp;
  }
  if (flippedDown !== -1) return flippedDown;
  return want;
}

export function liveTileCount(board: Board): number {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.value !== null) n++;
    }
  }
  return n;
}

export function generateSmartAddRow(
  rng: Rng,
  board: Board,
  opts: SmartAddRowOptions = {},
): AddRowResult {
  const batchLen = batchLengthFor(liveTileCount(board), opts.targetLength ?? 9);

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
  const helperCount = Math.max(1, Math.round(strength * batchLen * 0.45));

  // Choose helper columns: stranded-value columns first (cleanup priority),
  // then a deterministic shuffle of the rest. Restricted to columns inside
  // the batch (a batch of N cells occupies grid columns 0..N-1), so a short
  // batch never grows past its target length.
  const liveCols = [];
  for (let c = 0; c < Math.min(BOARD_COLS, batchLen); c++) if (bottom[c] !== null) liveCols.push(c);
  liveCols.sort((a, b) => {
    const sa = stranded.has(bottom[a] as number) ? 1 : 0;
    const sb = stranded.has(bottom[b] as number) ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return rng() < 0.5 ? -1 : 1;
  });

  const values: Array<number | null> = Array.from({ length: batchLen }, () => null);
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
  for (let c = 0; c < batchLen; c++) {
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

/**
 * Phase 4 — pick the press bucket from the level's ratios. A Decoy (or
 * Deferred) press is only meaningful while the player still has legal moves;
 * when the board is stuck the press must always create a match, so the bucket
 * upgrades to Immediate.
 */
export function pickAddRowBucket(
  rng: Rng,
  buckets: { immediate: number; deferred: number; decoy: number },
  hasLegalMoves: boolean,
): AddRowBucket {
  const total = buckets.immediate + buckets.deferred + buckets.decoy;
  if (total <= 0) return "immediate";
  const roll = rng() * total;
  if (roll < buckets.immediate) return "immediate";
  if (roll < buckets.immediate + buckets.deferred) {
    return hasLegalMoves ? "deferred" : "immediate";
  }
  return hasLegalMoves ? "decoy" : "immediate";
}

/** Values whose live count on the board is odd — each needs one more mate. */
export function oddCountValues(board: Board): number[] {
  const counts = new Array(10).fill(0);
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.value !== null) counts[cell.value]++;
    }
  }
  const out: number[] = [];
  for (let v = 1; v <= 9; v++) if (counts[v] % 2 === 1) out.push(v);
  return out;
}

/** Bottom-most live value per column (null when the column is empty). */
export function columnBottoms(board: Board): Array<number | null> {
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
  return bottom;
}

/**
 * Fill `count` slots with parity-neutral pairs: two copies of the same value
 * per pair, so every value's live count grows by an even number. Safe for
 * completion rows (the pair is an internal match, which is fine there).
 */
function fillSelfPairs(rng: Rng, count: number): number[] {
  const values: number[] = [];
  while (values.length < count) {
    const v = 1 + Math.floor(rng() * 9);
    values.push(v);
    if (values.length < count) values.push(v);
  }
  return values;
}

/**
 * Match-free fill for Deferred/Decoy rows: values drawn from a pool that can
 * sit next to each other without matching (2+3=5, 2+7=9, 3+8=11 — no equals,
 * no tens), and each candidate is checked against the cells below (vertical),
 * the previous row's diagonal neighbors, the wrap neighbor (previous row's
 * last live cell for column 0) and the cell to the left. Writes into `values`
 * in place, skipping slots already set by the caller (e.g. deferred mates).
 * The caller's retry loop catches any residual accident.
 */
function fillNoMatch(
  rng: Rng,
  board: Board,
  values: Array<number | null>,
  fromCol: number,
  wrapValue: number | null,
): void {
  const pool = [2, 3, 7, 8];
  const bottom = columnBottoms(board);
  const newRow = board.length;
  for (let c = fromCol; c < values.length; c++) {
    if (values[c] !== null) continue;
    let v: number | null = null;
    const fits = (cand: number): boolean => {
      const b = bottom[c];
      if (b !== null && (cand === b || cand === 10 - b)) return false;
      const left = c > 0 ? values[c - 1] : wrapValue;
      if (left !== null && (left === cand || left + cand === 10)) return false;
      // A preset mate (deferred placement) can sit to the right too.
      const right = c + 1 < values.length ? values[c + 1] : null;
      if (right !== null && (right === cand || right + cand === 10)) return false;
      for (const dc of [-1, 1]) {
        const nb = board[newRow - 1]?.[c + dc]?.value ?? null;
        if (nb !== null && (nb === cand || nb + cand === 10)) return false;
      }
      return true;
    };
    for (let t = 0; t < 12; t++) {
      const cand = pool[Math.floor(rng() * pool.length)];
      if (fits(cand)) {
        v = cand;
        break;
      }
    }
    if (v === null) {
      // Exhaustive scan over the full value range — always finds something.
      for (let cand = 1; cand <= 9; cand++) {
        if (fits(cand)) {
          v = cand;
          break;
        }
      }
    }
    values[c] = v ?? 2;
  }
}

/**
 * Deferred bucket: place a mate for each odd-count value on a diagonal line
 * behind a blocker, so the pair unlocks only after the blocker clears — no
 * immediate match is created. When placement fails the caller falls back.
 */
export function generateDeferredRow(
  rng: Rng,
  board: Board,
  opts: SmartAddRowOptions = {},
): AddRowResult {
  const batchLen = batchLengthFor(liveTileCount(board), opts.targetLength ?? 9);
  const bottom = columnBottoms(board);
  const odd = oddCountValues(board);
  const values: Array<number | null> = Array.from({ length: batchLen }, () => null);

  // Bottom-most live position per value → its column hosts the mate if the
  // diagonal-through-blocker trick fits within the batch.
  const valueColumns = new Map<number, number>();
  for (let c = 0; c < (board[0]?.length ?? 0); c++) {
    for (let r = board.length - 1; r >= 0; r--) {
      const v = board[r]?.[c]?.value ?? null;
      if (v !== null && !valueColumns.has(v)) {
        valueColumns.set(v, c);
        break;
      }
    }
  }

  const newRow = board.length;
  // Wrap neighbor: the last live cell of the previous row (reading order).
  let wrapValue: number | null = null;
  for (let c = BOARD_COLS - 1; c >= 0; c--) {
    const v = board[newRow - 1]?.[c]?.value ?? null;
    if (v !== null) {
      wrapValue = v;
      break;
    }
  }

  let placed = 0;
  for (const v of odd) {
    if (placed >= batchLen) break;
    const c = valueColumns.get(v);
    if (c === undefined) continue;
    // Diagonal lines through the mate cell at (newRow, c2): down-right keeps
    // (r - c) equal, down-left keeps (r + c) equal.
    const candidates = [c + (board.length - 1) - newRow, c - newRow + (board.length - 1)];
    let done = false;
    for (const c2 of candidates) {
      if (c2 < 0 || c2 >= batchLen || c2 === c) continue;
      if (values[c2] !== null) continue;
      // Other mates already placed in the row must not match this one.
      const leftMate = c2 > 0 ? values[c2 - 1] : null;
      const rightMate = c2 + 1 < batchLen ? values[c2 + 1] : null;
      if (
        (leftMate !== null && (leftMate === v || leftMate + v === 10)) ||
        (rightMate !== null && (rightMate === v || rightMate + v === 10))
      ) {
        continue;
      }
      const b = bottom[c2];
      if (b !== null && (b === v || b === 10 - v)) continue; // would match now
      // Diagonal adjacency to the previous row's cells.
      let diagBlocked = false;
      for (const dc of [-1, 1]) {
        const nb = board[newRow - 1]?.[c2 + dc]?.value ?? null;
        if (nb !== null && (nb === v || nb + v === 10)) {
          diagBlocked = true;
          break;
        }
      }
      if (diagBlocked) continue;
      // Wrap adjacency for the row's first cell.
      if (c2 === 0 && wrapValue !== null && (wrapValue === v || wrapValue + v === 10)) continue;
      values[c2] = v;
      placed++;
      done = true;
      break;
    }
    if (!done) {
      // No deferred spot found; skip — the dispatcher's retry loop will
      // regenerate, and the smart (Immediate) row is the final fallback.
      continue;
    }
  }

  // Fill remaining slots with match-free values so the row itself adds no
  // immediate legal moves (the caller's retry loop catches accidents).
  fillNoMatch(rng, board, values, 0, wrapValue);

  const row = (values as number[]).map((v) => makeCell(v));
  const before = findAllLegalMoves(board).length;
  const after = findAllLegalMoves([...board, row]).length;
  return { row, goal: "future", newLegalMoveCount: after - before };
}

/**
 * Decoy bucket: a row that creates no new match against the board and no
 * internal matches — pure friction for players who press while they still
 * have moves. Only ever used when the board has legal moves (the caller
 * guards that), so a stuck player can never burn a decoy press.
 */
export function generateDecoyRow(
  rng: Rng,
  board: Board,
  opts: SmartAddRowOptions = {},
): AddRowResult {
  const batchLen = batchLengthFor(liveTileCount(board), opts.targetLength ?? 9);
  const newRow = board.length;
  let wrapValue: number | null = null;
  for (let c = BOARD_COLS - 1; c >= 0; c--) {
    const v = board[newRow - 1]?.[c]?.value ?? null;
    if (v !== null) {
      wrapValue = v;
      break;
    }
  }
  const values: Array<number | null> = Array.from({ length: batchLen }, () => null);
  fillNoMatch(rng, board, values, 0, wrapValue);

  const row = values.map((v) => makeCell(v as number));
  const before = findAllLegalMoves(board).length;
  const after = findAllLegalMoves([...board, row]).length;
  return { row, goal: "decoy", newLegalMoveCount: after - before };
}

/**
 * Safety valve — the "completion" row for presses 5..6 of the budget.
 * Supplies exactly one mate per odd-count value, placed directly below a
 * live cell of that value (guaranteed immediate vertical match), and fills
 * the rest with self-pairs. After the press every value count is even: the
 * board is fully paired and can clear to empty without further presses.
 */
export function generateCompletionRow(rng: Rng, board: Board): AddRowResult {
  const batchLen = batchLengthFor(liveTileCount(board), 9);
  const bottom = columnBottoms(board);
  const odd = oddCountValues(board);
  const values: Array<number | null> = Array.from({ length: batchLen }, () => null);

  // Bottom-most live cell per value → its column, guaranteed bottom[c] == v.
  const valueColumns = new Map<number, number>();
  for (let c = 0; c < (board[0]?.length ?? 0); c++) {
    for (let r = board.length - 1; r >= 0; r--) {
      const v = board[r]?.[c]?.value ?? null;
      if (v !== null && !valueColumns.has(v)) {
        valueColumns.set(v, c);
        break;
      }
    }
  }

  let placed = 0;
  for (const v of odd) {
    const c = valueColumns.get(v);
    let target = c !== undefined && c < batchLen && values[c] === null ? c : -1;
    if (target === -1) {
      // Bottom-most cell sits outside the (possibly 8-wide) batch: place the
      // mate anywhere free so the count still pairs; the playout witness
      // decides whether the placement is actually reachable.
      for (let i = 0; i < batchLen; i++) {
        if (values[i] === null) {
          target = i;
          break;
        }
      }
    }
    if (target === -1) continue;
    values[target] = v;
    placed++;
  }

  // The batch is parity-correct by construction: odd values → 9-tile row,
  // even → 8-tile row, so the remaining slots are even in count.
  const fill = fillSelfPairs(rng, batchLen - placed);
  let fi = 0;
  for (let c = 0; c < batchLen; c++) {
    if (values[c] === null) values[c] = fill[fi++];
  }

  const row = (values as number[]).map((v) => makeCell(v));
  const before = findAllLegalMoves(board).length;
  const after = findAllLegalMoves([...board, row]).length;
  return { row, goal: "cleanup", newLegalMoveCount: after - before };
}

/**
 * Generate a row for a bucket with an internal fallback chain: a Decoy that
 * accidentally matches (or a Deferred that fails placement) degrades to the
 * Immediate smart row, which always yields at least one new legal move. The
 * caller re-checks acceptability and can fall back to rescue.
 */
export function generateAddRowForBucket(
  bucket: AddRowBucket,
  rng: Rng,
  board: Board,
  opts: SmartAddRowOptions = {},
): AddRowResult {
  if (bucket === "immediate") return generateSmartAddRow(rng, board, opts);
  if (bucket === "deferred") {
    let result = generateDeferredRow(rng, board, opts);
    for (let i = 0; i < 8 && result.newLegalMoveCount > 0; i++) {
      result = generateDeferredRow(rng, board, opts);
    }
    if (result.newLegalMoveCount > 0) return generateSmartAddRow(rng, board, opts);
    return result;
  }
  // decoy
  let result = generateDecoyRow(rng, board, opts);
  for (let i = 0; i < 8 && result.newLegalMoveCount > 0; i++) {
    result = generateDecoyRow(rng, board, opts);
  }
  if (result.newLegalMoveCount > 0) return generateSmartAddRow(rng, board, opts);
  return result;
}
