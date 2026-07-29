import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { simulateLevel } from "@/engine/simulator";

export default defineTool({
  name: "simulate_level",
  title: "Simulate level",
  description:
    "Run the heuristic AI over many deterministic seeds to estimate completion probability, add-row usage, and time distribution for a level.",
  inputSchema: {
    level: z.number().int().min(1).max(10),
    trials: z.number().int().min(1).max(2000).describe("Number of trials to run (max 2000)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ level, trials }) => {
    const result = simulateLevel(level, trials);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
