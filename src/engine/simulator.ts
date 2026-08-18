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
  type CellPosition,
  type GameState,
  type Move,
} from "./index";
import { getLevelConfig } from "./config/levels";
import { mulberry32 } from "./rng";
import { strandedValues } from "./straggler";
import { cellAt, classifyMove } from "./matching";
import { applyMoveToBoard, isBoardEmpty } from "./solver";
import { boardAfterPress } from "./index";
import type { Board } from "./types";

/** Per-move time cost heuristic (seconds). Tuned so the 27-cell spec board
 *  with a single Add Row completes near the Level 1 target of 45s. */
const TIME_PER_MOVE_BASE = 1.25; // seconds to scan + tap
const TIME_PER_LIVE_CELL = 0.06; // proportional scanning cost
const TIME_PER_ADD_ROW = 3.5; // deliberation + repositioning

export type SimulationRun = {
  seed: number;
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
  /** Wins that used exactly 1 Add Row (fraction of trials). Level 1 spec. */
  onePressRate: number;
};

/**
 * Human-perception time model (seconds). Not a timer — a probabilistic
 * envelope used by simulators and tests.
 *
 * A real player does not see every legal move instantly. Finding a move costs
 * a base tap/confirm time plus a per-cell scan cost for every cell inspected
 * before the first match pops out. Diagonal and wrap moves are harder to
 * notice; same-value pairs pop faster than sum-to-10 pairs. When no match is
 * visible within a scan window the player may mis-tap (counted but harmless)
 * and when the search gets long they press (+) out of fatigue — which is why
 * easy boards with clustered mates finish fast (L1 ~35s) and buried boards
 * stretch long, with more presses.
 */
export const HUMAN_TIME = {
  /** Base seconds to read + tap + confirm one move. */
  moveBase: 1.2,
  /** Seconds per cell inspected before the first match is spotted. */
  perInspect: 0.3,
  /** Seconds consumed by one Add Row press (deliberation + repositioning). */
  addRow: 3.5,
  /** Seconds wasted on a mis-tap (no state change, simulated for time). */
  invalidTap: 2.0,
  /** Seconds to read the board before the first move. */
  start: 1.5,
  /** Cells inspected before a match stops being "visible"; beyond this the
   *  player may mis-tap or give up the search. */
  scanWindow: 14,
  /** Beyond this scan depth the player presses (+) out of fatigue. */
  fatigueDepth: 16,
  /** Chance per fatigued search of pressing (+) instead of finding the move. */
  fatiguePressChance: 0.35,
  /** Chance of a mis-tap when the search exceeds the visible window. */
  misTapChance: 0.4,
};

export function liveTileCountFor(state: GameState): number {
  let n = 0;
  for (const row of state.board) for (const c of row) if (c.value !== null) n++;
  return n;
}

function livePositions(state: GameState): CellPosition[] {
  const out: CellPosition[] = [];
  for (let r = 0; r < state.board.length; r++) {
    const row = state.board[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c].value !== null) out.push({ row: r, col: c });
    }
  }
  return out;
}

export type ScanResult = {
  found: boolean;
  /** Cells inspected (1-based) before the first match was spotted, plus a
   *  perception modifier: +1 for diagonal, +2 for wrap, −0.5 for same-value. */
  k: number;
  move: Move | null;
};

/**
 * First match visible to a scanning human starting at `start` (reading order,
 * wrapping around). Same-value and same-row matches "pop"; diagonal and wrap
 * matches take longer to register.
 */
export function humanScan(state: GameState, start: number): ScanResult {
  const cells = livePositions(state);
  const legal = findAllLegalMoves(state.board);
  const moveByFrom = new Map<string, Move>();
  for (const m of legal) moveByFrom.set(`${m.from.row},${m.from.col}`, m);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[(start + i) % cells.length];
    const m = moveByFrom.get(`${cell.row},${cell.col}`);
    if (!m) continue;
    let extra = 0;
    const cls = classifyMove(state.board, m.from, m.to);
    if (cls === "diagonal") extra = 1;
    else if (cls === "wrap") extra = 2;
    const va = state.board[m.from.row][m.from.col].value;
    const vb = state.board[m.to.row][m.to.col].value;
    if (va !== null && vb !== null && va === vb) extra -= 0.5;
    return { found: true, k: i + 1 + extra, move: m };
  }
  return { found: false, k: cells.length, move: null };
}

