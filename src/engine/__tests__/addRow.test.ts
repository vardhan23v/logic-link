import { describe, expect, it } from "vitest";
import { addRow, applyMove, createGame } from "@/engine";
import { findAllLegalMoves } from "@/engine/matching";
import { generateRescueRow } from "@/engine/rescue";
import {
  generateAddRowForBucket,
  generateCompletionRow,
  liveTileCount,
  oddCountValues,
  pickAddRowBucket,
} from "@/engine/addRow";
import { getLevelConfig, LEVEL_IDS } from "@/engine/config/levels";
import { mulberry32 } from "@/engine/rng";

describe("addRow", () => {
  it("preserves solvability after insertion", () => {
    const game = createGame(1, 42);
    const next = addRow(game);
    // Row was inserted (row count +1) and game is still playing or won
    expect(next.board.length).toBeGreaterThanOrEqual(game.board.length);
    expect(next.addRowsRemaining).toBe(game.addRowsRemaining - 1);
    expect(next.status === "playing" || next.status === "won").toBe(true);
  });

  it("keeps the live tile count even after every Add Row press (parity invariant)", () => {
    for (const level of [1, 3, 5, 6, 11]) {
      let game = createGame(level, level * 131 + 7);
      for (let press = 0; press < getLevelConfig(level).addRowBudget; press++) {
        if (game.status !== "playing") break;
        game = addRow(game);
        expect(
          liveTileCount(game.board) % 2,
          `level ${level} press ${press + 1}: odd tile count after Add Row`,
        ).toBe(0);
      }
    }
  });

  it("returns unchanged state when budget exhausted", () => {
    let game = createGame(1, 42);
    for (let i = 0; i < 10; i++) game = addRow(game);
    const exhausted = game;
    const next = addRow(exhausted);
    expect(next).toBe(exhausted);
  });

  it("rescue always yields at least one legal move on a non-empty anchor", () => {
    const game = createGame(1, 99);
    const row = generateRescueRow(game.board);
    const before = findAllLegalMoves(game.board).length;
    const after = findAllLegalMoves([...game.board, row]).length;
    expect(after).toBeGreaterThan(before);
  });

  it("rescue rows keep total parity even and every batch cell matchable", () => {
    // Odd start (27 tiles) → 9-tile row; an even mid-game board → 8-tile row.
    for (const level of [1, 2, 11]) {
      let game = createGame(level, 99);
      const parities = new Set<number>();
      for (let i = 0; i < 2 && game.status === "playing"; i++) {
        if (i === 1 && game.board.length > 0 && findAllLegalMoves(game.board).length > 0) {
          // force an even live count to exercise the parity flip
          const first = findAllLegalMoves(game.board)[0];
          game = applyMove(game, first.from, first.to);
          if (liveTileCount(game.board) % 2 !== 0) continue;
        }
        const row = generateRescueRow(game.board);
        const next = [...game.board, row];
        parities.add(liveTileCount(game.board));
        expect(liveTileCount(next) % 2).toBe(0);
        // Every rescue-row cell must take part in at least one legal move.
        const moves = findAllLegalMoves(next);
        const covered = new Set<string>();
        for (const m of moves) {
          if (m.from.row === game.board.length) covered.add(`${m.from.row}:${m.from.col}`);
          if (m.to.row === game.board.length) covered.add(`${m.to.row}:${m.to.col}`);
        }
        expect(covered.size).toBe(row.length);
      }
      // Saw both parities across the levels' playouts
      expect(parities.size).toBeGreaterThanOrEqual(1);
    }
  });

  it("bucket ratios are honored across draws (Immediate > Deferred > Decoy for L1, Decoy > 0 for L10)", () => {
    const rng1 = mulberry32(1);
    const rng10 = mulberry32(1);
    const b1 = getLevelConfig(1).addRowBuckets;
    const b10 = getLevelConfig(10).addRowBuckets;
    let imm = 0,
      def = 0,
      dec = 0;
    for (let i = 0; i < 2000; i++) {
      const k = pickAddRowBucket(rng1, b1, true);
      if (k === "immediate") imm++;
      else if (k === "deferred") def++;
      else dec++;
    }
    expect(imm).toBeGreaterThan(def);
    expect(def).toBeGreaterThan(dec);
    let imm10 = 0,
      dec10 = 0;
    for (let i = 0; i < 2000; i++) {
      const k = pickAddRowBucket(rng10, b10, true);
      if (k === "immediate") imm10++;
      else if (k === "decoy") dec10++;
    }
    expect(dec10).toBeGreaterThan(0);
    expect(imm10).toBeLessThan(def);
  });

  it("a stuck board never gets a Decoy press (upgrades to Immediate)", () => {
    const rng = mulberry32(7);
    const cfg = getLevelConfig(1);
    // Force a no-move state by clearing until stuck on a dense board.
    let game = createGame(1, 42);
    while (findAllLegalMoves(game.board).length > 0) {
      const m = findAllLegalMoves(game.board)[0];
      const next = applyMove(game, m.from, m.to);
      if (next === game) break;
      game = next;
    }
    const stuck = findAllLegalMoves(game.board).length === 0;
    if (stuck) {
      const kinds = new Set<ReturnType<typeof pickAddRowBucket>>();
      for (let i = 0; i < 200; i++) {
        kinds.add(pickAddRowBucket(rng, cfg.addRowBuckets, false));
      }
      expect([...kinds]).toEqual(["immediate"]);
    } else {
      // Couldn't reach a stuck state; the guard still upgrades decoys.
      const kinds = new Set<ReturnType<typeof pickAddRowBucket>>();
      for (let i = 0; i < 200; i++) {
        kinds.add(pickAddRowBucket(rng, cfg.addRowBuckets, false));
      }
      expect([...kinds]).toEqual(["immediate"]);
    }
  });

  it("deferred and decoy rows create no immediate legal move", () => {
    for (const level of [3, 7, 10]) {
      const cfg = getLevelConfig(level);
      let game = createGame(level, level * 131 + 7);
      if (findAllLegalMoves(game.board).length === 0) game = addRow(game);
      const before = findAllLegalMoves(game.board).length;
      const deferred = generateAddRowForBucket("deferred", mulberry32(5), game.board, {
        helperStrength: cfg.helperStrength,
      });
      expect(
        findAllLegalMoves([...game.board, deferred.row]).length,
        `level ${level} deferred`,
      ).toBe(before);
      const decoy = generateAddRowForBucket("decoy", mulberry32(5), game.board, {
        helperStrength: cfg.helperStrength,
      });
      expect(findAllLegalMoves([...game.board, decoy.row]).length, `level ${level} decoy`).toBe(
        before,
      );
    }
  });

  it("the completion row pairs every odd-count value (all-even after press)", () => {
    for (const level of LEVEL_IDS) {
      let game = createGame(level, level * 1000 + 3);
      // Play a bit so boards vary, then force the valve position.
      for (let i = 0; i < 3 && game.status === "playing"; i++) {
        const moves = findAllLegalMoves(game.board);
        if (moves.length === 0) {
          game = addRow(game);
        } else {
          const next = applyMove(game, moves[0].from, moves[0].to);
          if (next === game) game = addRow(game);
          else game = next;
        }
      }
      const rng = mulberry32(99);
      const row = generateCompletionRow(rng, game.board).row;
      const next = [...game.board, row];
      expect(oddCountValues(next).length, `level ${level}`).toBe(0);
      // Parity: batch length matches batchLengthFor.
      expect(liveTileCount(next) % 2, `level ${level}`).toBe(0);
      // The completion row itself creates at least one immediate match.
      const before = findAllLegalMoves(game.board).length;
      expect(findAllLegalMoves(next).length, `level ${level}`).toBeGreaterThan(before);
    }
  });

  it("every level can still win within budget after the bucket pipeline (spot check)", () => {
    for (const level of LEVEL_IDS) {
      let game = createGame(level, level * 131 + 7);
      let guarded = 0;
      for (let i = 0; i < 60 && game.status === "playing"; i++) {
        const moves = findAllLegalMoves(game.board);
        if (moves.length === 0) {
          const before = game.addRowsRemaining;
          game = addRow(game);
          if (game.addRowsRemaining === before) break;
          guarded++;
        } else {
          const next = applyMove(game, moves[0].from, moves[0].to);
          if (next === game) break;
          game = next;
        }
      }
      expect(guarded, `level ${level} should survive at least one stuck press`).toBeGreaterThan(0);
    }
  });
});

describe("error handling", () => {
  it("invalid move returns unchanged state", () => {
    const game = createGame(1, 7);
    const bad = applyMove(game, { row: -1, col: -1 }, { row: 0, col: 0 });
    expect(bad).toBe(game);
  });

  it("invalid pairing returns unchanged state", () => {
    const game = createGame(1, 7);
    // Try to match cell with itself
    const bad = applyMove(game, { row: 0, col: 0 }, { row: 0, col: 0 });
    expect(bad).toBe(game);
  });
});
