import { describe, expect, it } from "vitest";
import { readTeamInfo, seasonFor, seasonLabel, sortTeamsByDate } from "../../src/domain/team-season";

describe("team year and season", () => {
  it("picks the season a date falls in", () => {
    expect(seasonFor(new Date("2026-01-15"))).toBe("winter");
    expect(seasonFor(new Date("2026-04-15"))).toBe("spring");
    expect(seasonFor(new Date("2026-07-15"))).toBe("summer");
    expect(seasonFor(new Date("2026-10-15"))).toBe("fall");
    expect(seasonFor(new Date("2026-12-15"))).toBe("winter");
  });

  it("reads and checks a team's name, year and season", () => {
    expect(readTeamInfo({ name: " Tigers ", year: "2026", season: "fall" })).toEqual({ info: { name: "Tigers", year: 2026, season: "fall" } });
    expect(readTeamInfo({ name: "", year: "2026", season: "fall" })).toMatchObject({ error: "Team name must be 1–80 characters." });
    expect(readTeamInfo({ name: "Tigers", year: "26", season: "fall" })).toMatchObject({ error: "Year must be a whole number from 2000 to 2100." });
    expect(readTeamInfo({ name: "Tigers", year: "2026", season: "autumn" })).toMatchObject({ error: "Choose a season." });
  });

  it("labels a team's season with its year", () => {
    expect(seasonLabel({ year: 2026, season: "fall" })).toBe("Fall 2026");
  });
});

describe("sortTeamsByDate", () => {
  it("orders by year, then winter, spring, summer, fall, then name", () => {
    const teams = [
      { name: "Fall 26", year: 2026, season: "fall" },
      { name: "cubs", year: 2026, season: "spring" },
      { name: "Winter 26", year: 2026, season: "winter" },
      { name: "Summer 26", year: 2026, season: "summer" },
      { name: "Fall 25", year: 2025, season: "fall" },
      { name: "Bears", year: 2026, season: "spring" },
    ] as const;
    expect(sortTeamsByDate(teams).map((t) => t.name)).toEqual(["Fall 25", "Winter 26", "Bears", "cubs", "Summer 26", "Fall 26"]);
  });
});
