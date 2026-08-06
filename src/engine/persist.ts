// GameState persistence: serializes a live game (board + counters + undo
// history) to a plain JSON string and rebuilds a GameState from it, so a
// reload resumes exactly where the player left off. Pure engine code — no
// storage I/O; the hook owns the localStorage read/write.

import { emptyCell, makeCell } from "./boardLayout";
import type { Board, CellPosition, GameSnapshot, GameState, RescueTrigger } from "./types";

type SerializableSnapshot = {
  board: number[][];
  addRowsRemaining: number;
  moveCount: number;
  rescueCounter: number;
  invalidTapCount: number;
  selectedCells: CellPosition[];
};

type SerializableGame = {
  version: 1;
  level: number;
  seed: number;
  addRowsRemaining: number;
  selectedCells: CellPosition[];
  status: "playing" | "won" | "lost";
  moveCount: number;
  rescueCounter: number;
  invalidTapCount: number;
  rescueTriggered: RescueTrigger;
  board: number[][];
  history: SerializableSnapshot[];
};

function boardToValues(board: Board): number[][] {
  return board.map((row) => row.map((cell) => cell.value ?? 0));
}

function valuesToBoard(values: number[][]): Board {
  return values.map((row) => row.map((v) => (v === 0 ? emptyCell() : makeCell(v))));
}

function snapshotToSerializable(s: GameSnapshot): SerializableSnapshot {
  return {
    board: boardToValues(s.board),
    addRowsRemaining: s.addRowsRemaining,
    moveCount: s.moveCount,
    rescueCounter: s.rescueCounter,
    invalidTapCount: s.invalidTapCount,
    selectedCells: s.selectedCells,
  };
}

function snapshotFromSerializable(s: SerializableSnapshot): GameSnapshot {
  return {
    board: valuesToBoard(s.board),
    addRowsRemaining: s.addRowsRemaining,
    moveCount: s.moveCount,
    rescueCounter: s.rescueCounter,
    invalidTapCount: s.invalidTapCount,
    selectedCells: s.selectedCells,
  };
}

export function serializeGame(game: GameState): string {
  const data: SerializableGame = {
    version: 1,
    level: game.level,
    seed: game.seed,
    addRowsRemaining: game.addRowsRemaining,
    selectedCells: game.selectedCells,
    status: game.status,
    moveCount: game.moveCount,
    rescueCounter: game.rescueCounter,
    invalidTapCount: game.invalidTapCount,
    rescueTriggered: game.rescueTriggered,
    board: boardToValues(game.board),
    history: game.history.map(snapshotToSerializable),
  };
  return JSON.stringify(data);
}

/** Rebuild a GameState from serializeGame output; null when malformed. */
export function deserializeGame(json: string): GameState | null {
  try {
    const data = JSON.parse(json) as SerializableGame;
    if (data.version !== 1 || !Array.isArray(data.board)) return null;
    if (!Array.isArray(data.history)) return null;
    const level = Number(data.level);
    if (!Number.isFinite(level)) return null;
    const board = valuesToBoard(data.board);
    if (board.length === 0 || board.some((row) => row.length !== board[0].length)) return null;
    return {
      board,
      level,
      seed: Number(data.seed) >>> 0 || 1,
      addRowsRemaining: data.addRowsRemaining,
      selectedCells: Array.isArray(data.selectedCells) ? data.selectedCells : [],
      status: data.status === "won" || data.status === "lost" ? data.status : "playing",
      moveCount: data.moveCount,
      rescueCounter: data.rescueCounter,
      invalidTapCount: data.invalidTapCount,
      rescueTriggered: data.rescueTriggered ?? null,
      history: data.history
        .map((s) => {
          const snap = snapshotFromSerializable(s);
          if (snap.board.length === 0) return null;
          return snap;
        })
        .filter((s): s is GameSnapshot => s !== null),
    };
  } catch {
    return null;
  }
}
