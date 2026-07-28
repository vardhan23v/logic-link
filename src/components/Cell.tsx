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
        "h-10 w-10 rounded-md text-base font-semibold transition-colors",
        "flex items-center justify-center border",
        empty
          ? "border-transparent bg-transparent text-transparent"
          : selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
      ].join(" ")}
      aria-label={empty ? "empty cell" : `cell ${value}`}
    >
      {empty ? "" : value}
    </button>
  );
}
