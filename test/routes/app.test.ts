import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getGame } from "../../src/db/games";
import type { Slot } from "../../src/domain/positions";

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
  const res = await post("/app/teams", { name, year: "2026", season: "fall" }, { Cookie: cookie });
  const id = (await res.text()).match(/hx-get="\/app\/teams\/([^"?]+)"/)?.[1];
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

    const created = await post("/app/teams", { name: "<Tigers>", year: "2026", season: "summer" }, { Cookie: cookie });
    expect(created.status).toBe(200);
    const fragment = await created.text();
    expect(fragment).toContain("&lt;Tigers&gt;");
    expect(fragment).not.toContain("<Tigers>");
    expect(fragment).toMatch(/2026<\/td>\s*<td[^>]*>Summer<\/td>/);

    const home = await exports.default.fetch(`${ORIGIN}/app/home`, { headers: { Cookie: cookie } });
    expect(await home.text()).toContain("Pat's teams");
  });

  it("requires a year and season for a new team", async () => {
    const cookie = await signUp("Pat");
    const noSeason = await post("/app/teams", { name: "Tigers", year: "2026" }, { Cookie: cookie });
    expect(noSeason.status).toBe(422);
    expect(await noSeason.text()).toBe("Choose a season.");
    const badYear = await post("/app/teams", { name: "Tigers", year: "1999", season: "fall" }, { Cookie: cookie });
    expect(badYear.status).toBe(422);
  });

  it("sorts the team list by any column", async () => {
    const cookie = await signUp("Pat");
    await post("/app/teams", { name: "Bears", year: "2025", season: "fall" }, { Cookie: cookie });
    await post("/app/teams", { name: "Astros", year: "2026", season: "spring" }, { Cookie: cookie });
    const order = (page: string) => [...page.matchAll(/hx-push-url="\/teams\/[^"]+"[^>]*>([^<]+)</g)].map((m) => m[1]);
    const list = (query: string) => exports.default.fetch(`${ORIGIN}/app/teams${query}`, { headers: { Cookie: cookie } }).then((r) => r.text());

    expect(order(await list(""))).toEqual(["Astros", "Bears"]);
    expect(order(await list("?sort=name&dir=desc"))).toEqual(["Bears", "Astros"]);
    const byYear = await list("?sort=year&dir=asc");
    expect(order(byYear)).toEqual(["Bears", "Astros"]);
    // The active column's header flips the direction, and the address keeps the sort.
    expect(byYear).toContain('hx-get="/app/teams?sort=year&amp;dir=desc" hx-replace-url="/?sort=year&amp;dir=desc"');

    const home = await exports.default.fetch(`${ORIGIN}/app/home?sort=name&dir=desc`, { headers: { Cookie: cookie } });
    expect(order(await home.text())).toEqual(["Bears", "Astros"]);
    // Adding a team keeps the table's sort.
    const added = await post("/app/teams", { name: "Cubs", year: "2024", season: "winter", sort: "name", dir: "desc" }, { Cookie: cookie });
    expect(order(await added.text())).toEqual(["Cubs", "Bears", "Astros"]);
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

    await post(`/app/teams/${teamId}/settings`, { name: "Tigers", year: "2026", season: "fall", inningsPerGame: "6", minDefensiveOuts: "6", minInfieldInnings: "2", alignmentMode: "9" }, { Cookie: cookie });
    const page = await (await generate(teamId, cookie, playerIds, { alignmentMode: "10" })).text();
    expect(page).toContain("11 players · 9 fielders");
    expect(page).toContain(">CF<");
    expect(page).not.toContain(">LC<");
  });

  it("reports rules that can't be met instead of failing", async () => {
    const { cookie, teamId, playerIds } = await teamWithPlayers(7);
    const page = await (await generate(teamId, cookie, playerIds, { innings: "9", pitcherInningLimit: "1" })).text();
    expect(page).toContain("HR-9");
    expect(page).toContain("Try Regenerate, change the options, or edit positions.");
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

  const lineupIn = (page: string) =>
    JSON.parse(decode(page.match(/name="lineup" value="([^"]+)"/)![1])) as { players: string[]; innings: Slot[][] };
  const selectedIn = (page: string, i: number, p: number) =>
    page.match(new RegExp(`id="slot-${i}-${p}"[\\s\\S]*?value="(\\w+)" selected`))![1];
  const editForm = (page: string, edits: Record<string, string> = {}) => ({
    lineup: JSON.stringify(lineupIn(page)),
    innings: "6",
    pitcherInningLimit: "2",
    ...edits,
  });

  it("applies a manual edit as a swap and re-runs the rule check", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const page = await generate(cookie, teamId, playerIds);
    const [a, b] = lineupIn(page).innings[0];

    const swapped = await (await post(`/app/teams/${teamId}/lineup/check`, editForm(page, { "slot-0-0": b }), { Cookie: cookie })).text();
    expect(selectedIn(swapped, 0, 0)).toBe(b);
    expect(selectedIn(swapped, 0, 1)).toBe(a);
    expect(lineupIn(swapped).innings[0].slice(0, 2)).toEqual([b, a]);
    expect(swapped).toContain("Season totals with this lineup");
    // The editor form stays in place: the answer only swaps its parts in by id.
    expect(page).toMatch(/<form[^>]*id="lineup-edit"[^>]*hx-swap="none"/);
    expect(swapped).not.toContain("<form");
    for (const id of ["lineup-state", "lineup-cells", "lineup-results"]) {
      expect(swapped).toMatch(new RegExp(`id="${id}"[^>]*hx-swap-oob="true"`));
    }

    // Benching a fielder leaves a position empty: shown as an error, not blocked.
    const benched = await (await post(`/app/teams/${teamId}/lineup/check`, editForm(page, { "slot-0-0": "BN" }), { Cookie: cookie })).text();
    expect(benched).toContain(`Inning 1: nobody is at ${a}.`);
    expect(benched).toContain("You can still save these positions.");
    expect(benched).not.toContain("Try Regenerate");
    const saved = await (await saveFrom(cookie, teamId, benched)).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    expect((await getGame(env.DB, teamId, gameId)).innings[0][0]).toBe("BN");
  });

  it("edits a planned game and locks a final one", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const saved = await (await saveFrom(cookie, teamId, await generate(cookie, teamId, playerIds))).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    expect(saved).toContain(`hx-get="/app/teams/${teamId}/games/${gameId}/edit"`);
    const base = `/app/teams/${teamId}/games/${gameId}`;

    const editPage = await (await exports.default.fetch(`${ORIGIN}${base}/edit`, { headers: { Cookie: cookie } })).text();
    expect(editPage).toContain("Edit positions:");
    const [a, b] = lineupIn(editPage).innings[2];
    const checked = await (await post(`${base}/check`, editForm(editPage, { "slot-2-1": a }), { Cookie: cookie })).text();
    expect(selectedIn(checked, 2, 0)).toBe(b);

    const res = await post(`${base}/lineup`, editForm(checked), { Cookie: cookie });
    expect(res.headers.get("HX-Push-Url")).toBe(`/teams/${teamId}/games/${gameId}`);
    expect(await res.text()).toContain("Finalize game");
    expect((await getGame(env.DB, teamId, gameId)).innings[2].slice(0, 2)).toEqual([b, a]);

    await post(`${base}/finalize`, {}, { Cookie: cookie });
    const finalEditRes = await exports.default.fetch(`${ORIGIN}${base}/edit`, { headers: { Cookie: cookie } });
    expect(finalEditRes.headers.get("HX-Replace-Url")).toBe(`/teams/${teamId}/games/${gameId}`);
    const finalEdit = await finalEditRes.text();
    expect(finalEdit).toContain("Reopen it to change positions.");
    expect(finalEdit).not.toContain('id="slot-0-0"');
    const locked = await post(`${base}/lineup`, editForm(checked, { "slot-2-0": a }), { Cookie: cookie });
    expect(locked.status).toBe(409);
    expect(await locked.text()).toBe("This game is final. Reopen it to change positions.");
    const lockedCheck = await post(`${base}/check`, editForm(checked, { "slot-2-0": a }), { Cookie: cookie });
    expect(lockedCheck.status).toBe(409);
    expect((await getGame(env.DB, teamId, gameId)).innings[2].slice(0, 2)).toEqual([b, a]);
  });

  it("names a message slot for turned-down requests on the editor and save", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const page = await generate(cookie, teamId, playerIds);
    expect(page).toMatch(/id="lineup-edit"[^>]*data-error-target="lineup-edit-error"/);
    expect(page).toMatch(/hx-post="\/app\/teams\/[^"]+\/games"[^>]*data-error-target="save-error"/);
    expect(page).toContain('id="lineup-edit-error" role="alert" hidden');
    expect(page).toContain('id="save-error" role="alert" hidden');
  });

  it("saves dropdown changes that the hidden lineup doesn't have yet", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const page = await generate(cookie, teamId, playerIds);
    const [a, b] = lineupIn(page).innings[0];
    const saved = await (await saveFrom(cookie, teamId, page, { "slot-0-0": b })).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    expect((await getGame(env.DB, teamId, gameId)).innings[0].slice(0, 2)).toEqual([b, a]);
  });

  it("saves a game edit posted in a different player order", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const saved = await (await saveFrom(cookie, teamId, await generate(cookie, teamId, playerIds))).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    const game = await getGame(env.DB, teamId, gameId);
    const ids = game.players.map((p) => p.id);
    const last = ids.length - 1;
    const reversed = { players: [...ids].reverse(), innings: game.innings.map((row) => [...row].reverse()) };
    const [first, lastSlot] = [game.innings[0][0], game.innings[0][last]];

    // Posted player 0 is the game's last player: give them the game's first player's slot.
    const res = await post(`/app/teams/${teamId}/games/${gameId}/lineup`, { lineup: JSON.stringify(reversed), "slot-0-0": first }, { Cookie: cookie });
    expect(res.status).toBe(200);
    const after = await getGame(env.DB, teamId, gameId);
    expect(after.players.map((p) => p.id)).toEqual(ids);
    expect([after.innings[0][0], after.innings[0][last]]).toEqual([lastSlot, first]);
    expect(after.innings.slice(1)).toEqual(game.innings.slice(1));
  });

  it("checks and saves with the options the lineup was generated with", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const page = await generate(cookie, teamId, playerIds);
    expect(page).toContain('name="minInfieldInnings" value="2"');

    // Nobody can play 6 infield innings with 2 outfielders on the field.
    const strict = await (await post(`/app/teams/${teamId}/lineup/check`, editForm(page, { minInfieldInnings: "6" }), { Cookie: cookie })).text();
    expect(strict).toContain("HR-6");
    const invalid = await post(`/app/teams/${teamId}/lineup/check`, editForm(page, { alignmentMode: "8" }), { Cookie: cookie });
    expect(invalid.status).toBe(422);

    const saved = await (await saveFrom(cookie, teamId, page, { minInfieldInnings: "6", minDefensiveOuts: "9", alignmentMode: "9" })).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    const { options } = await getGame(env.DB, teamId, gameId);
    expect(options).toMatchObject({ minInfieldInnings: 6, minDefensiveOuts: 9, alignmentMode: 9 });
    expect((await saveFrom(cookie, teamId, page, { minDefensiveOuts: "-1" })).status).toBe(422);
  });

  it("rejects edits with other players or from other coaches", async () => {
    const { cookie, teamId, playerIds } = await setup();
    const other = await setup();
    const page = await generate(cookie, teamId, playerIds);
    const saved = await (await saveFrom(cookie, teamId, page)).text();
    const gameId = saved.match(/games\/([^/"]+)\/finalize/)![1];
    const base = `/app/teams/${teamId}/games/${gameId}`;

    const { innings } = lineupIn(page);
    const outsider = JSON.stringify({ players: [...playerIds.slice(0, 6), other.playerIds[0]], innings });
    const form = { lineup: outsider, innings: "6", pitcherInningLimit: "2" };
    expect((await post(`${base}/lineup`, form, { Cookie: cookie })).status).toBe(422);
    expect((await post(`/app/teams/${teamId}/lineup/check`, form, { Cookie: cookie })).status).toBe(422);
    expect((await post(`${base}/lineup`, editForm(page), { Cookie: other.cookie })).status).toBe(404);
    expect((await post(`/app/teams/${teamId}/lineup/check`, editForm(page), { Cookie: other.cookie })).status).toBe(404);
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

  it("renames a team and changes its year and season", async () => {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    const settings = `/app/teams/${teamId}/settings`;
    const form = { inningsPerGame: "6", minDefensiveOuts: "6", minInfieldInnings: "2", alignmentMode: "10" };

    const saved = await (await post(settings, { ...form, name: "Lions", year: "2027", season: "spring" }, { Cookie: cookie })).text();
    expect(saved).toContain("Saved");
    // The page heading is updated out of band.
    expect(saved).toMatch(/id="team-heading" hx-swap-oob="true">\s*<h2[^>]*>Lions<\/h2>\s*<p[^>]*>Spring 2027<\/p>/);
    const page = await (await exports.default.fetch(`${ORIGIN}/app/teams/${teamId}`, { headers: { Cookie: cookie } })).text();
    expect(page).toContain('value="Lions"');
    expect(page).toContain("Spring 2027");

    const blank = await (await post(settings, { ...form, name: " ", year: "2027", season: "spring" }, { Cookie: cookie })).text();
    expect(blank).toContain("Team name must be 1–80 characters.");
    expect(blank).not.toContain("team-heading");
  });

  it("saves game settings and rejects impossible minimums", async () => {
    const cookie = await signUp("Pat");
    const teamId = await createTeam(cookie, "Tigers");
    const settings = `/app/teams/${teamId}/settings`;
    const team = { name: "Tigers", year: "2026", season: "fall" };

    const ok = await (await post(settings, { ...team, inningsPerGame: "4", minDefensiveOuts: "6", minInfieldInnings: "1", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(ok).toContain("Saved");
    const bad = await (await post(settings, { ...team, inningsPerGame: "4", minDefensiveOuts: "13", minInfieldInnings: "1", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(bad).toContain("from 0 to 12");
    const tooShort = await (await post(settings, { ...team, inningsPerGame: "2", minDefensiveOuts: "3", minInfieldInnings: "1", alignmentMode: "10" }, { Cookie: cookie })).text();
    expect(tooShort).toContain("from 3 to 9");
    const noMode = await (await post(settings, { ...team, inningsPerGame: "6", minDefensiveOuts: "6", minInfieldInnings: "1", alignmentMode: "11" }, { Cookie: cookie })).text();
    expect(noMode).toContain("Choose a 9-player or 10-player defense.");
    const tooMuchInfield = { ...team, inningsPerGame: "3", minDefensiveOuts: "6", minInfieldInnings: "4", alignmentMode: "10" };
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
