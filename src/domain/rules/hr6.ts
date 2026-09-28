import { playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

export const hr6 = defineRule(
  { id: "HR-6", label: "Every player meets the team's minimum infield innings", severity: "error" },
  (lineup) => {
    const minimum = lineup.options.minInfieldInnings;
    return lineup.players.flatMap((player, p) => {
      const { infield } = playerTotals(slotsOf(lineup, p));
      return infield < minimum
        ? [`${player.name} has ${infield} infield inning${infield === 1 ? "" : "s"} (minimum ${minimum}).`]
        : [];
    });
  },
);
