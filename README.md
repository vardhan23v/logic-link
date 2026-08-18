<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TanStack_Start-1.168-FF4154?style=flat-square&logo=reactrouter" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Tailwind-4.2-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

# Logic Link

A deterministic number-matching puzzle where every board is **guaranteed solvable before it ships**. Clear the 27-cell grid by pairing equal or sum-to-10 values, press Add Row when stuck, and climb 11 levels shaped by a constraint-first engine — not random chance.

Difficulty is mechanical, not visual: board size never changes. The engine is pure TypeScript with zero React imports. Same seed, same board, every time.

**Live demo:** deployed to Vercel from the `main` branch.

---

## Architecture

The engine lives in `src/engine/` and follows a constraint-first pipeline:

```
generator.ts → validator.ts → bake (scripts/bake-boards.ts) → boardPool.json → pool.ts
```

1. **Generator** loads a `LevelConfig` (buried-pair weight, decoy weight, value bias, burial depth) and builds a 27-cell board from 13 legal pairs + 1 singleton. Pairs are placed as *direct* (adjacent, immediately matchable) or *buried* (split across other values, matchable only after clearing). Near-miss decoys swap values so cells sit one away from matching a neighbor, without orphaning any value.
2. **Validator** runs a fairness sampler — 32 seeded random playouts — against the board. Any successful playout proves solvability. Boards scoring below the level's `fairnessThreshold` are rejected and regenerated with a bumped seed.
3. **Bake** (`npm run bake:boards`): survivors are additionally gated by the **budget solver** — a bounded DFS with a transposition table that proves a full-clear path exists within the level's Add Row budget — then written to `src/engine/config/boardPool.json`. Runtime serves boards straight from the pool; no generation happens on the client. What was tested is what ships.

Difficulty is a **scored model** (`difficulty.ts`), not a guess: five components — proximity, direction mix, decoy count, chain depth, value skew — are weighted and calibrated (least-squares fit) so `scoreBoard` lands inside a `difficultyBand` around the sawtooth target `D(L) = 10 + 10·⌊(L−1)/5⌋ + 5·((L−1)%5)` for every level.

Randomness is provided by a **deterministic seeded PRNG** (`src/engine/rng.ts`):

```ts
export type Rng = () => number
export function mulberry32(seed: number): Rng
export function randInt(rng: Rng, min: number, max: number): number
export function pick<T>(rng: Rng, arr: readonly T[]): T
export function shuffle<T>(rng: Rng, arr: readonly T[]): T[]
```

`GameState.seed` is carried through every transition. `createGame(level, seed)` with the same arguments always produces the same board, and any sequence of `applyMove` / `addRow` calls is fully reproducible — critical for bug reports, replay, and automated tuning.

**Add Row is bucketed** (`addRow.ts`): presses draw from Immediate / Deferred / Decoy buckets at per-level ratios (Decoy only ever fires while the player still has legal moves — a stuck board always gets a match). The **safety valve** kicks in on the last two presses of the budget: a completion row pairs every odd-count value, so the board can clear to empty without further presses.

**Frustration triggers** (`rescue.ts`) keep struggling players moving: a rescue row — wrap match plus several short match pairs — is dealt when 8 consecutive invalid taps land, when a press produced no new match twice in a row, or when the player dawdles past 1.5× the expected per-match time. Wins, losses, and rescues persist via `localStorage` (`persist.ts`), and undo rewinds any move or Add Row press.

The engine has **zero React coupling**. Every public function is pure: invalid input returns the same `GameState` reference rather than throwing.

---

## Design Decisions

### 27-cell fixed board (3 × 9)

27 is odd, so the board cannot pair off completely: it is built as 13 pairs + 1 singleton. "Solved" means cleared down to that pairing residual. Winning requires the board to be empty, so at least one Add Row is mandatory — wins always land on odd Add-Row counts (1, 3, or 5). Level 1 is tuned so a single press suffices ~86% of the time (mean 1.14 add rows at 10k trials).

Board size is constant across all 11 levels. Difficulty comes from **composition** (how many pairs are buried, how aggressively positions are scrambled, how generous Add Row is), never from "more cells to scan."

### Sawtooth difficulty curve

| Level | Score target | Buried | Decoy | Add Row mix (Immediate / Deferred / Decoy) | Character |
| ----- | ------------ | ------ | ----- | ------------------------------------------- | --------- |
| 1     | 10           | 0.08   | 0.09  | 70 / 30 / 0                                 | Tutorial  |
| 2     | 15           | 0.20   | 0.07  | 60 / 35 / 5                                 | Rise      |
| 3     | 20           | 0.30   | 0.13  | 50 / 40 / 10                                | Rise      |
| 4     | 25           | 0.42   | 0.16  | 45 / 45 / 10                                | Rise      |
| 5     | 30           | 0.55   | 0.32  | 40 / 45 / 15                                | Peak      |
| 6     | 20           | 0.32   | 0.13  | 50 / 40 / 10                                | Relief    |
| 7     | 25           | 0.42   | 0.19  | 35 / 45 / 20                                | Rise      |
| 8     | 30           | 0.60   | 0.30  | 30 / 45 / 25                                | Rise      |
| 9     | 35           | 0.66   | 0.43  | 25 / 45 / 30                                | Rise      |
| 10    | 40           | 0.68   | 0.55  | 20 / 45 / 35                                | Peak      |
| 11    | 30           | 0.34   | 0.34  | 50 / 40 / 10                                | Relief    |

