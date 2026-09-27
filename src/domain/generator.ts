/**
 * Lineup generator (docs/rules.md §6).
 *
 * Each attempt builds a whole game in three randomized steps:
 * 1. A round-robin bench schedule (HR-4), avoiding back-to-back sits (HR-11)
 *    and keeping everyone above the minimum field innings (HR-8).
 * 2. Pitching stints of at most the game's limit, each by a new pitcher who is
 *    fielded for the whole stint (HR-9, HR-10).
 * 3. For each inning, the remaining positions go to the fielded players by
 *    minimum-cost assignment. Costs steer toward the hard rules and soft
 *    preferences, and random noise makes Regenerate produce different lineups.
 *
 * Season-to-date totals (SR-3), when given, nudge every step: players who
 * have sat less often sit first, players who have pitched or caught less
 * pitch or catch first, and players who lean outfield are pulled toward the
 * infield. Totals are compared per game played, so missing games doesn't
 * earn a player extra time.
 *
 * Attempts are scored with the same rule check the coach sees. The best
 * lineup wins: fewest hard violations first, then the lowest soft cost.
 */

import { minCostAssignment } from "./assignment";
import { fairness } from "./fairness";
import { type GameOptions, type GamePlayer, type Lineup, minFieldInnings, playerTotals, slotsOf } from "./lineup";
import { categoryOf, fieldedPositions, MIN_PLAYERS, type PositionId, type Slot } from "./positions";
import type { Random } from "./random";
import { checkLineup } from "./rules";
import type { SeasonTotals } from "./season";

export interface GeneratorSettings {
  random?: Random;
  /** Upper bound on attempts; keeps CPU time predictable on Workers. */
  maxAttempts?: number;
  /** Stop early once this many rule-compliant lineups have been found. */
  targetCompliant?: number;
  /**
   * Give up looking for a compliant lineup after this many attempts without
   * one. Feasible games find one within a handful of attempts, so this mostly
   * caps the time spent on games where the rules can't all be met.
   */
  giveUpAfter?: number;
  /** Season-to-date totals from finalized games, by player id (SR-3). */
  season?: ReadonlyMap<string, SeasonTotals>;
}

export interface GeneratedLineup {
  lineup: Lineup;
  /** Hard-rule violations in the returned lineup (0 when every hard rule is met). */
  hardViolations: number;
}

export function generateLineup(
  players: GamePlayer[],
  options: GameOptions,
  settings: GeneratorSettings = {},
): GeneratedLineup {
  if (players.length < MIN_PLAYERS) throw new RangeError(`A game needs at least ${MIN_PLAYERS} players.`);
  const random = settings.random ?? Math.random;
  const maxAttempts = settings.maxAttempts ?? 150;
  const targetCompliant = settings.targetCompliant ?? 8;
  const giveUpAfter = settings.giveUpAfter ?? 30;

  const bias = seasonBias(players, settings.season);
  let best: { lineup: Lineup; hard: number; soft: number } | undefined;
  let compliant = 0;
  for (let attempt = 0; attempt < maxAttempts && compliant < targetCompliant; attempt++) {
    if (attempt >= giveUpAfter && compliant === 0) break;
    const lineup: Lineup = { players, options, innings: buildAttempt(players.length, options, bias, random) };
    const hard = checkLineup(lineup).filter((v) => v.severity === "error").length;
    if (hard === 0) compliant++;
    if (best && hard > best.hard) continue;
    const soft = softCost(lineup, bias);
    if (!best || hard < best.hard || soft < best.soft) best = { lineup, hard, soft };
  }
  return { lineup: best!.lineup, hardViolations: best!.hard };
}

