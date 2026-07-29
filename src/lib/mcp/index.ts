import { defineMcp } from "@lovable.dev/mcp-js";
import newGameTool from "./tools/newGame";
import legalMovesTool from "./tools/legalMoves";
import nextMoveTool from "./tools/nextMove";
import simulateTool from "./tools/simulate";

export default defineMcp({
  name: "number-match-mcp",
  title: "Logic Link Engine",
  version: "0.1.0",
  instructions:
    "Tools for the deterministic Logic Link puzzle engine. Use `new_game` to generate a board for a level (and get its seed), `legal_moves` to enumerate valid matches, `next_move` to get the heuristic AI's recommendation, and `simulate_level` to estimate completion probability across many deterministic trials. Matches require equal values or pairs summing to 10 (horizontal, vertical, diagonal, or wrap-around; empty cells are skipped).",
  tools: [newGameTool, legalMovesTool, nextMoveTool, simulateTool],
});
