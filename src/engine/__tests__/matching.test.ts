import { describe, expect, it } from "vitest";
import { findAllLegalMoves, isMatchPair } from "@/engine/matching";
import { makeCell } from "@/engine/boardLayout";
import type { Board, Cell } from "@/engine/types";

function boardFromValues(rows: Array<Array<number | null>>): Board {
  return rows.map((row) =>
    row.map<Cell>((v) => (v === null ? { id: `e${Math.random()}`, value: null } : makeCell(v))),
  );
}

describe("matching rules", () => {
  it("matches equal values", () => {
    expect(isMatchPair(5, 5)).toBe(true);
    expect(isMatchPair(3, 3)).toBe(true);
  });

  it("matches values summing to 10", () => {
    expect(isMatchPair(1, 9)).toBe(true);
    expect(isMatchPair(4, 6)).toBe(true);
  });

  it("rejects unrelated values", () => {
    expect(isMatchPair(1, 2)).toBe(false);
    expect(isMatchPair(3, 4)).toBe(false);
  });
});

describe("adjacency", () => {
  it("finds horizontal reading-order matches", () => {
    const board = boardFromValues([[5, 5, 1, 2, 3, 4, 6, 7, 8]]);
    const moves = findAllLegalMoves(board);
    // 5 & 5 adjacent, 4 & 6 adjacent
    expect(moves.some((m) => m.from.col === 0 && m.to.col === 1)).toBe(true);
    expect(moves.some((m) => m.from.col === 5 && m.to.col === 6)).toBe(true);
  });

  it("wraps last cell of a row to first cell of next row", () => {
    const board = boardFromValues([
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ]);
    // row0.col8=9, row1.col0=1 → sum 10, must be legal
    const moves = findAllLegalMoves(board);
    expect(
      moves.some(
        (m) =>
          (m.from.row === 0 && m.from.col === 8 && m.to.row === 1 && m.to.col === 0) ||
          (m.from.row === 1 && m.from.col === 0 && m.to.row === 0 && m.to.col === 8),
      ),
    ).toBe(true);
  });

  it("skips empty cells along a line", () => {
    // Row: 5, null, 5 → 5 & 5 should be adjacent via reading order (skip empty)
    const board = boardFromValues([[5, null, 5, null, null, null, null, null, null]]);
    const moves = findAllLegalMoves(board);
    expect(moves.length).toBe(1);
    expect(moves[0].from.col).toBe(0);
    expect(moves[0].to.col).toBe(2);
  });

  it("finds vertical matches", () => {
    const board = boardFromValues([
      [3, null, null, null, null, null, null, null, null],
      [7, null, null, null, null, null, null, null, null],
    ]);
    const moves = findAllLegalMoves(board);
    expect(moves.some((m) => m.from.col === 0 && m.to.col === 0 && m.from.row !== m.to.row)).toBe(
      true,
    );
  });
});
