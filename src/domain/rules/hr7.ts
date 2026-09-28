import { lineupPositions } from "../lineup";
import { MIN_PLAYERS } from "../positions";
import { defineRule } from "./types";

export const hr7 = defineRule(
  { id: "HR-7", label: "At least 7 players, fielded at the positions for that attendance", severity: "error" },
  (lineup) => {
    if (lineup.players.length < MIN_PLAYERS) {
      return [`A game needs at least ${MIN_PLAYERS} players; ${lineup.players.length} are present.`];
    }
    const positions = lineupPositions(lineup);
    return lineup.innings.flatMap((inning, i) => {
      const messages: string[] = [];
      for (const position of positions) {
        const count = inning.filter((slot) => slot === position).length;
        if (count === 0) messages.push(`Inning ${i + 1}: nobody is at ${position}.`);
        if (count > 1) messages.push(`Inning ${i + 1}: ${count} players are at ${position}.`);
      }
      for (const slot of new Set(inning)) {
        if (slot !== "BN" && !positions.includes(slot)) {
          messages.push(`Inning ${i + 1}: ${slot} isn't used with ${lineup.players.length} players.`);
        }
      }
      return messages;
    });
  },
);
