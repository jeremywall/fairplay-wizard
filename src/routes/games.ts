import { Hono } from "hono";
import { deleteGame, finalizeGame, type GameDetail, getGame, reopenGame, saveGame, updateGameLineup } from "../db/games";
import { listPlayers } from "../db/players";
import { getTeam } from "../db/teams";
import { fairness } from "../domain/fairness";
import { type Lineup, MAX_INNINGS, MIN_INNINGS } from "../domain/lineup";
import { checkLineup } from "../domain/rules";
import type { AppEnv } from "../types";
import { gameEditPage, gamePage } from "../views/games";
import { lineupEditor } from "../views/lineup";
import { type PostedLineup, readLineup } from "./lineup-form";
import { renderTeamPage } from "./team-page";

// Mounted at /app/teams/:teamId/games. Team access is checked by the parent router.
export const gameRoutes = new Hono<AppEnv>();

async function renderGame(db: D1Database, teamId: string, gameId: string) {
  const game = await getGame(db, teamId, gameId);
  const lineup = lineupOf(game);
  return gamePage(teamId, game, lineup, checkLineup(lineup), fairness(lineup));
}

function lineupOf(game: GameDetail, innings = game.innings): Lineup {
  return { players: game.players, options: game.options, innings };
}

/** The editor's lineup for a saved game: the same players, with the game's own options. */
function readGameLineup(body: Record<string, unknown>, game: GameDetail): PostedLineup | null {
  const posted = readLineup(body, game.options.innings, new Set(game.players.map((p) => p.id)));
  if (!posted || posted.players.length !== game.players.length) return null;
  // Keep the game's player order, so innings[i][k] lines up with game.players[k].
  const order = new Map(posted.players.map((id, k) => [id, k]));
  const innings = posted.innings.map((row) => game.players.map((p) => row[order.get(p.id)!]));
  return { players: game.players.map((p) => p.id), innings };
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
  const lineup = readLineup(form, innings, new Set(roster.map((p) => p.id)));
  if (!lineup) return c.text("Couldn't save this lineup. Generate it again and retry.", 422);

  const gameId = await saveGame(c.env.DB, teamId, {
    date,
    opponent,
    options: {
      innings,
      alignmentMode: team.alignmentMode,
      pitcherInningLimit: form.pitcherInningLimit === "2" ? 2 : 1,
      minDefensiveOuts: team.minDefensiveOuts,
      minInfieldInnings: team.minInfieldInnings,
    },
    players: lineup.players,
    innings: lineup.innings,
  });
  // Show the saved game's own address, so refresh and back work (see src/views/ui.ts).
  c.header("HX-Push-Url", `/teams/${teamId}/games/${gameId}`);
  return c.html(await renderGame(c.env.DB, teamId, gameId));
});

gameRoutes.get("/:gameId", async (c) => {
  return c.html(await renderGame(c.env.DB, c.req.param("teamId")!, c.req.param("gameId")));
});

// Manual edits to a planned game. A final game shows its page instead: reopen it first.
gameRoutes.get("/:gameId/edit", async (c) => {
  const teamId = c.req.param("teamId")!;
  const game = await getGame(c.env.DB, teamId, c.req.param("gameId"));
  const lineup = lineupOf(game);
  if (game.status !== "planned") return c.html(gamePage(teamId, game, lineup, checkLineup(lineup), fairness(lineup)));
  return c.html(gameEditPage(teamId, game, lineup, checkLineup(lineup), fairness(lineup)));
});

// One edit in the editor: apply it and re-run the rule check.
gameRoutes.post("/:gameId/check", async (c) => {
  const teamId = c.req.param("teamId")!;
  const game = await getGame(c.env.DB, teamId, c.req.param("gameId"));
  const posted = readGameLineup(await c.req.parseBody(), game);
  if (!posted) return c.text("Couldn't read this lineup. Reload the page and retry.", 422);
  const lineup = lineupOf(game, posted.innings);
  return c.html(
    lineupEditor({ checkUrl: `/app/teams/${teamId}/games/${game.id}/check`, lineup, violations: checkLineup(lineup), report: fairness(lineup) }),
  );
});

gameRoutes.post("/:gameId/lineup", async (c) => {
  const teamId = c.req.param("teamId")!;
  const game = await getGame(c.env.DB, teamId, c.req.param("gameId"));
  const posted = readGameLineup(await c.req.parseBody(), game);
  if (!posted) return c.text("Couldn't save this lineup. Reload the page and retry.", 422);
  if (!(await updateGameLineup(c.env.DB, teamId, game.id, posted.players, posted.innings))) {
    return c.text("This game is final. Reopen it to change positions.", 409);
  }
  c.header("HX-Push-Url", `/teams/${teamId}/games/${game.id}`);
  return c.html(await renderGame(c.env.DB, teamId, game.id));
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
  // The deleted game's address no longer exists, so replace it with the team's.
  c.header("HX-Replace-Url", `/teams/${teamId}`);
  return c.html(await renderTeamPage(c.env.DB, teamId));
});
