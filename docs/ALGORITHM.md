# Deterministic Number Match — Algorithm Writeup

## Goals

Replace RNG-driven generation with a **deterministic, constraint-first**
system that guarantees:

1. Every board is solvable.
2. Difficulty stays inside a per-level envelope regardless of the moves
   the player picks.
3. Difficulty follows a **sawtooth** curve (rise → relief → rise), not
   a straight ramp.
4. Add-Row help preserves solvability and reacts to player frustration.

The engine lives in `src/engine/` and has zero React imports so it can
be reused by web, native wrappers, an AI simulator, and automated tests.

## Public API

```ts
createGame(level, seed?) → GameState
applyMove(game, from, to) → GameState
addRow(game, opts?) → GameState        // opts: { rescueReason?: "time" }
registerInvalidTap(game) → GameState    // bump the invalid-tap streak
undo(game) → GameState                  // pops the snapshot history
restart(level, seed?) → GameState
boardAfterPress(game, opts?) → Board    // exact board after one press (solver-facing)
expectedSecondsPerMatch(level) → number // 1.5× this feeds the time rescue trigger
getLegalMoves(game) → Move[]
isGameWon(game) / isGameLost(game)
```

Every function is pure. Invalid input returns the same `GameState`
reference — the API never throws for normal gameplay.

## The board and its parity

Every level starts with the spec board: **3 full rows × 9 columns = 27
cells**. 27 is odd, so the cells cannot all pair off: the board is built
as **13 pairs + 1 singleton**. "Solved" therefore means *cleared down to
the pairing residual* — empty for an even board, one leftover cell for an
odd one (`solver.ts: pairingResidual`).

This is the mechanism behind the spec's "Level 1 completes after 1 Add
Row" requirement. The player can always clear the initial board down to
that single leftover cell, but **winning requires the board to be empty**,
so at least one Add Row is mandatory. Each Add Row deals 9 more cells
(odd again), which is why wins land on **odd** Add-Row counts — 1, 3, or
5 — and never 0. Level 1 is tuned so a single press suffices ~86% of the
time (mean 1.14 add rows at 10k trials).

Because board size is fixed across all 11 levels, difficulty comes purely
from **composition**, never from "more cells to scan".

## Part A — Seeding (Board Generation)

Constraint-first pipeline (`generator.ts`):

1. **Load `LevelConfig`** (`config/levels.ts`) — one config per level.
   Difficulty is data, not code.
2. **Pair Graph** (`pairGraph.ts`) — pick 13 legal value pairs (equal or
   sum-to-10), plus one singleton value for the odd slot.
3. **Constraint Graph** (`constraintGraph.ts`) — annotate each pair with
   `direct | buried` and clustering hints, weighted by the level config.
4. **Placement** (`boardLayout.ts`) — emit values into the 27 reading-order
   slots. A **direct** pair takes two consecutive slots, which are always
   adjacent (wrap-around means "last cell of row R, first cell of row R+1"
   is a legal adjacency), so it is matchable immediately. A **buried**
   pair is split: its partner is deferred 1–3 slots so other pairs' values
   sit between the halves, and it only becomes matchable once those clear.
   The singleton is emitted at a pair boundary so it never splits a direct
   pair.
5. **Decoy Injection** (`decoys.ts`) — swap the *positions* of a
   `decoyWeight`-scaled number of values. This preserves the global value
   multiset (every value keeps a partner somewhere) while changing which
   values are adjacent right now, raising scanning cost.
6. **Validate** (`validator.ts` + `solver.ts`) — a fairness sampler replays
   32 seeded random playouts. The fraction that reach the pairing residual
   is the board's **fairness score**; any successful playout is also a
   constructive proof of solvability. If every playout fails, a bounded DFS
   solver (transposition table keyed by a canonical board hash) is the
   tiebreaker. Boards scoring below the level's `fairnessThreshold` are
   rejected.
7. **Retry** with a deterministically-bumped seed (up to 20 attempts). If
   no candidate clears the bar, the generator falls back to **safe
   placement** — all pairs direct, no decoys — which is solvable by
   construction. In practice this happens on ≲5% of boards at the hardest
   levels and never at Level 1.

Randomness only picks among valid, pre-constrained choices — never whether
a board is solvable.

## Part A2 — The baked board pool (Phase 3)

On-device generation is the *fallback*; the shipped pipeline is
**bake-then-serve**:

1. `scripts/bake-boards.ts` pre-generates a **pool of 16 boards per level**
   (`src/engine/config/boardPool.json`, baked via `npm run bake:boards`).
   Every board is gated twice: it must land inside the level's difficulty
   band, and — the decisive filter — the **budget solver** must find a
   winning playout: `isWinnableWithinBudget` replays the deterministic
   `boardAfterPress` transition (bucketed rows + completion valve) through a
   playout search and only accepts boards that clear within the 6-row
   budget. Boards also pass the fairness sampler at a raised threshold.
