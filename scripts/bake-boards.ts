// Board pool baker (Phase 3).
//
// Generates candidate boards per level from the seeded PRNG, then filters:
//   1. skips safety-fallback boards (out-of-band difficulty by construction),
//   2. keeps boards whose scoreBoard value lands inside the D(L) tolerance band,
//   3. requires a constructive solver witness: a clear-to-empty path exists
//      within the level's Add Row press budget (DFS + move ordering, using
//      the exact deterministic rows index.addRow would inject).
//
// Survivors are written to src/engine/config/boardPool.json and shipped with
// the app. No generation happens at runtime — what was tested is what ships.
//
// Usage:
//   node --experimental-strip-types ...  (via vitest or a build tool)
//   npm run bake:boards -- --pool-size 16 --max-seeds 4000

import { getLevelConfig, LEVEL_IDS } from "../src/engine/config/levels";
import { generateBoard } from "../src/engine/generator";
import { scoreBoard, difficultyBand } from "../src/engine/difficulty";
import { isWinnableWithinBudget } from "../src/engine/solver";
import { boardAfterPress } from "../src/engine/index";
import { matchDensity } from "../src/engine/validator";
import { simulateNaiveBoard } from "../src/engine/simulator";
import { mulberry32 } from "../src/engine/rng";
import type { Board, GameState } from "../src/engine/types";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Args = { poolSize: number; maxSeeds: number; levels: number[] };

function parseArgs(argv: string[]): Args {
  const out: Args = { poolSize: 16, maxSeeds: 4000, levels: LEVEL_IDS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pool-size") out.poolSize = Number(argv[++i]);
    else if (a === "--max-seeds") out.maxSeeds = Number(argv[++i]);
    else if (a === "--levels")
      out.levels = argv[++i]
        .split(",")
        .map(Number)
        .filter((n) => Number.isFinite(n));
  }
  return out;
}

function serializeBoard(board: { row: { value: number | null }[] }[]): number[][] {
  return board.map((row) => row.map((cell) => cell.value as number));
}

async function main() {
  const { poolSize, maxSeeds, levels } = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const out: Record<number, unknown> = {};

  for (const level of levels) {
    const config = getLevelConfig(level);
    const [lo, hi] = difficultyBand(level);
    const boards: { seed: number; score: number; values: number[][] }[] = [];

    for (let attempt = 1; attempt <= maxSeeds && boards.length < poolSize; attempt++) {
      const seed = (level * 1000003 + attempt * 997) >>> 0 || 1;
      const gen = generateBoard(config, seed);
      if (gen.usedFallback) continue;

      const score = scoreBoard(gen.board);
      if (score < lo || score > hi) continue;

      // Spec floor on "match density": the fraction of start cells that
      // already sit inside a legal match. L1 must be ≥ 0.70 (instant
      // gratification); hard levels may bury matches below this.
      if (matchDensity(gen.board) < config.minMatchDensity) continue;

      const pressRow = (board: Board, _r: () => number, moveCount: number, pressesLeft: number) =>
        boardAfterPress({
          board,
          level,
          seed,
          moveCount,
          addRowsRemaining: pressesLeft,
        } as unknown as GameState);
      // Levels whose Add Row is a completion row on every press (L1's "1 add
      // row" design) must be winnable with a SINGLE press — the strongest
      // possible statement of the assignment contract. Other levels keep the
      // full 6-press budget.
      const witnessPresses =
        config.valvePressesLeft >= config.addRowBudget ? 1 : config.addRowBudget;
      const winnable = isWinnableWithinBudget(gen.board, mulberry32(seed), {
        presses: witnessPresses,
        maxNodes: 60_000,
        pressRow,
      });
      if (!winnable) continue;

      // Tutorial contract (levels whose Add Row is a completion row on every
      // press): the board must also be clearable by a mechanical left-to-right
      // sweep (no wrap moves, no backtracking) within the 6-press budget.
      // Because Add Row rows are normalized on the pool index, a single
      // deterministic run here is exactly what every runtime seed of this
      // board will experience — the anti-degenerate "naive L1 ≥ 85%" cohort
      // gate then holds by construction, not by sampling.
      if (config.valvePressesLeft >= config.addRowBudget) {
        if (!simulateNaiveBoard(gen.board, level, boards.length, config.addRowBudget)) continue;
      }

      boards.push({ seed, score, values: serializeBoard(gen.board) });

      boards.push({ seed, score, values: serializeBoard(gen.board) });
    }

    if (boards.length < poolSize) {
      console.error(
        `LEVEL ${level}: only ${boards.length}/${poolSize} boards in band [${lo.toFixed(1)}, ${hi.toFixed(1)}] after ${maxSeeds} seeds`,
      );
    } else {
      const mean = boards.reduce((s, b) => s + b.score, 0) / boards.length;
      console.log(
        `LEVEL ${level}: ${boards.length} boards baked, mean score ${mean.toFixed(2)} (band [${lo.toFixed(1)}, ${hi.toFixed(1)}])`,
      );
    }
    out[level] = {
      targetDifficulty: lo,
      band: [lo, hi],
      boards,
    };
  }

  const payload = {
    version: 1,
    note: "Generated by scripts/bake-boards.ts. Do not edit by hand.",
    levels: out,
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const dest = join(here, "..", "src", "engine", "config", "boardPool.json");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(payload, null, 2) + "\n");
  console.log(`\nWrote ${dest} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
