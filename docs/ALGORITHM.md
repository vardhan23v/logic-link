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
addRow(game) → GameState
restart(level, seed?) → GameState
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
5 — and never 0. Level 1 is tuned so a single press suffices ~93% of the
time.

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

## Part B — Add Row Logic

`addRow.ts` + `rescue.ts`. When the player presses `(+)`:

1. **Analyze** the board. For each column, find the **bottom-most live
   value** — a new row's cell in that column is vertically adjacent to it
   (empties are skipped), so placing its complement there is a
   *guaranteed* match. `straggler.ts` flags values sitting in nearly-empty
   rows.
2. **Generate** a 9-cell row that:
   - places complements under stranded columns first (cleanup priority),
   - grants `round(helperStrength × 4)` guaranteed helpers in total, so
     easier levels get 4 freebies and Level 10 gets 3 — this is the
     "varying friction" dial,
   - fills remaining slots with self-contained pairs so the new row can
     clear itself once the helpers are consumed.
3. **Validate** the resulting board is still winnable
   (`isAddRowAcceptable` runs bounded playouts — a cleared playout proves
   solvability while keeping latency bounded on hard boards).
4. **Fallback** to a deterministic **Rescue Row** if validation fails or
   the rescue counter is triggered.

### Rescue Mechanic

`GameState.rescueCounter` increments every time an Add Row produces
**zero** new legal moves. When it reaches `RESCUE_THRESHOLD = 2`, the next
`addRow` call bypasses the smart generator and emits
`generateRescueRow(board)`, which complements the last non-empty cell —
guaranteeing an immediate legal match via wrap-around adjacency. The
counter resets on success. This is the "player pressed (+) twice and is
still stuck" trigger from the brief.

### Straggler Cleanup

`straggler.ts` flags values in rows with ≤2 live cells. The Add-Row
generator sorts helper columns so stranded ones are served first, which
drains nearly-empty rows instead of letting them accumulate — the board
stays tidy and `removeEmptyRows` reclaims the space.

## Sawtooth Difficulty (`config/levels.ts`)

Board size is constant (27 cells). The dials are `buriedPairWeight` (how
many pairs are split apart), `decoyWeight` (positional scrambling),
`fairnessThreshold` (how punishing an accepted board may be), and
`helperStrength` (how generous Add Row is).

| Level | Target time (s) | Buried | Decoy | Fairness ≥ | Typical Add Rows |
| ----- | --------------- | ------ | ----- | ---------- | ---------------- |
| 1     | 45              | 0.08   | 0.04  | 0.80       | 1                |
| 2     | 70              | 0.20   | 0.10  | 0.60       | 1                |
| 3     | 90              | 0.30   | 0.16  | 0.40       | 1–3              |
| 4     | 120             | 0.42   | 0.22  | 0.30       | 1–3              |
| 5     | 150             | 0.55   | 0.32  | 0.30       | 1–3              |
| 6     | 90              | 0.32   | 0.18  | 0.45       | 1–3 ← relief     |
| 7     | 165             | 0.42   | 0.22  | 0.40       | 1–3              |
| 8     | 180             | 0.60   | 0.30  | 0.30       | 1–3              |
| 9     | 195             | 0.66   | 0.40  | 0.25       | 1–3              |
| 10    | 210             | 0.68   | 0.40  | 0.25       | 1–3              |
| 11    | 100             | 0.34   | 0.20  | 0.45       | 1–3 ← relief     |

Levels 1–5 climb, 6 drops back to ~Level 3, 7–10 climb to a higher peak,
and 11 drops again. Every level keeps the 6-Add-Row budget.

`targetCompletionTime` is **not a timer** — there is no clock in the game.
It is the probabilistic envelope from the brief: "if 100 players play
Level 1, it should complete within 45s with ≥90% probability." It is
verified by simulating a cohort, not enforced at runtime.

## Verification: the simulation harness

`simulator.ts` plays generated boards with a heuristic AI (prefers moves
that clear stranded values and drain nearly-empty rows, presses Add Row
when out of moves) and estimates play time from a per-move cost model.
`simulateLevel(level, trials)` reports completion rate, time percentiles,
and the Add-Row histogram.

Measured over **500 boards per level**:

| Level | Completion | Within target time | Add Rows (avg) |
| ----- | ---------- | ------------------ | -------------- |
| 1     | 99.8%      | 93.2%              | 1.15           |
| 2     | 99.6%      | 98.0%              | 1.29           |
| 3     | 99.6%      | 98.8%              | 1.67           |
| 4     | 99.2%      | 99.2%              | 1.66           |
| 5     | 98.6%      | 98.6%              | 1.78           |
| 6     | 99.4%      | 98.8%              | 1.50           |
| 7     | 99.0%      | 99.0%              | 1.67           |
| 8     | 98.6%      | 98.6%              | 1.71           |
| 9     | 98.2%      | 98.2%              | 1.92           |
| 10    | 96.4%      | 96.4%              | 1.89           |
| 11    | 98.4%      | 98.4%              | 1.54           |

Every level clears the mandatory **95%** completion bar, which
`src/engine/__tests__/simulator.test.ts` enforces on every CI run — a
config change that makes any level too hard fails the build.

Run it locally:

```bash
npx vitest run src/engine
```

## Invariants (enforced by tests)

- Every generated board is 3 rows × 9 columns with exactly 27 live cells.
- Every generated board is solvable to its pairing residual.
- Add Row never creates an unwinnable board.
- Rescue always guarantees ≥1 legal move.
- Accepted boards score `≥ fairnessThreshold` on the playout sampler.
- Add-Row budget (6) is never silently exceeded.
- Completion rate ≥ 95% per level in simulation.

## Determinism & Reproducibility

`GameState.seed` is carried through every transition. `createGame(level,
seed)` with the same `(level, seed)` always produces the same board, and
any `applyMove` / `addRow` sequence is fully reproducible — critical for
bug reports, replay, and automated difficulty tuning.
