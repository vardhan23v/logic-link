import { useCallback, useMemo, useState } from "react";
import {
  addRow as engineAddRow,
  applyMove as engineApplyMove,
  createGame,
  getLegalMoves,
  isGameLost,
  isGameWon,
  restart as engineRestart,
  toggleSelection,
  type CellPosition,
  type GameState,
} from "@/engine";

export function useGame(initialLevel: number) {
  const [game, setGame] = useState<GameState>(() => createGame(initialLevel));

  const selectCell = useCallback((pos: CellPosition) => {
    setGame((g) => toggleSelection(g, pos));
  }, []);

  const attemptMove = useCallback((a: CellPosition, b: CellPosition) => {
    setGame((g) => engineApplyMove(g, a, b));
  }, []);

  const addRow = useCallback(() => {
    setGame((g) => engineAddRow(g));
  }, []);

  const restart = useCallback((level: number) => {
    setGame(engineRestart(level));
  }, []);

  const legalMoves = useMemo(() => getLegalMoves(game), [game]);
  const isWon = isGameWon(game);
  const isLost = isGameLost(game);

  return { game, selectCell, attemptMove, addRow, restart, legalMoves, isWon, isLost };
}
