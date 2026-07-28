
Implement this as a production-quality React + TypeScript application using TanStack Start. The gameplay engine must be framework-agnostic TypeScript, while the UI must be built entirely with React components and hooks.

# MVP: Playable Deterministic Number Match (Levels 1–3)

## Technology Stack (Mandatory)

Required stack:

- React 19
- TypeScript
- TanStack Start
- TanStack Router
- TanStack Query (if needed)
- Vite
- Vitest
- PWA Manifest
- Plain CSS via existing `src/styles.css` semantic tokens (no additional UI framework)

Do NOT rewrite the application using Vue, Angular, Svelte, Solid, Next.js, or any other framework.

The gameplay engine is a pure TypeScript library inside `src/engine/` with **no React dependencies**. React only handles rendering, user interaction, state synchronization, animations (later), and navigation. The engine must be UI-independent so it can later be reused by React Web, React Native, Capacitor, Electron, an AI simulator, and automated testing.

## Engine Invariants

- Every generated board is solvable.
- Add Row never creates an unsolvable board.
- Rescue always guarantees at least one legal move.
- Difficulty stays within the configured level envelope.
- The share of legal solving orders that remain solvable stays at or above the level's configured fairness threshold.
- No operation may silently violate the configured Add Row budget.
- Public engine APIs remain backward compatible across future iterations.

## Gameplay rules (locked)

- 9-column grid, starts with 3 populated rows.
- Two cells match if equal OR sum = 10. Directions: horizontal, vertical, diagonal, wrap-around (last cell of a row ↔ first cell of next row).
- **Cleared cells are transparent to adjacency.** Empty cells are skipped along each direction; the first non-empty cell encountered is the adjacency partner.
- **Clearing:** both matched cells removed simultaneously. No auto-chain.
- **Row lifecycle:** a fully empty row is removed and rows below shift up.
- **Add Row (+):** always appends to the bottom. Max 6 per level.
- Win: board empty. Lose: Add Row budget spent AND no legal moves remain.

## Architecture (`src/engine/`)

```text
engine/
  types.ts              // Cell, Board, Pair, Move, LevelConfig, GameState, CellPosition
  config/levels.ts      // Level 1–3 configs
  rng.ts                // mulberry32 seeded PRNG
  matching.ts           // isMatchPair, lineNeighbors (skip-empties), findAllLegalMoves
  pairGraph.ts          // ordered legal pair pool
  constraintGraph.ts    // adjacency + burial + clustering constraints
  boardLayout.ts        // constraint-satisfying placement
  decoys.ts             // constrained decoy fill
  solver.ts             // DFS + transposition table + fairness sampler
  validator.ts          // solvability + fairness + difficulty-envelope checks
  generator.ts          // orchestrates constraint-first pipeline
  addRow.ts             // analyze → goal → generate → multi-criteria validate
  rescue.ts             // frustration counter, guaranteed-match generator
  straggler.ts          // sparse-row detection
  index.ts              // stable public API
```

## React Project Structure

```text
src/
  engine/               // pure TS, no React imports
  hooks/
    useGame.ts
    useBoard.ts
  components/
    Board.tsx
    Cell.tsx
    GameHeader.tsx
    GameControls.tsx
    StatusBanner.tsx
  routes/
    index.tsx           // landing → links to /play
    play.tsx            // playable game
  styles/
  utils/
```

## React Architecture

The React app is a thin presentation layer. Business logic never lives inside React components. Components must never generate boards, detect matches, solve puzzles, validate boards, or generate Add Rows.

```text
React UI → useGame() → Engine API → Game Engine → Updated GameState → React re-render
```

The engine owns all gameplay logic. React only displays `GameState`.

## Public Engine API (`src/engine/index.ts`)

```ts
createGame(level: number): GameState;
applyMove(game: GameState, firstCell: CellPosition, secondCell: CellPosition): GameState;
addRow(game: GameState): GameState;
restart(level: number): GameState;
getLegalMoves(game: GameState): Move[];
getBoard(game: GameState): Board;
isGameWon(game: GameState): boolean;
isGameLost(game: GameState): boolean;
```

All functions are pure and deterministic given the same inputs (including the seed carried inside `GameState`).

## Board & GameState (minimum stable contract)

```ts
type CellPosition = { row: number; col: number };

type Cell = {
  id: string;
  value: number | null; // null = cleared
};

type Board = Cell[][];

type GameState = {
  board: Board;
  level: number;
  seed: number;
  addRowsRemaining: number;
  selectedCells: CellPosition[];
  status: "playing" | "won" | "lost";
  moveCount: number;
  rescueCounter: number;
  history: Move[];
};
```