Levels 1–5 climb, 6 drops back to roughly Level 3 difficulty, 7–10 climb to a higher peak, and 11 drops again. Every level keeps the 6-Add-Row budget and clears the mandatory 95% completion bar.

### Fairness sampling over exhaustive solving

A full DFS solver on 27 cells with Add Row branching is combinatorially expensive. The fairness sampler runs 32 lightweight seeded playouts instead — fast enough to run inside generation, and any successful playout is a constructive proof of solvability. A bounded DFS with a transposition table (keyed by canonical board hash) is the tiebreaker when every playout fails, and the budget solver (`isWinnableWithinBudget`) replays the exact deterministic Add Row transitions to prove boards in the shipped pool clear within the press budget.

---

## Performance

`scripts/monte-carlo.ts` mass-simulates with two bots. The **heuristic bot** (perfect vision) gates the Wilson 95% CI lower bound on P(win) ≥ 95% and a mean-presses CI half-width ≤ 1. The **human bot** (`--bot human`) runs the human-perception time model (per-cell scan costs, mis-taps, fatigue presses) and gates completion **within the level's target time** — Level 1: ≥ 90% within 45s with ≥ 88% of wins using exactly 1 Add Row, matching the assignment letter. The same gates run in CI at reduced trials (`src/engine/__tests__/montecarlo.test.ts` plus the dedicated `level1.test.ts` statistical contract), and the budget solver independently proves every pooled board is winnable within its press budget.

Measured at **10,000 trials per level** (heuristic bot, worst level shown; all levels ≥ 95%):

| Level | P(win) | Wilson 95% CI | Mean moves | Add Rows (avg) |
| ----- | ------ | ------------- | ---------- | -------------- |
| 1     | 100.0% | [99.96%, 100%] | 18.1 | 1.03 |
| 9     | 99.08% | [98.87%, 100%] | 24.1 | 2.53 |
| 10    | 98.48% | [98.22%, 100%] | 22.5 | 2.14 |
| 11    | 100.0% | [99.96%, 100%] | 19.4 | 1.36 |

**Human-bot cohort** at 10,000 trials — what the Level 1 review complaint
("not completing in 1 minute and 1 Add Number") is verified against:

| Level | P(win) | ≤ target time | Avg add rows | 1-press share | p50 / p90 |
| ----- | ------ | ------------- | ------------ | ------------- | --------- |
| 1     | 100.0% | 99.4% (≤45s)  | 1.01 | 99.3% | 34.0s / 35.8s |
| 10    | 98.3%  | 98.3% (≤210s) | 1.86 | 66.7% | 41.7s / 83.6s |

Level 1 completes within 45 seconds in 99.4% of simulated human sessions, and 99.3% of wins use exactly one Add Row — every result clears the 90% bar with margin.

The **anti-degenerate check** (`scripts/naive-check.ts`) plays a mechanical sweep bot that never uses wrap moves: every baked Level 1 board is a deterministic naive win (100%, gate ≥ 85%), while Levels 8–10 stop it at 56–69% (gate ≤ 80%) — difficulty comes from the boards, not the tutorial. Rows are normalized on the pool index (`seed % 16`), so bake-time validation is byte-identical to runtime play.

---

## Quick Start

```bash
npm install
npm run dev          # Vite dev server
npm test             # vitest run src/engine
npm run bake:boards  # regenerate the solver-validated board pool
npm run build:pages  # GitHub Pages SPA build (uses vite.config.pages.ts)
```

### Simulator

```bash
npx -y tsx scripts/monte-carlo.ts              # 10k trials × all levels (heuristic gates)
npx -y tsx scripts/monte-carlo.ts --bot human  # human-perception time + 1-press gates
npx -y tsx scripts/naive-check.ts              # naive-sweep anti-degenerate gradient
```

Exits non-zero if any level fails its gates. Wired into CI at reduced trials.

---

## Project Structure

```
src/
├── engine/              # Framework-agnostic puzzle engine
│   ├── config/levels.ts # 11-level sawtooth difficulty data
│   ├── config/boardPool.json  # Baked, solver-validated boards (shipped)
│   ├── generator.ts     # Constraint-first board generation
│   ├── validator.ts     # Fairness gate
│   ├── solver.ts        # Fairness sampler + bounded DFS + budget solver
│   ├── difficulty.ts    # Scored difficulty model (5 components, calibration)
│   ├── pool.ts          # Deterministic board-pool lookup at runtime
│   ├── addRow.ts        # Bucketed Add Row (Immediate/Deferred/Decoy) + safety valve
│   ├── rescue.ts        # Tiered rescue rows + frustration triggers
│   ├── matching.ts      # Legal-move enumeration + direction classification
│   ├── rng.ts           # Seeded mulberry32 PRNG
│   ├── simulator.ts     # Heuristic AI + naive sweep bot for verification
│   ├── stats.ts         # Wilson CI + mean-CI helpers for the Monte Carlo gates
│   ├── persist.ts       # GameState serialization for localStorage resume + undo
│   └── __tests__/       # Engine test suite
├── components/          # React UI (custom Tailwind components)
├── hooks/useGame.ts     # Engine glue: persistence, analytics, time trigger
├── lib/analytics.ts     # Privacy-first event buffer (never leaves the device)
└── routes/              # TanStack Start file-based routes
scripts/
├── bake-boards.ts       # Offline pool baker (difficulty band + solver gate)
├── monte-carlo.ts       # 10k-trial Monte Carlo harness (P(win) CI, mean presses)
├── naive-check.ts       # Anti-degenerate naive-sweep gradient check
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