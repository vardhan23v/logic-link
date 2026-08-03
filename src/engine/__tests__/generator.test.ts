import { describe, expect, it } from "vitest";
import { getLevelConfig } from "@/engine/config/levels";
import { generateBoard } from "@/engine/generator";
import { isSolvable } from "@/engine/solver";

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
});
