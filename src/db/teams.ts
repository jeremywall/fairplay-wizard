import type { AlignmentMode } from "../domain/positions";
import type { Season, TeamInfo } from "../domain/team-season";

// Team data access. Every query is scoped to teams the calling coach belongs
// to, because D1 has no row-level security.

export type TeamRole = "head" | "assistant";

export interface TeamSummary {
  id: string;
  name: string;
  year: number;
  season: Season;
  role: TeamRole;
}

export class TeamAccessError extends Error {
  constructor() {
    super("Team not found");
  }
}

export async function listTeamsForCoach(db: D1Database, coachId: string): Promise<TeamSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.name, t.year, t.season, tc.role
         FROM team t
         JOIN team_coach tc ON tc.team_id = t.id
        WHERE tc.user_id = ?`,
    )
    .bind(coachId)
    .all<TeamSummary>();
  return results;
}

/** Creates a team with the calling coach as its head coach. */
export async function createTeam(db: D1Database, coachId: string, team: TeamInfo): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO team (id, name, year, season) VALUES (?, ?, ?, ?)`).bind(id, team.name, team.year, team.season),
    db.prepare(`INSERT INTO team_coach (team_id, user_id, role) VALUES (?, ?, 'head')`).bind(id, coachId),
  ]);
  return id;
}

/**
 * Returns the coach's role on the team, or throws TeamAccessError if the coach
 * doesn't belong to it. Call this before reading or changing any team data.
 */
export async function requireTeamAccess(db: D1Database, coachId: string, teamId: string): Promise<TeamRole> {
  const row = await db
    .prepare(`SELECT role FROM team_coach WHERE team_id = ? AND user_id = ?`)
    .bind(teamId, coachId)
    .first<{ role: TeamRole }>();
  if (!row) throw new TeamAccessError();
  return row.role;
}

export interface TeamDetails {
  id: string;
  name: string;
  year: number;
  season: Season;
  inningsPerGame: number;
  minDefensiveOuts: number;
  /** Defense used when 10 or more players are present. */
  alignmentMode: AlignmentMode;
  /** HR-6 minimum infield innings per player per game. */
  minInfieldInnings: number;
}

/** Returns team details. Call requireTeamAccess first. */
export async function getTeam(db: D1Database, teamId: string): Promise<TeamDetails> {
  const team = await db
    .prepare(
      `SELECT id, name, year, season, innings_per_game AS inningsPerGame, min_defensive_outs AS minDefensiveOuts,
              alignment_mode AS alignmentMode, min_infield_innings AS minInfieldInnings
         FROM team WHERE id = ?`,
    )
    .bind(teamId)
    .first<TeamDetails>();
  if (!team) throw new TeamAccessError();
  return team;
}

/** Updates the team's name, year, season and game settings. Call requireTeamAccess first. */
export async function updateTeamSettings(
  db: D1Database,
  teamId: string,
  settings: TeamInfo & { inningsPerGame: number; minDefensiveOuts: number; minInfieldInnings: number; alignmentMode: AlignmentMode },
): Promise<void> {
  await db
    .prepare(
      `UPDATE team SET name = ?, year = ?, season = ?,
              innings_per_game = ?, min_defensive_outs = ?, min_infield_innings = ?, alignment_mode = ?
        WHERE id = ?`,
    )
    .bind(
      settings.name,
      settings.year,
      settings.season,
      settings.inningsPerGame,
      settings.minDefensiveOuts,
      settings.minInfieldInnings,
      settings.alignmentMode,
      teamId,
    )
    .run();
}
