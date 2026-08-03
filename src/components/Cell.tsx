type Props = {
  value: number | null;
  selected: boolean;
  onClick: () => void;
};

/**
 * Subtle per-digit tint so players can scan for partners at a glance.
 * Complements share a hue family (1/9, 2/8, 3/7, 4/6) and 5 stands alone,
 * mirroring the sum-to-10 pairing rule.
 */
const VALUE_TINT: Record<number, string> = {
  1: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  9: "bg-sky-500/20 text-sky-800 dark:text-sky-200 border-sky-500/35",
  2: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
  8: "bg-violet-500/20 text-violet-800 dark:text-violet-200 border-violet-500/35",
  3: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  7: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/35",
  4: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
  6: "bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/35",
  5: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
};

export function Cell({ value, selected, onClick }: Props) {
  const empty = value === null;
  return (
    <button
      type="button"
      onClick={empty ? undefined : onClick}
      disabled={empty}
      className={[
        "aspect-square w-full rounded-lg font-mono text-[clamp(0.85rem,4vw,1.125rem)] font-bold tabular-nums",
        "flex items-center justify-center border transition-all duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        empty
          ? "border-transparent bg-transparent text-transparent"
          : selected
            ? "animate-pulse-ring scale-110 border-primary bg-primary text-primary-foreground shadow-[var(--shadow-elegant)]"
            : [
                "animate-cell-in shadow-[var(--shadow-cell)]",
                VALUE_TINT[value] ?? "border-border bg-card text-foreground",
                "hover:-translate-y-0.5 hover:border-primary/60 active:translate-y-0 active:scale-95",
              ].join(" "),
      ].join(" ")}
      aria-label={empty ? "empty cell" : `cell ${value}`}
    >
      {empty ? "" : value}
    </button>
  );
}
