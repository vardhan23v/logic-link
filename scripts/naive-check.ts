// Anti-degenerate check: a naive left-to-right sweep bot (sees only ordinary
// adjacencies — horizontal/vertical/diagonal — never wrap moves, never
// backtracks) must exhibit a real difficulty gradient:
//
//   • L1 ≥ 85% — a mechanical beginner must cruise through the tutorial
//     level (matches are in-row, mates adjacent).
//   • L8–L10 ≤ 80% — mechanical play must NOT be sufficient on the hardest
//     boards (buried pairs scattered across the wrap boundary stall the
//     sweep; the completion valve rescues winnability, not naive play).
//   • L11 is exempt: it is the designed "relief" level (sawtooth dip).
//
// Usage:
//   npx -y tsx scripts/naive-check.ts
//   npx -y tsx scripts/naive-check.ts --trials 2000

import { LEVEL_IDS } from "../src/engine/config/levels";
import {
  addRow as engineAddRow,
  applyMove as engineApplyMove,
  createGame,
  findAllLegalMoves,
  isGameWon,
  type GameState,
} from "../src/engine/index";
import { pickSweepMove } from "../src/engine/simulator";

function parseTrials(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--trials") return Number(args[i + 1]) || 1000;
  }
  return 1000;
}

function runNaive(level: number, seed: number): boolean {
  let state: GameState = createGame(level, seed);
  let moves = 0;
  while (state.status === "playing" && moves < 400) {
    const legal = findAllLegalMoves(state.board);
    const move = legal.length > 0 ? pickSweepMove(state) : null;
    if (move) {
      const next = engineApplyMove(state, move.from, move.to);
      if (next === state) break;
      state = next;
      moves++;
      continue;
    }
    // No visible match (or none at all) — a naive player deals a fresh row.
    if (state.addRowsRemaining <= 0) break;
    const before = state.addRowsRemaining;
    state = engineAddRow(state);
    if (state.addRowsRemaining === before) break;
  }
  return isGameWon(state);
}

export function naiveSolveRates(trials: number): Map<number, number> {
  const rates = new Map<number, number>();
  for (const lv of LEVEL_IDS) {
    let wins = 0;
    for (let i = 0; i < trials; i++) {
      const seed = ((11 * 2654435761) ^ (lv * 1013904223) ^ (i * 2246822519)) >>> 0 || 1;
      if (runNaive(lv, seed)) wins++;
    }
    rates.set(lv, wins / trials);
  }
  return rates;
}

function gateFor(level: number, rate: number): { ok: boolean; label: string } {
  if (level === 1) return { ok: rate >= 0.85, label: "easy gate ≥85%" };
  if (level >= 8 && level <= 10) return { ok: rate <= 0.8, label: "hard gate ≤80%" };
  return { ok: true, label: level === 11 ? "relief level (exempt)" : "" };
}

function main(): void {
  const trials = parseTrials();
  console.log(`Naive-sweep bot · ${trials.toLocaleString()} trials/level`);
  console.log("level  naive solve rate   gate");
  let allPass = true;
  for (const [lv, rate] of naiveSolveRates(trials)) {
    const { ok, label } = gateFor(lv, rate);
    if (!ok) allPass = false;
    console.log(
      `Level ${String(lv).padEnd(2)}  ${(rate * 100).toFixed(1).padStart(6)}%  ${label}  ${
        ok ? "PASS" : "FAIL"
      }`,
    );
  }
  if (!allPass) process.exitCode = 1;
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith("naive-check.ts");
if (isMain) main();
