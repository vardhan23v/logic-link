import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createGame } from "@/engine";
import { nextHeuristicMove } from "@/engine/simulator";

export default defineTool({
  name: "next_move",
  title: "Suggest next move",
  description:
    "Return the heuristic AI's recommended next move for a Number Match board reconstructed from (level, seed). Prefers matches that clear stragglers and reduce row count.",
  inputSchema: {
    level: z.number().int().min(1).max(10),
    seed: z.number().int(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ level, seed }) => {
    const game = createGame(level, seed);
    const move = nextHeuristicMove(game);
    const payload = move
      ? {
          move,
          values: [
            game.board[move.from.row]?.[move.from.col]?.value ?? null,
            game.board[move.to.row]?.[move.to.col]?.value ?? null,
          ],
        }
      : { move: null, message: "No legal move available." };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
