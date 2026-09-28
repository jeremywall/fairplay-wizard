import { describe, expect, it } from "vitest";
import { generateLineup, seasonBias } from "../../src/domain/generator";
import type { GameOptions } from "../../src/domain/lineup";
import { playerTotals, slotsOf } from "../../src/domain/lineup";
import { emptyTotals, type SeasonTotals, seasonTotals } from "../../src/domain/season";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i + 1}` }));

describe("seasonTotals", () => {
  it("adds up innings and positions across games", () => {
    const totals = seasonTotals([
      { players: ["a", "b"], innings: [["P", "BN"], ["LF", "C"]] },
      { players: ["b"], innings: [["SS"]] },
    ]);
    expect(totals.get("a")).toEqual({
      games: 1, field: 2, bench: 0, infield: 1, outfield: 1, pitcher: 1, catcher: 0, positions: { P: 1, LF: 1 },
    });
    expect(totals.get("b")).toMatchObject({ games: 2, field: 2, bench: 1, catcher: 1, positions: { C: 1, SS: 1 } });
  });
});

describe("seasonBias", () => {
  it("is neutral without history and compares per game played", () => {
    const none = seasonBias(players(2));
    expect(none.bench).toEqual([0, 0]);

    const a: SeasonTotals = { ...emptyTotals(), games: 2, bench: 4 };
    const b: SeasonTotals = { ...emptyTotals(), games: 4, bench: 4 };
    const bias = seasonBias(players(3), new Map([["p0", a], ["p1", b]]));
    expect(bias.bench).toEqual([0.5, -0.5, 0]); // 2/game vs 1/game; p2 has no history
  });
});

describe("generateLineup with season history (SR-3)", () => {
  const options: GameOptions = { innings: 6, alignmentMode: 9, pitcherInningLimit: 2, minDefensiveOuts: 6, minInfieldInnings: 2 };

  it("benches players who have sat less this season", () => {
    // 10 players, 9 fielders, 6 innings: only 6 of the 10 sit each game.
    const season = new Map(players(10).map((p, i) => [p.id, { ...emptyTotals(), games: 4, bench: i < 5 ? 8 : 0 }]));
    let satALot = 0;
    let neverSat = 0;
    for (let run = 0; run < 40; run++) {
      const { lineup, hardViolations } = generateLineup(players(10), options, { season });
      expect(hardViolations).toBe(0);
      lineup.players.forEach((_, p) => {
        const bench = playerTotals(slotsOf(lineup, p)).bench;
        if (p < 5) satALot += bench;
        else neverSat += bench;
      });
    }
    expect(neverSat).toBeGreaterThan(satALot * 2);
  });

  it("gives the mound to players who have pitched less", () => {
    const season = new Map(players(10).map((p, i) => [p.id, { ...emptyTotals(), games: 4, pitcher: i < 5 ? 6 : 0 }]));
    let veterans = 0;
    for (let run = 0; run < 40; run++) {
      const { lineup } = generateLineup(players(10), options, { season });
      lineup.players.forEach((_, p) => {
        if (p < 5) veterans += playerTotals(slotsOf(lineup, p)).pitcher;
      });
    }
    // 6 pitching innings a game; without history about half would go to the first five.
    expect(veterans / (40 * 6)).toBeLessThan(0.25);
  });
});
