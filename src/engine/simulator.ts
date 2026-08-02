// Simulation harness: plays generated boards with a simple heuristic AI to
// verify the per-level completion probability and time envelope.
//
// This module is pure engine code (no Node/DOM APIs) so it can be reused by
// tests, a CLI, or a browser dashboard.

import {
  addRow as engineAddRow,
  applyMove as engineApplyMove,
  createGame,
  findAllLegalMoves,
  isGameLost,
  isGameWon,
  type GameState,
  type Move,
} from "./index";
import { getLevelConfig } from "./config/levels";
import { mulberry32 } from "./rng";
import { strandedValues } from "./straggler";
import { cellAt } from "./matching";

// ---------------------------------------------------------------------------
// Player time model.
//
// Completion is defined as "board cleared AND cleared within the level's
// responseTime". The per-move cost grows with how much there is to scan and
// with how noisy the board is, so the *same* time model produces the declining
// completion curve purely from the difficulty config.
// ---------------------------------------------------------------------------

/** Fixed cost of deciding + tapping one match (seconds). */
const TIME_PER_MOVE_BASE = 1.6;
/** Scanning cost proportional to how many cells are still on screen. */
const TIME_PER_LIVE_CELL = 0.06;
/** Deliberating over an Add Row. */
const TIME_PER_ADD_ROW = 4.0;
/** Extra scanning cost from decoy digits (multiplier on the scan term). */
const DECOY_SCAN_WEIGHT = 1.3;
/** Extra scanning cost from scattered pairs (multiplier on the scan term). */
const SCATTER_SCAN_WEIGHT = 1.6;
/** Player-skill spread: per-run multiplier sampled in [MIN, MIN+RANGE]. */
const SKILL_MIN = 0.72;
const SKILL_RANGE = 0.75;

export type SimulationRun = {
  seed: number;
  /** Board fully cleared (ignoring the clock). */
  cleared: boolean;
  /** Cleared within the level time limit — this drives completion probability. */
  won: boolean;
  moves: number;
  addRowsUsed: number;
  estimatedSeconds: number;
};

export type SimulationReport = {
  level: number;
  trials: number;
  completed: number;
  completionRate: number;
  addRowsAvg: number;
  addRowsHistogram: number[]; // index = add rows used
  secondsAvg: number;
  secondsP50: number;
  secondsP90: number;
  secondsP95: number;
  targetCompletionTime: number;
  completionProbabilityTarget: number;
  withinTargetTime: number; // completed AND within targetCompletionTime
  withinTargetRate: number;
};

function liveCellCount(state: GameState): number {
  let n = 0;
  for (const row of state.board) for (const c of row) if (c.value !== null) n++;
  return n;
}

/**
 * Score a move: prefer moves that clear cells whose value is currently
 * "stranded" (only one live partner remains). Falls back to a stable
 * pseudo-random tiebreak so behavior is deterministic per (state, rng).
 */
function scoreMove(state: GameState, move: Move, stranded: Set<number>): number {
  const a = cellAt(state.board, move.from);
  const b = cellAt(state.board, move.to);
  let score = 0;
  if (a !== null && stranded.has(a)) score += 3;
  if (b !== null && stranded.has(b)) score += 3;
  // Prefer moves that empty a mostly-empty row (row cleanup).
  const rows = new Set([move.from.row, move.to.row]);
  for (const r of rows) {
    const rowCells = state.board[r] ?? [];
    const live = rowCells.reduce((n, c) => n + (c.value !== null ? 1 : 0), 0);
    if (live <= 2) score += 2;
    else if (live <= 4) score += 1;
  }
  return score;
}

export function pickBestMove(state: GameState, rng: () => number): Move | null {
  const legal = findAllLegalMoves(state.board);
  if (legal.length === 0) return null;
  const stranded = new Set(strandedValues(state.board));
  let best: Move[] = [];
  let bestScore = -Infinity;
  for (const m of legal) {
    const s = scoreMove(state, m, stranded) + rng() * 0.001; // deterministic jitter
    if (s > bestScore) {
      bestScore = s;
      best = [m];
    } else if (s === bestScore) {
      best.push(m);
    }
  }
  return best[Math.floor(rng() * best.length) % best.length];
}

/** Deterministic next-move pick used by the debug overlay. */
export function nextHeuristicMove(state: GameState): Move | null {
  const rng = mulberry32(((state.seed ^ (state.moveCount + 1)) >>> 0) || 1);
  return pickBestMove(state, rng);
}

export type SimulateBoardOptions = {
  /** Hard safety cap on moves to prevent infinite loops in pathological cases. */
  maxMoves?: number;
};

/**
 * Play a single generated board deterministically with a heuristic AI.
 * Uses Add Row when out of legal moves, up to the level's budget.
 */
