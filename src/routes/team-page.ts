import { finalGameRecords, listGames } from "../db/games";
import { listPlayers } from "../db/players";
import { getTeam } from "../db/teams";
import { seasonTotals } from "../domain/season";
import { teamPage } from "../views/roster";

/** Renders the full team page. Call requireTeamAccess first. */
export async function renderTeamPage(db: D1Database, teamId: string) {
  const [team, players, games, records] = await Promise.all([
    getTeam(db, teamId),
    listPlayers(db, teamId),
    listGames(db, teamId),
    finalGameRecords(db, teamId),
  ]);
  return teamPage(team, players, games, seasonTotals(records));
}
