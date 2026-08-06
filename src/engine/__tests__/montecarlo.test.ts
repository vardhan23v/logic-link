// Monte Carlo gates, at CI-friendly trial counts (the full 10k harness is
// `npx -y tsx scripts/monte-carlo.ts` and `scripts/naive-check.ts`):
//   • heuristic bot: Wilson 95% CI lower bound on P(win) ≥ level target
//   • mean moves CI half-width ≤ 1
//   • naive sweep: L1 ≥ 85%, L8–L10 ≤ 80% (anti-degenerate gradient)

import { describe, expect, it } from "vitest";
import { LEVEL_IDS, getLevelConfig } from "@/engine/config/levels";
import { runLevel } from "../../../scripts/monte-carlo";
import { naiveSolveRates } from "../../../scripts/naive-check";

describe("Monte Carlo gates (heuristic bot)", () => {
  it("P(win) Wilson 95% CI lower bound clears every level target", () => {
    const trials = 1_000;
    for (const lv of LEVEL_IDS) {
      const r = runLevel(lv, trials, "heuristic");
      const cfg = getLevelConfig(lv);
      expect(
        r.winLower95,
        `level ${lv}: win rate ${(r.winRate * 100).toFixed(2)}% CI lower ${(
          r.winLower95 * 100
        ).toFixed(2)}% < target ${cfg.completionProbability * 100}%`,
      ).toBeGreaterThanOrEqual(cfg.completionProbability);
    }
  }, 300_000);

  it("mean presses CI half-width ≤ 1 for every level", () => {
    const trials = 1_000;
    for (const lv of LEVEL_IDS) {
      const r = runLevel(lv, trials, "heuristic");
      expect(r.movesHalfWidth, `level ${lv}: ±${r.movesHalfWidth.toFixed(2)}`).toBeLessThanOrEqual(
        1,
      );
    }
  }, 300_000);
});

describe("anti-degenerate naive sweep", () => {
  it("mechanical play sails through L1 but stalls on L8–L10", () => {
    const rates = naiveSolveRates(500);
    const l1 = rates.get(1)!;
    expect(l1, `naive L1 solve ${(l1 * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.85);
    for (const lv of [8, 9, 10]) {
      const r = rates.get(lv)!;
      expect(r, `naive L${lv} solve ${(r * 100).toFixed(1)}% should be ≤ 80%`).toBeLessThanOrEqual(
        0.8,
      );
    }
  }, 300_000);

  it("naive play on the hardest level is well below naive play on L1", () => {
    const rates = naiveSolveRates(500);
    expect(rates.get(10)! + 0.15).toBeLessThan(rates.get(1)!);
  }, 300_000);
});
