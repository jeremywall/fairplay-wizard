import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteGame,
  finalGameRecords,
  finalizeGame,
  getGame,
  listGames,
  type NewGame,
  reopenGame,
  saveGame,
} from "../../src/db/games";
import { addPlayer, listPlayers } from "../../src/db/players";
import { createTeam, TeamAccessError } from "../../src/db/teams";
import type { Slot } from "../../src/domain/positions";
import { insertCoach } from "../helpers";

describe("game data access", () => {
  let teamId: string;
  let ids: string[];

  function newGame(date: string): NewGame {
    const row: Slot[] = ["P", "1B", "2B", "3B", "SS", "LC", "RC"];
    return {
      date,
      opponent: "Cubs",
      options: { innings: 2, alignmentMode: 10, pitcherInningLimit: 2, minDefensiveOuts: 6, minInfieldInnings: 1 },
      players: ids,
      innings: [row, [...row].reverse()],
    };
  }

  beforeEach(async () => {
    teamId = await createTeam(env.DB, await insertCoach(), "Tigers");
    for (const name of ["A", "B", "C", "D", "E", "F", "G"]) await addPlayer(env.DB, teamId, { name, jerseyNumber: null });
    ids = (await listPlayers(env.DB, teamId)).map((p) => p.id);
  });

  it("saves and loads a game with the options it was planned with", async () => {
    const gameId = await saveGame(env.DB, teamId, newGame("2026-10-04"));
    const game = await getGame(env.DB, teamId, gameId);
    expect(game).toMatchObject({ date: "2026-10-04", opponent: "Cubs", status: "planned" });
    expect(game.options.minInfieldInnings).toBe(1);
    expect(game.players.map((p) => p.name)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(game.innings[0]).toEqual(["P", "1B", "2B", "3B", "SS", "LC", "RC"]);
    expect(game.innings[1][0]).toBe("RC");
    expect(await listGames(env.DB, teamId)).toEqual([
      { id: gameId, date: "2026-10-04", opponent: "Cubs", status: "planned", playerCount: 7 },
    ]);
  });

  it("counts only finalized games as season records", async () => {
    await saveGame(env.DB, teamId, newGame("2026-10-01"));
    const final = await saveGame(env.DB, teamId, newGame("2026-10-08"));
    await finalizeGame(env.DB, teamId, final);
    const records = await finalGameRecords(env.DB, teamId);
    expect(records).toEqual([{ players: ids, innings: newGame("x").innings }]);

    await reopenGame(env.DB, teamId, final);
    expect((await getGame(env.DB, teamId, final)).status).toBe("planned");
    expect(await finalGameRecords(env.DB, teamId)).toEqual([]);
  });

  it("keeps games within their team", async () => {
    const gameId = await saveGame(env.DB, teamId, newGame("2026-10-04"));
    const otherTeam = await createTeam(env.DB, await insertCoach(), "Cubs");
    await expect(getGame(env.DB, otherTeam, gameId)).rejects.toBeInstanceOf(TeamAccessError);
    await finalizeGame(env.DB, otherTeam, gameId);
    await deleteGame(env.DB, otherTeam, gameId);
    expect((await getGame(env.DB, teamId, gameId)).status).toBe("planned");
  });

  it("deletes a game with its lineup", async () => {
    const gameId = await saveGame(env.DB, teamId, newGame("2026-10-04"));
    await deleteGame(env.DB, teamId, gameId);
    expect(await listGames(env.DB, teamId)).toEqual([]);
    const rows = await env.DB.prepare(`SELECT COUNT(*) AS n FROM game_assignment WHERE game_id = ?`).bind(gameId).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
