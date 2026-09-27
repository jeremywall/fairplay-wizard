import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  await next();
});

// Sends signed-out users back to the login screen. HTMX follows HX-Redirect
// with a full page load.
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    if (c.req.header("HX-Request")) {
      c.header("HX-Redirect", "/");
      return c.body(null, 401);
    }
    return c.redirect("/");
  }
  await next();
});
