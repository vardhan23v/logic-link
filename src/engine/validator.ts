// Validator: composes solver + fairness + envelope checks.

import { estimateFairness, isSolvable } from "./solver";
import type { Board, LevelConfig } from "./types";
import { mulberry32 } from "./rng";

export type ValidationResult = {
  solvable: boolean;
  fairness: number;
  ok: boolean;
  reason?: string;
};

export function validateBoard(board: Board, config: LevelConfig, seed: number): ValidationResult {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const fairness = estimateFairness(board, rng, 32);
  // Any cleared playout inside the fairness sample is a constructive witness
  // that the board is solvable. Only fall back to the exhaustive DFS when
  // every playout failed — bounded so a pathological candidate can't stall
  // the generator's retry loop.
  const solvable = fairness > 0 || isSolvable(board, { maxNodes: 6_000 });
  if (!solvable) return { solvable, fairness, ok: false, reason: "unsolvable" };

  const ok = fairness >= config.fairnessThreshold;
  return {
    solvable,
    fairness,
    ok,
    reason: ok ? undefined : `fairness ${fairness.toFixed(2)} < ${config.fairnessThreshold}`,
  };
}
