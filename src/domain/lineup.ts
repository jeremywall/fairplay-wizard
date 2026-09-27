import { type AlignmentMode, categoryOf, fieldedPositions, type PositionId, type Slot } from "./positions";

export interface GamePlayer {
  id: string;
  name: string;
}

export interface GameOptions {
  innings: number;
  alignmentMode: AlignmentMode;
  /** HR-9: maximum innings any one player may pitch. */
  pitcherInningLimit: 1 | 2;
  /** HR-8: team setting, enforced in whole innings. */
  minDefensiveOuts: number;
}

/** A full-game fielding lineup: `innings[i][p]` is player p's slot in inning i + 1. */
export interface Lineup {
  players: GamePlayer[];
  options: GameOptions;
  innings: Slot[][];
}

export const MIN_INNINGS = 3;
export const MAX_INNINGS = 9;

/** HR-8 minimum in whole innings. */
export function minFieldInnings(options: GameOptions): number {
  return Math.ceil(options.minDefensiveOuts / 3);
}

export function lineupPositions(lineup: Lineup): PositionId[] {
  return fieldedPositions(lineup.players.length, lineup.options.alignmentMode);
}

export function slotsOf(lineup: Lineup, player: number): Slot[] {
  return lineup.innings.map((inning) => inning[player]);
}

export interface PlayerTotals {
  pitcher: number;
  catcher: number;
  /** Infield by rule category: includes pitcher and catcher. */
  infield: number;
  outfield: number;
  bench: number;
  field: number;
  /** Innings at each specific position. */
  positions: Map<PositionId, number>;
}

export function playerTotals(slots: Slot[]): PlayerTotals {
  const totals: PlayerTotals = { pitcher: 0, catcher: 0, infield: 0, outfield: 0, bench: 0, field: 0, positions: new Map() };
  for (const slot of slots) {
    const category = categoryOf(slot);
    if (slot === "BN") {
      totals.bench++;
      continue;
    }
    totals.field++;
    totals.positions.set(slot, (totals.positions.get(slot) ?? 0) + 1);
    if (slot === "P") totals.pitcher++;
    if (slot === "C") totals.catcher++;
    if (category === "infield") totals.infield++;
    else totals.outfield++;
  }
  return totals;
}
