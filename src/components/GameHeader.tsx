import type { GameState } from "@/engine";

type Props = {
  game: GameState;
  legalMoveCount: number;
};

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
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

/** Six pips, one per Add Row in the budget; filled = still available. */
function AddRowPips({ remaining }: { remaining: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${remaining} add rows remaining`}>
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className={[
            "h-2.5 w-2.5 rounded-full transition-colors",
            i < remaining ? "bg-primary" : "bg-border",
          ].join(" ")}
        />
      ))}
    </span>
  );
}

export function GameHeader({ game, legalMoveCount }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Level" value={game.level} accent />
      <Stat label="Matches made" value={game.moveCount} />
      <Stat label="Add rows left" value={<AddRowPips remaining={game.addRowsRemaining} />} />
      <Stat label="Moves open" value={legalMoveCount} />
    </div>
  );
}
