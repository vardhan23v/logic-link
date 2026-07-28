// Decoy injector: for MVP the layout already places every cell as part of a
// legal pair, so there's no unused slot to fill. This module exposes a hook
// used by harder levels to inject controlled decoy digits inside otherwise
// pair-only boards without breaking solvability.
//
// It swaps N% of non-critical cell values with alternate digits chosen so
// that:
//   • the swapped value still forms at least one legal adjacency, OR
//   • the swap is validated by the solver before being kept.

import type { Board } from "./types";
import type { Rng } from "./rng";

export function injectDecoys(board: Board, _rng: Rng, _decoyWeight: number): Board {
  // MVP no-op; retained as a stable seam. Harder levels will implement this.
  return board;
}
