// Level 1 statistical contract — the exact metric the reviewer reported:
// "Level 1 is not completing in 1 minute and 1 Add Number."
//
// A human-perception model (scan-limited vision, mis-taps, fatigue presses,
// per-move time) simulates 10k normal sessions against the shipped L1 boards:
//   • P(win) ≥ 95% (Wilson 95% CI lower bound),
//   • ≥ 90% of sessions complete within the 45s target time,
//   • ≥ 88% of wins use exactly 1 Add Row,
//   • zero wins with 0 presses (parity invariant: 27 start cells can never
//     clear to empty — at least one press is mandatory by design).
//
// Also: every shipped L1 board must satisfy the spec's "70% match density"
// floor and be winnable with a single Add Row press (budget solver witness
// through the real valve row — pressing at any point deals a completion row).

import { describe, expect, it } from "vitest";
import { getLevelConfig } from "@/engine/config/levels";
import { getPooledBoard } from "@/engine/pool";
import { simulateLevelHuman, simulateLevelStrategy, type PlayStrategy } from "@/engine/simulator";
import { isWinnableWithinBudget } from "@/engine/solver";
import { matchDensity } from "@/engine/validator";
import { humanPlayabilityMetrics, isHumanPlayable } from "@/engine/humanPlayability";
import { boardAfterPress } from "@/engine/index";
import { mulberry32 } from "@/engine/rng";
import { wilsonInterval } from "@/engine/stats";
import type { Board } from "@/engine/types";

const L1_TARGET_SECONDS = 45;

const STRATEGIES: PlayStrategy[] = ["greedy", "semi-random", "random", "imperfect"];

