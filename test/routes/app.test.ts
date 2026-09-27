import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://example.com";

function post(path: string, form: Record<string, string>, headers: Record<string, string> = {}) {
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Origin: ORIGIN, "HX-Request": "true", ...headers },
    body: new URLSearchParams(form),
  });
}

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("app routes", () => {
  it("shows the login form to signed-out visitors", async () => {
    const res = await exports.default.fetch(`${ORIGIN}/app/home`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Coach sign in");
  });

  it("rejects cross-origin form posts", async () => {
    const res = await post("/app/teams", { name: "Tigers" }, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("redirects signed-out HTMX requests to the login screen", async () => {
    const res = await post("/app/teams", { name: "Tigers" });
    expect(res.status).toBe(401);
    expect(res.headers.get("HX-Redirect")).toBe("/");
  });

  it("lets a new coach sign up and create a team", async () => {
    const signup = await post("/auth/signup", { name: "Pat", email: "pat@example.com", password: "correct-horse" });
    expect(signup.headers.get("HX-Redirect")).toBe("/");
    const cookie = cookieHeader(signup);
    expect(cookie).not.toBe("");

    const created = await post("/app/teams", { name: "<Tigers>" }, { Cookie: cookie });
    expect(created.status).toBe(200);
    const fragment = await created.text();
    expect(fragment).toContain("&lt;Tigers&gt;");
    expect(fragment).not.toContain("<Tigers>");

    const home = await exports.default.fetch(`${ORIGIN}/app/home`, { headers: { Cookie: cookie } });
    expect(await home.text()).toContain("Pat's teams");
  });
});
