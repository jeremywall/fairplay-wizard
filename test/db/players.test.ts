import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addPlayer, listPlayers, movePlayer, removePlayer } from "../../src/db/players";
import { createTeam } from "../../src/db/teams";
import { insertCoach } from "../helpers";

const names = async (teamId: string) => (await listPlayers(env.DB, teamId)).map((p) => p.name);

describe("roster data access", () => {
  let teamId: string;

  beforeEach(async () => {
    teamId = await createTeam(env.DB, await insertCoach(), "Tigers");
    for (const name of ["Ava", "Ben", "Cal"]) await addPlayer(env.DB, teamId, { name, jerseyNumber: null });
  });

  it("adds players to the end of the batting order", async () => {
    await addPlayer(env.DB, teamId, { name: "Dee", jerseyNumber: "7" });
    const players = await listPlayers(env.DB, teamId);
    expect(players.map((p) => p.name)).toEqual(["Ava", "Ben", "Cal", "Dee"]);
    expect(players[3].jerseyNumber).toBe("7");
  });

  it("moves players up and down, and ignores moves past either end", async () => {
    const [ava, , cal] = await listPlayers(env.DB, teamId);
    await movePlayer(env.DB, teamId, cal.id, "up");
    expect(await names(teamId)).toEqual(["Ava", "Cal", "Ben"]);
    await movePlayer(env.DB, teamId, ava.id, "down");
    expect(await names(teamId)).toEqual(["Cal", "Ava", "Ben"]);
    await movePlayer(env.DB, teamId, cal.id, "up");
    expect(await names(teamId)).toEqual(["Cal", "Ava", "Ben"]);
  });

  it("skips removed players when reordering", async () => {
    const [, ben, cal] = await listPlayers(env.DB, teamId);
    await removePlayer(env.DB, teamId, ben.id);
    await movePlayer(env.DB, teamId, cal.id, "up");
    expect(await names(teamId)).toEqual(["Cal", "Ava"]);
  });

  it("keeps removed players in the database but off the roster", async () => {
    const [, ben] = await listPlayers(env.DB, teamId);
    await removePlayer(env.DB, teamId, ben.id);
    expect(await names(teamId)).toEqual(["Ava", "Cal"]);
    const row = await env.DB.prepare(`SELECT active FROM player WHERE id = ?`).bind(ben.id).first<{ active: number }>();
    expect(row?.active).toBe(0);
  });

  it("ignores player ids from another team", async () => {
    const otherTeam = await createTeam(env.DB, await insertCoach(), "Cubs");
    const [ava] = await listPlayers(env.DB, teamId);
    await removePlayer(env.DB, otherTeam, ava.id);
    await movePlayer(env.DB, otherTeam, ava.id, "down");
    expect(await names(teamId)).toEqual(["Ava", "Ben", "Cal"]);
  });
});
