// Framework-agnostic engine types. No React imports here.

export type CellPosition = { row: number; col: number };

export type Cell = {
  id: string;
  value: number | null; // null = cleared
};

export type Board = Cell[][];

export type Pair = {
  a: number;
  b: number;
};

export type Move = {
  from: CellPosition;
  to: CellPosition;
};

export type GameStatus = "playing" | "won" | "lost";

export type GameState = {
  board: Board;
  level: number;
  seed: number;
  addRowsRemaining: number;
  selectedCells: CellPosition[];
  status: GameStatus;
  moveCount: number;
  rescueCounter: number;
  history: Move[];
};

export type SeedStrategy = "levelOnly" | "ruleBasedVaried";

export type LevelConfig = {
  id: number;
  difficultyScore: number;
  matchDensity: number;
  directPairWeight: number;
  buriedPairWeight: number;
  clusteringWeight: number;
  decoyWeight: number;
  helperStrength: number;
  cleanupPriority: number;
  expectedAddRowDistribution: number[];
  targetCompletionTime: number;
  completionProbability: number;
  fairnessThreshold: number;
  seedStrategy: SeedStrategy;
  addRowBudget: number;
  /** Number of cells populated in the initial board. Must be even for solve-to-empty. */
  initialCellCount: number;

  // --- multi-variable difficulty knobs (all derived in config/difficulty.ts) ---
  /** Board width for this level. */
  gridCols: number;
  /** 0..1 — how far apart a pair's two halves are scattered. */
  scatterStrength: number;
  /** 0..1 — fraction of cells flipped to their complement as visual decoys. */
  decoyRatio: number;
  /** Approximate count of decoy cells on the initial board. */
  distractorCount: number;
  /** Seconds the board preview stays visible before play. */
  memorizationTime: number;
  /** Seconds allowed to clear the level. */
  responseTime: number;
  /** Seconds between staggered cell reveals. */
  spawnInterval: number;
  /** UI transition duration in ms. */
  animationSpeedMs: number;
  /** Rendered cell size in px. */
  cellSizePx: number;
  /** Rendered gap between cells in px. */
  cellGapPx: number;
};

/** Default board width; per-level width comes from `LevelConfig.gridCols`. */
export const BOARD_COLS = 9;