The board is always represented as a rectangular 2D array. Empty (cleared) cells remain as `null` until an entire row is removed. Row removal is the only operation that changes the board dimensions. Cell `id` is stable across state transitions so React keys and animations remain consistent.

Additional fields may be added later; existing fields must not change meaning or type.

## Error Handling

The public engine API should not throw exceptions for normal gameplay.

- Invalid moves return an unchanged `GameState`.
- Invalid Add Row requests after the budget is exhausted return an unchanged `GameState`.
- Invalid coordinates return an unchanged `GameState`.
- Unexpected internal failures during generation may throw descriptive errors, as they indicate implementation bugs rather than gameplay events.

## React State

Keep React state minimal.

```ts
const [game, setGame] = useState<GameState>();
```

Everything else derives from `GameState`. No duplicate state. No storing board cells separately. Avoid `useEffect` unless necessary. `useGame()` wraps the engine calls and exposes `game`, `applyMove`, `addRow`, `restart`, `legalMoves`, `isWon`, `isLost`.

## Component Tree

```text
<App>
  <GameHeader />
  <Board>
    <Cell />
  </Board>
  <GameControls />
  <StatusBanner />
</App>
```

Each component has a single responsibility.

## Generation pipeline (constraint-first)

1. Load `LevelConfig`.
2. Generate **Pair Graph** sized by `matchDensity`.
3. Build **Constraint Graph** (adjacency direction, burial depth, cluster group).
4. **Place mandatory pairs** via backtracking.
5. **Reserve future helper opportunities**.
6. **Inject decoys under constraints**.
7. **Validate** (solver + fairness + envelope).
8. Retry only on validation failure.

## Solver & order-independent fairness

- DFS over legal moves with a transposition table keyed by a canonical board hash.
- Fairness sampler evaluates multiple seeded legal move orderings.
- The validator estimates the percentage of legal move orderings that remain solvable.
- Reject a board only if the solvable-order percentage falls below the configured `fairnessThreshold` for that level (e.g. 90–95% for beginner levels, gradually decreasing for harder levels).

## Smart Add Row

Analyze → detect goal (Immediate / Future / Cleanup / Controlled Decoy) → generate 9-cell row → validate all of:

- preserves solvability,
- stays within level's difficulty envelope,
- respects level's expected Add Row usage distribution,
- prioritizes stranded numbers from `straggler`,
- avoids excessive new rows (prefer pair completion over lengthening).

On failure, fall through to Rescue.

## Rescue

Frustration counter increments on any Add Row producing zero new legal matches. At threshold = 2, next Add Row guarantees an immediate legal match adjacent to an existing non-empty cell. Counter resets on success.

## LevelConfig (future-proof)

```ts
type LevelConfig = {
  id: number;
  difficultyScore: number;
  matchDensity: number;
  directPairWeight: number;
  buriedPairWeight: number;
  clusteringWeight: number;
  decoyWeight: number;
  helperStrength: number;
  cleanupPriority: number;
  expectedAddRowDistribution: number[];
  targetCompletionTime: number;   // seconds
  completionProbability: number;  // 0..1
  fairnessThreshold: number;      // min share of legal orderings that must remain solvable
  seedStrategy: "levelOnly" | "ruleBasedVaried";
  addRowBudget: number;           // hard cap (6)
};
```

**`seedStrategy` semantics:**

- `levelOnly` — same level id always produces the same board.
- `ruleBasedVaried` — fresh board every play from a seeded PRNG + deterministic procedural constraints. Seed may vary per session; the board must always fall within the configured difficulty envelope. Randomness never determines solvability or difficulty — only variation among pre-validated layouts.

## UI (minimal, `/play`)

- Grid of `Cell` buttons; tap two cells to attempt a match. Invalid selection clears.
- Level select 1–3, Add Row button with remaining budget, win/lose banner, restart.
- Home route `/` becomes a short landing linking to `/play`.
- Semantic tokens only from `styles.css`.

## PWA (manifest-only)

- `public/manifest.webmanifest` with name, short_name, theme_color, background_color, `display: standalone`, icons.
- Head tags in `__root.tsx` for manifest + theme-color + apple-touch-icon.
- No service worker.

## Performance Targets

For Levels 1–3:

