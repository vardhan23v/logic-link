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
3. **Completion safety valve** — the valve is **per-level**
   (`valvePressesLeft`): when `addRowsRemaining ≤ valvePressesLeft` the row
   is a **completion row** that pairs every odd-count value at the
   bottom-most column, so the whole board can empty without further
   presses (retried up to 8 constructions, then tier-2 rescue: a single
   guaranteed wrap match + self-pairs, never a dead press). Level 1 sets
   the valve to 6 — **every** press is a completion row, which is the
   mechanical guarantee behind "Level 1 completes with 1 Add Row": the
   press either finishes the parity (board clears to empty) or leaves a
   fully paired, clear-completable board. Hard levels keep the valve at 2
   so mid-game presses carry decoy friction.

The rng stream is `mulberry32(((seed % 16) ^ (moveCount + 1)) >>> 0)`, so
the whole run — including every Add Row — is deterministic. The stream is
**normalized on the pool index** (`seed % 16`): every seed that serves the
same pooled board deals exactly the same rows. That is what makes the
offline gate-to-runtime bridge airtight — a board validated at bake time
behaves identically under every runtime seed that can reach it.

### Human-Perception Time Model

The assignment's "target time" is a *statistical envelope*, not a timer —
the game has no clock. `simulator.ts` models how a human actually plays,
so the envelope is measurable:

| Constant | Value | Meaning |
| -------- | ----- | ------- |
| `moveBase` | 1.2s | read + tap + confirm one move |
| `perInspect` | 0.3s | each cell inspected before the first match registers |
| `addRow` | 3.5s | deliberation + repositioning for one press |
| `invalidTap` | 2.0s | a mis-tap (counted, no state change) |
| `start` | 1.5s | reading the board before the first move |
| `scanWindow` | 14 | cells before a match stops being "visible" |
| `fatigueDepth` | 16 | beyond this the player presses (+) out of impatience |

The scan model (`humanScan`) walks cells in reading order from a random
attention point; the first match spotted at depth `k` costs
`1.2 + 0.3k` seconds. Same-value pairs register −0.5 cells faster,
diagonal +1, wrap +2 (harder to notice). Beyond the scan window the
player may mis-tap (40%); beyond the fatigue depth they press (+) (35%).
This makes measured time **board-driven**: clustered L1 boards finish near
35s, buried L10 boards stretch past 80s at the p90.

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

| Level | Target time (s) | Within-time bar | Density ≥ | Add Row mix (imm/def/dec) | Valve (presses) | Typical Add Rows |
| ----- | --------------- | --------------- | --------- | ------------------------- | --------------- | ---------------- |
| 1     | 45              | 90%             | 0.70      | 70 / 30 / 0               | 6 (all presses) | 1                |
| 2     | 70              | 95%             | 0.60      | 60 / 35 / 5               | 5               | 1                |
| 3     | 90              | 95%             | 0.50      | 50 / 40 / 10              | 4               | 1–3              |
| 4     | 120             | 95%             | 0.45      | 45 / 45 / 10              | 3               | 1–3              |
| 5     | 150             | 95%             | 0.38      | 40 / 45 / 15              | 2               | 1–3              |
| 6     | 90              | 95%             | 0.50      | 50 / 40 / 10              | 4               | 1–3 ← relief     |
| 7     | 165             | 95%             | 0.42      | 35 / 45 / 20              | 3               | 1–3              |
| 8     | 180             | 95%             | 0.34      | 30 / 45 / 25              | 2               | 1–3              |
| 9     | 195             | 95%             | 0.30      | 25 / 45 / 30              | 2               | 1–3              |
| 10    | 210             | 95%             | 0.25      | 20 / 45 / 35              | 2               | 1–3              |
| 11    | 100             | 95%             | 0.48      | 50 / 40 / 10              | 4               | 1–3 ← relief     |

Levels 1–5 climb, 6 drops back to ~Level 3, 7–10 climb to a higher peak,
and 11 drops again. Every level keeps the 6-Add-Row budget.

`targetCompletionTime` is **not a timer** — there is no clock in the game.
It is the probabilistic envelope from the brief: "if 100 players play
Level 1, it should complete within 45s with ≥90% probability." It is
verified by simulating a cohort, not enforced at runtime. New per-level
fields make the contract explicit and gated:

- `withinTargetProbability` — the Level 1 table's 90% bar; every other
  level holds the mandatory 95% bar.
- `minMatchDensity` — the spec's "70% match density" for Level 1: the
  fraction of start cells already inside a legal match. Level 1 boards
  are gate-rejected below 0.70; the bar descends with difficulty.
- `valvePressesLeft` — the completion-valve window. Level 1's valve of 6
  is the "designed around 1 Add Row" contract: the FIRST press is already
  a completion row, so a Level 1 board clears to empty with one press.

## Verification: Monte Carlo harness (Phase 6)

`scripts/monte-carlo.ts` mass-simulates every level with two bots and
gates the difficulty contract with proper statistics:

- **heuristic bot** (perfect vision): P(win) Wilson 95% CI lower bound
  ≥ 0.95 per level; mean-moves CI half-width ≤ 1.
