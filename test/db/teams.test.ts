import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { createTeam, listTeamsForCoach, requireTeamAccess, TeamAccessError } from "../../src/db/teams";

// Test storage persists across tests in a file, so each test gets fresh coaches.
async function insertCoach(): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)`,
  )
    .bind(id, "Coach", `${id}@example.com`, now, now)
    .run();
  return id;
}

describe("team data access", () => {
  let coach: string;
  let otherCoach: string;

  beforeEach(async () => {
    coach = await insertCoach();
    otherCoach = await insertCoach();
  });

  it("makes the creating coach the head coach", async () => {
    const teamId = await createTeam(env.DB, coach, "Tigers");
    expect(await requireTeamAccess(env.DB, coach, teamId)).toBe("head");
    expect(await listTeamsForCoach(env.DB, coach)).toEqual([{ id: teamId, name: "Tigers", role: "head" }]);
  });

  it("hides other coaches' teams", async () => {
    const teamId = await createTeam(env.DB, coach, "Tigers");
    expect(await listTeamsForCoach(env.DB, otherCoach)).toEqual([]);
    await expect(requireTeamAccess(env.DB, otherCoach, teamId)).rejects.toBeInstanceOf(TeamAccessError);
  });
});
