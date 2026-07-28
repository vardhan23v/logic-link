// Straggler detection: rows containing very few remaining non-empty cells.
// Feeds Add Row cleanup priority.

import type { Board } from "./types";

export function rowFillCounts(board: Board): number[] {
  return board.map((row) => row.filter((c) => c.value !== null).length);
}

export function strandedValues(board: Board): number[] {
  // Cells whose current row has ≤2 non-empty numbers left are considered stranded.
  const counts = rowFillCounts(board);
  const out: number[] = [];
  for (let r = 0; r < board.length; r++) {
    if (counts[r] > 0 && counts[r] <= 2) {
      for (const cell of board[r]) {
        if (cell.value !== null) out.push(cell.value);
      }
    }
  }
  return out;
}
