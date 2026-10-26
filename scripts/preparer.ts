/**
 * Exécuté à chaque déploiement : met la base à jour, puis charge les données de démonstration
 * si (et seulement si) DEMO=oui et qu'aucun établissement n'existe encore.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant : renseignez l'adresse de la base de données.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Base de données à jour.");
  const { rows } = await db.execute(sql`select count(*)::int as n from etablissements`);
  await pool.end();
  if (process.env.DEMO === "oui" && Number(rows[0]?.n ?? 0) === 0) {
    execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit", env: { ...process.env, AUTORISER_SEED: "oui" } });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
