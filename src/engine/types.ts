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
  /**
   * Number of cells populated in the initial board. The spec board is 27
   * (3 full 9-column rows): 13 pairs plus one singleton, guaranteed clearable
   * down to that singleton, whose partner arrives via Add Row — so every
   * level takes at least one Add Row press to win.
   */
  initialCellCount: number;
};

export const BOARD_COLS = 9;
