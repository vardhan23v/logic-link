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
  it("solves a trivial pair board", () => {
    const board = boardFromValues([[5, 5, 4, 6, 1, 9, 2, 8, 3]]);
    // Note: 8 cells pair, last is 3 alone → unsolvable
    expect(isSolvable(board)).toBe(false);
  });

  it("solves an even, fully pairable board", () => {
    const board = boardFromValues([
      [5, 5, 4, 6, 1, 9, 2, 8, 3],
      [7, null, null, null, null, null, null, null, null],
    ]);
    expect(isSolvable(board)).toBe(true);
  });

  it("returns false on an isolated single cell", () => {
    const board = boardFromValues([[7, null, null, null, null, null, null, null, null]]);
    expect(isSolvable(board)).toBe(false);
  });
});
