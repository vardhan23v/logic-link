import { LEVEL_IDS, getLevelConfig } from "@/engine/config/levels";

/** A level is "relief" when it is easier than the one before it (sawtooth dip). */
function isReliefLevel(id: number): boolean {
  const idx = LEVEL_IDS.indexOf(id);
  if (idx <= 0) return false;
  return getLevelConfig(id).difficultyScore < getLevelConfig(LEVEL_IDS[idx - 1]).difficultyScore;
}

type Props = {
  level: number;
  onLevelChange: (level: number) => void;
  onAddRow: () => void;
  onRestart: () => void;
  onUndo: () => void;
  canUndo: boolean;
  addRowsRemaining: number;
  disabled: boolean;
};

export function GameControls({
  level,
  onLevelChange,
  onAddRow,
  onRestart,
  onUndo,
  canUndo,
  addRowsRemaining,
  disabled,
}: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Level
        </span>
        <div className="grid grid-cols-6 gap-1.5">
          {LEVEL_IDS.map((id) => {
            const relief = isReliefLevel(id);
            const active = id === level;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onLevelChange(id)}
                title={relief ? `Level ${id} — relief level` : `Level ${id}`}
                className={[
                  "h-9 rounded-lg border font-mono text-sm font-semibold transition-all",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-elegant)]"
                    : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent",
                ].join(" ")}
              >
                {id}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onAddRow}
        disabled={disabled || addRowsRemaining <= 0}
        className="rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
      >
        + Add Row
        <span className="ml-2 rounded-md bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-xs">
          {addRowsRemaining}
        </span>
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        Restart
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={disabled || !canUndo}
        className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-40"
      >
        Undo
      </button>
    </div>
  );
}
