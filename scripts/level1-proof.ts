import {
  simulateLevelHuman,
  simulateLevelStrategy,
  formatReport,
  type PlayStrategy,
} from "../src/engine/simulator";
import { getPooledBoard } from "../src/engine/pool";
import { humanPlayabilityMetrics } from "../src/engine/humanPlayability";
import { wilsonInterval } from "../src/engine/stats";

const trials = Number(process.argv[2] ?? 20000);

const report = simulateLevelHuman(1, trials);
console.log(formatReport(report));
const z = 1.96;
const wilsonLB = (p: number, n: number) => {
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const hw = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return (c - hw) / d;
};
const check = (label: string, v: number, bar: number) => {
  const lb = wilsonLB(v, trials);
  const pass = lb >= bar;
  console.log(
    `  ${label}: ${(v * 100).toFixed(2)}%  (95% CI LB ${(lb * 100).toFixed(2)}% vs bar ${bar}) ${pass ? "PASS" : "FAIL"}`,
  );
  return pass;
};
let ok = true;
ok = check("within 45s", report.withinTargetRate, 0.9) && ok;
ok = check("exactly 1 Add Row", report.onePressRate, 0.88) && ok;
ok = check("P(win)", report.completionRate, 0.95) && ok;
const zero = report.addRowsHistogram[0] ?? 0;
console.log(`  parity: 0-press wins = ${zero} (must be 0) ${zero === 0 ? "PASS" : "FAIL"}`);
ok = ok && zero === 0;

console.log("\nPlayability of every shipped Level 1 board (assignment §3–§5):");
for (let seed = 1; seed <= 16; seed++) {
  const board = getPooledBoard(1, seed);
  if (!board) continue;
  const m = humanPlayabilityMetrics(board);
  const pass =
    m.obviousDensity >= 0.65 &&
    m.horizontalSamePairs >= 3 &&
    m.independentChoices >= 2 &&
    m.decoyTiles <= 1 &&
    m.wrapShare <= 0.15;
  ok = ok && pass;
  console.log(
    `  seed ${String(seed).padStart(2)}: obvious ${(m.obviousDensity * 100).toFixed(1)}%  h-same ${m.horizontalSamePairs}  choices ${m.independentChoices}  decoys ${m.decoyTiles}  wrap ${(m.wrapShare * 100).toFixed(1)}%  ${pass ? "PASS" : "FAIL"}`,
  );
}

console.log("\nDifferent-player-choice cohort (assignment §6, 10k each):");
for (const strategy of ["greedy", "semi-random", "imperfect", "random"] as PlayStrategy[]) {
  const r = simulateLevelStrategy(1, 10000, strategy);
  const win = wilsonInterval(r.trials, r.completed);
  const within = wilsonInterval(r.trials, r.withinTargetTime);
  const timeBar = strategy === "random" ? null : 0.9;
  const winPass = win.lower >= 0.95;
  const timePass = timeBar === null || within.lower >= timeBar;
  ok = ok && winPass && timePass;
  console.log(
    `  ${strategy.padEnd(11)} win ${(r.completionRate * 100).toFixed(2)}% (LB ${(win.lower * 100).toFixed(2)}%)${winPass ? " PASS" : " FAIL"}` +
      `  within45 ${(r.withinTargetRate * 100).toFixed(2)}% (LB ${(within.lower * 100).toFixed(2)}%)${timeBar === null ? " (report-only)" : timePass ? " PASS" : " FAIL"}` +
      `  1press ${(r.onePressRate * 100).toFixed(1)}%  rescue ${(r.rescueRate * 100).toFixed(2)}%  avg ${r.secondsAvg.toFixed(1)}s  p90 ${r.secondsP90.toFixed(1)}s`,
  );
}

console.log(ok ? "\nALL LEVEL 1 CONTRACTS PASS" : "\nLEVEL 1 CONTRACTS FAIL");
process.exitCode = ok ? 0 : 1;
