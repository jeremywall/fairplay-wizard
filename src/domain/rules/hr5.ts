import { slotsOf } from "../lineup";
import { categoryOf } from "../positions";
import { defineRule } from "./types";

export const hr5 = defineRule(
  { id: "HR-5", label: "Every player plays infield within the first 3 innings", severity: "error" },
  (lineup) =>
    lineup.players.flatMap((player, p) =>
      slotsOf(lineup, p)
        .slice(0, 3)
        .some((slot) => categoryOf(slot) === "infield")
        ? []
        : [`${player.name} has no infield inning in the first 3 innings.`],
    ),
);
