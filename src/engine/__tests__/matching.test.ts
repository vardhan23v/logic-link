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

  it("sees through cleared cells vertically", () => {
    // 3, empty, 7 in the same column → adjacent via skip-empties.
    const board = boardFromValues([
      [3, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      [7, null, null, null, null, null, null, null, null],
    ]);
    const moves = findAllLegalMoves(board);
    expect(
      moves.some((m) => m.from.row === 0 && m.to.row === 2 && m.from.col === 0 && m.to.col === 0),
    ).toBe(true);
  });

  it("sees through cleared cells diagonally (down-right)", () => {
    // (0,0)=1 and (3,3)=9 share the r-c=0 diagonal; the two intermediate
    // diagonal cells are cleared → still adjacent, and 1+9=10.
    const board = boardFromValues([
      [1, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, 9, null, null, null, null, null],
    ]);
    const moves = findAllLegalMoves(board);
    expect(
      moves.some((m) => m.from.row === 0 && m.from.col === 0 && m.to.row === 3 && m.to.col === 3),
    ).toBe(true);
  });

  it("sees through cleared cells diagonally (down-left)", () => {
    // (0,7)=4 and (3,4)=6 share the r+c=7 anti-diagonal, cells in between
    // cleared → adjacent, 4+6=10.
    const board = boardFromValues([
      [null, null, null, null, null, null, null, 4, null],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, 6, null, null, null, null],
    ]);
    const moves = findAllLegalMoves(board);
    expect(
      moves.some((m) => m.from.row === 0 && m.from.col === 7 && m.to.row === 3 && m.to.col === 4),
    ).toBe(true);
  });

  it("wrap-around skips cleared cells at the row boundary", () => {
    // Row 0 last live cell = 9 at col 6, row 1 first live cell = 1 at col 1,
    // with the two boundary cells cleared → still adjacent via wrap.
    const board = boardFromValues([
      [null, null, null, null, null, null, 9, null, null],
      [null, 1, null, null, null, null, null, null, null],
    ]);
    const moves = findAllLegalMoves(board);
    expect(
      moves.some(
        (m) =>
          (m.from.row === 0 && m.from.col === 6 && m.to.row === 1 && m.to.col === 1) ||
          (m.from.row === 1 && m.from.col === 1 && m.to.row === 0 && m.to.col === 6),
      ),
    ).toBe(true);
  });

  it("does not pair cells with a live cell between them", () => {
    // (0,0)=8 and (0,2)=8, but (0,1)=3 blocks the reading-order line, and no
    // other line joins them → not adjacent while the blocker is live, adjacent
    // once it clears.
    const blocked = boardFromValues([[8, 3, 8, null, null, null, null, null, null]]);
    const moves = findAllLegalMoves(blocked);
    expect(
      moves.some((m) => m.from.col === 0 && m.to.col === 2) ||
        moves.some((m) => m.from.col === 2 && m.to.col === 0),
    ).toBe(false);
    const cleared = boardFromValues([[8, null, 8, null, null, null, null, null, null]]);
    expect(findAllLegalMoves(cleared).length).toBe(1);
    expect(findAllLegalMoves(cleared)[0].from.col === 0).toBe(true);
    expect(findAllLegalMoves(cleared)[0].to.col).toBe(2);
  });
});
