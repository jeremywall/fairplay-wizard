import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://example.com";

function request(
  method: string,
  path: string,
  opts: { form?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  return exports.default.fetch(`${ORIGIN}${path}`, {
    method,
    headers: { Origin: ORIGIN, "HX-Request": "true", ...opts.headers },
    body: opts.form ? new URLSearchParams(opts.form) : undefined,
  });
}

const post = (path: string, form: Record<string, string>, headers?: Record<string, string>) =>
  request("POST", path, { form, headers });

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

/** Signs up a new coach and returns their session cookie. */
async function signUp(name: string): Promise<string> {
  const email = `${crypto.randomUUID()}@example.com`;
  const res = await post("/auth/signup", { name, email, password: "correct-horse" });
  expect(res.headers.get("HX-Redirect")).toBe("/");
  const cookie = cookieHeader(res);
  expect(cookie).not.toBe("");
  return cookie;
}

async function createTeam(cookie: string, name: string): Promise<string> {
  const res = await post("/app/teams", { name }, { Cookie: cookie });
  const id = (await res.text()).match(/hx-get="\/app\/teams\/([^"]+)"/)?.[1];
  expect(id).toBeDefined();
  return id!;
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
    const cookie = await signUp("Pat");

    const created = await post("/app/teams", { name: "<Tigers>" }, { Cookie: cookie });
    expect(created.status).toBe(200);
    const fragment = await created.text();
    expect(fragment).toContain("&lt;Tigers&gt;");
    expect(fragment).not.toContain("<Tigers>");

    const home = await exports.default.fetch(`${ORIGIN}/app/home`, { headers: { Cookie: cookie } });
    expect(await home.text()).toContain("Pat's teams");
  });
});

describe("roster routes", () => {
  it("adds, reorders and removes players", async () => {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    const players = `/app/teams/${teamId}/players`;

    await post(players, { name: "Ava", jerseyNumber: "3" }, { Cookie: cookie });
    const added = await (await post(players, { name: "Ben", jerseyNumber: "" }, { Cookie: cookie })).text();
    expect(added).toMatch(/Ava[\s\S]*#3[\s\S]*Ben/);

    const playerIds = [...added.matchAll(/players\/([^/"]+)\/move\?direction=up/g)].map((m) => m[1]);
    const benId = playerIds[1];
    const moved = await (await post(`${players}/${benId}/move?direction=up`, {}, { Cookie: cookie })).text();
    expect(moved).toMatch(/Ben[\s\S]*Ava/);

    const removed = await (await request("DELETE", `${players}/${benId}`, { headers: { Cookie: cookie } })).text();
    expect(removed).toContain("Ava");
    expect(removed).not.toContain("Ben");
  });

  it("validates player input", async () => {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    const res = await post(`/app/teams/${teamId}/players`, { name: "Ava", jerseyNumber: "abc" }, { Cookie: cookie });
    expect(await res.text()).toContain("Jersey number must be 1–3 digits.");
  });

  it("saves game settings and rejects impossible minimums", async () => {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    const settings = `/app/teams/${teamId}/settings`;

    const ok = await (await post(settings, { inningsPerGame: "4", minDefensiveOuts: "6" }, { Cookie: cookie })).text();
    expect(ok).toContain("Saved");
    const bad = await (await post(settings, { inningsPerGame: "4", minDefensiveOuts: "13" }, { Cookie: cookie })).text();
    expect(bad).toContain("from 0 to 12");
  });

  it("hides a team from coaches who don't belong to it", async () => {
    const owner = await signUp("Pat");
    const teamId = await createTeam(owner, "Tigers");
    const other = await signUp("Sam");

    const page = await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}`, { headers: { Cookie: other } });
    expect(page.status).toBe(404);
    const add = await post(`/app/teams/${teamId}/players`, { name: "Intruder" }, { Cookie: other });
    expect(add.status).toBe(404);
  });
});
