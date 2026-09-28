// Prints the SQL for Better Auth's tables. Use it to write a new migration after
// changing Better Auth options or plugins that add tables or columns:
//   node scripts/generate-auth-schema.mjs
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";

const { compileMigrations } = await getMigrations({
  database: new DatabaseSync(":memory:"),
  emailAndPassword: { enabled: true },
});
console.log(await compileMigrations());
