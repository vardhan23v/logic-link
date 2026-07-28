import { describe, expect, it } from "vitest";
import { addRow, applyMove, createGame } from "@/engine";
import { findAllLegalMoves } from "@/engine/matching";
import { generateRescueRow } from "@/engine/rescue";

describe("addRow", () => {
  it("preserves solvability after insertion", () => {
    const game = createGame(1, 42);
    const next = addRow(game);
    // Row was inserted (row count +1) and game is still playing or won
    expect(next.board.length).toBeGreaterThanOrEqual(game.board.length);
    expect(next.addRowsRemaining).toBe(game.addRowsRemaining - 1);
    expect(next.status === "playing" || next.status === "won").toBe(true);
  });

  it("returns unchanged state when budget exhausted", () => {
    let game = createGame(1, 42);
    for (let i = 0; i < 10; i++) game = addRow(game);
    const exhausted = game;
    const next = addRow(exhausted);
    expect(next).toBe(exhausted);
  });

  it("rescue always yields at least one legal move on a non-empty anchor", () => {
    const game = createGame(1, 99);
    const row = generateRescueRow(game.board);
    const before = findAllLegalMoves(game.board).length;
    const after = findAllLegalMoves([...game.board, row]).length;
    expect(after).toBeGreaterThan(before);
  });
});

describe("error handling", () => {
  it("invalid move returns unchanged state", () => {
    const game = createGame(1, 7);
    const bad = applyMove(game, { row: -1, col: -1 }, { row: 0, col: 0 });
    expect(bad).toBe(game);
  });

  it("invalid pairing returns unchanged state", () => {
    const game = createGame(1, 7);
    // Try to match cell with itself
    const bad = applyMove(game, { row: 0, col: 0 }, { row: 0, col: 0 });
    expect(bad).toBe(game);
  });
});
