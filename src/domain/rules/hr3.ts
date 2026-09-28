import { slotsOf } from "../lineup";
import { categoryOf } from "../positions";
import { defineRule } from "./types";

// Bench innings don't break an outfield streak.
export const hr3 = defineRule(
  { id: "HR-3", label: "No 3 consecutive outfield innings", severity: "error" },
  (lineup) =>
    lineup.players.flatMap((player, p) => {
      let streak = 0;
      for (const slot of slotsOf(lineup, p)) {
        const category = categoryOf(slot);
        if (category === "infield") streak = 0;
        else if (category === "outfield" && ++streak === 3) {
          return [`${player.name} plays outfield 3 innings in a row (bench innings don't break the streak).`];
        }
      }
      return [];
    }),
);
