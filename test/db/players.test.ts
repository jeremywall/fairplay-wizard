import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addPlayer, listPlayers, removePlayer } from "../../src/db/players";
import { createTeam } from "../../src/db/teams";
import { insertCoach } from "../helpers";

const names = async (teamId: string) => (await listPlayers(env.DB, teamId)).map((p) => p.name);

describe("roster data access", () => {
  let teamId: string;

  beforeEach(async () => {
    teamId = await createTeam(env.DB, await insertCoach(), "Tigers");
    for (const name of ["Ava", "Ben", "Cal"]) await addPlayer(env.DB, teamId, { name, jerseyNumber: null });
  });

  it("lists players in the order they were added", async () => {
    await addPlayer(env.DB, teamId, { name: "Dee", jerseyNumber: "7" });
    const players = await listPlayers(env.DB, teamId);
    expect(players.map((p) => p.name)).toEqual(["Ava", "Ben", "Cal", "Dee"]);
    expect(players[3].jerseyNumber).toBe("7");
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
    expect(await names(teamId)).toEqual(["Ava", "Ben", "Cal"]);
  });
});
