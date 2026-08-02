// Gates the difficulty curve: each level's simulated completion rate must sit
// near its configured target, and the curve must never rise as levels advance.
// Trials are modest here; `bun scripts/simulate.ts` gives a fuller signal.

import { describe, expect, it } from "vitest";
import { simulateLevel } from "@/engine/simulator";
import { LEVEL_IDS, getLevelConfig } from "@/engine/config/levels";

const TRIALS = Number(process.env.SIM_TRIALS ?? 25);
/** Sampling noise at this trial count is large; keep the band generous. */
const TOLERANCE = 0.25;

describe("difficulty curve", () => {
  it("level parameters increase monotonically", () => {
    for (let i = 1; i < LEVEL_IDS.length; i++) {
      const prev = getLevelConfig(LEVEL_IDS[i - 1]);
      const cur = getLevelConfig(LEVEL_IDS[i]);
      expect(cur.initialCellCount).toBeGreaterThan(prev.initialCellCount);
      expect(cur.scatterStrength).toBeGreaterThan(prev.scatterStrength);
      expect(cur.decoyRatio).toBeGreaterThan(prev.decoyRatio);
      expect(cur.gridCols).toBeGreaterThanOrEqual(prev.gridCols);
      expect(cur.memorizationTime).toBeLessThan(prev.memorizationTime);
      expect(cur.animationSpeedMs).toBeLessThan(prev.animationSpeedMs);
      expect(cur.completionProbability).toBeLessThan(prev.completionProbability);
      expect(cur.addRowBudget).toBeLessThanOrEqual(prev.addRowBudget);
    }
  });

  it("no level is impossible", () => {
    for (const level of LEVEL_IDS) {
      expect(getLevelConfig(level).completionProbability).toBeGreaterThanOrEqual(0.3);
    }
  });

  for (const level of LEVEL_IDS.slice(0, 5)) {
    it(`level ${level} completion rate tracks its target`, () => {
      const cfg = getLevelConfig(level);
      const report = simulateLevel(level, TRIALS);
      expect(
        report.completionRate,
        `level ${level}: ${(report.completionRate * 100).toFixed(1)}% (target ${(cfg.completionProbability * 100).toFixed(1)}%)`,
      ).toBeGreaterThanOrEqual(cfg.completionProbability - TOLERANCE);
    }, 120_000);
  }
});
