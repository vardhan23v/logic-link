import { describe, expect, it } from "vitest";
import {
  addRow,
  applyMove,
  createGame,
  expectedSecondsPerMatch,
  registerInvalidTap,
  undo,
  findAllLegalMoves,
} from "@/engine";
import { deserializeGame, serializeGame } from "@/engine/persist";
import { RESCUE_INVALID_TAPS } from "@/engine/rescue";

describe("undo", () => {
  it("undoes a move and restores add-row budget", () => {
    const game = createGame(1);
    const move = findAllLegalMoves(game.board)[0];
    expect(move).toBeDefined();
    const after = applyMove(game, move.from, move.to);
    expect(after.moveCount).toBe(1);
    const back = undo(after);
    expect(back.moveCount).toBe(0);
    expect(back.addRowsRemaining).toBe(game.addRowsRemaining);
  });

  it("undoes an Add Row press", () => {
    const game = createGame(1);
    const after = addRow(game);
    expect(after.addRowsRemaining).toBe(game.addRowsRemaining - 1);
    const back = undo(after);
    expect(back.addRowsRemaining).toBe(game.addRowsRemaining);
    expect(back.board.length).toBe(game.board.length);
  });

  it("is a no-op with empty history or after the game ends", () => {
    const game = createGame(1);
    expect(undo(game)).toBe(game);
    const after = addRow(game);
    const won = { ...after, status: "won" as const };
    expect(undo(won)).toBe(won);
  });

  it("undo of undo replays identically", () => {
    const game = createGame(1);
    const after = addRow(game);
    const back = undo(after);
    const redo = addRow(back);
    expect(redo.board.map((r) => r.map((c) => c.value))).toEqual(
      after.board.map((r) => r.map((c) => c.value)),
    );
    expect(redo.moveCount).toBe(after.moveCount);
  });
});

describe("rescue triggers", () => {
  it("never rescues on early presses when nothing is wrong", () => {
    const game = createGame(1);
    const after = addRow(game);
    expect(after.rescueTriggered).toBeNull();
    expect(after.rescueCounter).toBe(0);
  });

  it("fires a rescue after enough consecutive invalid taps", () => {
    let game = createGame(1);
    for (let i = 0; i < RESCUE_INVALID_TAPS; i++) {
      game = registerInvalidTap(game);
    }
    expect(game.invalidTapCount).toBe(RESCUE_INVALID_TAPS);
    const after = addRow(game);
    expect(after.rescueTriggered).toBe("invalidTaps");
    expect(after.invalidTapCount).toBe(RESCUE_INVALID_TAPS);
  });

  it("a time trigger forces a tier-1 rescue and adds matches", () => {
    const game = createGame(1);
    const before = findAllLegalMoves(game.board).length;
    const after = addRow(game, { rescueReason: "time" });
    expect(after.rescueTriggered).toBe("time");
    const afterMoves = findAllLegalMoves(after.board).length;
    // Tier-1 rescue adds several matches at once: wrap match + pairs.
    expect(afterMoves).toBeGreaterThan(before);
  });

  it("invalid-tap streak resets on a successful move", () => {
    let game = createGame(1);
    game = registerInvalidTap(game);
    game = registerInvalidTap(game);
    expect(game.invalidTapCount).toBe(2);
    const move = findAllLegalMoves(game.board)[0];
    const after = applyMove(game, move.from, move.to);
    expect(after.invalidTapCount).toBe(0);
  });

  it("expectedSecondsPerMatch is positive and sane for every level", () => {
    for (let level = 1; level <= 11; level++) {
      const s = expectedSecondsPerMatch(level);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(120);
    }
  });
});

describe("persistence", () => {
  it("round-trips a mid-game state with history", () => {
    const game = createGame(3);
    const move = findAllLegalMoves(game.board)[0];
    const afterMove = applyMove(game, move.from, move.to);
    const afterRow = addRow(afterMove);
    const json = serializeGame(afterRow);
    const restored = deserializeGame(json);
    expect(restored).not.toBeNull();
    expect(restored!.level).toBe(3);
    expect(restored!.moveCount).toBe(1);
    expect(restored!.addRowsRemaining).toBe(afterRow.addRowsRemaining);
    expect(restored!.board.map((r) => r.map((c) => c.value))).toEqual(
      afterRow.board.map((r) => r.map((c) => c.value)),
    );
    expect(restored!.history.length).toBe(2);
  });

  it("resumes play after restore", () => {
    const game = createGame(2);
    const afterRow = addRow(game);
    const restored = deserializeGame(serializeGame(afterRow))!;
    const move = findAllLegalMoves(restored.board)[0];
    const continued = applyMove(restored, move.from, move.to);
    expect(continued.moveCount).toBe(1);
    expect(continued.addRowsRemaining).toBe(afterRow.addRowsRemaining);
  });

  it("returns null for malformed input", () => {
    expect(deserializeGame("not json")).toBeNull();
    expect(deserializeGame('{"version":1}')).toBeNull();
    expect(deserializeGame('{"version":99,"board":[]}')).toBeNull();
  });
});
