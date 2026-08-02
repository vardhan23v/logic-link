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
  const maxAttempts = 40;
  let currentSeed = seed >>> 0 || 1;

  const cellCount =
    config.initialCellCount % 2 === 0 ? config.initialCellCount : config.initialCellCount - 1;
  const pairCount = cellCount / 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Relax scatter progressively on repeated failures so generation always
    // converges: harder layouts are tried first, easier ones are the fallback.
    const relax = Math.min(1, (attempt - 1) / maxAttempts);
    const scatter = config.scatterStrength * (1 - relax);

    const rng = mulberry32(currentSeed);
    const pairs = generatePairPool(rng, pairCount);
    const constraints = buildConstraintGraph(rng, pairs, config);
    let board = placePairs(rng, constraints, cellCount, {
      cols: config.gridCols,
      scatterStrength: scatter,
    });
    // Decoys are match-preserving flips, so they never affect validation.
    board = injectDecoys(board, rng, config.decoyRatio);

    const validation = validateBoard(board, config, currentSeed);
    if (validation.ok) return { board, seed: currentSeed, attempts: attempt };

    // Bump seed deterministically and retry.
    currentSeed = (currentSeed * 1103515245 + 12345) >>> 0 || 1;
  }

  // Final fallback: zero scatter is solvable by construction (every pair sits
  // in two consecutive reading-order slots).
  const rng = mulberry32(currentSeed);
  const pairs = generatePairPool(rng, pairCount);
  const constraints = buildConstraintGraph(rng, pairs, config);
  let board = placePairs(rng, constraints, cellCount, {
    cols: config.gridCols,
    scatterStrength: 0,
  });
  board = injectDecoys(board, rng, config.decoyRatio);
  const validation = validateBoard(board, config, currentSeed);
  if (!validation.solvable) {
    throw new Error("Generator failed to produce a solvable board");
  }
  return { board, seed: currentSeed, attempts: maxAttempts + 1 };
}

