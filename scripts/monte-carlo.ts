// Monte Carlo harness: mass-simulates every level and gates the results
// against the difficulty contract:
//   • --bot heuristic (default): perfect-vision solver-equivalent bot.
//     Gates: P(win) Wilson 95% CI lower bound ≥ completionProbability (0.95
//     everywhere), mean-moves CI half-width ≤ 1.
//   • --bot human: human-perception model (scan-limited vision, mis-taps,
//     fatigue presses, per-move time). Gates: P(win) lower bound ≥ target,
//     completion-within-target-time lower bound ≥ withinTargetProbability
//     (Level 1: ≥ 90% within 45s, the exact assignment metric), and Level 1's
//     "1 Add Row" design bar (≥ 88% of wins use exactly 1 press).
//
// Usage:
//   npx -y tsx scripts/monte-carlo.ts                        # 10k × all levels, heuristic
//   npx -y tsx scripts/monte-carlo.ts --bot human            # human-perception model
//   npx -y tsx scripts/monte-carlo.ts --bot human --level 1  # single level
//
// Pure engine imports only — runs under tsx with no build step.

import { getLevelConfig } from "../src/engine/config/levels";
import {
  addRow as engineAddRow,
  applyMove as engineApplyMove,
  createGame,
  findAllLegalMoves,
  isGameWon,
  type GameState,
} from "../src/engine/index";
import { mulberry32 } from "../src/engine/rng";
import { pickBestMove, simulateHumanBoard } from "../src/engine/simulator";
import { meanHalfWidth, wilsonInterval } from "../src/engine/stats";
import { LEVEL_IDS } from "../src/engine/config/levels";

type Bot = "heuristic" | "human";

type LevelResult = {
  level: number;
  trials: number;
  winRate: number;
  winLower95: number;
  meanMoves: number;
  movesHalfWidth: number;
  meanAddRows: number;
  secondsAvg: number;
  secondsP50: number;
  secondsP90: number;
  secondsP95: number;
  withinTarget: number;
  withinTargetLower95: number;
  onePressRate: number;
};

function parseArgs(): { level?: number; trials: number; bot: Bot } {
  const args = process.argv.slice(2);
  let level: number | undefined;
  let trials = 10_000;
  let bot: Bot = "heuristic";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--level") level = Number(args[i + 1]);
    if (args[i] === "--trials") trials = Number(args[i + 1]);
    if (args[i] === "--bot") bot = args[i + 1] as Bot;
  }
  if (!Number.isFinite(trials) || trials <= 0) throw new Error("trials must be a positive number");
  return { level, trials, bot };
}

/** A simple deterministic bot run for a single board. */
function runBot(
  level: number,
  seed: number,
  bot: Bot,
): { won: boolean; moves: number; addRows: number; seconds: number } {
  if (bot === "human") {
    const r = simulateHumanBoard(level, seed);
    return { won: r.won, moves: r.moves, addRows: r.addRowsUsed, seconds: r.estimatedSeconds };
  }
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0 || 1);
  let state: GameState = createGame(level, seed);
  let moves = 0;
  let addRows = 0;
  const seconds = 0;

  while (state.status === "playing" && moves < 400) {
    const legal = findAllLegalMoves(state.board);
    if (legal.length === 0) {
      if (state.addRowsRemaining <= 0) break;
      const before = state.addRowsRemaining;
      state = engineAddRow(state);
      if (state.addRowsRemaining === before) break;
      addRows++;
      continue;
    }
    const move = pickBestMove(state, rng);
    if (!move) break;
    const next = engineApplyMove(state, move.from, move.to);
    if (next === state) break;
    state = next;
    moves++;
  }

  return { won: isGameWon(state), moves, addRows, seconds };
}

