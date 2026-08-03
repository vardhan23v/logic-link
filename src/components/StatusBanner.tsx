import type { GameState } from "@/engine";

type Props = {
  game: GameState;
  onRestart: () => void;
  onNextLevel?: () => void;
};

/** Full-board overlay shown on win/loss with run stats and next actions. */
export function StatusBanner({ game, onRestart, onNextLevel }: Props) {
  if (game.status === "playing") return null;
  const won = game.status === "won";
  const addRowsUsed = 6 - game.addRowsRemaining;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-sm">
      <div
        role="status"
        className="animate-overlay-in mx-4 flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-elegant)]"
      >
        <span className="text-4xl">{won ? "🎉" : "🧩"}</span>
        <div>
          <div className="text-lg font-bold text-foreground">
            {won ? `Level ${game.level} cleared!` : "Out of moves"}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {won
              ? `${game.moveCount} matches · ${addRowsUsed} add ${addRowsUsed === 1 ? "row" : "rows"} used`
              : "The board locked up with no add rows left."}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2">
          {won && onNextLevel && (
            <button
              type="button"
              onClick={onNextLevel}
              className="rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Next level →
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className={[
              "rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
              won && onNextLevel
                ? "border border-input bg-background text-foreground hover:bg-accent"
                : "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elegant)] hover:brightness-110",
            ].join(" ")}
          >
            {won ? "Replay level" : "Try again"}
          </button>
        </div>
      </div>
    </div>
  );
}
