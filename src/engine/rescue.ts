// Rescue: guarantees at least one immediate legal match by generating a row
// whose values complement existing non-empty cells on the last row of the
// board. Used when smart Add Row fails validation or a frustration trigger
// fires (repeated dead presses, too many invalid taps, dawdling).
//
// Tiers:
//   tier 2 (default) — a single guaranteed wrap match: the row's first cell
//     complements the last live cell of the previous row (reading-order
//     adjacency across the wrap boundary).
//   tier 1 — a generous recovery: the wrap match plus 3–4 short horizontal
//     match pairs inside the row itself, so the player gets several moves at
//     once.

import { BOARD_COLS, type Board, type Cell } from "./types";
import { makeCell } from "./boardLayout";
import { liveTileCount, batchLengthFor } from "./addRow";

export const RESCUE_THRESHOLD = 2;
export const RESCUE_INVALID_TAPS = 8;

/** Last live value in reading order (the wrap anchor), null when empty. */
function lastLiveValue(board: Board): number | null {
  for (let r = board.length - 1; r >= 0; r--) {
    const row = board[r];
    for (let c = row.length - 1; c >= 0; c--) {
      if (row[c].value !== null) {
        return row[c].value;
      }
    }
  }
  return null;
}

/**
 * Values for a self-clearable row of `length` cells: equal pairs, with an
 * odd tail completing the previous pair (cell i = complement of cell i-1).
 */
function selfPairValues(length: number, start: number): number[] {
  const values: number[] = [];
  let v = start;
  while (values.length < length) {
    const remaining = length - values.length;
    if (remaining === 1) {
      values.push(10 - values[values.length - 1]);
      break;
    }
    values.push(v);
    if (values.length < length) values.push(v);
    v = (v % 9) + 1;
  }
  return values;
}

export function generateRescueRow(
  board: Board,
  opts: { tier?: 1 | 2 } = {},
  targetLength = BOARD_COLS,
): Cell[] {
  const tier = opts.tier ?? 2;
  const batchLen = batchLengthFor(liveTileCount(board), targetLength);
  const anchor = lastLiveValue(board);

  // Whole board empty → fully self-matching row of parity-consistent length.
  if (anchor === null) return selfPairValues(batchLen, 5).map((v) => makeCell(v));

  const first = 10 - anchor; // wrap match against the anchor
  if (tier === 1) {
    // Wrap match up front, then as many equal-value pairs as fit. batchLen 9:
    // 1 + 4 pairs = 9; batchLen 8: 1 + 3 pairs + tail-complement = 8 — every
    // cell takes part in a legal move.
    const values: number[] = [first];
    let v = (first % 9) + 1;
    while (values.length < batchLen) {
      const remaining = batchLen - values.length;
      if (remaining === 1) {
        values.push(10 - values[values.length - 1]);
        break;
      }
      values.push(v);
      if (values.length < batchLen) values.push(v);
      v = (v % 9) + 1;
    }
    values.length = batchLen;
    return values.map((v) => makeCell(v));
  }

  // Tier 2: wrap match + self-matching pairs for the rest, never stranding
  // isolated numbers.
  const values: number[] = [first];
  while (values.length < batchLen) {
    const remaining = batchLen - values.length;
    if (remaining === 1) {
      values.push(10 - values[values.length - 1]);
      break;
    }
    const v = ((values.length - 1) % 9) + 1;
    values.push(v);
    if (values.length < batchLen) values.push(v);
  }
  values.length = batchLen;
  return values.map((v) => makeCell(v));
}
