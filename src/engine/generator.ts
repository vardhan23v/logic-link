// Deterministic constraint-first board generator.
//
// Pipeline (per spec):
//   1. Load LevelConfig.
//   2. Generate Pair Graph.
//   3. Build Constraint Graph.
//   4. Place mandatory pairs.
//   5. Reserve future helper opportunities.  (encoded as unused capacity)
//   6. Inject decoys under constraints.       (MVP no-op)
//   7. Validate (solver + fairness + envelope).
//   8. Retry only if validation fails.

import { generatePairPool } from "./pairGraph";
import { buildConstraintGraph } from "./constraintGraph";
import { placePairs } from "./boardLayout";
import { injectDecoys } from "./decoys";
import { validateBoard } from "./validator";
import { mulberry32 } from "./rng";
import type { Board, LevelConfig } from "./types";

export type GenerationResult = {
  board: Board;
  seed: number;
  attempts: number;
};

export function generateBoard(config: LevelConfig, seed: number): GenerationResult {
  const maxAttempts = 20;
  let currentSeed = seed >>> 0 || 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const rng = mulberry32(currentSeed);
    const cellCount = config.initialCellCount % 2 === 0
      ? config.initialCellCount
      : config.initialCellCount - 1;
    const pairCount = cellCount / 2;

    const pairs = generatePairPool(rng, pairCount);
    const constraints = buildConstraintGraph(rng, pairs, config);
    let board = placePairs(rng, constraints, cellCount);
    board = injectDecoys(board, rng, config.decoyWeight);

    const validation = validateBoard(board, config, currentSeed);
    if (validation.ok) return { board, seed: currentSeed, attempts: attempt };

    // Bump seed deterministically and retry.
    currentSeed = (currentSeed * 1103515245 + 12345) >>> 0 || 1;
  }

  // Fallback: return the last generated (solvable-if-lucky) board without
  // fairness gating. The engine invariant is preserved by isSolvable when
  // possible; if not, we throw as this indicates an implementation bug.
  const rng = mulberry32(currentSeed);
  const cellCount =
    config.initialCellCount % 2 === 0 ? config.initialCellCount : config.initialCellCount - 1;
  const pairs = generatePairPool(rng, cellCount / 2);
  const constraints = buildConstraintGraph(rng, pairs, config);
  const board = placePairs(rng, constraints, cellCount);
  const validation = validateBoard(board, config, currentSeed);
  if (!validation.solvable) {
    throw new Error("Generator failed to produce a solvable board");
  }
  return { board, seed: currentSeed, attempts: maxAttempts + 1 };
}
