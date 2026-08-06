// Rescue: guarantees at least one immediate legal match by generating a row
// whose values complement existing non-empty cells on the last row of the
// board. Used when smart Add Row fails validation or the frustration counter
// crosses the rescue threshold.

import { BOARD_COLS, type Board, type Cell } from "./types";
import { makeCell } from "./boardLayout";
import { liveTileCount, batchLengthFor } from "./addRow";

export const RESCUE_THRESHOLD = 2;

export function generateRescueRow(board: Board, targetLength = BOARD_COLS): Cell[] {
  const batchLen = batchLengthFor(liveTileCount(board), targetLength);
  // Find the last non-empty row's values in reading order. The new row's first
  // cell will complement the last non-empty cell (immediate reading-order
  // adjacency via wrap-around), guaranteeing at least one legal match.
  let anchor: number | null = null;
  outer: for (let r = board.length - 1; r >= 0; r--) {
    const row = board[r];
    for (let c = row.length - 1; c >= 0; c--) {
      if (row[c].value !== null) {
        anchor = row[c].value;
        break outer;
      }
    }
  }
  // If the whole board is empty, produce a fully self-matching row of the
  // requested parity-consistent length.
  if (anchor === null) {
    const values: number[] = [];
    let v = 5;
    while (values.length < batchLen) {
      values.push(v);
      if (values.length < batchLen) values.push(v);
      v = (v % 9) + 1;
    }
    return values.map((v) => makeCell(v));
  }
  const first = 10 - anchor;
  const values: number[] = [first];
  while (values.length < batchLen) {
    // Fill the rest with self-matching pairs so the row itself is fully
    // solvable, and never strands isolated numbers.
    const remaining = batchLen - values.length;
    if (remaining === 1) {
      // Tail singleton with no partner left: make it the complement of the
      // cell before it, so the final two cells clear each other.
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
