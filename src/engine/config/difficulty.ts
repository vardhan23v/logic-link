// ---------------------------------------------------------------------------
// Centralized difficulty model.
//
// Every balancing number in the game lives in `BALANCE` below. Per-level values
// are *computed* from continuous formulas — there are no hardcoded per-level
// tables anywhere else in the codebase. Tweak `BALANCE`, re-run
// `bun scripts/simulate.ts`, and the whole curve moves predictably.
//
// Design goals
//   1. Monotonic: every level is strictly harder than the one before it on
//      every axis (no sawtooth, no plateaus).
//   2. Multi-variable: challenge grows through board size, scatter, decoys,
//      grid width, tighter timing and fewer Add Rows — not time alone.
//   3. Bounded: every parameter is clamped, so no level ever becomes
//      impossible or degenerate, at any level index.
// ---------------------------------------------------------------------------

import type { LevelConfig } from "../types";

/** All tunable balancing constants. This is the single source of truth. */
export const BALANCE = {
  /** Number of authored levels surfaced in the UI. Formulas work beyond it. */
  levelCount: 10,

  /** Board width. Wider grids = more scanning cost per row. */
  grid: {
    baseCols: 9,
    colsPerLevel: 0.25, // +1 column roughly every 4 levels
    maxCols: 12,
  },

  /** Filled cells on the initial board (must end up even to solve to empty). */
  cells: {
    base: 18,
    perLevel: 3.2,
    max: 60,
  },

  /**
   * Scatter = how far apart a pair's two halves are placed. 0 keeps pairs as
   * immediate reading-order neighbours (trivial); higher values shuffle values
   * across the board so the player must search. Boards are still solver-verified.
   */
  scatter: {
    base: 0.15,
    perLevel: 0.09,
    max: 0.95,
  },

  /**
   * Decoys are cells flipped from v to 10-v. Because both "equal" and
   * "sums to 10" are legal matches, flipping preserves every pair's legality
   * (solvability is untouched) while making the board much noisier to read.
   */
  decoys: {
    base: 0.05,
    perLevel: 0.075,
    max: 0.7,
  },

  /** Seconds the board preview / memorization phase stays visible. */
  memorization: {
    base: 5.0,
    perLevel: -0.35,
    min: 1.2,
  },

  /** Seconds allowed to clear the level. Grows slower than board size. */
  response: {
    base: 46,
    perLevel: 12,
    /** Extra seconds granted per filled cell above the level-1 baseline. */
    perExtraCell: 1.15,
    max: 420,
  },

  /** Seconds between staggered cell reveals when a board/row appears. */
  spawn: {
    base: 1.1,
    perLevel: -0.08,
    min: 0.25,
  },

  /** Base UI transition duration (ms). Faster = less forgiving feedback. */
  animation: {
    baseMs: 150,
    perLevelMs: -8,
    minMs: 70,
  },

  /** Cell geometry (px). Tighter spacing raises visual scanning cost. */
  layout: {
    cellBasePx: 44,
    cellPerLevelPx: -1.5,
    cellMinPx: 30,
    gapBasePx: 6,
    gapPerLevelPx: -0.4,
    gapMinPx: 2,
  },

  /** Add Row help shrinks as levels progress. */
  addRow: {
    base: 6,
    perLevel: -0.35,
    min: 3,
  },

  /**
   * Target completion probability for a first-time player.
   * L1 ~92.5%, L2 ~82.5%, L3 ~72.5%, L4 ~62.5%, then a gentler -5%/level
   * with a hard floor so no level is ever effectively impossible.
   */
  completion: {
    base: 0.925,
    steepDropPerLevel: 0.1, // levels 1-4
    steepUntilLevel: 4,
    gentleDropPerLevel: 0.05, // level 5+
    floor: 0.35,
  },

  /** Fraction of random move orderings that must still solve the board. */
  fairness: {
    base: 0.9,
    perLevel: -0.045,
    min: 0.45,
  },
} as const;

// --- small helpers ---------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Round to the nearest even number — the board must solve to empty. */
const toEven = (v: number) => 2 * Math.round(v / 2);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Zero-based level offset used by every linear ramp below. */
const step = (level: number) => Math.max(0, level - 1);

// --- individual parameter curves ------------------------------------------

export function gridColsFor(level: number): number {
  const { baseCols, colsPerLevel, maxCols } = BALANCE.grid;
  return clamp(Math.round(baseCols + colsPerLevel * step(level)), baseCols, maxCols);
}

export function initialCellCountFor(level: number): number {
  const { base, perLevel, max } = BALANCE.cells;
  return toEven(clamp(base + perLevel * step(level), base, max));
}

export function scatterStrengthFor(level: number): number {
  const { base, perLevel, max } = BALANCE.scatter;
  return round2(clamp(base + perLevel * step(level), 0, max));
}

export function decoyRatioFor(level: number): number {
  const { base, perLevel, max } = BALANCE.decoys;
  return round2(clamp(base + perLevel * step(level), 0, max));
}

