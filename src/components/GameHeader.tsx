import type { GameState } from "@/engine";

type Props = {
  game: GameState;
  legalMoveCount: number;
};

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={[
          "font-mono text-xl font-bold tabular-nums",
          accent ? "text-primary" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

export function GameHeader({ game, legalMoveCount }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Level" value={game.level} accent />
      <Stat label="Moves" value={game.moveCount} />
      <Stat label="Add rows" value={game.addRowsRemaining} />
      <Stat label="Legal" value={legalMoveCount} />
    </div>
  );
}
