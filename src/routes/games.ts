import { Hono } from "hono";
import { deleteGame, finalizeGame, getGame, reopenGame, saveGame } from "../db/games";
import { listPlayers } from "../db/players";
import { getTeam } from "../db/teams";
import { fairness } from "../domain/fairness";
import { type Lineup, MAX_INNINGS, MIN_INNINGS } from "../domain/lineup";
import { MIN_PLAYERS, POSITIONS, type Slot } from "../domain/positions";
import { checkLineup } from "../domain/rules";
import type { AppEnv } from "../types";
import { gamePage } from "../views/games";
import { renderTeamPage } from "./team-page";

// Mounted at /app/teams/:teamId/games. Team access is checked by the parent router.
export const gameRoutes = new Hono<AppEnv>();

const VALID_SLOTS = new Set<string>([...Object.keys(POSITIONS), "BN"]);

async function renderGame(db: D1Database, teamId: string, gameId: string) {
  const game = await getGame(db, teamId, gameId);
  const lineup: Lineup = { players: game.players, options: game.options, innings: game.innings };
  return gamePage(teamId, game, lineup, checkLineup(lineup), fairness(lineup));
}

/**
 * Parses the lineup posted from the Save form. Returns null unless every player
 * is an active player on this team and the grid has the right shape.
 */
function parseLineup(raw: unknown, innings: number, rosterIds: Set<string>): { players: string[]; innings: Slot[][] } | null {
  if (typeof raw !== "string") return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const { players, innings: grid } = (data ?? {}) as { players?: unknown; innings?: unknown };
  if (!Array.isArray(players) || !Array.isArray(grid)) return null;
  if (players.length < MIN_PLAYERS || new Set(players).size !== players.length) return null;
  if (!players.every((id) => typeof id === "string" && rosterIds.has(id))) return null;
  if (grid.length !== innings) return null;
  const validRow = (row: unknown) =>
    Array.isArray(row) && row.length === players.length && row.every((slot) => typeof slot === "string" && VALID_SLOTS.has(slot));
  if (!grid.every(validRow)) return null;
  return { players: players as string[], innings: grid as Slot[][] };
}

gameRoutes.post("/", async (c) => {
  const teamId = c.req.param("teamId")!;
  const [team, roster] = await Promise.all([getTeam(c.env.DB, teamId), listPlayers(c.env.DB, teamId)]);
  const form = await c.req.parseBody();
  const innings = Number(form.innings);
  const date = String(form.date ?? "");
  const opponent = String(form.opponent ?? "").trim() || null;

  if (!Number.isInteger(innings) || innings < MIN_INNINGS || innings > MAX_INNINGS) return c.text("Invalid innings.", 422);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.text("Enter the game date.", 422);
  if (opponent !== null && opponent.length > 60) return c.text("Opponent must be 60 characters or fewer.", 422);
  const lineup = parseLineup(form.lineup, innings, new Set(roster.map((p) => p.id)));
  if (!lineup) return c.text("Couldn't save this lineup. Generate it again and retry.", 422);

  const gameId = await saveGame(c.env.DB, teamId, {
    date,
    opponent,
    options: {
      innings,
      alignmentMode: team.alignmentMode,
      pitcherInningLimit: form.pitcherInningLimit === "1" ? 1 : 2,
      minDefensiveOuts: team.minDefensiveOuts,
      minInfieldInnings: team.minInfieldInnings,
    },
    players: lineup.players,
    innings: lineup.innings,
  });
  return c.html(await renderGame(c.env.DB, teamId, gameId));
});

gameRoutes.get("/:gameId", async (c) => {
  return c.html(await renderGame(c.env.DB, c.req.param("teamId")!, c.req.param("gameId")));
});

gameRoutes.post("/:gameId/finalize", async (c) => {
  const teamId = c.req.param("teamId")!;
  const gameId = c.req.param("gameId");
  await getGame(c.env.DB, teamId, gameId); // 404 if not this team's game
  await finalizeGame(c.env.DB, teamId, gameId);
  return c.html(await renderGame(c.env.DB, teamId, gameId));
});

gameRoutes.post("/:gameId/reopen", async (c) => {
  const teamId = c.req.param("teamId")!;
  const gameId = c.req.param("gameId");
  await getGame(c.env.DB, teamId, gameId); // 404 if not this team's game
  await reopenGame(c.env.DB, teamId, gameId);
  return c.html(await renderGame(c.env.DB, teamId, gameId));
});

gameRoutes.delete("/:gameId", async (c) => {
  const teamId = c.req.param("teamId")!;
  await deleteGame(c.env.DB, teamId, c.req.param("gameId"));
  return c.html(await renderTeamPage(c.env.DB, teamId));
});
