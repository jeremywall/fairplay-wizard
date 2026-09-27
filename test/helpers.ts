import { env } from "cloudflare:workers";

/** Inserts a coach directly. Test storage persists within a file, so ids are unique. */
export async function insertCoach(): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)`,
  )
    .bind(id, "Coach", `${id}@example.com`, now, now)
    .run();
  return id;
}