describe("Level 1 statistical contract (human-perception model, 10k trials)", () => {
  const report = simulateLevelHuman(1, 10_000);

  it("P(win) ≥ 95% (Wilson 95% CI lower bound)", () => {
    const ci = wilsonInterval(report.trials, report.completed);
    expect(
      ci.lower,
      `win ${(report.completionRate * 100).toFixed(2)}%, CI lower ${(ci.lower * 100).toFixed(
        2,
      )}% < 95%`,
    ).toBeGreaterThanOrEqual(0.95);
  });

  it("≥ 90% of sessions complete within 45 seconds", () => {
    const ci = wilsonInterval(report.trials, report.withinTargetTime);
    expect(
      ci.lower,
      `within-${L1_TARGET_SECONDS}s ${(report.withinTargetRate * 100).toFixed(
        2,
      )}%, CI lower ${(ci.lower * 100).toFixed(2)}% < 90%`,
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("≥ 88% of wins use exactly 1 Add Row", () => {
    expect(
      (report.onePressRate * 100).toFixed(2),
      `1-press share ${(report.onePressRate * 100).toFixed(2)}% < 88%`,
    ).not.toBeUndefined();
    expect(report.onePressRate).toBeGreaterThanOrEqual(0.88);
  });

  it("average completion time stays under 40s and p90 under 45s", () => {
    expect(report.secondsAvg).toBeLessThan(40);
    expect(report.secondsP90).toBeLessThanOrEqual(L1_TARGET_SECONDS);
  });

  it("no win ever uses 0 Add Rows (parity: 27 start cells must clear via a press)", () => {
    expect(report.addRowsHistogram[0]).toBe(0);
  });
}, 300_000);

describe("Level 1 board pool contract", () => {
  it("every shipped L1 board has ≥ 70% match density at start", () => {
    let checked = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const board = getPooledBoard(1, seed);
      if (!board) continue;
      checked++;
      const density = matchDensity(board);
      expect(
        density,
        `L1 seed ${seed}: density ${(density * 100).toFixed(1)}% < 70%`,
      ).toBeGreaterThanOrEqual(0.7);
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("every shipped L1 board passes the human-playability gate", () => {
    let checked = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const board = getPooledBoard(1, seed);
      if (!board) continue;
      checked++;
      const m = humanPlayabilityMetrics(board);
      expect(
        isHumanPlayable(board, 0.65),
        `L1 seed ${seed}: not human-playable (obvious ${(m.obviousDensity * 100).toFixed(
          1,
        )}%, h-same ${m.horizontalSamePairs}, choices ${m.independentChoices}, decoys ${
          m.decoyTiles
        }, wrap ${(m.wrapShare * 100).toFixed(1)}%)`,
      ).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("every shipped L1 board is winnable with a single Add Row press", () => {
    let checked = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const board = getPooledBoard(1, seed);
      if (!board) continue;
      checked++;
      const pressRow = (b: Board, _r: () => number, moveCount: number, pressesLeft: number) =>
        boardAfterPress({
          board: b,
          level: 1,
          seed,
          moveCount,
          addRowsRemaining: pressesLeft,
        } as never);
      const winnable = isWinnableWithinBudget(board, mulberry32(seed), {
        presses: 1,
        maxNodes: 120_000,
        pressRow,
      });
      expect(winnable, `L1 seed ${seed}: no clear path with a single press`).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  }, 300_000);
});

describe("Level 1 different-player-choice contract (assignment §6, 10k trials per strategy)", () => {
  // The normal-human cohort: players who look at the board and mostly take
  // the obvious match. They must hit the assignment's 45s / ~1 Add Row bars.
  const NORMAL: PlayStrategy[] = ["greedy", "semi-random", "imperfect"];
  // The chaos stress test: a player who taps uniformly random legal matches.
  // The assignment requires the game to stay RECOVERABLE under any choice
  // pattern — win rate is the gate; time is reported, not enforced (a
  // chaotic player is slow by definition, not by board design).
  const STRESS: PlayStrategy[] = ["random"];

  it.each(NORMAL)(
    "normal strategy %s: win ≥ 95%, within-45s ≥ 90%, 1 press ≥ 85%, rescue low, avg ≤ 1.5 presses, p90 ≤ 45s",
    (strategy) => {
      const report = simulateLevelStrategy(1, 10_000, strategy);
      const win = wilsonInterval(report.trials, report.completed);
      const within = wilsonInterval(report.trials, report.withinTargetTime);
      const onePress = report.onePressRate;
      expect(
        win.lower,
        `${strategy}: win ${(report.completionRate * 100).toFixed(2)}% CI ${(win.lower * 100).toFixed(2)}% < 95%`,
      ).toBeGreaterThanOrEqual(0.95);
      expect(
        within.lower,
        `${strategy}: within-45s ${(report.withinTargetRate * 100).toFixed(2)}% CI ${(within.lower * 100).toFixed(2)}% < 90%`,
      ).toBeGreaterThanOrEqual(0.9);
      expect(
        onePress,
        `${strategy}: 1-press ${(onePress * 100).toFixed(2)}% < 85%`,
      ).toBeGreaterThanOrEqual(0.85);
      expect(
        report.rescueRate,
        `${strategy}: rescue ${(report.rescueRate * 100).toFixed(2)}% — rescue must not be the primary path`,
      ).toBeLessThan(0.05);
      expect(
        report.addRowsAvg,
        `${strategy}: avg ${report.addRowsAvg.toFixed(2)} presses`,
      ).toBeLessThanOrEqual(1.5);
      expect(
        report.secondsP90,
        `${strategy}: p90 ${report.secondsP90.toFixed(1)}s > 45s`,
      ).toBeLessThanOrEqual(L1_TARGET_SECONDS);
    },
    600_000,
  );

  it.each(STRESS)(
    "stress strategy %s: the board stays recoverable (win ≥ 95%) even when the player ignores every hint",
    (strategy) => {
      const report = simulateLevelStrategy(1, 10_000, strategy);
      const win = wilsonInterval(report.trials, report.completed);
      expect(
        win.lower,
        `${strategy}: win ${(report.completionRate * 100).toFixed(2)}% CI ${(win.lower * 100).toFixed(2)}% < 95%`,
      ).toBeGreaterThanOrEqual(0.95);
      expect(
        report.onePressRate,
        `${strategy}: 1-press ${(report.onePressRate * 100).toFixed(2)}%`,
      ).toBeGreaterThanOrEqual(0.85);
      expect(
        report.rescueRate,
        `${strategy}: rescue ${(report.rescueRate * 100).toFixed(2)}%`,
      ).toBeLessThan(0.05);
    },
    600_000,
  );
});

describe("all-level human model (3k trials)", () => {
  it("completion-within-target-time clears every level's probability bar", () => {
    for (const lv of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const cfg = getLevelConfig(lv);
      const report = simulateLevelHuman(lv, 3_000);
      const ci = wilsonInterval(report.trials, report.withinTargetTime);
      expect(
        ci.lower,
        `L${lv}: within-${cfg.targetCompletionTime}s ${(report.withinTargetRate * 100).toFixed(
          2,
        )}%, CI lower ${(ci.lower * 100).toFixed(2)}% < target ${
          cfg.withinTargetProbability * 100
        }% (L1 spec: 90%, rest: 95%)`,
      ).toBeGreaterThanOrEqual(cfg.withinTargetProbability);
    }
  }, 300_000);
});
