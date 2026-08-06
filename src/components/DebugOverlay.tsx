import { useMemo } from "react";
import type { GameState, Move } from "@/engine";
import { isSolvable, findAllLegalMoves } from "@/engine";
import { nextHeuristicMove } from "@/engine/simulator";
import { strandedValues } from "@/engine/straggler";

type Props = {
  game: GameState;
  open: boolean;
  onToggle: () => void;
};

function fmtPos(p: { row: number; col: number }) {
  return `r${p.row}c${p.col}`;
}

function fmtMove(board: GameState["board"], m: Move) {
  const a = board[m.from.row]?.[m.from.col]?.value ?? "·";
  const b = board[m.to.row]?.[m.to.col]?.value ?? "·";
  return `${a}@${fmtPos(m.from)} ↔ ${b}@${fmtPos(m.to)}`;
}

export function DebugOverlay({ game, open, onToggle }: Props) {
  const legal = useMemo(() => findAllLegalMoves(game.board), [game.board]);
  const stranded = useMemo(() => strandedValues(game.board), [game.board]);
  // Solver can be expensive; cap nodes and only run when open.
  const solvable = useMemo(
    () => (open ? isSolvable(game.board, { maxNodes: 8000 }) : null),
    [open, game.board],
  );
  const nextMove = useMemo(() => (open ? nextHeuristicMove(game) : null), [open, game]);

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="rounded-md border border-border bg-card px-3 py-1.5 shadow-sm hover:bg-accent"
      >
        {open ? "Hide debug" : "Debug"}
      </button>
      {open && (
        <div className="mt-2 w-80 max-h-[70vh] overflow-auto rounded-md border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="mb-2 font-semibold">Engine debug</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Seed</dt>
            <dd>{game.seed}</dd>
            <dt className="text-muted-foreground">Level</dt>
            <dd>{game.level}</dd>
            <dt className="text-muted-foreground">Moves</dt>
            <dd>{game.moveCount}</dd>
            <dt className="text-muted-foreground">Add rows left</dt>
            <dd>{game.addRowsRemaining}</dd>
            <dt className="text-muted-foreground">Rescue counter</dt>
            <dd>{game.rescueCounter}</dd>
            <dt className="text-muted-foreground">Invalid taps</dt>
            <dd>{game.invalidTapCount}</dd>
            <dt className="text-muted-foreground">Rescue trigger</dt>
            <dd>{game.rescueTriggered ?? "—"}</dd>
            <dt className="text-muted-foreground">Undo stack</dt>
            <dd>{game.history.length} snapshots</dd>
            <dt className="text-muted-foreground">Solvable</dt>
            <dd>{solvable === null ? "…" : solvable ? "✓ yes" : "✗ no (or > node cap)"}</dd>
            <dt className="text-muted-foreground">Stranded</dt>
            <dd>{stranded.length ? stranded.join(", ") : "—"}</dd>
            <dt className="text-muted-foreground">Next AI move</dt>
            <dd>{nextMove ? fmtMove(game.board, nextMove) : "— (no legal)"}</dd>
          </dl>

          <div className="mt-3 mb-1 font-semibold">Match graph ({legal.length} legal)</div>
          <ul className="space-y-0.5">
            {legal.length === 0 && <li className="text-muted-foreground">No legal moves</li>}
            {legal.map((m, i) => {
              const isNext =
                nextMove &&
                nextMove.from.row === m.from.row &&
                nextMove.from.col === m.from.col &&
                nextMove.to.row === m.to.row &&
                nextMove.to.col === m.to.col;
              return (
                <li
                  key={i}
                  className={isNext ? "text-primary font-semibold" : "text-foreground/80"}
                >
                  {isNext ? "▶ " : "  "}
                  {fmtMove(game.board, m)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
