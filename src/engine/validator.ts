// Validator: composes solver + fairness + envelope checks.

import { estimateFairness, isSolvable, liveCellCount } from "./solver";
import { findAllLegalMoves } from "./matching";
import type { Board, LevelConfig } from "./types";
import { mulberry32 } from "./rng";

export type ValidationResult = {
  solvable: boolean;
  fairness: number;
  ok: boolean;
  reason?: string;
};

/**
 * Match density: the fraction of live cells that already sit inside at least
 * one legal match (horizontal/vertical/diagonal/wrap adjacency). This is the
 * spec's "70% match density" knob for Level 1 — how much of the board a
 * player can clear without solving anything deeper.
 */
export function matchDensity(board: Board): number {
  const moves = findAllLegalMoves(board);
  const touched = new Set<string>();
  for (const m of moves) {
    touched.add(`${m.from.row},${m.from.col}`);
    touched.add(`${m.to.row},${m.to.col}`);
  }
  const total = liveCellCount(board);
  if (total === 0) return 0;
  const live = touched.size;
  return live / total;
}

export function validateBoard(board: Board, config: LevelConfig, seed: number): ValidationResult {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const fairness = estimateFairness(board, rng, 32);
  // Any cleared playout inside the fairness sample is a constructive witness
  // that the board is solvable. Only fall back to the exhaustive DFS when
  // every playout failed — bounded so a pathological candidate can't stall
  // the generator's retry loop.
  const solvable = fairness > 0 || isSolvable(board, { maxNodes: 6_000 });
  if (!solvable) return { solvable, fairness, ok: false, reason: "unsolvable" };

  const density = matchDensity(board);
  if (density < config.minMatchDensity) {
    return {
      solvable,
      fairness,
      ok: false,
      reason: `matchDensity ${density.toFixed(2)} < ${config.minMatchDensity}`,
    };
  }

  const ok = fairness >= config.fairnessThreshold;
  return {
    solvable,
    fairness,
    ok,
    reason: ok ? undefined : `fairness ${fairness.toFixed(2)} < ${config.fairnessThreshold}`,
  };
}
