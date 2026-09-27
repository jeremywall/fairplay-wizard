import { minFieldInnings, playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

export const hr8 = defineRule(
  { id: "HR-8", label: "Every player meets the minimum defensive innings", severity: "error" },
  (lineup) => {
    const minimum = minFieldInnings(lineup.options);
    return lineup.players.flatMap((player, p) => {
      const { field } = playerTotals(slotsOf(lineup, p));
      return field < minimum
        ? [`${player.name} plays ${field} inning${field === 1 ? "" : "s"} in the field (minimum ${minimum}).`]
        : [];
    });
  },
);
