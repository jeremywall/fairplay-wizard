import { playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

/** Largest infield/outfield difference that isn't worth a notice. */
export const SR2_TOLERANCE = 2;

export const sr2 = defineRule(
  { id: "SR-2", label: "Balance infield and outfield innings", severity: "notice" },
  (lineup) =>
    lineup.players.flatMap((player, p) => {
      const { infield, outfield } = playerTotals(slotsOf(lineup, p));
      return Math.abs(infield - outfield) > SR2_TOLERANCE
        ? [`${player.name} has ${infield} infield and ${outfield} outfield innings.`]
        : [];
    }),
);
