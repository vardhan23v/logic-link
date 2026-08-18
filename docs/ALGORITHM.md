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
behaves identically under every runtime seed that can reach it. The bridge
is byte-exact: the naive rig mirrors the live engine's `addRow` semantics
(moveCount counts moves only; dead presses accumulate `rescueCounter` and
switch to tier-1 rescue rows), verified identical to `createGame` + the
real transition on every shipped board.

### Human Playability Score (assignment §3–§5)

The solver answers "can this board eventually clear?" — the playability
scorer (`humanPlayability.ts`) answers "can a normal human SEE and play
it?" Both must pass; the solver is never replaced.

Every legal move gets a visibility score (geometry + value + gap penalty):

| Component | Points |
| --------- | ------ |
| horizontal / vertical / diagonal / wrap geometry | 10 / 9 / 7 / 5 |
| value match (same or sum-to-10) | 8 |
| gap-skip (only possible after prior removals) | −7 |

Board metrics from the scored moves:

- `obviousDensity` — tiles inside ≥1 direct non-wrap match (≥ `OBVIOUS_THRESHOLD` = 15): the spec's "65–75% useful/obvious" bar.
- `horizontalSamePairs` — instantly visible same-value side-by-side pairs.
- `independentChoices` — maximal tile-disjoint set of obvious moves: how many independent options exist right now (assignment §5 "multiple reasonable choices").
- `decoyTiles` — tiles in no legal move at all (near-miss dead weight).
- `wrapShare` — legal moves reachable only through wrap-around geometry.

Level 1's gate (`minObviousDensity: 0.65`, enforced in the validator AND
again at bake time): obvious density ≥ 0.65, ≥ 3 visible same-value
horizontal pairs, ≥ 2 independent choices, ≤ 1 dead tile, ≤ 15% wrap-only
moves. Hard levels disable the gate (their difficulty IS obscurity and wrap
play) — measured playability is recorded for every board and in the pool
payload, giving the whole sawtooth a playability mirror:

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| ----- | - | - | - | - | - | - | - | - | - | -- | -- |
| playability score | 107 | 84.5 | 70.3 | 61.6 | 49.1 | 66.4 | 64.3 | 42.0 | 34.9 | 31.4 | 54.3 |
| obvious density | 96.3% | 90.3% | 85.4% | 85.6% | 80.6% | 83.1% | 87.0% | 77.5% | 75.9% | 75.7% | 83.1% |

The curve falls 107 → 31 across the climb, pulls back at the L6 and L11
relief levels, and every Level 1 board sits at 88–100% obvious density with
12–13 independent choices right from the start tile.

### Different-Player-Choice Simulation (assignment §6)

A mathematically solvable board must also survive the player picking a
different valid match than the intended path. `simulator.ts` simulates four
strategies (§6 A–D) with the same human-perception time model — only the
CHOICE differs:

- **greedy** — best visible match every time (best case).
- **semi-random** — prefers the best visible match, 25% of the time any
  other visible legal match ("prefer obvious but sometimes choose another").
- **imperfect** — 25% of the time a deliberately worse visible match.
- **random** — a uniformly random legal match: the chaos stress test.

The scan-cost model charges time for NOTICING a match (the shallowest
visible move); choosing a different visible match costs only a brief
glance-around (+1–3 cells), because a human who spots a pair taps it in
~1–2s regardless of which one it is. Gates: every strategy must stay
recoverable (P(win) ≥ 95%); the normal-human cohort additionally must hit
the 45s / ~1-press bars; the random strategy is time-report-only — a
chaotic tapper is slow by definition, not by board design.

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
| 1     | 100.0% | [99.96%, 100%] | 18.0 | 1.01 |
| 2     | 100.0% | [99.96%, 100%] | 18.5 | 1.13 |
| 3     | 99.99% | [99.94%, 100%] | 19.7 | 1.42 |
| 4     | 99.88% | [99.79%, 100%] | 20.6 | 1.64 |
| 5     | 99.79% | [99.68%, 100%] | 20.9 | 1.73 |
| 6     | 100.0% | [99.96%, 100%] | 19.1 | 1.28 |
| 7     | 99.95% | [99.88%, 100%] | 20.3 | 1.57 |
| 8     | 99.73% | [99.61%, 100%] | 21.6 | 1.90 |
| 9     | 99.14% | [98.94%, 100%] | 23.0 | 2.24 |
| 10    | 98.88% | [98.65%, 100%] | 23.1 | 2.28 |
| 11    | 99.99% | [99.94%, 100%] | 19.6 | 1.40 |

Human-bot cohort at **10,000 trials per level** (what the Level 1 review
complaint is measured against):

