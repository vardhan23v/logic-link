import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useGame } from "@/hooks/useGame";
import { Board } from "@/components/Board";
import { GameControls } from "@/components/GameControls";
import { GameHeader } from "@/components/GameHeader";
import { StatusBanner } from "@/components/StatusBanner";
import { DebugOverlay } from "@/components/DebugOverlay";

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

function PlayPage() {
  const [level, setLevel] = useState(1);
  const [debugOpen, setDebugOpen] = useState(false);
  const { game, selectCell, addRow, restart, legalMoves, isWon, isLost } = useGame(level);

  const handleLevelChange = (nextLevel: number) => {
    setLevel(nextLevel);
    restart(nextLevel);
  };
  const handleRestart = () => restart(level);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              Number Match
            </span>
            <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
              Deterministic Engine
            </h1>
          </div>
          <GameControls
            level={level}
            onLevelChange={handleLevelChange}
            onAddRow={addRow}
            onRestart={handleRestart}
            canAddRow={game.addRowsRemaining > 0}
            disabled={isWon || isLost}
          />
          <div className="rounded-2xl border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-2 font-sans font-semibold text-foreground">How to play</p>
            Tap two cells that <span className="text-foreground">match</span> or{" "}
            <span className="text-foreground">sum to 10</span>. Matches work horizontally,
            vertically, diagonally, and wrap from the end of a row to the start of the next.
            Empty cells are skipped.
          </div>
        </aside>

        {/* Main */}
        <section className="flex flex-col gap-4">
          <GameHeader game={game} legalMoveCount={legalMoves.length} />
          <div className="rounded-2xl border border-border bg-secondary/40 p-4">
            <div className="overflow-auto">
              <Board game={game} onSelect={selectCell} />
            </div>
          </div>
          <StatusBanner status={game.status} onRestart={handleRestart} />
        </section>
      </div>
      <DebugOverlay game={game} open={debugOpen} onToggle={() => setDebugOpen((v) => !v)} />
    </main>
  );
}
