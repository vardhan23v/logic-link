import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createGame, findAllLegalMoves } from "@/engine";

export default defineTool({
  name: "legal_moves",
  title: "List legal moves",
  description:
    "List all legal moves for a Number Match board reconstructed from (level, seed). Matches are equal values or pairs summing to 10, horizontally, vertically, diagonally, or wrap-around (skipping empty cells).",
  inputSchema: {
    level: z.number().int().min(1).max(10),
    seed: z.number().int().describe("The deterministic seed returned by new_game."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ level, seed }) => {
    const game = createGame(level, seed);
    const moves = findAllLegalMoves(game.board).map((m) => ({
      from: m.from,
      to: m.to,
      values: [
        game.board[m.from.row]?.[m.from.col]?.value ?? null,
        game.board[m.to.row]?.[m.to.col]?.value ?? null,
      ],
    }));
    const payload = { count: moves.length, moves };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