/** Lower is better. Covers SR-1, SR-2, SR-3 and the fairness spreads. */
export function softCost(lineup: Lineup, bias: SeasonBias = seasonBias(lineup.players)): number {
  let cost = 0;
  lineup.players.forEach((_, p) => {
    const totals = playerTotals(slotsOf(lineup, p));
    for (const [position, count] of totals.positions) {
      if (position !== "P") cost += 3 * (count - 1);
      cost += count * bias.position(p, position);
    }
    cost += 2 * Math.max(0, Math.abs(totals.infield - totals.outfield) - 1);
    cost +=
      totals.bench * bias.bench[p] +
      totals.pitcher * bias.pitcher[p] +
      totals.catcher * bias.catcher[p] +
      totals.outfield * bias.outfieldLean[p];
  });
  const { spreads } = fairness(lineup);
  return cost + 2 * (spreads.bench + spreads.infield + spreads.outfield);
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Per-player season leanings, centered on the players present so that 0 means
 * "average". Positive bench means the player has sat more than average, and
 * so on. Players with no finalized games count as average.
 */
export interface SeasonBias {
  bench: number[];
  pitcher: number[];
  catcher: number[];
  /** Outfield minus infield innings per game, centered. */
  outfieldLean: number[];
  /** Innings per game the player has had at a position. */
  position(player: number, position: PositionId): number;
}

export function seasonBias(players: GamePlayer[], season?: ReadonlyMap<string, SeasonTotals>): SeasonBias {
  const history = players.map((p) => {
    const t = season?.get(p.id);
    return t && t.games > 0 ? t : undefined;
  });
  const centered = (rate: (t: SeasonTotals) => number) => {
    const rates = history.map((t) => (t ? rate(t) / t.games : undefined));
    const known = rates.filter((r): r is number => r !== undefined);
    const mean = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 0;
    return rates.map((r) => (r === undefined ? 0 : r - mean));
  };
  return {
    bench: centered((t) => t.bench),
    pitcher: centered((t) => t.pitcher),
    catcher: centered((t) => t.catcher),
    outfieldLean: centered((t) => t.outfield - t.infield),
    position: (player, position) => {
      const t = history[player];
      return t ? (t.positions[position] ?? 0) / t.games : 0;
    },
  };
}

/** Random order, tilted so lower keys tend to come first. */
function tiltedOrder(items: number[], key: (item: number) => number, random: Random): number[] {
  const scored = items.map((item) => ({ item, score: 2 * key(item) + random() }));
  return scored.sort((a, b) => a.score - b.score).map((s) => s.item);
}

function buildAttempt(playerCount: number, options: GameOptions, bias: SeasonBias, random: Random): Slot[][] {
  const positions = fieldedPositions(playerCount, options.alignmentMode);
  const innings = options.innings;
  const benchPerInning = playerCount - positions.length;
  const bench = planBench(playerCount, innings, benchPerInning, innings - minFieldInnings(options), bias, random);
  const pitchers = planPitchers(playerCount, innings, options.pitcherInningLimit, bench, bias, random);
  const openPositions = positions.filter((position) => position !== "P");

  const state = range(playerCount).map(() => ({
    infield: 0,
    outfield: 0,
    catcher: 0,
    /** Consecutive outfield innings, ignoring bench innings (HR-3). */
    outfieldStreak: 0,
    positions: new Map<PositionId, number>(),
  }));

  const result: Slot[][] = [];
  for (let i = 0; i < innings; i++) {
    const slots: Slot[] = new Array<Slot>(playerCount).fill("BN");
    const pitcher = pitchers[i];
    slots[pitcher] = "P";
    const fielders = range(playerCount).filter((p) => p !== pitcher && !bench[i].has(p));

    const cost = fielders.map((p) => {
      let futureField = 0;
      let futurePitch = 0;
      let earlyField = 0;
      for (let j = i + 1; j < innings; j++) {
        if (pitchers[j] === p) futurePitch++;
        else if (!bench[j].has(p)) futureField++;
        if (j < 3 && !bench[j].has(p)) earlyField++;
      }
      const s = state[p];
      const infieldNeed = Math.max(0, 2 - s.infield - futurePitch); // HR-6
      const needsOutfield = s.outfield === 0; // HR-2
      const needsEarlyInfield = i < 3 && s.infield === 0; // HR-5
      const willPitch = pitchers.includes(p);

      return openPositions.map((position) => {
        let c = random() * 3;
        if (categoryOf(position) === "outfield") {
          if (s.outfieldStreak >= 2) c += 1000; // HR-3
          if (infieldNeed > futureField) c += 1000; // HR-6 would become impossible
          if (needsEarlyInfield && earlyField === 0) c += 1000; // HR-5 would become impossible
          if (needsEarlyInfield) c += 4;
          c += (6 * infieldNeed) / (futureField + 1);
          c += 3 * Math.max(0, s.outfield - s.infield); // SR-2
          c += 1.5 * bias.outfieldLean[p]; // SR-3
        } else {
          if (needsOutfield && futureField === 0) c += 1000; // HR-2 would become impossible
          if (needsOutfield) c += 4 / (futureField + 1);
          c += 3 * Math.max(0, s.infield - s.outfield); // SR-2
          if (position === "C") {
            if (willPitch && s.catcher >= 3) c += 1000; // HR-1
            c += 8 * s.catcher;
            c += 2 * bias.catcher[p]; // SR-3
          }
        }
        c += bias.position(p, position); // SR-3
        return c + 6 * (s.positions.get(position) ?? 0); // SR-1
      });
    });

    minCostAssignment(cost).forEach((column, row) => {
      slots[fielders[row]] = openPositions[column];
    });

    slots.forEach((slot, p) => {
      if (slot === "BN") return;
      const s = state[p];
      s.positions.set(slot, (s.positions.get(slot) ?? 0) + 1);
      if (slot === "C") s.catcher++;
      if (categoryOf(slot) === "infield") {
        s.infield++;
        s.outfieldStreak = 0;
      } else {
        s.outfield++;
        s.outfieldStreak++;
      }
    });
    result.push(slots);
  }
  return result;
}

/**
 * Round-robin bench schedule. A new round starts only when everyone has sat in
 * the current one. Prefers players who didn't sit last inning and who can
 * still afford a bench inning, then players who have sat less this season.
 */
function planBench(
  playerCount: number,
  innings: number,
  perInning: number,
  maxBench: number,
  bias: SeasonBias,
  random: Random,
) {
  const plan: Set<number>[] = [];
  const counts = new Array<number>(playerCount).fill(0);
  let round = new Set(range(playerCount));
  let previous = new Set<number>();

  for (let i = 0; i < innings; i++) {
    const chosen = new Set<number>();
    while (chosen.size < perInning) {
      let candidates = [...round].filter((p) => !chosen.has(p));
      if (candidates.length === 0) {
        round = new Set(range(playerCount));
        candidates = [...round].filter((p) => !chosen.has(p));
      }
      candidates = tiltedOrder(candidates, (p) => bias.bench[p], random);
      const pick =
        candidates.find((p) => !previous.has(p) && counts[p] < maxBench) ??
        candidates.find((p) => !previous.has(p)) ??
        candidates[0];
      chosen.add(pick);
      round.delete(pick);
      counts[pick]++;
    }
    plan.push(chosen);
    previous = chosen;
  }
  return plan;
}

/**
 * Pitcher for each inning. Each stint is up to `limit` innings by a player who
 * hasn't pitched yet and is fielded throughout. When that's impossible it
 * falls back to shorter stints, and finally to breaking HR-9 or HR-10, so the
 * rule check can report it. Players who have pitched less this season go first.
 */
function planPitchers(
  playerCount: number,
  innings: number,
  limit: number,
  bench: Set<number>[],
  bias: SeasonBias,
  random: Random,
) {
  const plan: number[] = [];
  const pitched = new Set<number>();
  const fieldedFor = (p: number, from: number, to: number) => range(to - from).every((k) => !bench[from + k].has(p));

  let start = 0;
  while (start < innings) {
    const order = tiltedOrder(range(playerCount), (p) => bias.pitcher[p], random);
    let end = Math.min(start + limit, innings);
    let pitcher = order.find((p) => !pitched.has(p) && fieldedFor(p, start, end));
    if (pitcher === undefined) {
      end = start + 1;
      pitcher =
        order.find((p) => !pitched.has(p) && fieldedFor(p, start, end)) ??
        (start > 0 && !bench[start].has(plan[start - 1]) ? plan[start - 1] : undefined) ??
        order.find((p) => !bench[start].has(p))!;
    }
    pitched.add(pitcher);
    for (let i = start; i < end; i++) plan[i] = pitcher;
    start = end;
  }
  return plan;
}
