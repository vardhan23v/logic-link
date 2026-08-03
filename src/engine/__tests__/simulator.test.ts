// Gates each level's completion probability with a large simulated cohort.
// Trials-per-level is kept modest so the suite stays under the default
// vitest budget; the CLI harness (`bun scripts/simulate.ts`) runs 1000+
// per level for a fuller signal.

import { describe, expect, it } from "vitest";
import { simulateLevel } from "@/engine/simulator";
import { LEVEL_IDS, getLevelConfig } from "@/engine/config/levels";

const TRIALS = Number(process.env.SIM_TRIALS ?? 120);

describe("simulation harness", () => {
  for (const level of LEVEL_IDS) {
    it(`level ${level} completion rate meets its configured probability`, () => {
      const cfg = getLevelConfig(level);
      const report = simulateLevel(level, TRIALS);
      expect(
        report.completionRate,
        `level ${level}: ${(report.completionRate * 100).toFixed(1)}% completed (target ${(cfg.completionProbability * 100).toFixed(1)}%)`,
      ).toBeGreaterThanOrEqual(cfg.completionProbability);
    }, 60_000);
  }
});
