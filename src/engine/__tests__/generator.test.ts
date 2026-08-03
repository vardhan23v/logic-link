import { describe, expect, it } from "vitest";
import { getLevelConfig, LEVEL_IDS } from "@/engine/config/levels";
import { generateBoard } from "@/engine/generator";
import { isSolvable, liveCellCount } from "@/engine/solver";
import { BOARD_COLS } from "@/engine/types";

describe("generator", () => {
  for (const level of [1, 2, 3]) {
    it(`level ${level} generates solvable boards across many seeds`, () => {
      const config = getLevelConfig(level);
      let solvable = 0;
      const trials = 25;
      for (let s = 1; s <= trials; s++) {
        const { board } = generateBoard(config, s * 7 + 1);
        if (isSolvable(board)) solvable++;
      }
      expect(solvable).toBe(trials);
    });
  }

  it("every level starts with exactly 3 full 9-column rows (spec board)", () => {
    for (const level of LEVEL_IDS) {
      const { board } = generateBoard(getLevelConfig(level), level * 131 + 7);
      expect(board.length).toBe(3);
      for (const row of board) expect(row.length).toBe(BOARD_COLS);
      expect(liveCellCount(board)).toBe(27);
    }
  });
});
