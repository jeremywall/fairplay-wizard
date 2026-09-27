// Season-to-date totals from finalized games (docs/rules.md SR-3 and season stats).

import { playerTotals } from "./lineup";
import type { PositionId, Slot } from "./positions";

export interface GameRecord {
  /** Player ids present, in the game's batting order. */
  battingOrder: string[];
  /** `innings[i][k]` is the slot of `battingOrder[k]` in inning i + 1. */
  innings: Slot[][];
  /** Team plate appearances, or null if not recorded. */
  plateAppearances: number | null;
}

export interface SeasonTotals {
  games: number;
  field: number;
  bench: number;
  /** Includes pitcher and catcher, as in the rules. */
  infield: number;
  outfield: number;
  pitcher: number;
  catcher: number;
  positions: Partial<Record<PositionId, number>>;
  plateAppearances: number;
}

export function emptyTotals(): SeasonTotals {
  return { games: 0, field: 0, bench: 0, infield: 0, outfield: 0, pitcher: 0, catcher: 0, positions: {}, plateAppearances: 0 };
}

/**
 * Splits a team's plate appearances over the batting order: everyone gets a
 * turn per time through the order, and the top of the order gets the extras.
 */
export function plateAppearancesByPlayer(battingOrder: readonly string[], total: number): Map<string, number> {
  const result = new Map<string, number>();
  const laps = Math.floor(total / battingOrder.length);
  const extra = total % battingOrder.length;
  battingOrder.forEach((id, k) => result.set(id, laps + (k < extra ? 1 : 0)));
  return result;
}

export function seasonTotals(games: readonly GameRecord[]): Map<string, SeasonTotals> {
  const totals = new Map<string, SeasonTotals>();
  for (const game of games) {
    const plateAppearances =
      game.plateAppearances === null ? new Map<string, number>() : plateAppearancesByPlayer(game.battingOrder, game.plateAppearances);
    game.battingOrder.forEach((id, k) => {
      const t = totals.get(id) ?? emptyTotals();
      const g = playerTotals(game.innings.map((inning) => inning[k]));
      t.games++;
      t.field += g.field;
      t.bench += g.bench;
      t.infield += g.infield;
      t.outfield += g.outfield;
      t.pitcher += g.pitcher;
      t.catcher += g.catcher;
      for (const [position, count] of g.positions) t.positions[position] = (t.positions[position] ?? 0) + count;
      t.plateAppearances += plateAppearances.get(id) ?? 0;
      totals.set(id, t);
    });
  }
  return totals;
}
