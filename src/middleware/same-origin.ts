import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF protection for cookie-authenticated routes: state-changing requests must
// come from this app's own origin.
export const sameOrigin = createMiddleware(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method) && c.req.header("Origin") !== new URL(c.req.url).origin) {
    return c.text("Forbidden", 403);
  }
  await next();
});
