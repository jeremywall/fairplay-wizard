// The year and season a team plays in, and the sort orders for the team list.

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABELS: Record<Season, string> = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter" };

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

export const TEAM_SORT_KEYS = ["name", "year", "season", "role"] as const;
export type TeamSortKey = (typeof TEAM_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export interface TeamSort {
  key: TeamSortKey;
  dir: SortDir;
}

/** Newest first: by year and season, latest first. */
export const DEFAULT_TEAM_SORT: TeamSort = { key: "year", dir: "desc" };

/** The direction a column sorts in when first chosen: dates newest first, text A–Z. */
export function firstDir(key: TeamSortKey): SortDir {
  return key === "year" ? "desc" : "asc";
}

/** Reads a sort from query values, falling back to the default for anything unknown. */
export function readTeamSort(sort?: string, dir?: string): TeamSort {
  if (!(TEAM_SORT_KEYS as readonly string[]).includes(sort ?? "")) return DEFAULT_TEAM_SORT;
  const key = sort as TeamSortKey;
  return { key, dir: dir === "asc" || dir === "desc" ? dir : firstDir(key) };
}

interface SortableTeam extends TeamInfo {
  role: "head" | "assistant";
}

// Seasons in calendar order within a year (winter games start in January).
const SEASON_ORDER: Record<Season, number> = { winter: 0, spring: 1, summer: 2, fall: 3 };
const ROLE_ORDER = { head: 0, assistant: 1 };

const byName = (a: SortableTeam, b: SortableTeam) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const byWhen = (a: SortableTeam, b: SortableTeam) => a.year - b.year || SEASON_ORDER[a.season] - SEASON_ORDER[b.season];

/**
 * Sorts teams by the chosen column. Ties fall back to newest season first,
 * then name, so the order is stable whichever column is chosen.
 */
export function sortTeams<T extends SortableTeam>(teams: readonly T[], sort: TeamSort): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const primary: Record<TeamSortKey, (a: T, b: T) => number> = {
    name: byName,
    year: byWhen,
    season: (a, b) => SEASON_ORDER[a.season] - SEASON_ORDER[b.season],
    role: (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
  };
  return [...teams].sort((a, b) => sign * primary[sort.key](a, b) || -byWhen(a, b) || byName(a, b));
}
