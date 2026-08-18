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

/**
 * Full previous-state snapshot for undo. Boards are small (≤ ~12 rows × 9
 * cols) and share cell references, so snapshots are cheap; history holds one
 * per applied move or Add Row press.
 */
export type GameSnapshot = {
  board: Board;
  addRowsRemaining: number;
  moveCount: number;
  rescueCounter: number;
  invalidTapCount: number;
  selectedCells: CellPosition[];
};

/** What forced a rescue row on the last Add Row press. */
export type RescueTrigger = "counter" | "invalidTaps" | "time" | null;

export type GameState = {
  board: Board;
  level: number;
  seed: number;
  addRowsRemaining: number;
  selectedCells: CellPosition[];
  status: GameStatus;
  moveCount: number;
  rescueCounter: number;
  /** Consecutive invalid pair taps; feeds the frustration rescue trigger. */
  invalidTapCount: number;
  /** Which rescue trigger fired on the most recent Add Row press (null if none). */
  rescueTriggered: RescueTrigger;
  history: GameSnapshot[];
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
  /**
   * Mandatory per-level bar for "completion within the target time": the
   * fraction of a simulated player cohort that must finish within
   * `targetCompletionTime`. Level 1 is 0.90 per the spec table; every other
   * level holds the mandatory 0.95 bar.
   */
  withinTargetProbability: number;
  /**
   * Add Row guarantee window (presses from the end of the 6-press budget that
   * switch to a completion row, which pairs every odd-count value so the
   * board can clear to empty without further presses). Level 1 sets this to 6
   * so even the FIRST press is guaranteed clearable — the "designed around 1
   * Add Row" contract. High levels keep 2 so mid-game presses carry decoy
   * friction.
   */
  valvePressesLeft: number;
  /**
   * Minimum fraction of initial cells that must already sit in a legal match
   * (horizontal/vertical/diagonal/wrap adjacency). L1 = 0.70 per the spec
   * table ("70% match density, instant gratification"), descending to
   * ~0.25 at the hardest levels, relief levels rising again.
   */
  minMatchDensity: number;
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
  /**
   * 0..1 — probability that a pair drawn for the board is (5,5). Easy levels
   * read as "many 5s" (low entropy, instantly recognizable); hard levels are
   * spread across all 13 pair types (high entropy, scattered 1s and 9s).
   */
  valueBias: number;
  /**
   * 1..9 — maximum number of foreign values the generator may drop between
   * the two halves of a buried pair. 1 keeps partners adjacent; 6+ scatters
   * them deep so a naive left-to-right sweep stalls.
   */
  burialDepth: number;
  /**
   * Phase 4 — Add Row bucketing. Fractions of presses (sum ≈ 1) that should
   * produce an Immediate row (match available right after insert), a Deferred
   * row (mate placed so the pair unlocks after one more clearing), or a Decoy
   * row (no new match — pure friction, only ever offered while the board
   * still has legal moves, never when the player is stuck).
   */
  addRowBuckets: { immediate: number; deferred: number; decoy: number };
};

export const BOARD_COLS = 9;
