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
    const cellCount = config.initialCellCount;
    const pairCount = Math.floor(cellCount / 2);
    // Odd boards (the 27-cell 3-row start) carry one singleton whose partner
    // must arrive via Add Row; solvability means clearing to that one cell.
    const extraValue = cellCount % 2 === 1 ? 1 + Math.floor(rng() * 9) : undefined;

    const pairs = generatePairPool(rng, pairCount);
    const constraints = buildConstraintGraph(rng, pairs, config);
    let board = placePairs(rng, constraints, cellCount, { extraValue });
    board = injectDecoys(board, rng, config.decoyWeight);

    const validation = validateBoard(board, config, currentSeed);
    if (validation.ok) return { board, seed: currentSeed, attempts: attempt };

    // Bump seed deterministically and retry.
    currentSeed = (currentSeed * 1103515245 + 12345) >>> 0 || 1;
  }

  // Fallback: no attempt cleared the fairness gate, so regenerate with safe
  // all-direct placement and no decoys. That board is solvable by
  // construction (every pair adjacent, singleton at a pair boundary),
  // preserving the engine invariant even when the fairness bar can't be met
  // for this config/seed neighborhood.
  const rng = mulberry32(currentSeed);
  const cellCount = config.initialCellCount;
  const extraValue = cellCount % 2 === 1 ? 1 + Math.floor(rng() * 9) : undefined;
  const pairs = generatePairPool(rng, Math.floor(cellCount / 2));
  const constraints = buildConstraintGraph(rng, pairs, config);
  const board = placePairs(rng, constraints, cellCount, { safe: true, extraValue });
  const validation = validateBoard(board, config, currentSeed);
  if (!validation.solvable) {
    throw new Error("Generator failed to produce a solvable board");
  }
  return { board, seed: currentSeed, attempts: maxAttempts + 1 };
}