export type HumanRun = {
  seed: number;
  won: boolean;
  moves: number;
  addRowsUsed: number;
  invalidTaps: number;
  estimatedSeconds: number;
};

/**
 * Simulate one session with the human-perception model: scan-limited vision,
 * mis-taps, fatigue presses, and the per-move time model above. Deterministic
 * for a given (level, seed).
 */
export function simulateHumanBoard(level: number, seed: number): HumanRun {
  const rng = mulberry32((seed ^ 0x51ab7d9) >>> 0 || 1);
  let state = createGame(level, seed);
  let moves = 0;
  let addRowsUsed = 0;
  let invalidTaps = 0;
  let seconds = HUMAN_TIME.start;

  while (state.status === "playing" && moves < 400) {
    const legal = findAllLegalMoves(state.board);
    if (legal.length === 0) {
      if (state.addRowsRemaining <= 0) break;
      const before = state.addRowsRemaining;
      state = engineAddRow(state);
      if (state.addRowsRemaining === before) break;
      addRowsUsed++;
      seconds += HUMAN_TIME.addRow;
      continue;
    }
    const start = Math.floor(rng() * liveTileCountFor(state));
    const scan = humanScan(state, start);
    if (!scan.found || !scan.move) break;
    if (scan.k >= HUMAN_TIME.scanWindow && rng() < HUMAN_TIME.misTapChance) {
      invalidTaps++;
      seconds += HUMAN_TIME.invalidTap;
    }
    if (scan.k >= HUMAN_TIME.fatigueDepth && rng() < HUMAN_TIME.fatiguePressChance) {
      if (state.addRowsRemaining <= 0) break;
      const before = state.addRowsRemaining;
      state = engineAddRow(state);
      if (state.addRowsRemaining === before) break;
      addRowsUsed++;
      seconds += HUMAN_TIME.addRow;
      continue;
    }
    seconds += HUMAN_TIME.moveBase + HUMAN_TIME.perInspect * scan.k;
    const next = engineApplyMove(state, scan.move.from, scan.move.to);
    if (next === state) break;
    state = next;
    moves++;
  }

  return {
    seed,
    won: isGameWon(state),
    moves,
    addRowsUsed,
    invalidTaps,
    estimatedSeconds: seconds,
  };
}

/** Monte Carlo for the human-perception model. */
export function simulateLevelHuman(level: number, trials: number, seedBase = 1): SimulationReport {
  const cfg = getLevelConfig(level);
  const runs: HumanRun[] = [];
  for (let i = 0; i < trials; i++) {
    const seed = ((seedBase * 2654435761) ^ (level * 1013904223) ^ (i * 2246822519)) >>> 0 || 1;
    runs.push(simulateHumanBoard(level, seed));
  }
  return reportFromRuns(
    level,
    cfg.targetCompletionTime,
    cfg.completionProbability,
    cfg.withinTargetProbability,
    runs.map((r) => ({
      seed: r.seed,
      won: r.won,
      moves: r.moves,
      addRowsUsed: r.addRowsUsed,
      estimatedSeconds: r.estimatedSeconds,
    })),
  );
}

function reportFromRuns(
  level: number,
  targetCompletionTime: number,
  completionProbabilityTarget: number,
  withinTargetProbability: number,
  runs: { won: boolean; estimatedSeconds: number; addRowsUsed: number }[],
): SimulationReport {
  const trials = runs.length;
  const completed = runs.filter((r) => r.won).length;
  const wonRuns = runs.filter((r) => r.won);
  const seconds = wonRuns.map((r) => r.estimatedSeconds).sort((a, b) => a - b);
  const addRows = wonRuns.map((r) => r.addRowsUsed);
  const maxAdd = Math.max(...addRows, 0);
  const histogram = Array.from({ length: maxAdd + 1 }, () => 0);
  for (const n of addRows) histogram[n]++;
  const withinTargetTime = wonRuns.filter((r) => r.estimatedSeconds <= targetCompletionTime).length;
  const onePressRate = wonRuns.filter((r) => r.addRowsUsed === 1).length / trials;
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
    targetCompletionTime,
    completionProbabilityTarget,
    withinTargetTime,
    withinTargetRate: withinTargetTime / trials,
    onePressRate,
  };
}

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
  const rng = mulberry32((state.seed ^ (state.moveCount + 1)) >>> 0 || 1);
  return pickBestMove(state, rng);
}

