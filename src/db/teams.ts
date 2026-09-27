// Team data access. Every query is scoped to teams the calling coach belongs
// to, because D1 has no row-level security.

export type TeamRole = "head" | "assistant";

export interface TeamSummary {
  id: string;
  name: string;
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
      `SELECT t.id, t.name, tc.role
         FROM team t
         JOIN team_coach tc ON tc.team_id = t.id
        WHERE tc.user_id = ?
        ORDER BY t.name COLLATE NOCASE`,
    )
    .bind(coachId)
    .all<TeamSummary>();
  return results;
}

/** Creates a team with the calling coach as its head coach. */
export async function createTeam(db: D1Database, coachId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO team (id, name) VALUES (?, ?)`).bind(id, name),
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
  inningsPerGame: number;
  minDefensiveOuts: number;
}

/** Returns team details. Call requireTeamAccess first. */
export async function getTeam(db: D1Database, teamId: string): Promise<TeamDetails> {
  const team = await db
    .prepare(
      `SELECT id, name, innings_per_game AS inningsPerGame, min_defensive_outs AS minDefensiveOuts
         FROM team WHERE id = ?`,
    )
    .bind(teamId)
    .first<TeamDetails>();
  if (!team) throw new TeamAccessError();
  return team;
}

/** Updates game settings. Call requireTeamAccess first. */
export async function updateTeamSettings(
  db: D1Database,
  teamId: string,
  settings: { inningsPerGame: number; minDefensiveOuts: number },
): Promise<void> {
  await db
    .prepare(`UPDATE team SET innings_per_game = ?, min_defensive_outs = ? WHERE id = ?`)
    .bind(settings.inningsPerGame, settings.minDefensiveOuts, teamId)
    .run();
}
