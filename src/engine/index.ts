// Stable public engine API. Anything outside src/engine communicates only
// through this module.

import { getLevelConfig } from "./config/levels";
import { generateBoard } from "./generator";
import { applyMoveToBoard, isBoardEmpty, isSolvable } from "./solver";
import { findAllLegalMoves, isLegalMove } from "./matching";
import { generateSmartAddRow, isAddRowAcceptable } from "./addRow";
import { generateRescueRow, RESCUE_THRESHOLD } from "./rescue";
import { mulberry32, newSeed } from "./rng";
import type { Board, CellPosition, GameState, Move } from "./types";

export type { Board, Cell, CellPosition, GameState, LevelConfig, Move, Pair } from "./types";

function inBounds(board: Board, pos: CellPosition): boolean {
  return (
    pos.row >= 0 &&
    pos.row < board.length &&
    pos.col >= 0 &&
    pos.col < (board[pos.row]?.length ?? 0)
  );
}

function deriveStatus(board: Board, addRowsRemaining: number): GameState["status"] {
  if (isBoardEmpty(board)) return "won";
  if (findAllLegalMoves(board).length === 0 && addRowsRemaining === 0) return "lost";
  return "playing";
}

export function createGame(level: number, seedInput?: number): GameState {
  const config = getLevelConfig(level);
  const seed = seedInput ?? (config.seedStrategy === "levelOnly" ? level * 9973 + 17 : newSeed());
  const gen = generateBoard(config, seed);
  return {
    board: gen.board,
    level,
    seed: gen.seed,
    addRowsRemaining: config.addRowBudget,
    selectedCells: [],
    status: deriveStatus(gen.board, config.addRowBudget),
    moveCount: 0,
    rescueCounter: 0,
    history: [],
  };
}

export function restart(level: number, seedInput?: number): GameState {
  return createGame(level, seedInput);
}

export function applyMove(
  game: GameState,
  firstCell: CellPosition,
  secondCell: CellPosition,
): GameState {
  if (game.status !== "playing") return game;
  if (!inBounds(game.board, firstCell) || !inBounds(game.board, secondCell)) return game;
  if (!isLegalMove(game.board, firstCell, secondCell)) return game;

  const move: Move = { from: firstCell, to: secondCell };
  const nextBoard = applyMoveToBoard(game.board, move);
  const status = deriveStatus(nextBoard, game.addRowsRemaining);
  return {
    ...game,
    board: nextBoard,
    selectedCells: [],
    moveCount: game.moveCount + 1,
    status,
    history: [...game.history, move],
  };
}

export function addRow(game: GameState): GameState {
  if (game.status !== "playing") return game;
  if (game.addRowsRemaining <= 0) return game;

  const legalBefore = findAllLegalMoves(game.board).length;
  const rng = mulberry32((game.seed ^ (game.moveCount + 1)) >>> 0);

  let candidate = generateSmartAddRow(rng, game.board);
  let row = candidate.row;
  let usedRescue = false;

  if (game.rescueCounter >= RESCUE_THRESHOLD) {
    row = generateRescueRow(game.board);
    usedRescue = true;
  } else if (!isAddRowAcceptable(game.board, row)) {
    row = generateRescueRow(game.board);
    usedRescue = true;
  }

  const nextBoard: Board = [...game.board, row];
  const legalAfter = findAllLegalMoves(nextBoard).length;
  const newLegal = legalAfter - legalBefore;
  const rescueCounter = usedRescue || newLegal > 0 ? 0 : game.rescueCounter + 1;

  return {
    ...game,
    board: nextBoard,
    addRowsRemaining: game.addRowsRemaining - 1,
    selectedCells: [],
    rescueCounter,
    status: deriveStatus(nextBoard, game.addRowsRemaining - 1),
  };
}

export function getLegalMoves(game: GameState): Move[] {
  return findAllLegalMoves(game.board);
}

export function getBoard(game: GameState): Board {
  return game.board;
}

export function isGameWon(game: GameState): boolean {
  return game.status === "won";
}

export function isGameLost(game: GameState): boolean {
  return game.status === "lost";
}

/** Toggle selection for a cell; when two cells are selected try to apply. */
export function toggleSelection(game: GameState, pos: CellPosition): GameState {
  if (game.status !== "playing") return game;
  if (!inBounds(game.board, pos)) return game;
  const cell = game.board[pos.row][pos.col];
  if (!cell || cell.value === null) return game;

  const existing = game.selectedCells;
  if (existing.length === 1 && existing[0].row === pos.row && existing[0].col === pos.col) {
    return { ...game, selectedCells: [] };
  }
  if (existing.length === 0) {
    return { ...game, selectedCells: [pos] };
  }
  // Two-cell selection → try applying the move.
  const first = existing[0];
  const attempted = applyMove(game, first, pos);
  if (attempted !== game) return attempted;
  // Invalid → replace selection with the new cell.
  return { ...game, selectedCells: [pos] };
}

// Re-export commonly-needed helpers for consumers (tests, tools).
export { isSolvable, findAllLegalMoves, isLegalMove };
