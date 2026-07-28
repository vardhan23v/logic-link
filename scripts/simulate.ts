// CLI simulation harness.
//
// Usage:
//   bun scripts/simulate.ts               # 1000 trials × levels 1-10
//   bun scripts/simulate.ts --trials 2000 --levels 1,2,3
//
// Exits non-zero if any level's completion rate falls below its configured
// `completionProbability`, so this can be wired into CI.

import { formatReport, simulateLevel } from "../src/engine/simulator";
import { LEVEL_IDS } from "../src/engine/config/levels";

type Args = { trials: number; levels: number[] };

function parseArgs(argv: string[]): Args {
  const out: Args = { trials: 1000, levels: LEVEL_IDS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--trials") out.trials = Number(argv[++i]);
    else if (a === "--levels")
      out.levels = argv[++i]
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
  }
  return out;
}

async function main() {
  const { trials, levels } = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  console.log(`Simulating ${trials} boards per level for levels ${levels.join(", ")}\n`);

  let anyBelowTarget = false;
  for (const level of levels) {
    const report = simulateLevel(level, trials);
    console.log(formatReport(report));
    if (report.completionRate < report.completionProbabilityTarget) {
      anyBelowTarget = true;
      console.log(
        `  FAIL: completion rate ${(report.completionRate * 100).toFixed(1)}% < target ${(report.completionProbabilityTarget * 100).toFixed(1)}%`,
      );
    }
    console.log("");
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s`);
  process.exit(anyBelowTarget ? 1 : 0);
}

main();
