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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-6">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
          Deterministic Puzzle Engine
        </span>
        <h1 className="text-5xl font-bold tracking-tight text-foreground">Logic Link</h1>
        <p className="text-lg text-muted-foreground">
          A deterministic take on the classic sum-to-10 puzzle. Link identical numbers or pairs
          that sum to 10, across rows, columns, diagonals, and wrap-around. Every generated
          board is guaranteed solvable, and the smart Add Row helps you when you get stuck —
          without ever creating an unfair situation.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/play"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start playing
          </Link>
          <a
            href="#about"
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Learn more
          </a>
        </div>
      </header>

      <section id="about" className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">About</h2>
        <p className="text-base text-muted-foreground">
          Logic Link is a fair-by-design number puzzle built on a constraint-first engine.
          Instead of shuffling random numbers and hoping a board is solvable, the engine
          generates matching pairs first, places them strategically, and validates every level
          with a bounded DFS solver before it ever reaches you. The result: no unfair
          dead-ends, no lucky boards — just pure logic.
        </p>
        <p className="text-base text-muted-foreground">
          Ten levels follow a sawtooth difficulty curve — rising through Level 5, dipping at
          Level 6 for a breath of fresh air, then climbing past the earlier peak up to Level
          10. Each level is tuned with its own match density, clustering, decoy weight, and
          target completion probability, all validated by a 1,000-trial simulation harness.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">How it works</h2>
        <ul className="grid gap-3 text-sm text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">9-column grid</span> — starts with
            3 rows and grows as you add more.
          </li>
          <li>
            <span className="font-semibold text-foreground">Match rule</span> — link equal
            values, or pairs that sum to 10, across rows, columns, diagonals, and wrap-around.
          </li>
          <li>
            <span className="font-semibold text-foreground">Smart Add Row</span> — 6 uses per
            level; prioritizes stranded numbers and never breaks the board.
          </li>
          <li>
            <span className="font-semibold text-foreground">Rescue mode</span> — if two Add
            Rows in a row fail to unlock a match, the engine guarantees a playable pair.
          </li>
          <li>
            <span className="font-semibold text-foreground">Solver-validated</span> — every
            board is proven solvable before you see it.
          </li>
        </ul>
      </section>
    </main>
  );
}
