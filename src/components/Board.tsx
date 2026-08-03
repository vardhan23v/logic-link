import type { CellPosition, GameState } from "@/engine";
import { Cell } from "./Cell";

type Props = {
  game: GameState;
  onSelect: (pos: CellPosition) => void;
};

/**
 * Fluid 9-column grid: cells are square and share the available width, so the
 * board fits any viewport down to small phones without horizontal scrolling.
 */
export function Board({ game, onSelect }: Props) {
  const { board, selectedCells } = game;
  const selectedKey = new Set(selectedCells.map((p) => `${p.row}:${p.col}`));

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-elegant)] sm:p-3">
      <div className="grid grid-cols-9 gap-1 sm:gap-1.5">
        {board.map((row, r) =>
          row.map((cell, c) => (
            <Cell
              key={cell.id}
              value={cell.value}
              selected={selectedKey.has(`${r}:${c}`)}
              onClick={() => onSelect({ row: r, col: c })}
            />
          )),
        )}
      </div>
    </div>
  );
}
