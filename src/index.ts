import { Hono } from "hono";
import { createAuth } from "./auth";
import { TeamAccessError } from "./db/teams";
import { sameOrigin } from "./middleware/same-origin";
import { loadSession } from "./middleware/session";
import { appRoutes } from "./routes/app";
import { authRoutes } from "./routes/auth";
import type { AppEnv } from "./types";

// Static files in /public are served directly by Workers Static Assets. Only
// the paths listed in wrangler.jsonc `run_worker_first` reach this Worker.
const app = new Hono<AppEnv>();

app.use("*", async (c, next) => {
  c.set("auth", createAuth(c.env));
  await next();
});

// Better Auth's JSON API. It does its own origin checks.
app.on(["GET", "POST"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw));

app.use("/auth/*", sameOrigin);
app.use("/app/*", sameOrigin, loadSession);
app.route("/auth", authRoutes);
app.route("/app", appRoutes);

app.onError((err, c) => {
  if (err instanceof TeamAccessError) return c.text("Not found", 404);
  console.error(err);
  return c.text("Something went wrong.", 500);
});

export default app;