2. `src/engine/pool.ts` serves boards deterministically at runtime:
   `getPooledBoard(level, seed)` picks pool index `seed % poolLength`, so a
   given `(level, seed)` is byte-identical for every player on every
   platform. `createGame` prefers the pool and falls back to
   `generateBoard` only when a level has no baked entries.

The pool is re-baked whenever generation or Add Row changes, and
`pool.test.ts` enforces pool health: ≥8 boards per level, band membership,
determinism, and winnability of actually-played boards.

## Part B — Add Row Logic

`addRow.ts` + `rescue.ts`. When the player presses `(+)`, the transition
runs through `boardAfterPress(game, opts)` (the exact same function the
budget solver simulates), then updates counters and the snapshot history.
The row is chosen by this priority chain:

1. **Frustration triggers** — if the press is a time trigger (dawdled
   >1.5× the expected per-match time), the invalid-tap streak is ≥
   `RESCUE_INVALID_TAPS` (8), or the rescue counter is at its threshold,
   the row is a **tier-1 rescue**: wrap match + 3–4 short horizontal pairs,
   so a struggling player gets several moves at once.
2. **Bucketed smart rows** — otherwise, `pickAddRowBucket` draws
   Immediate / Deferred / Decoy from the level's `addRowBuckets` mix
   (decoys are only offered while the board still has legal moves — never
   to a stuck player). `generateAddRowForBucket` builds the row:
   - **Immediate**: complements under bottom-most live columns (≥1 match
     right after insert) plus self-clearing pairs.
   - **Deferred**: mates placed on diagonal "behind blocker" lines — the
     pair unlocks after one more clearing.
   - **Decoy**: no new match, pure friction.
   Each candidate is validated (`isAddRowAcceptable`, bounded playouts);
   a failing Decoy degrades to Deferred → Immediate → rescue.
3. **Completion safety valve** — on presses 5..6 of the 6-row budget, the
   row is a **completion row** that pairs every odd-count value at the
   bottom-most column, so the whole board can empty without further
   presses (retried up to 8 constructions, then tier-2 rescue: a single
   guaranteed wrap match + self-pairs, never a dead press).

The rng stream is `mulberry32((seed ^ (moveCount + 1)) >>> 0)`, so the
whole run — including every Add Row — is deterministic.

### Rescue Mechanic

Three triggers feed `generateRescueRow`:

| Trigger | Condition | Row |
| ------- | --------- | --- |
| counter | `rescueCounter ≥ 2` (a press produced zero new legal moves) | tier 1 |
| invalidTaps | 8 consecutive invalid pair taps | tier 1 |
| time | no action for > 1.5× `expectedSecondsPerMatch(level)` | tier 1 |

Tier 1 rows give a wrap match plus 3–4 short horizontal match pairs.
`rescueCounter` resets on any press that produces a legal move; the
invalid-tap streak resets on any successful move.

### Straggler Cleanup

`straggler.ts` flags values in rows with ≤2 live cells. The Add-Row
generator sorts helper columns so stranded ones are served first, which
drains nearly-empty rows instead of letting them accumulate — the board
stays tidy and `removeEmptyRows` reclaims the space.

## Undo, Persistence, Analytics (Phase 7)

- **Undo** — every applied move or Add Row press pushes a
  `GameSnapshot` (board + counters + selection) onto `history`; `undo`
  pops the last one. Snapshot boards share cell references, so the stack
  is cheap.
- **Persistence** — `src/engine/persist.ts` serializes the full game
  (board values, counters, undo history) to a plain JSON string; the
  `useGame` hook saves on every change (`logic-link:game`) and resumes a
  reload exactly where the player left off.
- **Analytics** — `src/lib/analytics.ts` records privacy-first events
  (never leave the device): `time_to_first_match`, `add_rows_used`,
  `completion_time`, `rescue_triggered`.

## Sawtooth Difficulty (`config/levels.ts`)

Board size is constant (27 cells). The dials are `buriedPairWeight` (how
many pairs are split apart), `decoyWeight` (positional scrambling),
`fairnessThreshold` (how punishing an accepted board may be), and the
`addRowBuckets` mix (Immediate / Deferred / Decoy friction). Add-Row
friction rises with difficulty — Level 1 never deals a decoy, Level 10
deals decoys on 35% of presses.

| Level | Target time (s) | Buried | Decoy | Fairness ≥ | Add Row mix (imm/def/dec) | Typical Add Rows |
| ----- | --------------- | ------ | ----- | ---------- | ------------------------- | ---------------- |
| 1     | 45              | 0.08   | 0.09  | 0.80       | 70 / 30 / 0               | 1                |
| 2     | 70              | 0.20   | 0.07  | 0.60       | 60 / 35 / 5               | 1                |
| 3     | 90              | 0.30   | 0.13  | 0.40       | 50 / 40 / 10              | 1–3              |
| 4     | 120             | 0.42   | 0.16  | 0.30       | 45 / 45 / 10              | 1–3              |
| 5     | 150             | 0.55   | 0.32  | 0.30       | 40 / 45 / 15              | 1–3              |
| 6     | 90              | 0.32   | 0.13  | 0.45       | 50 / 40 / 10              | 1–3 ← relief     |
| 7     | 165             | 0.42   | 0.19  | 0.40       | 35 / 45 / 20              | 1–3              |
| 8     | 180             | 0.60   | 0.30  | 0.30       | 30 / 45 / 25              | 1–3              |
| 9     | 195             | 0.66   | 0.43  | 0.25       | 25 / 45 / 30              | 1–3              |
| 10    | 210             | 0.68   | 0.55  | 0.25       | 20 / 45 / 35              | 1–3              |
| 11    | 100             | 0.34   | 0.34  | 0.45       | 50 / 40 / 10              | 1–3 ← relief     |

