import { playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

export const hr6 = defineRule(
  { id: "HR-6", label: "Every player plays at least 2 infield innings", severity: "error" },
  (lineup) =>
    lineup.players.flatMap((player, p) => {
      const { infield } = playerTotals(slotsOf(lineup, p));
      return infield < 2 ? [`${player.name} has ${infield} infield inning${infield === 1 ? "" : "s"} (minimum 2).`] : [];
    }),
);
