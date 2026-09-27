// Roster data access. Callers must check requireTeamAccess for the team first;
// every query here is also scoped by team_id so a player id from another team
// never matches.

export interface Player {
  id: string;
  name: string;
  jerseyNumber: string | null;
  battingSlot: number;
}

/** Active players in fixed batting order. */
export async function listPlayers(db: D1Database, teamId: string): Promise<Player[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, jersey_number AS jerseyNumber, batting_slot AS battingSlot
         FROM player
        WHERE team_id = ? AND active = 1
        ORDER BY batting_slot`,
    )
    .bind(teamId)
    .all<Player>();
  return results;
}

/** Adds a player at the end of the batting order. */
export async function addPlayer(
  db: D1Database,
  teamId: string,
  player: { name: string; jerseyNumber: string | null },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO player (id, team_id, name, jersey_number, batting_slot)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(batting_slot), 0) + 1 FROM player WHERE team_id = ?))`,
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

/** Swaps a player with the active player directly above or below them in the batting order. */
export async function movePlayer(
  db: D1Database,
  teamId: string,
  playerId: string,
  direction: "up" | "down",
): Promise<void> {
  const player = await db
    .prepare(`SELECT batting_slot AS battingSlot FROM player WHERE id = ? AND team_id = ? AND active = 1`)
    .bind(playerId, teamId)
    .first<{ battingSlot: number }>();
  if (!player) return;

  const neighbor = await db
    .prepare(
      direction === "up"
        ? `SELECT id, batting_slot AS battingSlot FROM player
            WHERE team_id = ? AND active = 1 AND batting_slot < ? ORDER BY batting_slot DESC LIMIT 1`
        : `SELECT id, batting_slot AS battingSlot FROM player
            WHERE team_id = ? AND active = 1 AND batting_slot > ? ORDER BY batting_slot ASC LIMIT 1`,
    )
    .bind(teamId, player.battingSlot)
    .first<{ id: string; battingSlot: number }>();
  if (!neighbor) return;

  await db.batch([
    db.prepare(`UPDATE player SET batting_slot = ? WHERE id = ? AND team_id = ?`).bind(neighbor.battingSlot, playerId, teamId),
    db.prepare(`UPDATE player SET batting_slot = ? WHERE id = ? AND team_id = ?`).bind(player.battingSlot, neighbor.id, teamId),
  ]);
}
