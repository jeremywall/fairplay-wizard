// Sign-in methods on a coach's own account (Better Auth's `account` table).

/** Whether the coach has linked a sign-in provider such as "google". */
export async function hasLinkedProvider(db: D1Database, userId: string, providerId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS linked FROM account WHERE userId = ? AND providerId = ? LIMIT 1`)
    .bind(userId, providerId)
    .first<{ linked: number }>();
  return row !== null;
}
