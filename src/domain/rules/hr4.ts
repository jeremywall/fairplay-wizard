import { defineRule } from "./types";

// Bench turns go round-robin: nobody sits for the (k+1)th time while someone
// present hasn't sat k times, except players sitting in that same inning.
export const hr4 = defineRule(
  { id: "HR-4", label: "Bench turns go round-robin", severity: "error" },
  (lineup) => {
    const counts = lineup.players.map(() => 0);
    const reported = new Set<number>();
    const messages: string[] = [];
    lineup.innings.forEach((inning, i) => {
      const benched = inning.flatMap((slot, p) => (slot === "BN" ? [p] : []));
      const fewest = Math.min(...counts);
      const waiting = counts.flatMap((count, p) => (count === fewest && inning[p] !== "BN" ? [p] : []));
      if (waiting.length > 0) {
        for (const p of benched) {
          if (counts[p] > fewest && !reported.has(p)) {
            reported.add(p);
            messages.push(
              `${lineup.players[p].name} sits again in inning ${i + 1} before ${lineup.players[waiting[0]].name} has sat as often.`,
            );
          }
        }
      }
      for (const p of benched) counts[p]++;
    });
    return messages;
  },
);
