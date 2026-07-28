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
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Level</span>
        <select
          className="rounded-md border border-input bg-background px-2 py-1"
          value={level}
          onChange={(e) => onLevelChange(Number(e.target.value))}
        >
          {LEVEL_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onAddRow}
        disabled={disabled || !canAddRow}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        Add Row (+)
      </button>
      <button
        type="button"
        onClick={onRestart}
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        Restart
      </button>
    </div>
  );
}
