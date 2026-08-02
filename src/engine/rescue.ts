// Rescue: guarantees at least one immediate legal match by generating a row
// whose values complement existing non-empty cells on the last row of the
// board. Used when smart Add Row fails validation or the frustration counter
// crosses the rescue threshold.

import { BOARD_COLS, type Board, type Cell } from "./types";
import { makeCell } from "./boardLayout";

export const RESCUE_THRESHOLD = 2;

export function generateRescueRow(board: Board): Cell[] {
  // Find the last non-empty row's values in reading order. The new row's first
  // cell will complement the last non-empty cell (immediate reading-order
  // adjacency via wrap-around), guaranteeing at least one legal match.
  const cols = board[0]?.length ?? BOARD_COLS;
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
  // If the whole board is empty, produce a self-matching pair row.
  const first = anchor === null ? 5 : 10 - anchor;
  const values: number[] = [first];
  while (values.length < cols) {
    // Fill the rest with self-matching pairs so the row itself is fully
    // solvable, and never strands isolated numbers.
    const v = ((values.length - 1) % 9) + 1;
    values.push(v);
    if (values.length < cols) values.push(v);
  }
  values.length = cols;
  return values.map((v) => makeCell(v));
}
