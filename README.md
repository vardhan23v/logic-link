<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TanStack_Start-1.168-FF4154?style=flat-square&logo=reactrouter" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Tailwind-4.2-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Capacitor-8.4-119EFF?style=flat-square&logo=capacitor" alt="Capacitor" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

# Logic Link

A deterministic number-matching puzzle where every board is **guaranteed solvable before render**. Clear the 27-cell grid by pairing equal or sum-to-10 values, press Add Row when stuck, and climb 11 levels shaped by a constraint-first engine — not random chance.

Difficulty is mechanical, not visual: board size never changes. The engine is pure TypeScript with zero React imports. Same seed, same board, every time.

---

## Architecture

The engine lives in `src/engine/` and follows a constraint-first pipeline:

```
generator.ts → validator.ts → fairness validation
```

1. **Generator** loads a `LevelConfig` (buried-pair weight, decoy weight, helper strength) and builds a 27-cell board from 13 legal pairs + 1 singleton. Pairs are placed as *direct* (adjacent, immediately matchable) or *buried* (split across other values, matchable only after clearing). Decoy injection scrambles positions without changing the value multiset.
2. **Validator** runs a fairness sampler — 32 seeded random playouts — against the board. Any successful playout proves solvability. Boards scoring below the level's `fairnessThreshold` are rejected and regenerated with a bumped seed.
3. **Fallback** to all-direct placement if 20 attempts fail. This triggers on ~5% of boards at the hardest levels and never at Level 1.

Randomness is provided by a **deterministic seeded PRNG** (`src/engine/rng.ts`):

```ts
export type Rng = () => number
export function mulberry32(seed: number): Rng
export function randInt(rng: Rng, min: number, max: number): number
export function pick<T>(rng: Rng, arr: readonly T[]): T
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[]
export function newSeed(): number
```

`GameState.seed` is carried through every transition. `createGame(level, seed)` with the same arguments always produces the same board, and any sequence of `applyMove` / `addRow` calls is fully reproducible — critical for bug reports, replay, and automated tuning.

The engine has **zero React coupling**. Every public function is pure: invalid input returns the same `GameState` reference rather than throwing.

---

## Design Decisions

### 27-cell fixed board (3 × 9)

27 is odd, so the board cannot pair off completely: it is built as 13 pairs + 1 singleton. "Solved" means cleared down to that pairing residual. Winning requires the board to be empty, so at least one Add Row is mandatory — wins always land on odd Add-Row counts (1, 3, or 5). Level 1 is tuned so a single press suffices ~93% of the time.

Board size is constant across all 11 levels. Difficulty comes from **composition** (how many pairs are buried, how aggressively positions are scrambled, how generous Add Row is), never from "more cells to scan."

### Sawtooth difficulty curve

| Level | Buried | Decoy | Fairness ≥ | Character |
| ----- | ------ | ----- | ---------- | --------- |
| 1     | 0.08   | 0.04  | 0.80       | Tutorial  |
| 2     | 0.20   | 0.10  | 0.60       | Rise      |
| 3     | 0.30   | 0.16  | 0.40       | Rise      |
| 4     | 0.42   | 0.22  | 0.30       | Rise      |
| 5     | 0.55   | 0.32  | 0.30       | Peak      |
| 6     | 0.32   | 0.18  | 0.45       | Relief    |
| 7     | 0.42   | 0.22  | 0.40       | Rise      |
| 8     | 0.60   | 0.30  | 0.30       | Rise      |
| 9     | 0.66   | 0.40  | 0.25       | Rise      |
| 10    | 0.68   | 0.40  | 0.25       | Peak      |
| 11    | 0.34   | 0.20  | 0.45       | Relief    |

Levels 1–5 climb, 6 drops back to roughly Level 3 difficulty, 7–10 climb to a higher peak, and 11 drops again. Every level keeps the 6-Add-Row budget and clears the mandatory 95% completion bar.

### Fairness sampling over exhaustive solving

A full DFS solver on 27 cells with Add Row branching is combinatorially expensive. The fairness sampler runs 32 lightweight seeded playouts instead — fast enough to run inside generation, and any successful playout is a constructive proof of solvability. A bounded DFS with a transposition table (keyed by canonical board hash) is the tiebreaker when every playout fails.

---

## Performance

`scripts/simulate.ts` plays thousands of boards with a heuristic AI that prefers moves clearing stranded values, drains nearly-empty rows, and presses Add Row when out of legal moves. Time is estimated from a per-move cost model.

Measured over **500 boards per level**:

| Level | Completion | Within target | Add Rows (avg) |
| ----- | ---------- | ------------- | -------------- |
| 1     | 99.8%      | 93.2%         | 1.15           |
| 2     | 99.6%      | 98.0%         | 1.29           |
| 3     | 99.6%      | 98.8%         | 1.67           |
| 4     | 99.2%      | 99.2%         | 1.66           |
| 5     | 98.6%      | 98.6%         | 1.78           |
| 6     | 99.4%      | 98.8%         | 1.50           |
| 7     | 99.0%      | 99.0%         | 1.67           |
| 8     | 98.6%      | 98.6%         | 1.71           |
| 9     | 98.2%      | 98.2%         | 1.92           |
| 10    | 96.4%      | 96.4%         | 1.89           |
| 11    | 98.4%      | 98.4%         | 1.54           |

Every level clears the 95% completion bar. `src/engine/__tests__/simulator.test.ts` enforces this on every CI run — a config change that makes any level too hard fails the build.

---

## Quick Start

```bash
npm install
npm run dev          # Vite dev server
npm test             # vitest run src/engine
npm run build:pages  # GitHub Pages SPA build (uses vite.config.pages.ts)
```

### Simulator

```bash
bun scripts/simulate.ts                          # 1000 trials × all levels
bun scripts/simulate.ts --trials 2000 --levels 1,5,10
```

Exits non-zero if any level falls below its completion target. Wired into CI.

---

## Project Structure

```
src/
├── engine/              # Framework-agnostic puzzle engine
│   ├── config/levels.ts # 11-level sawtooth difficulty data
│   ├── generator.ts     # Constraint-first board generation
│   ├── validator.ts     # Fairness gate
│   ├── solver.ts        # Fairness sampler + bounded DFS
│   ├── addRow.ts        # Smart Add Row with cleanup priority
│   ├── rescue.ts        # Deterministic rescue row
│   ├── matching.ts      # Legal-move enumeration
│   ├── rng.ts           # Seeded mulberry32 PRNG
│   ├── simulator.ts     # Heuristic AI for difficulty verification
│   └── __tests__/       # Engine test suite
├── components/          # React UI (shadcn/ui, Radix primitives)
├── lib/                 # Shared utilities
└── routes/              # TanStack Start file-based routes
scripts/
├── simulate.ts          # CLI simulation harness
└── spa-entry.mjs        # SPA fallback for GitHub Pages
docs/
└── ALGORITHM.md         # Full algorithm writeup with verification data
```

---

## Deployment

### Vercel (primary)

Push to the connected branch. The `vercel.json` at the root configures SPA rewrites.

### GitHub Pages

```bash
npm run build:pages
```

Builds with `vite.config.pages.ts` (SPA mode, basepath `/logic-link`) and rewrites the entry point. Deploy `dist/client/` to GitHub Pages. The build is reproducible: same commit, same output.

---

## License

MIT