function runLevel(level: number, trials: number, bot: Bot): LevelResult {
  const moves: number[] = [];
  const addRows: number[] = [];
  const seconds: number[] = [];
  const wonSeconds: number[] = [];
  let wins = 0;
  let withinTarget = 0;
  let onePressWins = 0;
  for (let i = 0; i < trials; i++) {
    const seed = ((7 * 2654435761) ^ (level * 1013904223) ^ (i * 2246822519)) >>> 0 || 1;
    const r = runBot(level, seed, bot);
    if (r.won) {
      wins++;
      moves.push(r.moves);
      addRows.push(r.addRows);
      wonSeconds.push(r.seconds);
      if (r.addRows === 1) onePressWins++;
      if (r.seconds > 0 && r.seconds <= getLevelConfig(level).targetCompletionTime) {
        withinTarget++;
      }
    }
    if (r.seconds > 0) seconds.push(r.seconds);
  }
  const ci = wilsonInterval(trials, wins);
  const withinCi = wilsonInterval(trials, withinTarget);
  const sorted = [...wonSeconds].sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
  return {
    level,
    trials,
    winRate: wins / trials,
    winLower95: ci.lower,
    meanMoves: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0,
    movesHalfWidth: meanHalfWidth(moves),
    meanAddRows: addRows.length ? addRows.reduce((a, b) => a + b, 0) / addRows.length : 0,
    secondsAvg: wonSeconds.length ? wonSeconds.reduce((a, b) => a + b, 0) / wonSeconds.length : 0,
    secondsP50: pct(0.5),
    secondsP90: pct(0.9),
    secondsP95: pct(0.95),
    withinTarget,
    withinTargetLower95: withinCi.lower,
    onePressRate: onePressWins / trials,
  };
}

function printHumanRow(r: LevelResult): boolean {
  const cfg = getLevelConfig(r.level);
  const passWin = r.winLower95 >= cfg.completionProbability;
  const passWithin = r.withinTargetLower95 >= cfg.withinTargetProbability;
  const passOnePress = r.level === 1 ? r.onePressRate >= 0.88 : true;
  const ok = passWin && passWithin && passOnePress;
  const fmt = (n: number) => (n * 100).toFixed(1) + "%";
  console.log(
    `${String(r.level).padEnd(5)}  ${fmt(r.winRate).padStart(7)}  ` +
      `${fmt(r.winLower95).padStart(7)}  ${fmt(r.withinTarget / r.trials).padStart(7)}  ` +
      `${fmt(r.withinTargetLower95).padStart(7)}  ${r.secondsAvg.toFixed(1).padStart(5)}s ` +
      `${r.secondsP50.toFixed(1).padStart(5)}s ${r.secondsP90.toFixed(1).padStart(5)}s ` +
      `${r.meanAddRows.toFixed(2).padStart(5)}  ${(r.onePressRate * 100).toFixed(1).padStart(5)}%  ` +
      `${ok ? "PASS" : "FAIL"}`,
  );
  return ok;
}

function main(): void {
  const { level, trials, bot } = parseArgs();
  const targets = level !== undefined ? [level] : LEVEL_IDS;
  if (bot === "human") {
    console.log(
      `Monte Carlo · ${trials.toLocaleString()} trials/level · bot: human-perception\n` +
        `level  P(win)     winLB      inTarget   inTgtLB   avgT  p50    p90    addRows 1press  gate`,
    );
  } else {
    console.log(`Monte Carlo · ${trials.toLocaleString()} trials/level · bot: heuristic`);
    console.log("level  P(win)        Wilson 95% CI      mean moves   ±CI       mean add rows");
  }

  let allPass = true;
  for (const lv of targets) {
    const cfg = getLevelConfig(lv);
    const r = runLevel(lv, trials, bot);
    if (bot === "human") {
      if (!printHumanRow(r)) allPass = false;
      continue;
    }
    const passWin = r.winLower95 >= cfg.completionProbability;
    const passMoves = r.movesHalfWidth <= 1;
    const ok = passWin && passMoves;
    if (!ok) allPass = false;
    console.log(
      `${String(lv).padEnd(5)}  ${(r.winRate * 100).toFixed(2).padEnd(10)} ` +
        `[${(r.winLower95 * 100).toFixed(2)}% , ${(r.winRate * 100 + 0).toFixed(2)}%]  ` +
        `${r.meanMoves.toFixed(1).padStart(7)}   ±${r.movesHalfWidth.toFixed(2).padEnd(5)}  ` +
        `${r.meanAddRows.toFixed(2)}` +
        `  ${ok ? "PASS" : "FAIL"} (gate ≥${(cfg.completionProbability * 100).toFixed(0)}% / ±1)`,
    );
  }
  if (!allPass) process.exitCode = 1;
}

export { runLevel };
export type { LevelResult, Bot };

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith("monte-carlo.ts");
if (isMain) main();
