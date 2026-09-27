import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { addPlayer, listPlayers, movePlayer, removePlayer } from "../db/players";
import { createTeam, getTeam, listTeamsForCoach, requireTeamAccess, updateTeamSettings } from "../db/teams";
import { requireUser } from "../middleware/session";
import type { AppEnv } from "../types";
import { loginForm } from "../views/auth";
import { roster, teamPage, teamSettings } from "../views/roster";
import { teamItem, teamsPage } from "../views/teams";

export const appRoutes = new Hono<AppEnv>();

// Initial content for the app shell: the coach's teams, or the login form.
appRoutes.get("/home", async (c) => {
  const user = c.get("user");
  if (!user) return c.html(loginForm());
  return c.html(teamsPage(user, await listTeamsForCoach(c.env.DB, user.id)));
});

appRoutes.use("/teams", requireUser);
appRoutes.use("/teams/*", requireUser);

// Every /teams/:teamId route is limited to coaches of that team. Other coaches
// get a 404 (TeamAccessError, handled in src/index.ts).
const requireTeam = createMiddleware<AppEnv>(async (c, next) => {
  await requireTeamAccess(c.env.DB, c.get("user")!.id, c.req.param("teamId")!);
  await next();
});
appRoutes.use("/teams/:teamId", requireTeam);
appRoutes.use("/teams/:teamId/*", requireTeam);

appRoutes.post("/teams", async (c) => {
  const user = c.get("user")!;
  const name = String((await c.req.parseBody()).name ?? "").trim();
  if (!name || name.length > 80) return c.text("Team name must be 1–80 characters.", 422);
  const id = await createTeam(c.env.DB, user.id, name);
  return c.html(teamItem({ id, name, role: "head" }));
});

appRoutes.get("/teams/:teamId", async (c) => {
  const teamId = c.req.param("teamId");
  const [team, players] = await Promise.all([getTeam(c.env.DB, teamId), listPlayers(c.env.DB, teamId)]);
  return c.html(teamPage(team, players));
});

appRoutes.post("/teams/:teamId/settings", async (c) => {
  const teamId = c.req.param("teamId");
  const form = await c.req.parseBody();
  const inningsPerGame = Number(form.inningsPerGame);
  const minDefensiveOuts = Number(form.minDefensiveOuts);
  const team = await getTeam(c.env.DB, teamId);

  let error: string | undefined;
  if (!Number.isInteger(inningsPerGame) || inningsPerGame < 1 || inningsPerGame > 9) {
    error = "Innings per game must be a whole number from 1 to 9.";
  } else if (!Number.isInteger(minDefensiveOuts) || minDefensiveOuts < 0 || minDefensiveOuts > inningsPerGame * 3) {
    error = `Minimum defensive outs must be a whole number from 0 to ${inningsPerGame * 3}.`;
  }
  if (error) return c.html(teamSettings({ ...team, inningsPerGame, minDefensiveOuts }, { error }));

  await updateTeamSettings(c.env.DB, teamId, { inningsPerGame, minDefensiveOuts });
  return c.html(teamSettings({ ...team, inningsPerGame, minDefensiveOuts }, { saved: true }));
});

appRoutes.post("/teams/:teamId/players", async (c) => {
  const teamId = c.req.param("teamId");
  const form = await c.req.parseBody();
  const name = String(form.name ?? "").trim();
  const jerseyNumber = String(form.jerseyNumber ?? "").trim() || null;

  let error: string | undefined;
  if (!name || name.length > 60) error = "Player name must be 1–60 characters.";
  else if (jerseyNumber !== null && !/^\d{1,3}$/.test(jerseyNumber)) error = "Jersey number must be 1–3 digits.";
  if (!error) await addPlayer(c.env.DB, teamId, { name, jerseyNumber });

  return c.html(roster(teamId, await listPlayers(c.env.DB, teamId), { error }));
});

appRoutes.post("/teams/:teamId/players/:playerId/move", async (c) => {
  const teamId = c.req.param("teamId");
  const direction = c.req.query("direction");
  if (direction === "up" || direction === "down") {
    await movePlayer(c.env.DB, teamId, c.req.param("playerId"), direction);
  }
  return c.html(roster(teamId, await listPlayers(c.env.DB, teamId)));
});

appRoutes.delete("/teams/:teamId/players/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  await removePlayer(c.env.DB, teamId, c.req.param("playerId"));
  return c.html(roster(teamId, await listPlayers(c.env.DB, teamId)));
});
