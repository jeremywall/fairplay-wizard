import { playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

export const hr1 = defineRule(
  { id: "HR-1", label: "A player who catches more than 3 innings can't pitch", severity: "error" },
  (lineup) =>
    lineup.players.flatMap((player, p) => {
      const totals = playerTotals(slotsOf(lineup, p));
      return totals.catcher > 3 && totals.pitcher > 0
        ? [`${player.name} catches ${totals.catcher} innings and also pitches.`]
        : [];
    }),
);
