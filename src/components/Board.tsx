import type { CellPosition, GameState } from "@/engine";
import { Cell } from "./Cell";

type Props = {
  game: GameState;
  onSelect: (pos: CellPosition) => void;
};

export function Board({ game, onSelect }: Props) {
  const { board, selectedCells } = game;
  const selectedKey = new Set(selectedCells.map((p) => `${p.row}:${p.col}`));

  return (
    <div className="inline-flex flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-sm">
      {board.map((row, r) => (
        <div key={r} className="flex gap-1">
          {row.map((cell, c) => (
            <Cell
              key={cell.id}
              value={cell.value}
              selected={selectedKey.has(`${r}:${c}`)}
              onClick={() => onSelect({ row: r, col: c })}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
