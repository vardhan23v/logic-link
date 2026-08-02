import type { CellPosition, GameState } from "@/engine";
import { Cell } from "./Cell";

import { getLevelConfig } from "@/engine/config/levels";

type Props = {
  game: GameState;
  onSelect: (pos: CellPosition) => void;
};

export function Board({ game, onSelect }: Props) {
  const { board, selectedCells } = game;
  // Geometry and animation speed both come from the level difficulty config.
  const cfg = getLevelConfig(game.level);
  const selectedKey = new Set(selectedCells.map((p) => `${p.row}:${p.col}`));

  return (
    <div
      className="inline-flex flex-col rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-elegant)]"
      style={{ gap: cfg.cellGapPx }}
    >
      {board.map((row, r) => (
        <div key={r} className="flex" style={{ gap: cfg.cellGapPx }}>
          {row.map((cell, c) => (
            <Cell
              key={cell.id}
              value={cell.value}
              selected={selectedKey.has(`${r}:${c}`)}
              onClick={() => onSelect({ row: r, col: c })}
              sizePx={cfg.cellSizePx}
              animationMs={cfg.animationSpeedMs}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
