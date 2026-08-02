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
  // Node cap scales with board size so big, scattered boards stay fast.
  const cells = board.reduce((n, r) => n + r.filter((c) => c.value !== null).length, 0);
  const solvable = isSolvable(board, { maxNodes: Math.min(6000, 150 * cells) });
  if (!solvable) return { solvable, fairness: 0, ok: false, reason: "unsolvable" };

  const rng = mulberry32(seed ^ 0x9e3779b9);
  const fairness = estimateFairness(board, rng, 8);
  const ok = fairness >= config.fairnessThreshold;
  return {
    solvable,
    fairness,
    ok,
    reason: ok ? undefined : `fairness ${fairness.toFixed(2)} < ${config.fairnessThreshold}`,
  };
}
