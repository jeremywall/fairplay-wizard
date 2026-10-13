// The year and season a team plays in, and the date order of the team list.

// In calendar order within a year: winter games start in January.
export const SEASONS = ["winter", "spring", "summer", "fall"] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABELS: Record<Season, string> = { winter: "Winter", spring: "Spring", summer: "Summer", fall: "Fall" };

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export function isSeason(value: unknown): value is Season {
  return typeof value === "string" && (SEASONS as readonly string[]).includes(value);
}

/** The season a date falls in: Mar–May spring, Jun–Jul summer, Aug–Nov fall, Dec–Feb winter. */
export function seasonFor(date: Date): Season {
  const month = date.getUTCMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 7) return "summer";
  if (month >= 8 && month <= 11) return "fall";
  return "winter";
}

export interface TeamInfo {
  name: string;
  year: number;
  season: Season;
}

/** Reads and checks a team's name, year and season from a form. */
export function readTeamInfo(form: Record<string, unknown>): { info: TeamInfo } | { error: string; info: TeamInfo } {
  const name = String(form.name ?? "").trim();
  const year = Number(form.year);
  const season = String(form.season ?? "");
  const info = { name, year, season: season as Season };
  if (!name || name.length > 80) return { error: "Team name must be 1–80 characters.", info };
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return { error: `Year must be a whole number from ${MIN_YEAR} to ${MAX_YEAR}.`, info };
  }
  if (!isSeason(season)) return { error: "Choose a season.", info };
  return { info };
}

/** A team's year and season as one label, e.g. "Fall 2026". */
export function seasonLabel(team: { year: number; season: Season }): string {
  return `${SEASON_LABELS[team.season]} ${team.year}`;
}

/**
 * Sorts teams in date order: by year, then by season within the year
 * (winter, spring, summer, fall), then by name.
 */
export function sortTeamsByDate<T extends TeamInfo>(teams: readonly T[]): T[] {
  return [...teams].sort(
    (a, b) =>
      a.year - b.year ||
      SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
