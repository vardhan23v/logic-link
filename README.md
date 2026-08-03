<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TanStack_Start-1.168-FF4154?style=flat-square&logo=reactrouter" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.2-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Capacitor-8.4-119EFF?style=flat-square&logo=capacitor" alt="Capacitor" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

# Logic Link

A deterministic number-matching logic puzzle with progressive difficulty. Clear the board by pairing equal or sum-to-10 values, press **Add Row** when you are stuck, and climb 11 levels tuned by a constraint-first engine — not random chance.

Every board is **guaranteed solvable** before you see it. Difficulty comes from composition (buried pairs, decoy scrambling, helper generosity), not from bigger boards. The engine is framework-agnostic, pure, and reproducible: same seed, same board, every time.

---

## Features

- **27-cell boards** — 3 rows × 9 columns, fixed across all levels. Difficulty is mechanical, not visual.
- **11-level sawtooth curve** — rise (1→5), relief (6), rise (7→10), relief (11). Every level clears the mandatory 95% completion bar.
- **Deterministic engine** — constraint-first generation, fairness-validated boards, pure functions with zero React imports.
- **Engine simulator** — `scripts/simulate.ts` plays thousands of boards with a heuristic AI and reports completion rates, time percentiles, and Add-Row histograms. Wired into CI.
- **GitHub Pages SPA** — reproducible build with `npm run build:pages`, served under `/logic-link`.
- **Capacitor Android** — native Android wrapper via `@capacitor/android`, sharing the same engine.
- **Rescue mechanic** — two consecutive dead-end Add Rows trigger a deterministic rescue row that guarantees a legal match.

---

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Framework | [TanStack Start](https://tanstack.com/start) (React 19, Vite 8) |
| Styling | Tailwind CSS 4 |
| UI primitives | Radix UI, Lucide React, shadcn/ui |
| Engine | Pure TypeScript (`src/engine/`) — zero framework imports |
| Testing | Vitest |
| Mobile | Capacitor 8 (Android) |
| Lint / Format | ESLint 9 + Prettier |

---

## Project Structure

```
logic-link/
├── src/
│   ├── engine/               # Framework-agnostic puzzle engine
│   │   ├── types.ts          # Cell, Board, GameState, LevelConfig, BOARD_COLS
│   │   ├── index.ts          # Public API: createGame, applyMove, addRow, restart
│   │   ├── config/
│   │   │   └── levels.ts     # LEVEL_CONFIGS: 11-level sawtooth difficulty data
│   │   ├── generator.ts      # Constraint-first board generation pipeline
│   │   ├── solver.ts         # Fairness sampler + bounded DFS tiebreaker
│   │   ├── validator.ts      # Board acceptance gate (fairnessThreshold)
│   │   ├── addRow.ts         # Smart Add Row with cleanup priority
│   │   ├── rescue.ts         # Deterministic rescue row (2-dead-end trigger)
│   │   ├── straggler.ts      # Stranded-value detection for row cleanup
│   │   ├── matching.ts       # Legal-move enumeration (equal or sum-to-10)
│   │   ├── rng.ts            # Seeded PRNG for reproducible generation
│   │   ├── simulator.ts      # Heuristic AI player for difficulty verification
│   │   └── __tests__/        # Engine test suite (vitest run src/engine)
│   ├── components/           # React UI components (shadcn/ui)
│   ├── lib/                  # Shared utilities
│   └── routes/               # TanStack Start file-based routes
├── scripts/
│   ├── simulate.ts           # CLI harness: bun scripts/simulate.ts
│   └── spa-entry.mjs         # SPA fallback entry for GitHub Pages
├── docs/
│   └── ALGORITHM.md          # Full algorithm writeup with verification data
├── android/                  # Capacitor Android project
├── public/                   # Static assets (manifest, robots.txt)
├── package.json
├── vite.config.pages.ts      # GitHub Pages build config
└── README.md
```

The workspace also contains independent sub-projects (`Vard-AI`, `campus-compass`, `career-forge-pro`, `promptlab-sprint`, `vardhan23v`) that are not part of Logic Link.

---

## Local Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Run the engine test suite
npm test

# Lint and format
npm run lint
npm run format
```

### Engine Simulation

```bash
# 1000 trials across all 11 levels
bun scripts/simulate.ts

# Custom trials and level selection
bun scripts/simulate.ts --trials 2000 --levels 1,5,10
```

The simulator exits non-zero if any level falls below its `completionProbability` target (95%), so it can gate CI.

---

## Deployment

### GitHub Pages

```bash
npm run build:pages
```

This runs `vite build --config vite.config.pages.ts` then rewrites the SPA entry so client-side routing works under `/logic-link`. The output lands in `dist/client/`. Deploy that directory to GitHub Pages.

The build is **reproducible**: same commit, same output.

### Android (Capacitor)

```bash
# Sync the web build into the Android project
npx cap sync android

# Open in Android Studio
npx cap open android
```

Build and sign from Android Studio. The Capacitor wrapper loads the same engine and UI as the web build.

---

## Algorithm

See **[docs/ALGORITHM.md](docs/ALGORITHM.md)** for the full writeup: constraint-first generation, sawtooth difficulty curve, Add Row logic, rescue mechanic, simulation verification data, and enforced invariants.

---

## License

MIT