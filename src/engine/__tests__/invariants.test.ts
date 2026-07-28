import { describe, expect, it } from "vitest";
import { createGame, applyMove, getLegalMoves } from "@/engine";

describe("invariants", () => {
  it("engine never mutates input GameState across applyMove", () => {
    const game = createGame(1, 21);
    const snapshot = JSON.stringify(game);
    const moves = getLegalMoves(game);
    if (moves.length > 0) {
      applyMove(game, moves[0].from, moves[0].to);
    }
    expect(JSON.stringify(game)).toBe(snapshot);
  });

  it("createGame is deterministic per seed", () => {
    const a = createGame(2, 12345);
    const b = createGame(2, 12345);
    // Cell ids differ (id counter), but values and structure must match.
    const shape = (g: typeof a) => g.board.map((r) => r.map((c) => c.value));
    expect(shape(a)).toEqual(shape(b));
    expect(a.seed).toBe(b.seed);
  });
});
