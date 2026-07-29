import { LEVEL_IDS } from "@/engine/config/levels";

type Props = {
  level: number;
  onLevelChange: (level: number) => void;
  onAddRow: () => void;
  onRestart: () => void;
  canAddRow: boolean;
  disabled: boolean;
};

export function GameControls({
  level,
  onLevelChange,
  onAddRow,
  onRestart,
  canAddRow,
  disabled,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Level
        </label>
        <select
          className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
          value={level}
          onChange={(e) => onLevelChange(Number(e.target.value))}
        >
          {LEVEL_IDS.map((id) => (
            <option key={id} value={id}>
              Level {id}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={onAddRow}
        disabled={disabled || !canAddRow}
        className="rounded-lg bg-[image:var(--gradient-primary)] px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-elegant)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
      >
        + Add Row
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        Restart
      </button>
    </div>
  );
}
