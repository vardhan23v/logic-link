import type { GameState } from "@/engine";

type Props = {
  game: GameState;
  legalMoveCount: number;
};

export function GameHeader({ game, legalMoveCount }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-card px-4 py-3 text-sm">
      <div className="font-semibold">Level {game.level}</div>
      <div className="text-muted-foreground">Moves: {game.moveCount}</div>
      <div className="text-muted-foreground">Add Rows left: {game.addRowsRemaining}</div>
      <div className="text-muted-foreground">Legal moves: {legalMoveCount}</div>
    </div>
  );
}
