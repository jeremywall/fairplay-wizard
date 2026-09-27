import { lineupPositions, playerTotals, slotsOf } from "../lineup";
import { defineRule } from "./types";

// A pitching stint counts as one turn at pitcher (HR-9/HR-10 already limit it).
// A repeat only counts when the player has no more field innings than there
// are fielded positions, so all their innings could have been different.
export const sr1 = defineRule(
  { id: "SR-1", label: "Avoid repeating a position in a game", severity: "notice" },
  (lineup) => {
    const positionCount = lineupPositions(lineup).length;
    return lineup.players.flatMap((player, p) => {
      const totals = playerTotals(slotsOf(lineup, p));
      if (totals.field - Math.max(0, totals.pitcher - 1) > positionCount) return [];
      const repeated = [...totals.positions]
        .filter(([position, count]) => position !== "P" && count > 1)
        .map(([position]) => position);
      return repeated.length > 0 ? [`${player.name} plays ${repeated.join(", ")} more than once.`] : [];
    });
  },
);
