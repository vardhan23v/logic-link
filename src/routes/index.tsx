import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Logic Link — Deterministic Number Puzzle" },
      {
        name: "description",
        content:
          "Logic Link is a fair, deterministic number-matching puzzle. Every board is solvable, Add Row helps you smartly, and difficulty stays within a controlled envelope.",
      },
      { property: "og:title", content: "Logic Link — Deterministic Number Puzzle" },
      {
        property: "og:description",
        content:
          "Every board is solvable. Fair by design. Play Logic Link, the deterministic number puzzle.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight text-foreground">Logic Link</h1>
      <p className="text-base text-muted-foreground">
        A deterministic take on the classic sum-to-10 puzzle. Link identical numbers or pairs
        that sum to 10, across rows, columns, diagonals, and wrap-around. Every generated board
        is guaranteed solvable, and the smart Add Row helps you when you get stuck — without
        ever creating an unfair situation.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/play"
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start playing
        </Link>
      </div>
      <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
        <li>• 9-column grid, starts with 3 rows.</li>
        <li>• Link equal values or pairs summing to 10.</li>
        <li>• Add Row is smart: it prioritizes stranded numbers and never breaks the board.</li>
        <li>• Every board is validated by an internal solver before you see it.</li>
      </ul>
    </main>
  );
}
