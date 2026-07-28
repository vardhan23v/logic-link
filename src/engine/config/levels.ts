import type { LevelConfig } from "../types";

/**
 * Sawtooth difficulty curve (Levels 1-10).
 *
 * Rise: 1 → 5, dip at 6 (~ L3), rise: 7 → 10 (peak > L5).
 * Difficulty is expressed primarily through `initialCellCount`
 * (more filled cells = more scanning) and secondarily through
 * `decoyWeight`, `buriedPairWeight`, and `matchDensity`.
 *
 * `initialCellCount` MUST be even so the initial board is solvable
 * to empty without spending Add Rows (spec invariant).
 *
 * Add-row budget stays at 6 for every level. The expected number of
 * Add Rows to complete each level is encoded in
 * `expectedAddRowDistribution` (index 0 = 0 add rows, etc.).
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
    difficultyScore: 2,
    matchDensity: 0.85,
    directPairWeight: 0.8,
    buriedPairWeight: 0.2,
    clusteringWeight: 0.65,
    decoyWeight: 0.1,
    helperStrength: 0.9,
    cleanupPriority: 0.9,
    expectedAddRowDistribution: [0.1, 0.55, 0.3, 0.05],
    targetCompletionTime: 65,
    completionProbability: 0.9,
    fairnessThreshold: 0.9,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 24,
  },
  3: {
    id: 3,
    difficultyScore: 3,
    matchDensity: 0.8,
    directPairWeight: 0.7,
    buriedPairWeight: 0.3,
    clusteringWeight: 0.55,
    decoyWeight: 0.15,
    helperStrength: 0.85,
    cleanupPriority: 0.85,
    expectedAddRowDistribution: [0.05, 0.35, 0.45, 0.15],
    targetCompletionTime: 90,
    completionProbability: 0.9,
    fairnessThreshold: 0.88,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 26,
  },
  4: {
    id: 4,
    difficultyScore: 4,
    matchDensity: 0.75,
    directPairWeight: 0.6,
    buriedPairWeight: 0.4,
    clusteringWeight: 0.5,
    decoyWeight: 0.2,
    helperStrength: 0.8,
    cleanupPriority: 0.8,
    expectedAddRowDistribution: [0.05, 0.25, 0.4, 0.2, 0.1],
    targetCompletionTime: 120,
    completionProbability: 0.9,
    fairnessThreshold: 0.87,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 28,
  },
  5: {
    id: 5,
    difficultyScore: 5,
    matchDensity: 0.7,
    directPairWeight: 0.5,
    buriedPairWeight: 0.5,
    clusteringWeight: 0.4,
    decoyWeight: 0.25,
    helperStrength: 0.75,
    cleanupPriority: 0.75,
    expectedAddRowDistribution: [0.03, 0.17, 0.35, 0.3, 0.15],
    targetCompletionTime: 150,
    completionProbability: 0.9,
    fairnessThreshold: 0.85,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 30,
  },
  // Relief level: mirrors L3 in difficulty; slightly more decoys so it
  // still feels like progress rather than a straight repeat.
  6: {
    id: 6,
    difficultyScore: 3,
    matchDensity: 0.8,
    directPairWeight: 0.68,
    buriedPairWeight: 0.32,
    clusteringWeight: 0.55,
    decoyWeight: 0.18,
    helperStrength: 0.85,
    cleanupPriority: 0.85,
    expectedAddRowDistribution: [0.05, 0.35, 0.45, 0.15],
    targetCompletionTime: 90,
    completionProbability: 0.92,
    fairnessThreshold: 0.88,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 26,
  },
  7: {
    id: 7,
    difficultyScore: 5,
    matchDensity: 0.72,
    directPairWeight: 0.55,
    buriedPairWeight: 0.45,
    clusteringWeight: 0.45,
    decoyWeight: 0.22,
    helperStrength: 0.75,
    cleanupPriority: 0.75,
    expectedAddRowDistribution: [0.03, 0.2, 0.37, 0.28, 0.12],
    targetCompletionTime: 140,
    completionProbability: 0.9,
    fairnessThreshold: 0.86,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 28,
  },
  8: {
    id: 8,
    difficultyScore: 6,
    matchDensity: 0.68,
    directPairWeight: 0.5,
    buriedPairWeight: 0.5,
    clusteringWeight: 0.4,
    decoyWeight: 0.27,
    helperStrength: 0.7,
    cleanupPriority: 0.7,
    expectedAddRowDistribution: [0.02, 0.15, 0.33, 0.32, 0.15, 0.03],
    targetCompletionTime: 165,
    completionProbability: 0.9,
    fairnessThreshold: 0.85,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 30,
  },
  9: {
    id: 9,
    difficultyScore: 7,
    matchDensity: 0.65,
    directPairWeight: 0.45,
    buriedPairWeight: 0.55,
    clusteringWeight: 0.35,
    decoyWeight: 0.32,
    helperStrength: 0.68,
    cleanupPriority: 0.68,
    expectedAddRowDistribution: [0.02, 0.12, 0.3, 0.32, 0.18, 0.06],
    targetCompletionTime: 185,
    completionProbability: 0.9,
    fairnessThreshold: 0.83,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 32,
  },
  10: {
    id: 10,
    difficultyScore: 8,
    matchDensity: 0.62,
    directPairWeight: 0.4,
    buriedPairWeight: 0.6,
    clusteringWeight: 0.3,
    decoyWeight: 0.35,
    helperStrength: 0.65,
    cleanupPriority: 0.65,
    expectedAddRowDistribution: [0.01, 0.09, 0.27, 0.33, 0.22, 0.08],
    targetCompletionTime: 210,
    completionProbability: 0.9,
    fairnessThreshold: 0.82,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 34,
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
