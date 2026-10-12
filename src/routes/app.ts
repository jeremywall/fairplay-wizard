import { Hono } from "hono";
import { html } from "hono/html";
import { createMiddleware } from "hono/factory";
import { hasLinkedProvider } from "../db/accounts";
import { addPlayer, listPlayers, removePlayer } from "../db/players";
import { createTeam, getTeam, listTeamsForCoach, requireTeamAccess, updateTeamSettings } from "../db/teams";
import { googleEnabled } from "../auth";
import { readTeamInfo, readTeamSort, seasonFor } from "../domain/team-season";
import { requireUser } from "../middleware/session";
import { gameRoutes } from "./games";
import { lineupRoutes } from "./lineup";
import { renderTeamPage } from "./team-page";
import type { AppEnv } from "../types";
import { loginForm } from "../views/auth";
import { roster, teamHeading, teamSettings } from "../views/roster";
import { teamsPage, teamTable } from "../views/teams";

export const appRoutes = new Hono<AppEnv>();

// Initial content for the app shell: the coach's teams, or the login form.
// Google sign-in returns to "/?login=error&error=<code>" if it fails, and
// Connect Google returns to "/?link=done" or "/?link=error&error=<code>".
appRoutes.get("/home", async (c) => {
  const user = c.get("user");
  const google = googleEnabled(c.env);
  const code = c.req.query("error") ?? "";
  if (!user) {
    let error: string | undefined;
    if (c.req.query("login") === "error") {
      error = /not.linked/i.test(code)
        ? "That email already has a password account. Sign in with your password, then use Connect Google on your teams page."
        : "Google sign-in didn't complete. Please try again.";
    }
    return c.html(loginForm({ error, google }));
  }

  let notice: { error?: boolean; text: string } | undefined;
  if (c.req.query("link") === "done") notice = { text: "Google is connected. Next time you can sign in with Google." };
  if (c.req.query("link") === "error") {
    notice = {
      error: true,
      text: /email/i.test(code)
        ? "Couldn't connect Google: use the Google account with the same email as this account."
        : /already.linked/i.test(code)
          ? "Couldn't connect Google: that Google account is already connected to a different account."
          : "Couldn't connect Google. Please try again.",
    };
  }
  const [teams, googleLinked] = await Promise.all([
    listTeamsForCoach(c.env.DB, user.id),
    google ? hasLinkedProvider(c.env.DB, user.id, "google") : Promise.resolve(false),
  ]);
  const sort = readTeamSort(c.req.query("sort"), c.req.query("dir"));
  const now = new Date();
  const defaults = { year: now.getUTCFullYear(), season: seasonFor(now) };
  return c.html(teamsPage(user, teams, sort, defaults, { google: google ? { linked: googleLinked } : undefined, notice }));
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

appRoutes.route("/teams/:teamId/lineup", lineupRoutes);
appRoutes.route("/teams/:teamId/games", gameRoutes);

// The team table, sorted by ?sort=<column>&dir=<asc|desc>.
appRoutes.get("/teams", async (c) => {
  const sort = readTeamSort(c.req.query("sort"), c.req.query("dir"));
  return c.html(teamTable(await listTeamsForCoach(c.env.DB, c.get("user")!.id), sort));
});

// Creates a team and returns the team table, keeping the table's sort.
appRoutes.post("/teams", async (c) => {
  const user = c.get("user")!;
  const form = await c.req.parseBody();
  const read = readTeamInfo(form);
  if ("error" in read) return c.text(read.error, 422);
  await createTeam(c.env.DB, user.id, read.info);
  const sort = readTeamSort(String(form.sort ?? ""), String(form.dir ?? ""));
  return c.html(teamTable(await listTeamsForCoach(c.env.DB, user.id), sort));
});

appRoutes.get("/teams/:teamId", async (c) => {
  return c.html(await renderTeamPage(c.env.DB, c.req.param("teamId")));
});

appRoutes.post("/teams/:teamId/settings", async (c) => {
  const teamId = c.req.param("teamId");
  const form = await c.req.parseBody();
  const inningsPerGame = Number(form.inningsPerGame);
  const minDefensiveOuts = Number(form.minDefensiveOuts);
  const minInfieldInnings = Number(form.minInfieldInnings);
  const alignmentMode = Number(form.alignmentMode);
  const team = await getTeam(c.env.DB, teamId);
  const read = readTeamInfo(form);

  let error: string | undefined;
  if ("error" in read) {
    error = read.error;
  } else if (!Number.isInteger(inningsPerGame) || inningsPerGame < 3 || inningsPerGame > 9) {
    error = "Innings per game must be a whole number from 3 to 9.";
  } else if (!Number.isInteger(minDefensiveOuts) || minDefensiveOuts < 0 || minDefensiveOuts > inningsPerGame * 3) {
    error = `Minimum defensive outs must be a whole number from 0 to ${inningsPerGame * 3}.`;
  } else if (!Number.isInteger(minInfieldInnings) || minInfieldInnings < 0 || minInfieldInnings > inningsPerGame) {
    error = `Minimum infield innings must be a whole number from 0 to ${inningsPerGame}.`;
  } else if (alignmentMode !== 9 && alignmentMode !== 10) {
    error = "Choose a 9-player or 10-player defense.";
  }
  if (error) return c.html(teamSettings({ ...team, ...read.info, inningsPerGame, minDefensiveOuts, minInfieldInnings }, { error }));

  const settings = { ...read.info, inningsPerGame, minDefensiveOuts, minInfieldInnings, alignmentMode: alignmentMode as 9 | 10 };
  await updateTeamSettings(c.env.DB, teamId, settings);
  // The page heading shows the name too, so update it out of band.
  return c.html(html`${teamSettings({ ...team, ...settings }, { saved: true })}${teamHeading({ ...team, ...settings }, true)}`);
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

appRoutes.delete("/teams/:teamId/players/:playerId", async (c) => {
  const teamId = c.req.param("teamId");
  await removePlayer(c.env.DB, teamId, c.req.param("playerId"));
  return c.html(roster(teamId, await listPlayers(c.env.DB, teamId)));
});
