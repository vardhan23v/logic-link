type Props = {
  value: number | null;
  selected: boolean;
  onClick: () => void;
};

export function Cell({ value, selected, onClick }: Props) {
  const empty = value === null;
  return (
    <button
      type="button"
      onClick={empty ? undefined : onClick}
      disabled={empty}
      className={[
        "h-11 w-11 rounded-lg font-mono text-lg font-bold tabular-nums",
        "flex items-center justify-center border transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        empty
          ? "border-transparent bg-transparent text-transparent"
          : selected
            ? "border-primary bg-primary text-primary-foreground scale-95 shadow-[var(--shadow-elegant)]"
            : "border-border bg-card text-foreground shadow-[var(--shadow-cell)] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent active:translate-y-0",
      ].join(" ")}
      aria-label={empty ? "empty cell" : `cell ${value}`}
    >
      {empty ? "" : value}
    </button>
  );
}
