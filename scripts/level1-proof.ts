import { simulateLevelHuman, formatReport } from "../src/engine/simulator";

const trials = Number(process.argv[2] ?? 20000);
const report = simulateLevelHuman(1, trials);
console.log(formatReport(report));
const wins = report.completionRate;
const within = report.withinTargetRate;
const onePress = report.onePressRate;
const z = 1.96;
const wilsonLB = (p: number, n: number) => {
  const d = 1 + z * z / n;
  const c = p + z * z / (2 * n);
  const hw = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return (c - hw) / d;
};
const check = (label: string, v: number, bar: number, pass: boolean) =>
  console.log(`  ${label}: ${(v * 100).toFixed(2)}%  (95% CI LB ${(wilsonLB(v, trials) * 100).toFixed(2)}% vs bar ${bar}) ${pass ? "PASS" : "FAIL"}`);
check("within 45s", within, 0.9, wilsonLB(within, trials) >= 0.9);
check("exactly 1 Add Row", onePress, 0.88, wilsonLB(onePress, trials) >= 0.88);
check("P(win)", wins, 0.95, wilsonLB(wins, trials) >= 0.95);
const zero = report.addRowsHistogram[0] ?? 0;
console.log(`  parity: 0-press wins = ${zero} (must be 0) ${zero === 0 ? "PASS" : "FAIL"}`);
process.exitCode = wilsonLB(within, trials) >= 0.9 && wilsonLB(onePress, trials) >= 0.88 && wilsonLB(wins, trials) >= 0.95 && zero === 0 ? 0 : 1;