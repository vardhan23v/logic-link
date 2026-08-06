import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addRow as engineAddRow,
  applyMove as engineApplyMove,
  createGame,
  expectedSecondsPerMatch,
  getLegalMoves,
  isGameLost,
  isGameWon,
  registerInvalidTap,
  restart as engineRestart,
  toggleSelection,
  undo as engineUndo,
  type CellPosition,
  type GameState,
} from "@/engine";
import { deserializeGame, serializeGame } from "@/engine/persist";
import { track } from "@/lib/analytics";

const STORAGE_KEY = "logic-link:game";

function loadSavedGame(level: number, seedOverride?: number): GameState {
  if (seedOverride !== undefined) return createGame(level, seedOverride);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createGame(level);
    const saved = deserializeGame(raw);
    if (saved && saved.level === level && saved.status === "playing") return saved;
  } catch {
    // Corrupt or unavailable storage — start fresh.
  }
  return createGame(level);
}

export function useGame(initialLevel: number, seedOverride?: number) {
  const [game, setGame] = useState<GameState>(() => loadSavedGame(initialLevel, seedOverride));

  // Phase 5 time trigger: if the player takes > 1.5× the expected per-match
  // time since their last action, the next Add Row press is a tier-1 rescue.
  const lastActionAtRef = useRef(Date.now());
  const startedAtRef = useRef(Date.now());
  const perMatchMs = useMemo(() => expectedSecondsPerMatch(initialLevel) * 1000, [initialLevel]);
  const touch = useCallback(() => {
    lastActionAtRef.current = Date.now();
  }, []);
  const timeRescueDue = useCallback(() => {
    return Date.now() - lastActionAtRef.current > 1.5 * perMatchMs;
  }, [perMatchMs]);

  const elapsedMs = useCallback(() => Date.now() - startedAtRef.current, []);

  const selectCell = useCallback((pos: CellPosition) => {
    setGame((g) => toggleSelection(g, pos));
  }, []);

  const attemptMove = useCallback(
    (a: CellPosition, b: CellPosition) => {
      setGame((g) => {
        const next = engineApplyMove(g, a, b);
        if (next === g) {
          // Invalid pair — count it toward the frustration rescue.
          touch();
          return registerInvalidTap(g);
        }
        touch();
        return next;
      });
    },
    [touch],
  );

  const addRow = useCallback(() => {
    setGame((g) => engineAddRow(g, timeRescueDue() ? { rescueReason: "time" } : {}));
    touch();
  }, [timeRescueDue, touch]);

  const undo = useCallback(() => {
    setGame((g) => engineUndo(g));
  }, []);

  const restart = useCallback(
    (level: number) => {
      setGame(engineRestart(level, seedOverride));
      startedAtRef.current = Date.now();
      lastActionAtRef.current = Date.now();
      prevMoveCountRef.current = 0;
    },
    [seedOverride],
  );

  // Persist every change so a reload resumes mid-game.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeGame(game));
    } catch {
      // Persistence must never break the game.
    }
  }, [game]);

  // Time to first match: fire once when the first move of a run lands.
  const prevMoveCountRef = useRef(game.moveCount);
  useEffect(() => {
    if (game.moveCount === 1 && prevMoveCountRef.current === 0) {
      track({ type: "time_to_first_match", level: game.level, ms: elapsedMs() });
    }
    prevMoveCountRef.current = game.moveCount;
  }, [game.moveCount, game.level, elapsedMs]);

  // Analytics on terminal states.
  useEffect(() => {
    if (game.status === "playing") return;
    const used = 6 - game.addRowsRemaining;
    track({
      type: "add_rows_used",
      level: game.level,
      used,
      won: game.status === "won",
    });
    track({
      type: "completion_time",
      level: game.level,
      ms: elapsedMs(),
      won: game.status === "won",
    });
  }, [game.status, game.level, game.addRowsRemaining, elapsedMs]);

  useEffect(() => {
    if (game.rescueTriggered === null) return;
    track({ type: "rescue_triggered", level: game.level, reason: game.rescueTriggered });
  }, [game.rescueTriggered, game.level]);

  const legalMoves = useMemo(() => getLegalMoves(game), [game]);
  const isWon = isGameWon(game);
  const isLost = isGameLost(game);

  return { game, selectCell, attemptMove, addRow, undo, restart, legalMoves, isWon, isLost };
}
