import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useGame } from "@/hooks/useGame";
import { Board } from "@/components/Board";
import { GameControls } from "@/components/GameControls";
import { GameHeader } from "@/components/GameHeader";
import { StatusBanner } from "@/components/StatusBanner";
import { DebugOverlay } from "@/components/DebugOverlay";
import { LEVEL_IDS } from "@/engine/config/levels";

function readQueryParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

function readSeedParam(): number | undefined {
  const raw = readQueryParam("seed");
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n >>> 0 : undefined;
}

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Play — Number Match" },
      {
        name: "description",
        content:
          "A deterministic number-matching puzzle. Match identical numbers or pairs that sum to 10 across rows, columns, diagonals, and wrap-around.",
      },
      { property: "og:title", content: "Play — Number Match" },
      {
        property: "og:description",
        content: "Deterministic number-matching puzzle with a fair, solvable engine.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlayPage,
});

const MAX_LEVEL = LEVEL_IDS[LEVEL_IDS.length - 1];

function PlayPage() {
  const [level, setLevel] = useState(1);
  const [debugOpen, setDebugOpen] = useState(() => readQueryParam("debug") !== null);
  const seedOverride = readSeedParam();
  const { game, selectCell, addRow, restart, legalMoves, isWon, isLost } = useGame(
    level,
    seedOverride,
  );

  const handleLevelChange = (nextLevel: number) => {
    setLevel(nextLevel);
    restart(nextLevel);
  };
  const handleRestart = () => restart(level);
  const handleNextLevel = level < MAX_LEVEL ? () => handleLevelChange(level + 1) : undefined;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6 sm:gap-6 sm:py-8 lg:grid-cols-[280px_1fr]">
        {/* Sidebar — below the board on mobile, beside it on desktop. */}
        <aside className="order-2 flex flex-col gap-4 lg:order-1">
          <div className="hidden flex-col gap-1 lg:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              Number Match
            </span>
            <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
              Logic Link
            </h1>
          </div>
          <GameControls
            level={level}
            onLevelChange={handleLevelChange}
            onAddRow={addRow}
            onRestart={handleRestart}
            addRowsRemaining={game.addRowsRemaining}
            disabled={isWon || isLost}
          />
          <div className="rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-2 font-sans font-semibold text-foreground">How to play</p>
            Tap two cells that <span className="text-foreground">match</span> or{" "}
            <span className="text-foreground">sum to 10</span>. Matches work horizontally,
            vertically, diagonally, and wrap from the end of a row to the start of the next. Empty
            cells are skipped. Clear every number to win — the Add Row button (
            <span className="text-foreground">6 per level</span>) deals a fresh row when you run out
            of moves.
          </div>
        </aside>

        {/* Main — board first on mobile. */}
        <section className="order-1 flex flex-col gap-4 lg:order-2">
          <div className="flex items-baseline justify-between lg:hidden">
            <h1 className="font-mono text-xl font-bold tracking-tight text-foreground">
              Logic Link
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              Number Match
            </span>
          </div>
          <GameHeader game={game} legalMoveCount={legalMoves.length} />
          <div className="relative rounded-2xl border border-border bg-secondary/40 p-3 sm:min-h-[19rem] sm:p-4">
            <div className="flex justify-center">
              <Board game={game} onSelect={selectCell} />
            </div>
            <StatusBanner game={game} onRestart={handleRestart} onNextLevel={handleNextLevel} />
          </div>
        </section>
      </div>
      <DebugOverlay game={game} open={debugOpen} onToggle={() => setDebugOpen((v) => !v)} />
    </main>
  );
}
