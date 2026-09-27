// Read-only fairness readout (docs/rules.md §7). Not a rule, and it doesn't
// feed back into the generator.

import { type Lineup, playerTotals, slotsOf } from "./lineup";

export type FairnessLabel = "Excellent" | "Good" | "Uneven";

export interface FairnessReport {
  label: FairnessLabel;
  /** Max minus min across present players. Infield includes pitcher and catcher. */
  spreads: { bench: number; infield: number; outfield: number };
}

export function fairness(lineup: Lineup): FairnessReport {
  const totals = lineup.players.map((_, p) => playerTotals(slotsOf(lineup, p)));
  const spread = (values: number[]) => (values.length === 0 ? 0 : Math.max(...values) - Math.min(...values));
  const spreads = {
    bench: spread(totals.map((t) => t.bench)),
    infield: spread(totals.map((t) => t.infield)),
    outfield: spread(totals.map((t) => t.outfield)),
  };
  const worst = Math.max(spreads.bench, spreads.infield, spreads.outfield);
  return { label: worst <= 1 ? "Excellent" : worst <= 2 ? "Good" : "Uneven", spreads };
}
