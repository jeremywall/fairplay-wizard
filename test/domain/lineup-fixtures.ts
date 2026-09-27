import type { GameOptions, Lineup } from "../../src/domain/lineup";
import type { Slot } from "../../src/domain/positions";

export const defaultOptions: GameOptions = { innings: 6, alignmentMode: 9, pitcherInningLimit: 2, minDefensiveOuts: 6 };

/**
 * Builds a lineup from one row per player, e.g. `"Ava: P 1B BN LF"`.
 * Each whitespace-separated slot is one inning.
 */
export function lineupOf(rows: string[], options: Partial<GameOptions> = {}): Lineup {
  const parsed = rows.map((row) => {
    const [name, slots] = row.split(":");
    return { name: name.trim(), slots: slots.trim().split(/\s+/) as Slot[] };
  });
  const innings = parsed[0].slots.length;
  return {
    players: parsed.map((p, i) => ({ id: `p${i}`, name: p.name })),
    options: { ...defaultOptions, innings, ...options },
    innings: Array.from({ length: innings }, (_, i) => parsed.map((p) => p.slots[i])),
  };
}