- **human bot** (`--bot human`, the human-perception model above):
  P(win) CI lower bound ≥ 0.95; **completion-within-target-time** CI
  lower bound ≥ `withinTargetProbability` (Level 1: 90% within 45s —
  the exact assignment metric); Level 1 additionally requires ≥ 88% of
  wins using exactly 1 Add Row.

Measured at **10,000 trials per level** (heuristic bot):

| Level | P(win) | Wilson 95% CI | Mean moves | Mean add rows |
| ----- | ------ | ------------- | ---------- | ------------- |
| 1     | 100.0% | [99.96%, 100%] | 18.1 | 1.03 |
| 2     | 100.0% | [99.96%, 100%] | 18.6 | 1.15 |
| 3     | 100.0% | [99.96%, 100%] | 19.9 | 1.49 |
| 4     | 99.99% | [99.94%, 100%] | 20.2 | 1.54 |
| 5     | 99.75% | [99.63%, 100%] | 21.3 | 1.82 |
| 6     | 100.0% | [99.96%, 100%] | 19.3 | 1.32 |
| 7     | 100.0% | [99.96%, 100%] | 19.6 | 1.41 |
| 8     | 99.52% | [99.36%, 100%] | 21.8 | 1.95 |
| 9     | 99.08% | [98.87%, 100%] | 24.1 | 2.53 |
| 10    | 98.48% | [98.22%, 100%] | 22.5 | 2.14 |
| 11    | 100.0% | [99.96%, 100%] | 19.4 | 1.36 |

Human-bot cohort at **10,000 trials per level** (what the Level 1 review
complaint is measured against):

| Level | P(win) | Win CI LB | ≤ target time | Time CI LB | p50 / p90 | Avg add rows | 1-press share |
| ----- | ------ | --------- | ------------- | ---------- | --------- | ------------ | ------------- |
| 1     | 100.0% | 100.0%    | 99.4% (≤45s)  | 99.2%      | 34.0/35.8 | 1.01 | 99.3% |
| 2     | 100.0% | 99.9%     | 99.7% (≤70s)  | 99.5%      | 35.6/45.2 | 1.14 | 87.8% |
| 3     | 99.9%  | 99.8%     | 99.8% (≤90s)  | 99.7%      | 37.1/58.0 | 1.34 | 81.3% |
| 4     | 100.0% | 99.9%     | 100.0% (≤120s)| 99.9%      | 37.0/57.2 | 1.34 | 81.3% |
| 5     | 99.6%  | 99.4%     | 99.6% (≤150s) | 99.4%      | 38.7/64.2 | 1.61 | 71.2% |
| 6     | 99.9%  | 99.9%     | 99.8% (≤90s)  | 99.7%      | 36.8/57.3 | 1.28 | 84.6% |
| 7     | 99.9%  | 99.8%     | 99.9% (≤165s) | 99.8%      | 36.8/46.9 | 1.21 | 88.8% |
| 8     | 99.6%  | 99.5%     | 99.6% (≤180s) | 99.5%      | 40.3/78.3 | 1.73 | 71.4% |
| 9     | 98.4%  | 98.1%     | 98.4% (≤195s) | 98.1%      | 45.2/87.2 | 2.27 | 55.9% |
| 10    | 98.3%  | 98.0%     | 98.3% (≤210s) | 98.0%      | 41.7/83.6 | 1.86 | 66.7% |
| 11    | 99.9%  | 99.8%     | 99.8% (≤100s) | 99.7%      | 38.8/57.0 | 1.30 | 82.4% |

Every level clears the **95%** bar with margin; Level 1 clears its 90%
within-45s bar at 99.2% (CI lower bound), with 99.3% of wins using a
single Add Row — the exact contract the reviewer measured. Run it locally:

```bash
npx -y tsx scripts/monte-carlo.ts              # 10k trials × all levels, heuristic
npx -y tsx scripts/monte-carlo.ts --bot human  # human-perception model + time gates
npx vitest run src/engine                      # CI-friendly gates
```

The **dedicated Level 1 statistical test** (`src/engine/__tests__/level1.test.ts`)
runs in CI: 10k human-model sessions gating P(win) ≥ 95%, within-45s ≥ 90%
(Wilson lower bounds), ≥ 88% one-press wins, avg time < 40s, and the
parity invariant that no win uses 0 presses.

## Anti-degenerate checks (Phase 7)

`scripts/naive-check.ts` plays every level with a **naive sweep bot** that
only sees ordinary adjacencies (horizontal / vertical / diagonal — never
wrap moves, never backtracks) and presses Add Row whenever it can't spot a
match. Because Add Row rows are normalized on the pool index, every
shipped Level 1 board is a deterministic naive win by construction — the
bake rejects any L1 board a mechanical beginner cannot clear. Measured at
1,000 seeds per level:

| Level | Naive solve rate | Gate |
| ----- | ---------------- | ---- |
| 1     | 100%             | ≥ 85% (deterministic: every baked L1 board is naive-winnable) |
| 8     | 56.3%            | ≤ 80% (mechanical play must NOT be enough) |
| 9     | 62.5%            | ≤ 80% |
| 10    | 68.8%            | ≤ 80% |
| 11    | 87.5%            | exempt (relief level) |

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
