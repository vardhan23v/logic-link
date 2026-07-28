// Ordered legal pair pool. Pairs are chosen from the 5 legal match types.
// Deterministic given the seed. Randomness only orders choices among valid pairs.

import type { Pair } from "./types";
import { pick, shuffle, type Rng } from "./rng";

/** All legal pair value types (sum=10 or equal). */
export const PAIR_TYPES: Pair[] = [
  { a: 1, b: 9 },
  { a: 2, b: 8 },
  { a: 3, b: 7 },
  { a: 4, b: 6 },
  { a: 5, b: 5 },
  { a: 1, b: 1 },
  { a: 2, b: 2 },
  { a: 3, b: 3 },
  { a: 4, b: 4 },
  { a: 6, b: 6 },
  { a: 7, b: 7 },
  { a: 8, b: 8 },
  { a: 9, b: 9 },
];

export function generatePairPool(rng: Rng, pairCount: number): Pair[] {
  const pool: Pair[] = [];
  const shuffled = shuffle(rng, PAIR_TYPES);
  for (let i = 0; i < pairCount; i++) {
    pool.push(shuffled[i % shuffled.length]);
  }
  return shuffle(rng, pool);
}

export function randomPairType(rng: Rng): Pair {
  return pick(rng, PAIR_TYPES);
}