Levels 1–5 climb, 6 drops back to ~Level 3, 7–10 climb to a higher peak,
and 11 drops again. Every level keeps the 6-Add-Row budget.

`targetCompletionTime` is **not a timer** — there is no clock in the game.
It is the probabilistic envelope from the brief: "if 100 players play
Level 1, it should complete within 45s with ≥90% probability." It is
verified by simulating a cohort, not enforced at runtime.

## Verification: Monte Carlo harness (Phase 6)

`scripts/monte-carlo.ts` mass-simulates every level with a heuristic bot
(clears stranded values, drains nearly-empty rows, presses Add Row when
stuck) and gates the difficulty contract with proper statistics:

- **P(win) ≥ 0.95** — the Wilson 95% CI *lower bound* must clear the
  target, not just the point estimate.
- **Mean presses ± CI** — the mean-moves CI half-width must be ≤ 1.

Measured at **10,000 trials per level** (heuristic bot):

| Level | P(win) | Wilson 95% CI | Mean moves | Mean add rows |
| ----- | ------ | ------------- | ---------- | ------------- |
| 1     | 100.0% | [99.96%, 100%] | 18.6 | 1.14 |
| 2     | 100.0% | [99.96%, 100%] | 18.9 | 1.24 |
| 3     | 99.86% | [99.77%, 100%] | 20.1 | 1.52 |
| 4     | 99.76% | [99.64%, 100%] | 20.8 | 1.71 |
| 5     | 99.80% | [99.69%, 100%] | 21.1 | 1.77 |
| 6     | 99.93% | [99.86%, 100%] | 19.7 | 1.43 |
| 7     | 99.85% | [99.75%, 100%] | 20.1 | 1.51 |
| 8     | 99.67% | [99.54%, 100%] | 21.3 | 1.82 |
| 9     | 99.44% | [99.27%, 100%] | 22.4 | 2.10 |
| 10    | 98.17% | [97.89%, 100%] | 21.9 | 1.98 |
| 11    | 99.90% | [99.82%, 100%] | 20.0 | 1.50 |

Every level clears the **95%** bar with margin, and the difficulty
gradient is real: Level 1 completes in ~18.6 moves, Level 10 needs ~21.9.
Run it locally:

```bash
npx -y tsx scripts/monte-carlo.ts          # 10k trials × all levels
npx vitest run src/engine                  # CI-friendly gates (1k trials)
```

## Anti-degenerate checks (Phase 7)

`scripts/naive-check.ts` plays every level with a **naive sweep bot** that
only sees ordinary adjacencies (horizontal / vertical / diagonal — never
wrap moves, never backtracks) and presses Add Row whenever it can't spot a
match. Measured at 1,000 boards per level:

| Level | Naive solve rate | Gate |
| ----- | ---------------- | ---- |
| 1     | 90.3%            | ≥ 85% (mechanical play must clear the tutorial) |
| 8     | 62.9%            | ≤ 80% (mechanical play must NOT be enough) |
| 9     | 61.6%            | ≤ 80% |
| 10    | 54.2%            | ≤ 80% |
| 11    | 84.0%            | exempt (relief level) |

This is the guarantee that difficulty comes from the *boards*, not the
tutorial: beginners sail through Level 1, while the hardest levels resist
a player who never looks past the row they're scanning.

## Invariants (enforced by tests)

- Every generated board is 3 rows × 9 columns with exactly 27 live cells.
- Every baked pool board is winnable within the 6-row budget
  (`isWinnableWithinBudget`).
- Add Row never creates an unwinnable board (valve on presses 5–6).
- Rescue always guarantees ≥1 legal move (tier 1 = several).
- Accepted boards score `≥ fairnessThreshold` on the playout sampler.
- Add-Row budget (6) is never silently exceeded.
- Completion rate CI lower bound ≥ 95% per level in Monte Carlo.
- Naive sweep solves L1 ≥ 85% and fails L8–L10 ≥ 20% of the time.
- Undo round-trips moves and Add Row presses; persistence round-trips a
  mid-game state with its full history.

## Determinism & Reproducibility

`GameState.seed` is carried through every transition. `createGame(level,
seed)` with the same `(level, seed)` always produces the same board, and
any `applyMove` / `addRow` sequence is fully reproducible — critical for
bug reports, replay, and automated difficulty tuning.
