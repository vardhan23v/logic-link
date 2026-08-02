type Props = {
  value: number | null;
  selected: boolean;
  onClick: () => void;
  /** Size in px — shrinks with level (see config/difficulty.ts). */
  sizePx?: number;
  /** Transition duration in ms — faster on higher levels. */
  animationMs?: number;
};

export function Cell({ value, selected, onClick, sizePx = 44, animationMs = 150 }: Props) {
  const empty = value === null;
  const fontPx = Math.max(12, Math.round(sizePx * 0.42));
  return (
    <button
      type="button"
      onClick={empty ? undefined : onClick}
      disabled={empty}
      className={[
        "rounded-lg font-mono font-bold tabular-nums",
        "flex items-center justify-center border transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        empty
          ? "border-transparent bg-transparent text-transparent"
          : selected
            ? "border-primary bg-primary text-primary-foreground scale-95 shadow-[var(--shadow-elegant)]"
            : "border-border bg-card text-foreground shadow-[var(--shadow-cell)] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent active:translate-y-0",
      ].join(" ")}
      style={{ height: sizePx, width: sizePx, fontSize: fontPx, transitionDuration: `${animationMs}ms` }}
      aria-label={empty ? "empty cell" : `cell ${value}`}
    >
      {empty ? "" : value}
    </button>
  );
}
