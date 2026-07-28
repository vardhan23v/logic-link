import type { LevelConfig } from "../types";

export const LEVEL_CONFIGS: Record<number, LevelConfig> = {
  1: {
    id: 1,
    difficultyScore: 1,
    matchDensity: 0.9,
    directPairWeight: 0.85,
    buriedPairWeight: 0.15,
    clusteringWeight: 0.7,
    decoyWeight: 0.1,
    helperStrength: 0.9,
    cleanupPriority: 0.9,
    expectedAddRowDistribution: [0.9, 0.08, 0.02],
    targetCompletionTime: 45,
    completionProbability: 0.95,
    fairnessThreshold: 0.9,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 20, // 2 full rows + 2 cells; keeps L1 fast
  },
  2: {
    id: 2,
    difficultyScore: 2,
    matchDensity: 0.82,
    directPairWeight: 0.7,
    buriedPairWeight: 0.3,
    clusteringWeight: 0.55,
    decoyWeight: 0.2,
    helperStrength: 0.8,
    cleanupPriority: 0.8,
    expectedAddRowDistribution: [0.6, 0.3, 0.1],
    targetCompletionTime: 70,
    completionProbability: 0.93,
    fairnessThreshold: 0.88,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 24,
  },
  3: {
    id: 3,
    difficultyScore: 3,
    matchDensity: 0.75,
    directPairWeight: 0.55,
    buriedPairWeight: 0.45,
    clusteringWeight: 0.4,
    decoyWeight: 0.3,
    helperStrength: 0.7,
    cleanupPriority: 0.7,
    expectedAddRowDistribution: [0.3, 0.4, 0.2, 0.1],
    targetCompletionTime: 90,
    completionProbability: 0.9,
    fairnessThreshold: 0.85,
    seedStrategy: "ruleBasedVaried",
    addRowBudget: 6,
    initialCellCount: 26,
  },
};

export function getLevelConfig(level: number): LevelConfig {
  const cfg = LEVEL_CONFIGS[level];
  if (!cfg) throw new Error(`Unknown level: ${level}`);
  return cfg;
}
