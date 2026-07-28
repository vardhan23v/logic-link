type Props = {
  status: "playing" | "won" | "lost";
  onRestart: () => void;
};

export function StatusBanner({ status, onRestart }: Props) {
  if (status === "playing") return null;
  const won = status === "won";
  return (
    <div
      role="status"
      className={[
        "rounded-md border px-4 py-3 text-sm",
        won
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-destructive/40 bg-destructive/10 text-foreground",
      ].join(" ")}
    >
      <div className="font-semibold">{won ? "You cleared the board!" : "No moves left."}</div>
      <div className="mt-1 text-muted-foreground">
        {won ? "Nice work." : "Restart to try again."}
      </div>
      <button
        type="button"
        onClick={onRestart}
        className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Play again
      </button>
    </div>
  );
}
