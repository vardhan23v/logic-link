# Logic Link — Algorithm Writeup

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

## Part A — Seeding (Board Generation)

Constraint-first pipeline (`generator.ts`):

1. **Load `LevelConfig`** (`config/levels.ts`) — one config per level.
   Difficulty is data, not code.
2. **Pair Graph** (`pairGraph.ts`) — pick N legal value pairs (equal or
   sum-to-10) sized to the level's `initialCellCount`.
3. **Constraint Graph** (`constraintGraph.ts`) — annotate each pair with
   `direct | buried` and clustering hints, weighted by the level config.
4. **Placement** (`boardLayout.ts`) — place pairs into a rectangular
   9-column board. In MVP each pair occupies two reading-order slots so
   it is adjacent by construction (wrap-around means "last cell of row R,
   first cell of row R+1" is a legal adjacency). This makes the board
   **solvable by construction**, not by rejection sampling.
5. **Decoy Injection** (`decoys.ts`) — a validated seam for higher levels
   to swap non-critical values to increase scanning cost without breaking
   solvability.
6. **Validate** (`validator.ts` + `solver.ts`) — DFS solver with a
   transposition table keyed by a canonical board hash. A fairness
   sampler replays several seeded move orders; if the fraction of
   orderings that stay solvable drops below the level's
   `fairnessThreshold`, the board is rejected.
7. **Retry** with a deterministically-bumped seed. Retries are a
   safety net; the constraint-first placement almost always succeeds.

Randomness is only used to pick among valid, pre-constrained choices —
never to decide whether a board is solvable.

## Part B — Add Row Logic

`addRow.ts` + `rescue.ts`. When the player presses `(+)`:

1. **Analyze** the board via `straggler.ts` to find stranded values
   (cells whose only remaining partner is a specific complement).
2. **Generate** a 9-cell row that:
   - front-loads complements of stranded values (cleanup),
   - fills remaining slots from the level's pair pool,
   - prefers completing pairs over lengthening the board.
3. **Validate** the resulting board is still solvable
   (`isAddRowAcceptable` runs the solver with a node cap).
4. **Fallback** to a deterministic **Rescue Row** if validation fails
   or if the rescue counter is triggered.

### Rescue Mechanic

`GameState.rescueCounter` increments every time an Add Row produces
**zero** new legal moves. When it reaches `RESCUE_THRESHOLD = 2`, the
next `addRow` call bypasses the smart generator and emits a
`generateRescueRow(board)` that complements the last non-empty cell —
guaranteeing at least one immediate legal match via wrap-around
adjacency. The counter resets on success.

### Straggler Cleanup

`straggler.ts` scans for values whose only remaining live partner is
their complement. The Add-Row generator uses that list as its top
priority when choosing the first cells of the new row, so isolated
cells get cleared rather than accumulating.

## Sawtooth Difficulty (`config/levels.ts`)

Difficulty is expressed by `initialCellCount` (scanning cost),
`buriedPairWeight`, `decoyWeight`, and `matchDensity`. The result:

| Level | Cells | Target time (s) | Typical Add Rows |
| ----- | ----- | --------------- | ---------------- |
| 1     | 22    | 45              | 1                |
| 2     | 24    | 65              | 1–2              |
| 3     | 26    | 90              | 2                |
| 4     | 28    | 120             | 2–3              |
| 5     | 30    | 150             | 2–3              |
| 6     | 26    | 90              | 2   ← relief     |
| 7     | 28    | 140             | 2–3              |
| 8     | 30    | 165             | 3                |
| 9     | 32    | 185             | 3–4              |
| 10    | 34    | 210             | 3–4              |

Every level keeps the 6-Add-Row budget. Level 6 mirrors Level 3 with
slightly more decoys — the "breath of fresh air" without repeating.

## Invariants (enforced by tests)

- Every generated board is solvable.
- Add Row never creates an unsolvable board.
- Rescue always guarantees ≥1 legal move.
- `≥ fairnessThreshold` of legal move orderings remain solvable.
- Add-Row budget is never silently exceeded.
- Public engine APIs stay backward compatible.

## Determinism & Reproducibility

`GameState.seed` is carried through every transition. `createGame(level, seed)`
with the same `(level, seed)` always produces the same board, and any
`applyMove` / `addRow` sequence is fully reproducible — critical for
bug reports, replay, and automated difficulty tuning.
