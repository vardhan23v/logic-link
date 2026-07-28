import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useGame } from "@/hooks/useGame";
import { Board } from "@/components/Board";
import { GameControls } from "@/components/GameControls";
import { GameHeader } from "@/components/GameHeader";
import { StatusBanner } from "@/components/StatusBanner";

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
  const { game, selectCell, addRow, restart, legalMoves, isWon, isLost } = useGame(level);

  const handleLevelChange = (nextLevel: number) => {
    setLevel(nextLevel);
    restart(nextLevel);
  };

  const handleRestart = () => restart(level);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Number Match</h1>
        <p className="text-sm text-muted-foreground">
          Tap two cells that either match, or sum to 10. Matches work horizontally, vertically,
          diagonally, and wrap from the last cell of a row to the first cell of the next row.
          Empty cells are skipped along each line.
        </p>
      </header>

      <GameHeader game={game} legalMoveCount={legalMoves.length} />
      <GameControls
        level={level}
        onLevelChange={handleLevelChange}
        onAddRow={addRow}
        onRestart={handleRestart}
        canAddRow={game.addRowsRemaining > 0}
        disabled={isWon || isLost}
      />

      <div className="overflow-auto">
        <Board game={game} onSelect={selectCell} />
      </div>

      <StatusBanner status={game.status} onRestart={handleRestart} />
    </main>
  );
}