/**
 * Naive left-to-right sweep: the first *visible* match found scanning
 * reading order — the way a mechanical beginner plays. Sees only ordinary
 * adjacencies (horizontal, vertical, diagonal); never uses wrap moves, which
 * hide across a row boundary. Stalls (returns null) when only wrap matches
 * remain. Used by the anti-degenerate checks: a naive player should cruise
 * through easy levels (mates placed in-row, burialDepth 1) and stall on hard
 * ones (burialDepth 6+ scatters mates across the wrap boundary).
 */
export function pickSweepMove(state: GameState): Move | null {
  const board = state.board;
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c].value === null) continue;
      const from = { row: r, col: c };
      for (const m of findAllLegalMoves(board)) {
        if (m.from.row !== r || m.from.col !== c) continue;
        if (m.to.row === r && m.to.col < c) continue; // already passed it
        if (classifyMove(board, m.from, m.to) === "wrap") continue; // invisible
        return m;
      }
    }
  }
  return null;
}

/**
 * Deterministic naive-sweep session over a GIVEN board (no pool lookup, so
 * pool bakers can gate candidates before they are published). Plays the
 * left-to-right sweep bot against `board` with the engine's exact Add Row
 * rows (completion valve included), up to `budget` presses. Returns true
 * when the board clears. Every shipped Level 1 board passes this — the
 * tutorial must be clearable by mechanical play, which is what makes the
 * cohort anti-degenerate gate deterministic instead of statistical.
 */
export function simulateNaiveBoard(board: Board, level: number, seed: number, budget = 6): boolean {
  let b = board;
  let moves = 0;
  let pressesLeft = budget;
  let moveCount = 0;
  while (moves < 400) {
    if (isBoardEmpty(b)) return true;
    const legal = findAllLegalMoves(b);
    const fake = {
      board: b,
      level,
      seed,
      moveCount,
      addRowsRemaining: pressesLeft,
    } as unknown as GameState;
    const move = legal.length > 0 ? pickSweepMove(fake) : null;
    if (move) {
      b = applyMoveToBoard(b, move);
      moves++;
      moveCount++;
      continue;
    }
    if (pressesLeft <= 0) return false;
    b = boardAfterPress(fake);
    pressesLeft--;
    moveCount++;
  }
  return b.every((row) => row.every((c) => c.value === null));
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
  const maxMoves = opts.maxMoves ?? 400;
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

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
      seconds += TIME_PER_ADD_ROW;
      continue;
    }
    const move = pickBestMove(state, rng);
    if (!move) break;
    const next = engineApplyMove(state, move.from, move.to);
    if (next === state) break; // safety: illegal move — shouldn't happen
    seconds += TIME_PER_MOVE_BASE + TIME_PER_LIVE_CELL * liveCellCount(state);
    state = next;
    moves++;
  }

  return {
    seed,
    won: isGameWon(state),
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
  const runs: SimulationRun[] = [];
  for (let i = 0; i < trials; i++) {
    // Distinct seeds per trial; deterministic given (level, seedBase, i).
    const seed = ((seedBase * 2654435761) ^ (level * 1013904223) ^ (i * 2246822519)) >>> 0 || 1;
    runs.push(simulateBoard(level, seed));
  }
  const cfg = getLevelConfig(level);
  return reportFromRuns(
    level,
    cfg.targetCompletionTime,
    cfg.completionProbability,
    cfg.withinTargetProbability,
    runs,
  );
}

export function formatReport(report: SimulationReport): string {
  const pct = (n: number) => (n * 100).toFixed(1) + "%";
  const s = (n: number) => n.toFixed(1) + "s";
  return [
    `Level ${report.level}  ×${report.trials}`,
    `  completion:      ${pct(report.completionRate)}  (target ≥ ${pct(report.completionProbabilityTarget)})`,
    `  within target:   ${pct(report.withinTargetRate)}  (≤ ${report.targetCompletionTime}s)`,
    `  exactly 1 press: ${pct(report.onePressRate)}  (Level 1 design target ≥ 90%)`,
    `  time p50/p90/p95: ${s(report.secondsP50)} / ${s(report.secondsP90)} / ${s(report.secondsP95)}   avg ${s(report.secondsAvg)}`,
    `  add rows avg:    ${report.addRowsAvg.toFixed(2)}   hist: [${report.addRowsHistogram.join(", ")}]`,
  ].join("\n");
}
