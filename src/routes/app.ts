import { Hono } from "hono";
import { createTeam, listTeamsForCoach } from "../db/teams";
import { requireUser } from "../middleware/session";
import type { AppEnv } from "../types";
import { loginForm } from "../views/auth";
import { teamItem, teamsPage } from "../views/teams";

export const appRoutes = new Hono<AppEnv>();

// Initial content for the app shell: the coach's teams, or the login form.
appRoutes.get("/home", async (c) => {
  const user = c.get("user");
  if (!user) return c.html(loginForm());
  return c.html(teamsPage(user, await listTeamsForCoach(c.env.DB, user.id)));
});

appRoutes.use("/teams/*", requireUser);
appRoutes.use("/teams", requireUser);

appRoutes.post("/teams", async (c) => {
  const user = c.get("user")!;
  const name = String((await c.req.parseBody()).name ?? "").trim();
  if (!name || name.length > 80) return c.text("Team name must be 1–80 characters.", 422);
  const id = await createTeam(c.env.DB, user.id, name);
  return c.html(teamItem({ id, name, role: "head" }));
});
