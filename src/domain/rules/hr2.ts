import { playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

export const hr2 = defineRule(
  { id: "HR-2", label: "Every player plays at least 1 infield and 1 outfield inning", severity: "error" },
  (lineup) =>
    lineup.players.flatMap((player, p) => {
      const totals = playerTotals(slotsOf(lineup, p));
      const messages: string[] = [];
      if (totals.infield === 0) messages.push(`${player.name} has no infield innings.`);
      if (totals.outfield === 0) messages.push(`${player.name} has no outfield innings.`);
      return messages;
    }),
);
