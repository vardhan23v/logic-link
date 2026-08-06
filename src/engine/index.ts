// Stable public engine API. Anything outside src/engine communicates only
// through this module.

import { getLevelConfig } from "./config/levels";
import { generateBoard } from "./generator";
import { getPooledBoard } from "./pool";
import { applyMoveToBoard, isBoardEmpty, isSolvable } from "./solver";
import { findAllLegalMoves, isLegalMove } from "./matching";
import type { AddRowBucket } from "./addRow";
import {
  generateAddRowForBucket,
  generateCompletionRow,
  generateSmartAddRow,
  isAddRowAcceptable,
  pickAddRowBucket,
  VALVE_PRESSES_LEFT,
} from "./addRow";
import { generateRescueRow, RESCUE_THRESHOLD } from "./rescue";
import { mulberry32 } from "./rng";
import type { Board, Cell, CellPosition, GameState, Move } from "./types";

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
  // Seed derives from the level ID only, so a given level is byte-identical
  // for every player. An explicit seedInput (e.g. from the ?seed= debug
  // query param) overrides it for bug reproduction.
  const seed = seedInput ?? ((level * 9973 + 17) >>> 0 || 1);
  // Phase 3: prefer the pre-baked, solver-validated board pool; fall back to
  // on-device generation only when a level is missing from the pool.
  const pooled = getPooledBoard(level, seed);
  const board = pooled ?? generateBoard(config, seed).board;
  return {
    board,
    level,
    seed,
    addRowsRemaining: config.addRowBudget,
    selectedCells: [],
    status: deriveStatus(board, config.addRowBudget),
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

/**
 * The exact board after one Add Row press, mirroring the live `addRow`
 * transition: bucketed smart row first (Immediate/Deferred/Decoy per level,
 * decoys only offered while the board still has moves), the completion safety
 * valve on presses 5..6 of the budget, rescue fallback, same deterministic
 * rng stream derived from (seed, moveCount + 1). Exposed so the budget
 * solver simulates precisely what ships.
 */
export function boardAfterPress(game: GameState): Board {
  const rng = mulberry32((game.seed ^ (game.moveCount + 1)) >>> 0);
  const { helperStrength, addRowBuckets } = getLevelConfig(game.level);
  const hasLegalMoves = findAllLegalMoves(game.board).length > 0;

  let row: Cell[];
  if (game.rescueCounter >= RESCUE_THRESHOLD) {
    row = generateRescueRow(game.board);
  } else if (game.addRowsRemaining <= VALVE_PRESSES_LEFT) {
    // Safety valve: presses 5..6 must enable a full clear — a completion row
    // that pairs every odd-count value, so the board can empty without any
    // further presses. Retry a few constructions (the playout witness is
    // probabilistic) before falling back to rescue, which still guarantees a
    // fresh match (never a dead press).
    row = generateRescueRow(game.board);
    for (let attempt = 0; attempt < 8; attempt++) {
      const completion = generateCompletionRow(rng, game.board);
      if (isAddRowAcceptable(game.board, completion.row, rng)) {
        row = completion.row;
        break;
      }
    }
  } else {
    // Fallback chain: a Decoy that fails (or is unavailable) degrades to
    // Deferred, then Immediate, then rescue. A stuck board skips straight to
    // Immediate via pickAddRowBucket, so presses always create a match.
    const bucket = pickAddRowBucket(rng, addRowBuckets, hasLegalMoves);
    const order: AddRowBucket[] =
      bucket === "decoy"
        ? ["decoy", "deferred", "immediate"]
        : bucket === "deferred"
          ? ["deferred", "immediate"]
          : ["immediate"];
    row = generateRescueRow(game.board);
    for (const b of order) {
      const candidate = generateAddRowForBucket(b, rng, game.board, { helperStrength });
      if (isAddRowAcceptable(game.board, candidate.row, rng)) {
        row = candidate.row;
        break;
      }
    }
  }

  return [...game.board, row];
}

export function addRow(game: GameState): GameState {
  if (game.status !== "playing") return game;
  if (game.addRowsRemaining <= 0) return game;

  const legalBefore = findAllLegalMoves(game.board).length;
  const nextBoard = boardAfterPress(game);

  const legalAfter = findAllLegalMoves(nextBoard).length;
  const newLegal = legalAfter - legalBefore;
  // Every press injects at least one match (smart or rescue row), so the
  // frustration counter resets whenever the player presses; it only builds
  // up across presses that fail to produce a legal move (can't happen with
  // the current rows, kept as a guard).
  const rescueCounter = newLegal > 0 ? 0 : game.rescueCounter + 1;

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
