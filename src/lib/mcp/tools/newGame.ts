import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createGame } from "@/engine";

export default defineTool({
  name: "new_game",
  title: "New game",
  description:
    "Create a new deterministic Logic Link puzzle for a given level (1-10) and optional seed. Returns the initial board, seed, and remaining Add Row budget.",
  inputSchema: {
    level: z.number().int().min(1).max(10).describe("Level from 1 (easiest) to 10 (hardest)."),
    seed: z.number().int().optional().describe("Optional deterministic seed. Omit for level default."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ level, seed }) => {
    const game = createGame(level, seed);
    const grid = game.board.map((row) => row.map((c) => c?.value ?? null));
    const payload = {
      seed: game.seed,
      level: game.level,
      addRowsRemaining: game.addRowsRemaining,
      status: game.status,
      board: grid,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