- Board generation should typically complete in under 50 ms.
- Move validation should feel instantaneous.
- Add Row generation should typically complete in under 50 ms.
- The UI should remain responsive throughout gameplay.

Optimisations must preserve correctness before improving speed.

## Tests (vitest)

- `matching.test.ts` — pair rule, wrap-around, diagonal, skip-empties adjacency.
- `solver.test.ts` — hand-crafted solvable and unsolvable boards.
- `generator.test.ts` — 200 generations per level 1–3 all pass validator; retry count stays low.
- `addRow.test.ts` — never produces unsolvable state; respects envelope; rescue always yields ≥1 legal move.
- `errorHandling.test.ts` — invalid moves, invalid coords, and over-budget Add Row return an unchanged `GameState` without throwing.
- `invariants.test.ts` — property-style checks across randomized play sequences, including fairness-threshold compliance and immutability of inputs.

## Developer Notes

**Public API.** `engine/index.ts` exports the stable public API. Future additions must be additive. Avoid breaking existing function signatures. If a breaking change becomes unavoidable, introduce a versioned API (e.g. `engine/v2/index.ts`) rather than modifying existing exports.

Future work lands behind this boundary without breaking consumers:

- Levels 4–10 (add configs only).
- Sawtooth difficulty tuning (config-driven).
- AI-player simulator (consumes the public API).
- Analytics hooks (event emitter on state transitions).
- Difficulty balancing from simulator output.
- Native mobile wrapper (Capacitor).

## Out of scope this iteration

Levels 4–10, sawtooth tuning, AI simulator, analytics dashboard, polished graphics, APK build.

---

## Engine Principles

### Determinism before randomness

Randomness is never used to determine gameplay correctness. It may only select between multiple valid, pre-constrained choices. No PRNG call may directly decide whether a board is solvable, how difficult it is, or whether the player receives help.

### Constraint-first generation

The engine constructs valid boards rather than generating random boards and rejecting failures. Backtracking and constraint satisfaction are preferred over rejection sampling. Retries are a safety net, not the primary strategy.

### Configuration over code

Difficulty is driven entirely through `LevelConfig`. Adding new levels should primarily require configuration changes, not algorithm rewrites.

### Stable public API

Anything outside `src/engine/` communicates only through the public API exposed by `engine/index.ts`. Internal implementations may change without affecting consumers. Additions are additive; breaking changes go through a versioned API rather than mutating existing exports.

### Separation of responsibilities

One responsibility per module. `matching.ts` only determines legal moves; `solver.ts` only searches; `validator.ts` only verifies; `generator.ts` only orchestrates generation; `addRow.ts` only creates helper rows; `rescue.ts` only handles guaranteed recovery. No circular dependencies. The engine has zero React imports.

### Immutability

The engine never mutates `GameState` or `Board` in place. Every public API returns a new immutable `GameState`. React components must treat `GameState` as immutable. Structural sharing may be used internally for performance.

### Testability

Every module is independently testable. No hidden global state. Configuration and seeds are injected explicitly. Every algorithm produces deterministic results given the same config and seed.

### Extensibility

The architecture must allow future features — Levels 4–10, sawtooth tuning, AI simulation, analytics, multiplayer experiments, native wrappers — to be added without redesigning existing modules.

---

# Implementation Order (Mandatory)

Implement incrementally. Every phase must compile, pass tests, and leave the project in a working state before moving to the next phase.

## Phase 1 — Core Engine

Implement `types.ts`, `rng.ts`, `matching.ts`, `GameState`, the public API surface, basic immutable state transitions, and unit tests.

**Goal:** a manually-created board can be played correctly.

## Phase 2 — Solver

Implement the DFS solver, board hashing, transposition table, validator, and solver tests.

**Goal:** the engine can verify whether a board is solvable.

## Phase 3 — Generator

Implement the pair graph, constraint graph, board layout, decoy generation, retry strategy, and generator tests.

**Goal:** Levels 1–3 generate valid boards automatically.

## Phase 4 — Add Row

Implement Smart Add Row, Rescue, Straggler detection, and related tests.

**Goal:** every Add Row preserves solvability.

## Phase 5 — React UI

Implement `Board`, `Cell`, `useGame`, controls, status banner, level selection, and restart.

**Goal:** playable game in the browser.

## Phase 6 — PWA

Implement manifest, icons, and metadata.

**Goal:** installable web application.

## Phase 7 — Polish

Performance improvements, test coverage, documentation, code cleanup.

**Goal:** production-ready MVP.
