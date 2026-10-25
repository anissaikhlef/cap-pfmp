import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/cap_pfmp" });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Base de données à jour.");
}
main().catch((e) => { console.error(e); process.exit(1); });
