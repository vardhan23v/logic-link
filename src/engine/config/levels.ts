import type { LevelConfig } from "../types";

/**
 * Sawtooth difficulty curve (Levels 1-10).
 *
 * Rise: 1 → 5, dip at 6 (~ L3), rise: 7 → 10 (peak > L5).
 * Difficulty is expressed through `initialCellCount` (more filled cells =
 * more scanning), `buriedPairWeight` (pairs split apart at layout time so
 * they only match after the values between them clear), and `decoyWeight`
 * (post-layout value scrambling). `fairnessThreshold` falls as levels rise:
 * harder levels accept boards that fewer random playouts clear, which is
 * what forces deliberate move ordering.
 *
 * Level 1 is the unchanged tutorial-grade board; the climb starts at 2.
 *
 * `initialCellCount` MUST be even so the initial board is solvable
 * to empty without spending Add Rows (spec invariant).
 *
 * Add-row budget stays at 6 for every level. The expected number of
 * Add Rows to complete each level is encoded in
 * `expectedAddRowDistribution` (index 0 = 0 add rows, etc.). A 9-cell row
 * flips the board's live-cell parity, so add rows are effectively spent in
 * pairs — the distributions put their mass on even counts (observed from the
 * simulation harness).
 */
export const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1: {
    id: 1,
    difficultyScore: 1,
    matchDensity: 0.9,
    directPairWeight: 0.9,
    buriedPairWeight: 0.1,
    clusteringWeight: 0.75,
    decoyWeight: 0.05,
    helperStrength: 0.95,
    cleanupPriority: 0.95,
    expectedAddRowDistribution: [0.15, 0.75, 0.1], // ~1 add row typical
    targetCompletionTime: 45,
    completionProbability: 0.9,
    fairnessThreshold: 0.92,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 22,
  },
  2: {
    id: 2,
    difficultyScore: 3,
    matchDensity: 0.78,
    directPairWeight: 0.65,
    buriedPairWeight: 0.35,
    clusteringWeight: 0.55,
    decoyWeight: 0.18,
    helperStrength: 0.82,
    cleanupPriority: 0.82,
    expectedAddRowDistribution: [0.54, 0, 0.27, 0, 0.14, 0, 0.05],
    targetCompletionTime: 100,
    completionProbability: 0.9,
    fairnessThreshold: 0.35,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 28,
  },
  3: {
    id: 3,
    difficultyScore: 4,
    matchDensity: 0.74,
    directPairWeight: 0.58,
    buriedPairWeight: 0.42,
    clusteringWeight: 0.5,
    decoyWeight: 0.22,
    helperStrength: 0.78,
    cleanupPriority: 0.78,
    expectedAddRowDistribution: [0.49, 0, 0.29, 0, 0.16, 0, 0.06],
    targetCompletionTime: 120,
    completionProbability: 0.9,
    fairnessThreshold: 0.3,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 30,
  },
  4: {
    id: 4,
    difficultyScore: 5,
    matchDensity: 0.7,
    directPairWeight: 0.52,
    buriedPairWeight: 0.48,
    clusteringWeight: 0.45,
    decoyWeight: 0.26,
    helperStrength: 0.74,
    cleanupPriority: 0.74,
    expectedAddRowDistribution: [0.45, 0, 0.28, 0, 0.17, 0, 0.1],
    targetCompletionTime: 145,
    completionProbability: 0.9,
    fairnessThreshold: 0.25,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 32,
  },
  5: {
    id: 5,
    difficultyScore: 6,
    matchDensity: 0.66,
    directPairWeight: 0.46,
    buriedPairWeight: 0.54,
    clusteringWeight: 0.38,
    decoyWeight: 0.3,
    helperStrength: 0.7,
    cleanupPriority: 0.7,
    expectedAddRowDistribution: [0.37, 0, 0.33, 0, 0.22, 0, 0.08],
    targetCompletionTime: 175,
    completionProbability: 0.9,
    fairnessThreshold: 0.25,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 34,
  },
  // Relief level: eases back to ~L3 difficulty so the sawtooth dips before
  // the final climb; slightly more decoys than L3 so it still feels new.
  6: {
    id: 6,
    difficultyScore: 4,
    matchDensity: 0.74,
    directPairWeight: 0.56,
    buriedPairWeight: 0.44,
    clusteringWeight: 0.5,
    decoyWeight: 0.24,
    helperStrength: 0.78,
    cleanupPriority: 0.78,
    expectedAddRowDistribution: [0.47, 0, 0.34, 0, 0.13, 0, 0.06],
    targetCompletionTime: 120,
    completionProbability: 0.92,
    fairnessThreshold: 0.3,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 30,
  },
  7: {
    id: 7,
    difficultyScore: 6,
    matchDensity: 0.66,
    directPairWeight: 0.48,
    buriedPairWeight: 0.52,
    clusteringWeight: 0.4,
    decoyWeight: 0.28,
    helperStrength: 0.7,
    cleanupPriority: 0.7,
    expectedAddRowDistribution: [0.36, 0, 0.34, 0, 0.19, 0, 0.11],
    targetCompletionTime: 170,
    completionProbability: 0.9,
    fairnessThreshold: 0.3,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 34,
  },
  8: {
    id: 8,
    difficultyScore: 7,
    matchDensity: 0.62,
    directPairWeight: 0.42,
    buriedPairWeight: 0.58,
    clusteringWeight: 0.34,
    decoyWeight: 0.29,
    helperStrength: 0.66,
    cleanupPriority: 0.66,
    expectedAddRowDistribution: [0.41, 0, 0.32, 0, 0.16, 0, 0.11],
    targetCompletionTime: 200,
    completionProbability: 0.9,
    fairnessThreshold: 0.35,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 36,
  },
  9: {
    id: 9,
    difficultyScore: 8,
    matchDensity: 0.58,
    directPairWeight: 0.36,
    buriedPairWeight: 0.64,
    clusteringWeight: 0.28,
    decoyWeight: 0.35,
    helperStrength: 0.62,
    cleanupPriority: 0.62,
    expectedAddRowDistribution: [0.37, 0, 0.37, 0, 0.16, 0, 0.1],
    targetCompletionTime: 230,
    completionProbability: 0.9,
    fairnessThreshold: 0.3,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 38,
  },
  10: {
    id: 10,
    difficultyScore: 9,
    matchDensity: 0.55,
    directPairWeight: 0.3,
    buriedPairWeight: 0.66,
    clusteringWeight: 0.25,
    decoyWeight: 0.35,
    helperStrength: 0.58,
    cleanupPriority: 0.58,
    expectedAddRowDistribution: [0.35, 0, 0.36, 0, 0.17, 0, 0.12],
    targetCompletionTime: 260,
    completionProbability: 0.9,
    fairnessThreshold: 0.3,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 40,
  },
};

export const LEVEL_IDS = Object.keys(LEVEL_CONFIGS)
  .map(Number)
  .sort((a, b) => a - b);

export function getLevelConfig(level: number): LevelConfig {
  const cfg = LEVEL_CONFIGS[level];
  if (!cfg) throw new Error(`Unknown level: ${level}`);
  return cfg;
}
