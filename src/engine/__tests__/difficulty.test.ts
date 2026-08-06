import { describe, expect, it } from "vitest";
import {
  difficultyTarget,
  difficultyBand,
  difficultyComponents,
  scoreBoard,
  DIFFICULTY,
  proximityComponent,
  directionMixComponent,
  decoyComponent,
  chainDepthComponent,
  valueSkewComponent,
} from "@/engine/difficulty";
import { createGame } from "@/engine";
import { makeCell, emptyCell } from "@/engine/boardLayout";
import { getLevelConfig } from "@/engine/config/levels";
import type { Board, Cell } from "@/engine/types";

function boardFromValues(rows: Array<Array<number | null>>): Board {
  return rows.map((row) => row.map<Cell>((v) => (v === null ? emptyCell() : makeCell(v))));
}

describe("sawtooth difficulty curve", () => {
  const { base, kRamp, kDrift } = DIFFICULTY;

  it("uses k_drift = 2 * k_ramp", () => {
    expect(kDrift).toBe(2 * kRamp);
  });

  it("satisfies the analytic constraints from the brief", () => {
    // D(6) equals D(3): level 6 is genuine relief.
    expect(difficultyTarget(6)).toBe(difficultyTarget(3));
    // D(10) exceeds D(5): each cycle peaks higher.
    expect(difficultyTarget(10)).toBeGreaterThan(difficultyTarget(5));
    // D(11) drops back below the peak of the cycle it ends ("resets").
    expect(difficultyTarget(11)).toBeLessThan(difficultyTarget(10));
    expect(difficultyTarget(11)).toBe(difficultyTarget(5));
    // Monotonic within each cycle.
    expect(difficultyTarget(2)).toBeGreaterThan(difficultyTarget(1));
    expect(difficultyTarget(5)).toBeGreaterThan(difficultyTarget(4));
    expect(difficultyTarget(7)).toBeGreaterThan(difficultyTarget(6));
    expect(difficultyTarget(10)).toBeGreaterThan(difficultyTarget(9));
  });

  it("scores climb 1..5, dip at 6, climb 7..10, drop at 11", () => {
    const scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(difficultyTarget);
    expect(scores).toEqual([10, 15, 20, 25, 30, 20, 25, 30, 35, 40, 30]);
  });

  it("bands are symmetric around their targets", () => {
    for (const level of [1, 3, 5, 6, 10, 11]) {
      const t = difficultyTarget(level);
      const [lo, hi] = difficultyBand(level);
      expect(lo).toBeLessThan(t);
      expect(hi).toBeGreaterThan(t);
    }
  });

  it("level config target times respect the sawtooth shape", () => {
    const t = (l: number) => getLevelConfig(l).targetCompletionTime;
    expect(t(6)).toBe(t(3)); // relief back to normal
    expect(t(5)).toBeLessThan(t(10)); // each peak higher
    expect(t(11)).toBeLessThan(t(10)); // drop at 11
    expect(t(11)).toBeLessThanOrEqual(t(6) + 15); // relief-ish
    expect(t(1)).toBeLessThan(t(3));
    expect(t(3)).toBeLessThan(t(5));
  });
});

describe("scoreBoard components", () => {
  it("proximity is low for adjacent partners, high for split pairs", () => {
    const adjacent = boardFromValues([[5, 5, 4, 6, null, null, null, null, null]]);
    // partners at distance 1 and 1
    expect(proximityComponent(adjacent)).toBeLessThan(2);
    const split = boardFromValues([[5, 1, 2, 3, 5, null, null, null, null]]);
    // 5s are 4 apart
    expect(proximityComponent(split)).toBeGreaterThan(3);
  });

  it("directionMix weights diagonals above horizontal matches", () => {
    // Horizontal pair: 5 5 → 1 line × 1.0
    const horizontal = boardFromValues([[5, 5, null, null, null, null, null, null, null]]);
    const h = directionMixComponent(horizontal);
    expect(h).toBeCloseTo(1.0, 5);
    // Diagonal pair 5 at (0,0) / 5 at (1,1) is reachable on TWO lines
    // (reading order + down-right diagonal), each at diagonal weight.
    const diagonal = boardFromValues([
      [5, null, null, null, null, null, null, null, null],
      [null, 5, null, null, null, null, null, null, null],
    ]);
    const d = directionMixComponent(diagonal);
    expect(d).toBeCloseTo(2 * 2.4, 5);
    // Vertical pair sits at vertical weight, on two lines (reading order +
    // column), same as the diagonal case.
    const vertical = boardFromValues([
      [5, null, null, null, null, null, null, null, null],
      [5, null, null, null, null, null, null, null, null],
    ]);
    expect(directionMixComponent(vertical)).toBeCloseTo(2 * 1.4, 5);
  });

  it("decoyCount catches near-miss adjacencies", () => {
    // 4 next to 3: 4+3=7, off by 3 — not near. 6 next to 3: 6+3=9, one away
    // from 10 → near-miss decoy.
    const board = boardFromValues([[6, 3, null, null, null, null, null, null, null]]);
    expect(decoyComponent(board)).toBe(1);
    // 5 next to 6: values one apart → near-miss.
    const board2 = boardFromValues([[5, 6, null, null, null, null, null, null, null]]);
    expect(decoyComponent(board2)).toBe(1);
    // Real match (4,6) is not a decoy.
    const board3 = boardFromValues([[4, 6, null, null, null, null, null, null, null]]);
    expect(decoyComponent(board3)).toBe(0);
  });

  it("chainDepth counts greedy left-to-right moves to the dead end", () => {
    // 5 5 | 4 6 | 1 9 | 2 8 | 3 — greedy clears 4 pairs then stops on 3.
    const board = boardFromValues([[5, 5, 4, 6, 1, 9, 2, 8, 3]]);
    expect(chainDepthComponent(board)).toBe(4);
  });

  it("valueSkew punishes low-entropy boards (many 5s) less", () => {
    const manyFives = boardFromValues([[5, 5, 5, 5, 5, 5, 5, 5, 5]]);
    const mixed = boardFromValues([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
    expect(valueSkewComponent(manyFives)).toBeLessThan(valueSkewComponent(mixed));
  });

  it("scoreBoard is stable for identical boards and scales with difficulty", () => {
    const game = createGame(1, 42);
    expect(scoreBoard(game.board)).toBe(scoreBoard(game.board));
    const game5 = createGame(5, 42);
    expect(scoreBoard(game5.board)).toBeGreaterThan(scoreBoard(game.board));
  });

  it("components are reported together", () => {
    const game = createGame(3, 7);
    const c = difficultyComponents(game.board);
    expect(typeof c.proximity).toBe("number");
    expect(typeof c.directionMix).toBe("number");
    expect(typeof c.decoyCount).toBe("number");
    expect(typeof c.chainDepth).toBe("number");
    expect(typeof c.valueSkew).toBe("number");
  });
});