export function memorizationTimeFor(level: number): number {
  const { base, perLevel, min } = BALANCE.memorization;
  return round2(Math.max(min, base + perLevel * step(level)));
}

export function spawnIntervalFor(level: number): number {
  const { base, perLevel, min } = BALANCE.spawn;
  return round2(Math.max(min, base + perLevel * step(level)));
}

export function animationSpeedMsFor(level: number): number {
  const { baseMs, perLevelMs, minMs } = BALANCE.animation;
  return Math.round(Math.max(minMs, baseMs + perLevelMs * step(level)));
}

export function cellSizePxFor(level: number): number {
  const { cellBasePx, cellPerLevelPx, cellMinPx } = BALANCE.layout;
  return Math.round(Math.max(cellMinPx, cellBasePx + cellPerLevelPx * step(level)));
}

export function cellGapPxFor(level: number): number {
  const { gapBasePx, gapPerLevelPx, gapMinPx } = BALANCE.layout;
  return round2(Math.max(gapMinPx, gapBasePx + gapPerLevelPx * step(level)));
}

export function addRowBudgetFor(level: number): number {
  const { base, perLevel, min } = BALANCE.addRow;
  return Math.round(Math.max(min, base + perLevel * step(level)));
}

/**
 * Response (level time limit). It grows with level, but *slower* than the
 * board grows, so the per-cell time budget shrinks every level — that is the
 * main lever behind the declining completion probability.
 */
export function responseTimeFor(level: number): number {
  const { base, perLevel, perExtraCell, max } = BALANCE.response;
  const extraCells = initialCellCountFor(level) - initialCellCountFor(1);
  return Math.round(clamp(base + perLevel * step(level) + perExtraCell * extraCells, base, max));
}

export function completionProbabilityFor(level: number): number {
  const c = BALANCE.completion;
  const steep = Math.min(level, c.steepUntilLevel);
  const gentle = Math.max(0, level - c.steepUntilLevel);
  const p = c.base - c.steepDropPerLevel * (steep - 1) - c.gentleDropPerLevel * gentle;
  return round2(clamp(p, c.floor, 0.99));
}

export function fairnessThresholdFor(level: number): number {
  const { base, perLevel, min } = BALANCE.fairness;
  return round2(Math.max(min, base + perLevel * step(level)));
}

/**
 * Expected Add Row usage distribution, derived from how much of the board a
 * player is likely to strand. Index 0 = "finished with zero Add Rows".
 * Kept as a derived curve so it can never drift out of sync with the budget.
 */
function addRowDistributionFor(level: number): number[] {
  const budget = addRowBudgetFor(level);
  const mean = clamp(0.6 + 0.28 * step(level), 0, budget);
  const raw = Array.from({ length: budget + 1 }, (_, k) => Math.exp(-((k - mean) ** 2) / 1.6));
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => round2(v / total));
}

/** Build the full, formula-derived config for any level index (1..n). */
export function computeLevelConfig(level: number): LevelConfig {
  const scatter = scatterStrengthFor(level);
  const decoyRatio = decoyRatioFor(level);
  const cells = initialCellCountFor(level);

  return {
    id: level,
    // A single 0..10-ish scalar summarising the level's pressure. Useful for
    // UI labels and for anything that wants "how hard is this" in one number.
    difficultyScore: round2(1 + 0.9 * step(level)),

    // Legacy weights, now derived from the same continuous curves so the
    // generator's constraint hints track the difficulty ramp automatically.
    matchDensity: round2(clamp(0.9 - 0.05 * step(level), 0.4, 0.95)),
    directPairWeight: round2(clamp(1 - scatter, 0.05, 0.95)),
    buriedPairWeight: round2(clamp(scatter, 0.05, 0.95)),
    clusteringWeight: round2(clamp(0.75 - 0.07 * step(level), 0.1, 0.9)),
    decoyWeight: decoyRatio,
    helperStrength: round2(clamp(0.95 - 0.045 * step(level), 0.5, 0.95)),
    cleanupPriority: round2(clamp(0.95 - 0.04 * step(level), 0.5, 0.95)),

    expectedAddRowDistribution: addRowDistributionFor(level),
    targetCompletionTime: responseTimeFor(level),
    completionProbability: completionProbabilityFor(level),
    fairnessThreshold: fairnessThresholdFor(level),
    seedStrategy: "ruleBasedVaried",
    addRowBudget: addRowBudgetFor(level),
    initialCellCount: cells,

    // --- multi-variable difficulty knobs ---
    gridCols: gridColsFor(level),
    scatterStrength: scatter,
    decoyRatio,
    /** Approximate number of decoy-flipped cells on the initial board. */
    distractorCount: Math.round(cells * decoyRatio),
    memorizationTime: memorizationTimeFor(level),
    responseTime: responseTimeFor(level),
    spawnInterval: spawnIntervalFor(level),
    animationSpeedMs: animationSpeedMsFor(level),
    cellSizePx: cellSizePxFor(level),
    cellGapPx: cellGapPxFor(level),
  };
}
