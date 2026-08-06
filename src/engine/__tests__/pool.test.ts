import { describe, it, expect } from "vitest";
import { createGame, boardAfterPress } from "@/engine";
import { getLevelConfig, LEVEL_IDS } from "@/engine/config/levels";
import { scoreBoard, difficultyBand } from "@/engine/difficulty";
import { isWinnableWithinBudget } from "@/engine/solver";
import { mulberry32 } from "@/engine/rng";
import { getPooledBoard, poolBoardCount } from "@/engine/pool";
import type { Board, GameState } from "@/engine/types";

describe("board pool", () => {
  it("has at least 8 baked boards per level", () => {
    for (const level of LEVEL_IDS) {
      expect(poolBoardCount(level), `level ${level}`).toBeGreaterThanOrEqual(8);
    }
  });

  it("every pooled board sits inside its level's difficulty band", () => {
    for (const level of LEVEL_IDS) {
      const [lo, hi] = difficultyBand(level);
      const config = getLevelConfig(level);
      for (let s = 1; s <= poolBoardCount(level); s++) {
        const board = getPooledBoard(level, s * 9973);
        expect(board, `level ${level} seed ${s}`).not.toBeNull();
        const score = scoreBoard(board!);
        expect(score, `level ${level} seed ${s}`).toBeGreaterThanOrEqual(lo);
        expect(score, `level ${level} seed ${s}`).toBeLessThanOrEqual(hi);
        void config;
      }
    }
  });

  it("the boards players actually get are winnable within the press budget", () => {
    for (const level of LEVEL_IDS) {
      const config = getLevelConfig(level);
      const game = createGame(level);
      const seed = game.seed;
      const pressRow = (board: Board, _r: () => number, moveCount: number) =>
        boardAfterPress({ board, level, seed, moveCount } as unknown as GameState);
      const ok = isWinnableWithinBudget(game.board, mulberry32(seed), {
        presses: config.addRowBudget,
        maxNodes: 120_000,
        pressRow,
      });
      expect(
        ok,
        `level ${level} must have a winning path within ${config.addRowBudget} presses`,
      ).toBe(true);
    }
  });

  it("level → board mapping is deterministic", () => {
    const values = (game: ReturnType<typeof createGame>) =>
      game.board.map((row) => row.map((c) => c.value));
    for (const level of [1, 5, 11]) {
      const a = createGame(level, 12345);
      const b = createGame(level, 12345);
      expect(JSON.stringify(values(a))).toBe(JSON.stringify(values(b)));
    }
  });
});
