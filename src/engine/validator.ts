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

export function validateBoard(
  board: Board,
  config: LevelConfig,
  seed: number,
): ValidationResult {
  const solvable = isSolvable(board);
  if (!solvable) return { solvable, fairness: 0, ok: false, reason: "unsolvable" };

  const rng = mulberry32(seed ^ 0x9e3779b9);
  const fairness = estimateFairness(board, rng, 20);
  const ok = fairness >= config.fairnessThreshold;
  return {
    solvable,
    fairness,
    ok,
    reason: ok ? undefined : `fairness ${fairness.toFixed(2)} < ${config.fairnessThreshold}`,
  };
}
