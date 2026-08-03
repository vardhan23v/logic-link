import { describe, expect, it } from "vitest";
import { isSolvable } from "@/engine/solver";
import { makeCell } from "@/engine/boardLayout";
import type { Board, Cell } from "@/engine/types";

function boardFromValues(rows: Array<Array<number | null>>): Board {
  return rows.map((row) =>
    row.map<Cell>((v) => (v === null ? { id: `e${Math.random()}`, value: null } : makeCell(v))),
  );
}

describe("solver", () => {
  it("solves an odd board down to its pairing residual", () => {
    // 9 cells: 4 pairs + the lone 3. Clearing to one leftover cell counts as
    // solved — the singleton's partner arrives via Add Row.
    const board = boardFromValues([[5, 5, 4, 6, 1, 9, 2, 8, 3]]);
    expect(isSolvable(board)).toBe(true);
  });

  it("solves an even, fully pairable board to empty", () => {
    const board = boardFromValues([
      [5, 5, 4, 6, 1, 9, 2, 8, 3],
      [7, null, null, null, null, null, null, null, null],
    ]);
    expect(isSolvable(board)).toBe(true);
  });

  it("returns false on an even board with an unmatchable remainder", () => {
    // 1-1 clears, then 2 and 3 remain: not equal, don't sum to 10 → stuck at
    // two live cells, above the residual of 0.
    const board = boardFromValues([[1, 1, 2, 3, null, null, null, null, null]]);
    expect(isSolvable(board)).toBe(false);
  });

  it("treats a lone cell as already at its residual", () => {
    const board = boardFromValues([[7, null, null, null, null, null, null, null, null]]);
    expect(isSolvable(board)).toBe(true);
  });
});
