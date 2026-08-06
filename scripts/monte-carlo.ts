// Monte Carlo harness: mass-simulates every level with a bot model and gates
// the results against the difficulty contract:
//   • P(win) ≥ 0.95 — Wilson 95% CI lower bound must clear the bar
//   • mean presses (moves) reported with a CI half-width ≤ 1
//
// Usage:
//   npx -y tsx scripts/monte-carlo.ts                # 10k trials × all levels
//   npx -y tsx scripts/monte-carlo.ts --level 4      # single level
//   npx -y tsx scripts/monte-carlo.ts --trials 2000  # fewer trials (faster)
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
import { pickBestMove } from "../src/engine/simulator";
import { meanHalfWidth, wilsonInterval } from "../src/engine/stats";
import { LEVEL_IDS } from "../src/engine/config/levels";

type Bot = "heuristic" | "random";

type LevelResult = {
  level: number;
  trials: number;
  winRate: number;
  winLower95: number;
  meanMoves: number;
  movesHalfWidth: number;
  meanAddRows: number;
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
): { won: boolean; moves: number; addRows: number } {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0 || 1);
  let state: GameState = createGame(level, seed);
  let moves = 0;
  let addRows = 0;

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
    const move =
      bot === "heuristic"
        ? pickBestMove(state, rng)
        : legal[Math.floor(rng() * legal.length) % legal.length];
    if (!move) break;
    const next = engineApplyMove(state, move.from, move.to);
    if (next === state) break;
    state = next;
    moves++;
  }

  return { won: isGameWon(state), moves, addRows };
}

function runLevel(level: number, trials: number, bot: Bot): LevelResult {
  const moves: number[] = [];
  const addRows: number[] = [];
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const seed = ((7 * 2654435761) ^ (level * 1013904223) ^ (i * 2246822519)) >>> 0 || 1;
    const r = runBot(level, seed, bot);
    if (r.won) {
      wins++;
      moves.push(r.moves);
      addRows.push(r.addRows);
    }
  }
  const ci = wilsonInterval(trials, wins);
  return {
    level,
    trials,
    winRate: wins / trials,
    winLower95: ci.lower,
    meanMoves: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0,
    movesHalfWidth: meanHalfWidth(moves),
    meanAddRows: addRows.length ? addRows.reduce((a, b) => a + b, 0) / addRows.length : 0,
  };
}

function main(): void {
  const { level, trials, bot } = parseArgs();
  const targets = level !== undefined ? [level] : LEVEL_IDS;
  console.log(`Monte Carlo · ${trials.toLocaleString()} trials/level · bot: ${bot}`);
  console.log("level  P(win)        Wilson 95% CI      mean moves   ±CI       mean add rows");

  let allPass = true;
  for (const lv of targets) {
    const cfg = getLevelConfig(lv);
    const r = runLevel(lv, trials, bot);
    const passWin = bot === "heuristic" && r.winLower95 >= cfg.completionProbability;
    const passMoves = bot === "heuristic" && r.movesHalfWidth <= 1;
    const ok = passWin && passMoves;
    if (!ok) allPass = false;
    console.log(
      `${String(lv).padEnd(5)}  ${(r.winRate * 100).toFixed(2).padEnd(10)} ` +
        `[${(r.winLower95 * 100).toFixed(2)}% , ${(r.winRate * 100 + 0).toFixed(2)}%]  ` +
        `${r.meanMoves.toFixed(1).padStart(7)}   ±${r.movesHalfWidth.toFixed(2).padEnd(5)}  ` +
        `${r.meanAddRows.toFixed(2)}` +
        (bot === "heuristic"
          ? `  ${ok ? "PASS" : "FAIL"} (gate ≥${(cfg.completionProbability * 100).toFixed(0)}% / ±1)`
          : ""),
    );
  }
  if (bot === "heuristic" && !allPass) process.exitCode = 1;
}

export { runLevel };
export type { LevelResult, Bot };

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith("monte-carlo.ts");
if (isMain) main();
