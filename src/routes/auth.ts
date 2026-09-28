import { Hono } from "hono";
import type { AppEnv } from "../types";
import { loginForm, signupForm } from "../views/auth";

// Form-based wrappers around Better Auth so HTMX can post plain forms and get
// HTML back. Better Auth's own JSON endpoints stay mounted at /api/auth/*.
export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/login", (c) => c.html(loginForm()));
authRoutes.get("/signup", (c) => c.html(signupForm()));

authRoutes.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const email = String(form.email ?? "");
  const res = await c.get("auth").api.signInEmail({
    body: { email, password: String(form.password ?? "") },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  if (!res.ok) return c.html(loginForm({ error: "Invalid email or password.", email }));
  return redirectHome(res);
});

authRoutes.post("/signup", async (c) => {
  const form = await c.req.parseBody();
  const name = String(form.name ?? "").trim();
  const email = String(form.email ?? "");
  const res = await c.get("auth").api.signUpEmail({
    body: { name, email, password: String(form.password ?? "") },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  if (!res.ok) {
    const body = await res.json<{ message?: string }>().catch(() => null);
    return c.html(signupForm({ error: body?.message ?? "Could not create the account.", name, email }));
  }
  return redirectHome(res);
});

authRoutes.post("/logout", async (c) => {
  const res = await c.get("auth").api.signOut({ headers: c.req.raw.headers, asResponse: true });
  return redirectHome(res);
});

// Passes Better Auth's session cookies through and reloads the app shell.
function redirectHome(authResponse: Response): Response {
  const headers = new Headers({ "HX-Redirect": "/" });
  for (const cookie of authResponse.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 200, headers });
}
