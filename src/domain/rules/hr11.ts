import { slotsOf } from "../lineup";
import { defineRule } from "./types";

export const hr11 = defineRule(
  { id: "HR-11", label: "Nobody sits two innings in a row", severity: "error" },
  (lineup) =>
    lineup.players.flatMap((player, p) => {
      const slots = slotsOf(lineup, p);
      const i = slots.findIndex((slot, k) => k > 0 && slot === "BN" && slots[k - 1] === "BN");
      return i === -1 ? [] : [`${player.name} sits in innings ${i} and ${i + 1}.`];
    }),
);