export function simulateBoard(
  level: number,
  seed: number,
  opts: SimulateBoardOptions = {},
): SimulationRun {
  const cfg = getLevelConfig(level);
  const maxMoves = opts.maxMoves ?? 600;
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  // Deterministic per-run player skill (reaction speed + search efficiency).
  const skill = SKILL_MIN + rng() * SKILL_RANGE;
  // Board-noise multiplier applied to the scanning term.
  const noise =
    1 + cfg.decoyRatio * DECOY_SCAN_WEIGHT + cfg.scatterStrength * SCATTER_SCAN_WEIGHT;

  let state = createGame(level, seed);
  let moves = 0;
  let addRowsUsed = 0;
  let seconds = 0;

  while (state.status === "playing" && moves < maxMoves) {
    const legalMoveCount = findAllLegalMoves(state.board).length;
    if (legalMoveCount === 0) {
      if (state.addRowsRemaining <= 0) break;
      const before = state.addRowsRemaining;
      state = engineAddRow(state);
      if (state.addRowsRemaining === before) break; // no-op, avoid loop
      addRowsUsed++;
      seconds += TIME_PER_ADD_ROW * skill;
      continue;
    }
    const move = pickBestMove(state, rng);
    if (!move) break;
    const next = engineApplyMove(state, move.from, move.to);
    if (next === state) break; // safety: illegal move — shouldn't happen
    // Fewer legal moves on screen = longer search before one is spotted.
    const scarcity = 1 + 1 / Math.max(1, legalMoveCount);
    seconds +=
      skill *
      (TIME_PER_MOVE_BASE + TIME_PER_LIVE_CELL * liveCellCount(state) * noise * scarcity);
    state = next;
    moves++;
  }

  const cleared = isGameWon(state);
  return {
    seed,
    cleared,
    // "Won" for probability purposes means cleared inside the time limit.
    won: cleared && seconds <= cfg.responseTime,
    moves,
    addRowsUsed,
    estimatedSeconds: seconds,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function simulateLevel(level: number, trials: number, seedBase = 1): SimulationReport {
  const cfg = getLevelConfig(level);
  const runs: SimulationRun[] = [];
  for (let i = 0; i < trials; i++) {
    // Distinct seeds per trial; deterministic given (level, seedBase, i).
    const seed = ((seedBase * 2654435761) ^ (level * 1013904223) ^ (i * 2246822519)) >>> 0 || 1;
    runs.push(simulateBoard(level, seed));
  }

  const completed = runs.filter((r) => r.won).length;
  const wonRuns = runs.filter((r) => r.won);
  const seconds = wonRuns.map((r) => r.estimatedSeconds).sort((a, b) => a - b);
  const addRows = wonRuns.map((r) => r.addRowsUsed);
  const maxAdd = cfg.addRowBudget;
  const histogram = Array.from({ length: maxAdd + 1 }, () => 0);
  for (const n of addRows) histogram[Math.min(n, maxAdd)]++;

  const withinTargetTime = wonRuns.filter(
    (r) => r.estimatedSeconds <= cfg.targetCompletionTime,
  ).length;

  return {
    level,
    trials,
    completed,
    completionRate: completed / trials,
    addRowsAvg: addRows.length ? addRows.reduce((a, b) => a + b, 0) / addRows.length : 0,
    addRowsHistogram: histogram,
    secondsAvg: seconds.length ? seconds.reduce((a, b) => a + b, 0) / seconds.length : 0,
    secondsP50: percentile(seconds, 50),
    secondsP90: percentile(seconds, 90),
    secondsP95: percentile(seconds, 95),
    targetCompletionTime: cfg.targetCompletionTime,
    completionProbabilityTarget: cfg.completionProbability,
    withinTargetTime,
    withinTargetRate: withinTargetTime / trials,
  };
}

export function formatReport(report: SimulationReport): string {
  const pct = (n: number) => (n * 100).toFixed(1) + "%";
  const s = (n: number) => n.toFixed(1) + "s";
  return [
    `Level ${report.level}  ×${report.trials}`,
    `  completion:      ${pct(report.completionRate)}  (target ≥ ${pct(report.completionProbabilityTarget)})`,
    `  within target:   ${pct(report.withinTargetRate)}  (≤ ${report.targetCompletionTime}s)`,
    `  time p50/p90/p95: ${s(report.secondsP50)} / ${s(report.secondsP90)} / ${s(report.secondsP95)}   avg ${s(report.secondsAvg)}`,
    `  add rows avg:    ${report.addRowsAvg.toFixed(2)}   hist: [${report.addRowsHistogram.join(", ")}]`,
  ].join("\n");
}
