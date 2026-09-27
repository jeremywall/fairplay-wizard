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

describe("lineup routes", () => {
  async function teamWithPlayers(count: number) {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    let html = "";
    for (let i = 1; i <= count; i++) {
      html = await (await post(`/app/teams/${teamId}/players`, { name: `Kid ${i}` }, { Cookie: cookie })).text();
    }
    const playerIds = [...html.matchAll(/players\/([^/"]+)\/move\?direction=up/g)].map((m) => m[1]);
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

    await post(`/app/teams/${teamId}/settings`, { inningsPerGame: "6", minDefensiveOuts: "6", alignmentMode: "9" }, { Cookie: cookie });
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
    const playerIds = [...html.matchAll(/players\/([^/"]+)\/move\?direction=up/g)].map((m) => m[1]);
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

  it("saves, finalizes, and carries the batting order into the next game", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const first = await generate(cookie, teamId, playerIds);
    const firstOrder = rowNames(first).slice(0, 7);
    expect(firstOrder).toEqual(["Ava", "Ben", "Cal", "Dee", "Eli", "Fay", "Gus"]);

    const saved = await (await saveFrom(cookie, teamId, first)).text();
    expect(saved).toContain("vs Cubs");
    expect(saved).toContain("Finalize game");
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];

    // 9 plate appearances with 7 batters: Ben (2nd) batted last.
    const final = await (await post(`/app/teams/${teamId}/games/${gameId}/finalize`, { plateAppearances: "9" }, { Cookie: cookie })).text();
    expect(final).toContain("Final");
    expect(final).toContain("Ben</span> batted last");

    const next = await generate(cookie, teamId, playerIds);
    expect(rowNames(next).slice(0, 7)).toEqual(["Cal", "Dee", "Eli", "Fay", "Gus", "Ava", "Ben"]);

    const teamPage = await (await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}`, { headers: { Cookie: cookie } })).text();
    expect(teamPage).toContain("Season stats");
    expect(teamPage).toMatch(/vs Cubs[\s\S]*Final/);
    // Ava led off and got 2 of the 9 plate appearances; 1 game, 6 innings split between field and bench.
    expect(teamPage).toMatch(/scope="row">Ava<\/th>\s*<td[^>]*>1<\/td>(\s*<td[^>]*>\d+<\/td>){7}\s*<td[^>]*>2<\/td>/);
  });

  it("reopens and deletes games", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const saved = await (await saveFrom(cookie, teamId, await generate(cookie, teamId, playerIds))).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    await post(`/app/teams/${teamId}/games/${gameId}/finalize`, { plateAppearances: "9" }, { Cookie: cookie });

    const reopened = await (await post(`/app/teams/${teamId}/games/${gameId}/reopen`, {}, { Cookie: cookie })).text();
    expect(reopened).toContain("Finalize game");
    expect(rowNames(await generate(cookie, teamId, playerIds))[0]).toBe("Ava");

    const res = await request("DELETE", `/app/teams/${teamId}/games/${gameId}`, { headers: { Cookie: cookie } });
    expect(await res.text()).toContain("No saved games yet.");
  });

  it("rejects invalid finalize input and tampered lineups", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const page = await generate(cookie, teamId, playerIds);
    const saved = await (await saveFrom(cookie, teamId, page)).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    const bad = await (await post(`/app/teams/${teamId}/games/${gameId}/finalize`, { plateAppearances: "-1" }, { Cookie: cookie })).text();
    expect(bad).toContain("Plate appearances must be a whole number");

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

    const ok = await (await post(settings, { inningsPerGame: "4", minDefensiveOuts: "6", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(ok).toContain("Saved");
    const bad = await (await post(settings, { inningsPerGame: "4", minDefensiveOuts: "13", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(bad).toContain("from 0 to 12");
    const tooShort = await (await post(settings, { inningsPerGame: "2", minDefensiveOuts: "3", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(tooShort).toContain("from 3 to 9");
    const noMode = await (await post(settings, { inningsPerGame: "6", minDefensiveOuts: "6", alignmentMode: "11" }, { Cookie: cookie })).text();
    expect(noMode).toContain("Choose a 9-player or 10-player defense.");
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
