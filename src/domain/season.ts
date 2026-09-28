// Season-to-date totals from finalized games (docs/rules.md SR-3 and §9).

import { playerTotals } from "./lineup";
import type { PositionId, Slot } from "./positions";

export interface GameRecord {
  /** Player ids present. */
  players: string[];
  /** `innings[i][k]` is the slot of `players[k]` in inning i + 1. */
  innings: Slot[][];
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
}

export function emptyTotals(): SeasonTotals {
  return { games: 0, field: 0, bench: 0, infield: 0, outfield: 0, pitcher: 0, catcher: 0, positions: {} };
}

export function seasonTotals(games: readonly GameRecord[]): Map<string, SeasonTotals> {
  const totals = new Map<string, SeasonTotals>();
  for (const game of games) {
    game.players.forEach((id, k) => {
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
      totals.set(id, t);
    });
  }
  return totals;
}
