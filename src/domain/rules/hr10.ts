import { slotsOf } from "../lineup";
import { defineRule, inningList } from "./types";

export const hr10 = defineRule(
  { id: "HR-10", label: "Each pitcher pitches one uninterrupted stint", severity: "error" },
  (lineup) =>
    lineup.players.flatMap((player, p) => {
      const pitched = slotsOf(lineup, p).flatMap((slot, i) => (slot === "P" ? [i] : []));
      const contiguous = pitched.every((inning, k) => k === 0 || inning === pitched[k - 1] + 1);
      return contiguous ? [] : [`${player.name} pitches in innings ${inningList(pitched)}, which isn't one stint.`];
    }),
);
