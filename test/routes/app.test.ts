import { env, exports } from "cloudflare:workers";
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

/** Player ids from a rendered roster, in roster order. */
function playerIdsIn(rosterHtml: string): string[] {
  return [...rosterHtml.matchAll(/hx-delete="\/app\/teams\/[^/]+\/players\/([^"]+)"/g)].map((m) => m[1]);
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

  it("offers Google sign-in and sends the browser to Google", async () => {
    const home = await (await exports.default.fetch(`${ORIGIN}/app/home`)).text();
    expect(home).toContain("Continue with Google");

    const res = await post("/auth/google", {});
    const target = new URL(res.headers.get("HX-Redirect")!);
    expect(target.origin).toBe("https://accounts.google.com");
    expect(target.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(target.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
    expect(res.headers.getSetCookie().length).toBeGreaterThan(0); // OAuth state cookie
  });

  it("explains a failed Google sign-in", async () => {
    const home = await (await exports.default.fetch(`${ORIGIN}/app/home?login=error`)).text();
    expect(home).toContain("Google sign-in didn&#39;t complete");
    const notLinked = await (await exports.default.fetch(`${ORIGIN}/app/home?login=error&error=account_not_linked`)).text();
    expect(notLinked).toContain("then use Connect Google");
  });

  it("lets a password account connect Google", async () => {
    const cookie = await signUp("Pat");
    const home = await (await exports.default.fetch(`${ORIGIN}/app/home`, { headers: { Cookie: cookie } })).text();
    expect(home).toContain("Connect Google");

    const res = await post("/auth/google/link", {}, { Cookie: cookie });
    const target = new URL(res.headers.get("HX-Redirect")!);
    expect(target.origin).toBe("https://accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);

    const done = await (await exports.default.fetch(`${ORIGIN}/app/home?link=done`, { headers: { Cookie: cookie } })).text();
    expect(done).toContain("Google is connected");
  });

  it("hides Connect Google once Google is linked", async () => {
    const cookie = await signUp("Pat");
    const userId = (await env.DB.prepare(`SELECT userId FROM session ORDER BY createdAt DESC LIMIT 1`).first<{ userId: string }>())!.userId;
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES (?, ?, 'google', ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), "google-sub-123", userId, now, now)
      .run();
    const home = await (await exports.default.fetch(`${ORIGIN}/app/home`, { headers: { Cookie: cookie } })).text();
    expect(home).not.toContain("Connect Google");
  });

  it("won't start Connect Google without a session", async () => {
    const res = await post("/auth/google/link", {});
    expect(res.headers.get("HX-Redirect")).toBe("/?link=error");
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

describe("lineup routes", () => {
  async function teamWithPlayers(count: number) {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    let html = "";
    for (let i = 1; i <= count; i++) {
      html = await (await post(`/app/teams/${teamId}/players`, { name: `Kid ${i}` }, { Cookie: cookie })).text();
    }
    const playerIds = playerIdsIn(html);
    return { cookie, teamId, playerIds };
  }

  function generate(teamId: string, cookie: string, playerIds: string[], extra: Record<string, string> = {}) {
    const body = new URLSearchParams({ innings: "6", pitcherInningLimit: "2", ...extra });
    for (const id of playerIds) body.append("player", id);
    return exports.default.fetch(`${ORIGIN}/app/teams/${teamId}/lineup`, {
      method: "POST",
      headers: { Origin: ORIGIN, "HX-Request": "true", Cookie: cookie },
      body,
    });
  }

  it("shows the setup form with the roster as an attendance checklist", async () => {
    const { cookie, teamId } = await teamWithPlayers(3);
    const res = await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}/lineup`, { headers: { Cookie: cookie } });
    const page = await res.text();
    expect(page).toContain("Who's here?");
    expect(page.match(/data-attendance/g)).toHaveLength(3);
    expect(page).toMatch(/name="pitcherInningLimit" value="1" checked/);
  });

  it("asks for at least 7 players", async () => {
    const { cookie, teamId, playerIds } = await teamWithPlayers(7);
    const page = await (await generate(teamId, cookie, playerIds.slice(0, 6))).text();
    expect(page).toContain("Check at least 7 players as present (6 checked).");
  });

  it("generates a lineup that meets every hard rule for a typical game", async () => {
    const { cookie, teamId, playerIds } = await teamWithPlayers(11);
    const page = await (await generate(teamId, cookie, playerIds)).text();
    expect(page).not.toMatch(/HR-\d+<\/span>/);
    expect(page).not.toContain("Some rules can't all be met");
    expect(page.match(/<tr>/g)?.length).toBeGreaterThanOrEqual(22); // grid + summary rows
    expect(page).toContain(">LC<");
    expect(page).toContain("Regenerate");
  });

  it("uses the team's defense setting with 10 or more players", async () => {
    const { cookie, teamId, playerIds } = await teamWithPlayers(11);
    const setup = await (await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}/lineup`, { headers: { Cookie: cookie } })).text();
    expect(setup).toContain("10-player defense");

    await post(`/app/teams/${teamId}/settings`, { inningsPerGame: "6", minDefensiveOuts: "6", minInfieldInnings: "2", alignmentMode: "9" }, { Cookie: cookie });
    const page = await (await generate(teamId, cookie, playerIds, { alignmentMode: "10" })).text();
    expect(page).toContain("11 players · 9 fielders");
    expect(page).toContain(">CF<");
    expect(page).not.toContain(">LC<");
  });

  it("reports rules that can't be met instead of failing", async () => {
    const { cookie, teamId, playerIds } = await teamWithPlayers(7);
    const page = await (await generate(teamId, cookie, playerIds, { innings: "9", pitcherInningLimit: "1" })).text();
    expect(page).toContain("HR-9");
    expect(page).toContain("Some rules can't all be met");
  });

  it("ignores players from other teams", async () => {
    const { cookie, teamId, playerIds } = await teamWithPlayers(7);
    const other = await teamWithPlayers(1);
    const page = await (await generate(teamId, cookie, [...playerIds.slice(0, 6), other.playerIds[0]])).text();
    expect(page).toContain("(6 checked)");
  });

  it("is limited to the team's coaches", async () => {
    const { teamId, playerIds } = await teamWithPlayers(7);
    const stranger = await signUp("Sam");
    expect((await generate(teamId, stranger, playerIds)).status).toBe(404);
  });
});

describe("game routes", () => {
  const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const rowNames = (page: string) => [...page.matchAll(/scope="row">([^<]+)<\/th>/g)].map((m) => m[1]);

  async function setup() {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    let html = "";
    for (const name of ["Ava", "Ben", "Cal", "Dee", "Eli", "Fay", "Gus"]) {
      html = await (await post(`/app/teams/${teamId}/players`, { name }, { Cookie: cookie })).text();
    }
    const playerIds = playerIdsIn(html);
    return { cookie, teamId, playerIds };
  }

  async function generate(cookie: string, teamId: string, playerIds: string[]) {
    const body = new URLSearchParams({ innings: "6", pitcherInningLimit: "2" });
    for (const id of playerIds) body.append("player", id);
    const res = await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}/lineup`, {
      method: "POST",
      headers: { Origin: ORIGIN, "HX-Request": "true", Cookie: cookie },
      body,
    });
    return res.text();
  }

  async function saveFrom(cookie: string, teamId: string, lineupPage: string, extra: Record<string, string> = {}) {
    const lineup = decode(lineupPage.match(/name="lineup" value="([^"]+)"/)![1]);
    return post(
      `/app/teams/${teamId}/games`,
      { lineup, innings: "6", pitcherInningLimit: "2", date: "2026-10-04", opponent: "Cubs", ...extra },
      { Cookie: cookie },
    );
  }

  it("saves a lineup and finalizes it into season stats", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const first = await generate(cookie, teamId, playerIds);
    expect(rowNames(first).slice(0, 7)).toEqual(["Ava", "Ben", "Cal", "Dee", "Eli", "Fay", "Gus"]);

    const savedRes = await saveFrom(cookie, teamId, first);
    const saved = await savedRes.text();
    expect(savedRes.headers.get("HX-Push-Url")).toBe(`/teams/${teamId}/games/${saved.match(/games\/([^/"]+)\/finalize/)![1]}`);
    expect(saved).toContain("vs Cubs");
    expect(saved).toContain("Finalize game");
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];

    const final = await (await post(`/app/teams/${teamId}/games/${gameId}/finalize`, {}, { Cookie: cookie })).text();
    expect(final).toContain("counts toward season stats");

    const teamPage = await (await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}`, { headers: { Cookie: cookie } })).text();
    expect(teamPage).toMatch(/vs Cubs[\s\S]*Final/);
    // 7 players and 7 positions: Ava played all 6 innings of 1 game and never sat.
    expect(teamPage).toMatch(/scope="row">Ava<\/th>\s*<td[^>]*>1<\/td>\s*<td[^>]*>6<\/td>\s*<td[^>]*>0<\/td>/);

    // The next lineup shows season totals including the proposed game: 2 games, 12 innings for Ava.
    const next = await generate(cookie, teamId, playerIds);
    const seasonTable = next.slice(next.indexOf("Season totals with this lineup"));
    const avaRow = seasonTable.match(/scope="row">Ava<\/th>([\s\S]*?)<\/tr>/)![1];
    const [games, ...innings] = [...avaRow.matchAll(/<td[^>]*>(\d+)/g)].map((m) => Number(m[1]));
    expect(games).toBe(2);
    expect(innings).toHaveLength(5);
    expect(innings.reduce((a, b) => a + b, 0)).toBe(12);
  });

  it("reopens and deletes games", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const saved = await (await saveFrom(cookie, teamId, await generate(cookie, teamId, playerIds))).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    await post(`/app/teams/${teamId}/games/${gameId}/finalize`, {}, { Cookie: cookie });

    const reopened = await (await post(`/app/teams/${teamId}/games/${gameId}/reopen`, {}, { Cookie: cookie })).text();
    expect(reopened).toContain("Finalize game");

    const res = await request("DELETE", `/app/teams/${teamId}/games/${gameId}`, { headers: { Cookie: cookie } });
    expect(res.headers.get("HX-Replace-Url")).toBe(`/teams/${teamId}`);
    expect(await res.text()).toContain("No saved games yet.");
  });

  it("rejects tampered lineups", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const other = await setup();
    const tampered = JSON.stringify({ players: [...playerIds.slice(0, 6), other.playerIds[0]], innings: [] });
    const res = await post(`/app/teams/${teamId}/games`, { lineup: tampered, innings: "6", date: "2026-10-04" }, { Cookie: cookie });
    expect(res.status).toBe(422);
  });

  it("hides games from coaches who don't belong to the team", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const saved = await (await saveFrom(cookie, teamId, await generate(cookie, teamId, playerIds))).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    const stranger = await signUp("Sam");
    const res = await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}/games/${gameId}`, { headers: { Cookie: stranger } });
    expect(res.status).toBe(404);
  });
});

describe("roster routes", () => {
  it("adds and removes players", async () => {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    const players = `/app/teams/${teamId}/players`;

    await post(players, { name: "Ava", jerseyNumber: "3" }, { Cookie: cookie });
    const added = await (await post(players, { name: "Ben", jerseyNumber: "" }, { Cookie: cookie })).text();
    expect(added).toMatch(/Ava[\s\S]*#3[\s\S]*Ben/);

    const benId = playerIdsIn(added)[1];

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

    const ok = await (await post(settings, { inningsPerGame: "4", minDefensiveOuts: "6", minInfieldInnings: "1", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(ok).toContain("Saved");
    const bad = await (await post(settings, { inningsPerGame: "4", minDefensiveOuts: "13", minInfieldInnings: "1", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(bad).toContain("from 0 to 12");
    const tooShort = await (await post(settings, { inningsPerGame: "2", minDefensiveOuts: "3", minInfieldInnings: "1", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(tooShort).toContain("from 3 to 9");
    const noMode = await (await post(settings, { inningsPerGame: "6", minDefensiveOuts: "6", minInfieldInnings: "1", alignmentMode: "11" }, { Cookie: cookie })).text();
    expect(noMode).toContain("Choose a 9-player or 10-player defense.");
    const tooMuchInfield = { inningsPerGame: "3", minDefensiveOuts: "6", minInfieldInnings: "4", alignmentMode: "10" };
    expect(await (await post(settings, tooMuchInfield, { Cookie: cookie })).text()).toContain(
      "Minimum infield innings must be a whole number from 0 to 3.",
    );
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
