// Constraint graph for pair placement. Each pair carries:
//  - preferred adjacency direction (reading-order, vertical, diagonal)
//  - allowed burial depth (how many empty cells may sit between at match time)
//  - cluster group id (pairs sharing a group cluster nearby)
//
// For MVP the constraint set is intentionally light — its main job is to feed
// the layout engine deterministic hints so we build valid boards without
// rejection sampling.

import type { LevelConfig, Pair } from "./types";
import { type Rng } from "./rng";

export type PairDirection = "reading" | "vertical" | "diagonal";

export type PairConstraint = {
  pair: Pair;
  direction: PairDirection;
  buried: boolean; // hint only; layout may honor or ignore
  clusterId: number;
};

const DIRECTIONS: PairDirection[] = ["reading", "vertical", "diagonal"];

export function buildConstraintGraph(
  rng: Rng,
  pairs: Pair[],
  config: LevelConfig,
): PairConstraint[] {
  const constraints: PairConstraint[] = [];
  const buriedRatio = config.buriedPairWeight;
  const clusterCount = Math.max(1, Math.round(pairs.length * config.clusteringWeight * 0.4));
  for (let i = 0; i < pairs.length; i++) {
    // Bias toward reading-order for direct pairs; harder levels see more variety.
    const dirRoll = rng();
    let direction: PairDirection;
    if (dirRoll < config.directPairWeight * 0.7) direction = "reading";
    else if (dirRoll < config.directPairWeight * 0.7 + 0.2) direction = "vertical";
    else direction = DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)];
    constraints.push({
      pair: pairs[i],
      direction,
      buried: rng() < buriedRatio,
      clusterId: i % clusterCount,
    });
  }
  return constraints;
}
