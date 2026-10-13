import { describe, expect, it } from "vitest";
import { readTeamInfo, readTeamSort, seasonFor, sortTeams } from "../../src/domain/team-season";

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

  it("falls back to the default sort for unknown columns", () => {
    expect(readTeamSort("bogus", "asc")).toEqual({ key: "season", dir: "desc" });
    // Year and season were separate columns before; old links get the default.
    expect(readTeamSort("year", "asc")).toEqual({ key: "season", dir: "desc" });
    expect(readTeamSort("name")).toEqual({ key: "name", dir: "asc" });
    expect(readTeamSort("season")).toEqual({ key: "season", dir: "desc" });
  });
});

describe("sortTeams", () => {
  const teams = [
    { name: "cubs", year: 2025, season: "fall", role: "assistant" },
    { name: "Tigers", year: 2026, season: "spring", role: "head" },
    { name: "Astros", year: 2026, season: "fall", role: "head" },
    { name: "Bears", year: 2026, season: "spring", role: "assistant" },
  ] as const;
  const names = (key: "name" | "season" | "role", dir: "asc" | "desc") => sortTeams(teams, { key, dir }).map((t) => t.name);

  it("sorts by name, ignoring case", () => {
    expect(names("name", "asc")).toEqual(["Astros", "Bears", "cubs", "Tigers"]);
    expect(names("name", "desc")).toEqual(["Tigers", "cubs", "Bears", "Astros"]);
  });

  it("sorts by year, then season within the year, then name", () => {
    expect(names("season", "desc")).toEqual(["Astros", "Bears", "Tigers", "cubs"]);
    expect(names("season", "asc")).toEqual(["cubs", "Bears", "Tigers", "Astros"]);
  });

  it("sorts by role, head coach first", () => {
    expect(names("role", "asc")).toEqual(["Astros", "Tigers", "Bears", "cubs"]);
  });
});