| Level | P(win) | Win CI LB | ≤ target time | Time CI LB | p50 / p90 | Avg add rows | 1-press share |
| ----- | ------ | --------- | ------------- | ---------- | --------- | ------------ | ------------- |
| 1     | 100.0% | 99.9%     | 99.3% (≤45s)  | 99.1%      | 34.3/36.2 | 1.01 | 99.2% |
| 2     | 100.0% | 99.9%     | 99.8% (≤70s)  | 99.6%      | 35.3/40.1 | 1.11 | 90.7% |
| 3     | 99.9%  | 99.8%     | 99.8% (≤90s)  | 99.7%      | 36.6/53.6 | 1.27 | 84.9% |
| 4     | 99.9%  | 99.8%     | 99.9% (≤120s) | 99.8%      | 37.7/60.8 | 1.42 | 78.5% |
| 5     | 99.6%  | 99.5%     | 99.6% (≤150s) | 99.5%      | 39.5/67.2 | 1.63 | 70.4% |
| 6     | 99.9%  | 99.8%     | 99.8% (≤90s)  | 99.6%      | 36.6/56.7 | 1.29 | 83.2% |
| 7     | 99.9%  | 99.8%     | 99.9% (≤165s) | 99.8%      | 37.0/49.9 | 1.27 | 86.3% |
| 8     | 99.6%  | 99.4%     | 99.6% (≤180s) | 99.4%      | 40.1/82.3 | 1.78 | 71.7% |
| 9     | 98.4%  | 98.1%     | 98.4% (≤195s) | 98.1%      | 43.4/85.8 | 2.17 | 56.0% |
| 10    | 98.1%  | 97.8%     | 98.1% (≤210s) | 97.8%      | 42.5/88.0 | 2.19 | 58.5% |
| 11    | 99.9%  | 99.9%     | 99.9% (≤100s) | 99.8%      | 38.1/55.6 | 1.26 | 85.0% |

Every level clears the **95%** bar with margin; Level 1 clears its 90%
within-45s bar at 99.1% (CI lower bound), with 99.2% of wins using a single
Add Row — the exact contract the reviewer measured. Run it locally:

```bash
npx -y tsx scripts/monte-carlo.ts              # 10k trials × all levels, heuristic
npx -y tsx scripts/monte-carlo.ts --bot human  # human-perception model + time gates
npx -y tsx scripts/level1-proof.ts 20000       # dedicated L1 proof (45s + 1 press + playability + strategies)
npx vitest run src/engine                      # CI-friendly gates
```

The **dedicated Level 1 statistical test** (`src/engine/__tests__/level1.test.ts`)
runs in CI: 10k human-model sessions gating P(win) ≥ 95%, within-45s ≥ 90%
(Wilson lower bounds), ≥ 88% one-press wins, avg time < 40s, and the
parity invariant that no win uses 0 presses. The same file runs all four
player strategies at 10k trials each: the normal-human cohort must clear
the 45s/90%/85% bars, and the random chaos strategy must stay recoverable
(win ≥ 95%).

## Anti-degenerate checks (Phase 7)

`scripts/naive-check.ts` plays every level with a **naive sweep bot** that
only sees ordinary adjacencies (horizontal / vertical / diagonal — never
wrap moves, never backtracks) and presses Add Row whenever it can't spot a
match. The gradient is **construction-based**, not sampled: the baker
rejects any Level 1 board the naive bot cannot clear, and rejects every
L8–L10 board the naive bot CAN clear — so the cohort rates below are exact
for any trial count. The rig mirrors the live engine byte-for-byte
(moveCount semantics + rescueCounter accumulation), verified identical to
the real `createGame` path on every shipped board:

| Level | Naive solve rate | Gate |
| ----- | ---------------- | ---- |
| 1     | 100%             | ≥ 85% (every baked L1 board is naive-winnable by construction) |
| 8     | 0%               | ≤ 80% (every baked board stumps mechanical play by construction) |
| 9     | 0%               | ≤ 80% |
| 10    | 0%               | ≤ 80% |
| 11    | 81.3%            | exempt (relief level) |

## Invariants (enforced by tests)

- Every generated board is 3 rows × 9 columns with exactly 27 live cells.
- Every baked pool board is winnable within the 6-row budget
  (`isWinnableWithinBudget`).
- Every baked board satisfies both the solver witness AND its level's
  human-playability contract (Level 1: obvious density ≥ 0.65, ≥ 3 visible
  same-value pairs, ≥ 2 independent choices, ≤ 1 dead tile, ≤ 15% wraps).
- Add Row never creates an unwinnable board (valve on presses 5–6).
- Rescue always guarantees ≥1 legal move (tier 1 = several).
- Accepted boards score `≥ fairnessThreshold` on the playout sampler.
- Add-Row budget (6) is never silently exceeded.
- Completion rate CI lower bound ≥ 95% per level in Monte Carlo.
- Every player-strategy (greedy, semi-random, imperfect, random) completes
  Level 1 at ≥ 95% — different valid choices never break the game.
- Naive sweep solves L1 by construction and fails L8–L10 by construction.
- Undo round-trips moves and Add Row presses; persistence round-trips a
  mid-game state with its full history.

## Determinism & Reproducibility

`GameState.seed` is carried through every transition. `createGame(level,
seed)` with the same `(level, seed)` always produces the same board, and
any `applyMove` / `addRow` sequence is fully reproducible — critical for
bug reports, replay, and automated difficulty tuning.
