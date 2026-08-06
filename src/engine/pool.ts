// Phase 3: the baked board pool. Boards are generated offline by
// scripts/bake-boards.ts, validated (difficulty band + solver witness within
// the press budget) and shipped in config/boardPool.json. Runtime picks the
// board for a (level, seed) pair from the pool — fully deterministic, no
// generation work on the client.
import poolData from "./config/boardPool.json";
import { makeCell, emptyCell } from "./boardLayout";
import { getLevelConfig } from "./config/levels";
import type { Board, Cell } from "./types";

type PoolEntry = { seed: number; score: number; values: number[][] };

type PoolPayload = {
  version: number;
  levels: Record<string, { targetDifficulty: number; band: [number, number]; boards: PoolEntry[] }>;
};

const pool = poolData as unknown as PoolPayload;

export function hasPoolForLevel(level: number): boolean {
  const entries = pool.levels[String(level)];
  return !!entries && entries.boards.length > 0;
}

function deserialize(values: number[][]): Board {
  return values.map((row) => row.map<Cell>((v) => (v === null ? emptyCell() : makeCell(v))));
}

/**
 * Deterministic pool lookup for a level. The same (level, seed) always maps
 * to the same board; seeds cycle through the pool so a fresh game can serve
 * every player without repeated boards.
 */
export function getPooledBoard(level: number, seed: number): Board | null {
  const entries = pool.levels[String(level)];
  if (!entries || entries.boards.length === 0) return null;
  const idx =
    ((Math.abs(seed) % entries.boards.length) + entries.boards.length) % entries.boards.length;
  return deserialize(entries.boards[idx].values);
}

/** Score of the pooled board for a level, or null when absent. */
export function getPooledScore(level: number, seed: number): number | null {
  const entries = pool.levels[String(level)];
  if (!entries || entries.boards.length === 0) return null;
  const idx =
    ((Math.abs(seed) % entries.boards.length) + entries.boards.length) % entries.boards.length;
  return entries.boards[idx].score;
}

export function poolBoardCount(level: number): number {
  const entries = pool.levels[String(level)];
  return entries ? entries.boards.length : 0;
}

export { getLevelConfig };
