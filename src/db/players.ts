// Roster data access. Callers must check requireTeamAccess for the team first;
// every query here is also scoped by team_id so a player id from another team
// never matches.

export interface Player {
  id: string;
  name: string;
  jerseyNumber: string | null;
}

/** Active players, in the order they were added. */
export async function listPlayers(db: D1Database, teamId: string): Promise<Player[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, jersey_number AS jerseyNumber
         FROM player
        WHERE team_id = ? AND active = 1
        ORDER BY roster_order`,
    )
    .bind(teamId)
    .all<Player>();
  return results;
}

/** Adds a player at the end of the roster. */
export async function addPlayer(
  db: D1Database,
  teamId: string,
  player: { name: string; jerseyNumber: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO player (id, team_id, name, jersey_number, roster_order)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(roster_order), 0) + 1 FROM player WHERE team_id = ?))`,
    )
    .bind(id, teamId, player.name, player.jerseyNumber, teamId)
    .run();
  return id;
}

/**
 * Removes a player from the roster. The row is kept (inactive) so that past
 * games and season stats still reference it.
 */
export async function removePlayer(db: D1Database, teamId: string, playerId: string): Promise<void> {
  await db.prepare(`UPDATE player SET active = 0 WHERE id = ? AND team_id = ?`).bind(playerId, teamId).run();
}
