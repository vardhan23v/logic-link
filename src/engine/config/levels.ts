// Per-level configs are *derived*, not authored. Everything comes from the
// continuous formulas in `config/difficulty.ts`, so difficulty rises smoothly
// and predictably with no hardcoded per-level values.
//
// This module keeps the historic public surface (`LEVEL_CONFIGS`, `LEVEL_IDS`,
// `getLevelConfig`) so nothing downstream had to change.

import type { LevelConfig } from "../types";
import { BALANCE, computeLevelConfig } from "./difficulty";

export { BALANCE, computeLevelConfig } from "./difficulty";

/** Authored level range surfaced in the UI. */
export const LEVEL_IDS: number[] = Array.from({ length: BALANCE.levelCount }, (_, i) => i + 1);

export const LEVEL_CONFIGS: Record<number, LevelConfig> = Object.fromEntries(
  LEVEL_IDS.map((id) => [id, computeLevelConfig(id)]),
);

/**
 * Config for a level. Levels beyond the authored range are computed on the
 * fly from the same curves (all parameters are clamped), so an endless mode
 * never falls off a cliff or becomes impossible.
 */
export function getLevelConfig(level: number): LevelConfig {
  if (!Number.isFinite(level) || level < 1) throw new Error(`Unknown level: ${level}`);
  return LEVEL_CONFIGS[level] ?? computeLevelConfig(Math.floor(level));
}
