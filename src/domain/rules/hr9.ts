import { playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

export const hr9 = defineRule(
  { id: "HR-9", label: "Pitchers stay within the game's pitcher inning limit", severity: "error" },
  (lineup) => {
    const limit = lineup.options.pitcherInningLimit;
    return lineup.players.flatMap((player, p) => {
      const { pitcher } = playerTotals(slotsOf(lineup, p));
      return pitcher > limit ? [`${player.name} pitches ${pitcher} innings (limit ${limit}).`] : [];
    });
  },
);
