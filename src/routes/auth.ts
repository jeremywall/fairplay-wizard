import { Hono } from "hono";
import { googleEnabled } from "../auth";
import type { AppEnv } from "../types";
import { loginForm, signupForm } from "../views/auth";

// Form-based wrappers around Better Auth so HTMX can post plain forms and get
// HTML back. Better Auth's own JSON endpoints stay mounted at /api/auth/*,
// including the Google callback (/api/auth/callback/google).
export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/login", (c) => c.html(loginForm({ google: googleEnabled(c.env) })));
authRoutes.get("/signup", (c) => c.html(signupForm({ google: googleEnabled(c.env) })));

authRoutes.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const email = String(form.email ?? "");
  const res = await c.get("auth").api.signInEmail({
    body: { email, password: String(form.password ?? "") },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  if (!res.ok) return c.html(loginForm({ error: "Invalid email or password.", email, google: googleEnabled(c.env) }));
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
    const error = body?.message ?? "Could not create the account.";
    return c.html(signupForm({ error, name, email, google: googleEnabled(c.env) }));
  }
  return redirectHome(res);
});

// Starts Google sign-in: Better Auth returns Google's consent URL and sets a
// state cookie, and HTMX sends the browser to Google. Google redirects back to
// /api/auth/callback/google, which signs the coach in and returns to "/".
authRoutes.post("/google", async (c) => {
  if (!googleEnabled(c.env)) return c.text("Google sign-in isn't set up.", 404);
  const res = await c.get("auth").api.signInSocial({
    body: { provider: "google", callbackURL: "/", errorCallbackURL: "/?login=error" },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  const body = await res.json<{ url?: string }>().catch(() => null);
  if (!res.ok || !body?.url) {
    return c.html(loginForm({ error: "Couldn't start Google sign-in. Please try again.", google: true }));
  }
  const headers = new Headers({ "HX-Redirect": body.url });
  for (const cookie of res.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 200, headers });
});

// Links Google to the signed-in coach's existing account. Existing
// email/password accounts need this once: Better Auth won't link Google on
// sign-in to an account whose email the app never verified (it would let
// someone who pre-registered your email take over your Google sign-in).
authRoutes.post("/google/link", async (c) => {
  if (!googleEnabled(c.env)) return c.text("Google sign-in isn't set up.", 404);
  const res = await c.get("auth").api.linkSocialAccount({
    body: { provider: "google", callbackURL: "/?link=done", errorCallbackURL: "/?link=error" },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  const body = await res.json<{ url?: string }>().catch(() => null);
  if (!res.ok || !body?.url) {
    return new Response(null, { status: 200, headers: { "HX-Redirect": "/?link=error" } });
  }
  const headers = new Headers({ "HX-Redirect": body.url });
  for (const cookie of res.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 200, headers });
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
