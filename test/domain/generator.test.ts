import { describe, expect, it } from "vitest";
import { minCostAssignment } from "../../src/domain/assignment";
import { fairness } from "../../src/domain/fairness";
import { generateLineup } from "../../src/domain/generator";
import type { GameOptions } from "../../src/domain/lineup";
import { type AlignmentMode, defaultAlignmentMode, fieldedPositions } from "../../src/domain/positions";
import { checkLineup } from "../../src/domain/rules";
import { lineupOf } from "./lineup-fixtures";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i + 1}` }));

describe("fieldedPositions", () => {
  it("follows the attendance table", () => {
    expect(fieldedPositions(6, 9)).toEqual([]);
    expect(fieldedPositions(7, 10)).toEqual(["P", "1B", "2B", "3B", "SS", "LC", "RC"]);
    expect(fieldedPositions(8, 10)).toEqual(["P", "C", "1B", "2B", "3B", "SS", "LC", "RC"]);
    expect(fieldedPositions(9, 10)).toEqual(["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]);
    expect(fieldedPositions(12, 9)).toEqual(["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]);
    expect(fieldedPositions(12, 10)).toEqual(["P", "C", "1B", "2B", "3B", "SS", "LF", "LC", "RC", "RF"]);
  });
  it("defaults to 10 positions only with 10 or more present", () => {
    expect(defaultAlignmentMode(9)).toBe(9);
    expect(defaultAlignmentMode(10)).toBe(10);
  });
});

describe("minCostAssignment", () => {
  it("finds the cheapest assignment", () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    expect(minCostAssignment(cost)).toEqual([1, 0, 2]);
  });
});

describe("fairness", () => {
  it("labels by the largest spread", () => {
    expect(fairness(lineupOf(["A: P LF BN", "B: 1B BN C"])).label).toBe("Excellent");
    const uneven = fairness(lineupOf(["A: P 1B 2B 3B", "B: BN LF BN RF"]));
    expect(uneven.spreads).toEqual({ bench: 2, infield: 4, outfield: 2 });
    expect(uneven.label).toBe("Uneven");
  });
});

/**
 * Counting conditions that every hard-rule-compliant lineup needs. Games that
 * fail them can't meet every hard rule (for example 7 players over 3 innings
 * only get 6 outfield slots for 7 players).
 */
function obviouslyInfeasible(n: number, options: GameOptions): boolean {
  const positions = fieldedPositions(n, options.alignmentMode);
  const infieldSlots = positions.filter((p) => ["P", "C", "1B", "2B", "3B", "SS"].includes(p)).length * options.innings;
  const outfieldSlots = (positions.length * options.innings) - infieldSlots;
  const maxBench = Math.ceil(((n - positions.length) * options.innings) / n);
  const minField = options.innings - maxBench;
  return (
    Math.ceil(options.innings / options.pitcherInningLimit) > n ||
    minField < 3 ||
    infieldSlots < 2 * n ||
    outfieldSlots < n
  );
}

describe("generateLineup", () => {
  const configs: { n: number; options: GameOptions }[] = [];
  for (let n = 7; n <= 13; n++) {
    for (let innings = 3; innings <= 9; innings++) {
      for (const pitcherInningLimit of [1, 2] as const) {
        const modes: AlignmentMode[] = n >= 10 ? [9, 10] : [9];
        for (const alignmentMode of modes) {
          configs.push({ n, options: { innings, alignmentMode, pitcherInningLimit, minDefensiveOuts: 6 } });
        }
      }
    }
  }

  it("meets every hard rule whenever the counting conditions allow it", () => {
    const failures: string[] = [];
    for (const { n, options } of configs) {
      if (obviouslyInfeasible(n, options)) continue;
      for (let run = 0; run < 3; run++) {
        const { lineup, hardViolations } = generateLineup(players(n), options);
        const errors = checkLineup(lineup).filter((v) => v.severity === "error");
        expect(hardViolations).toBe(errors.length);
        if (errors.length > 0) failures.push(`${n} players ${JSON.stringify(options)}: ${errors[0].ruleId}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("still returns a complete lineup, with violations reported, when the rules can't all be met", () => {
    const options: GameOptions = { innings: 9, alignmentMode: 9, pitcherInningLimit: 1, minDefensiveOuts: 6 };
    const { lineup, hardViolations } = generateLineup(players(7), options);
    expect(lineup.innings).toHaveLength(9);
    expect(hardViolations).toBeGreaterThan(0);
    expect(checkLineup(lineup).some((v) => v.ruleId === "HR-9")).toBe(true);
    expect(checkLineup(lineup).some((v) => v.ruleId === "HR-7")).toBe(false);
  });

  it("produces different lineups on repeated runs with the same inputs", () => {
    const options: GameOptions = { innings: 6, alignmentMode: 10, pitcherInningLimit: 2, minDefensiveOuts: 6 };
    const seen = new Set<string>();
    for (let run = 0; run < 10; run++) seen.add(JSON.stringify(generateLineup(players(11), options).lineup.innings));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("rejects fewer than 7 players", () => {
    const options: GameOptions = { innings: 6, alignmentMode: 9, pitcherInningLimit: 2, minDefensiveOuts: 6 };
    expect(() => generateLineup(players(6), options)).toThrow(RangeError);
  });
});
