/**
 * Exécuté à chaque déploiement : met la base à jour, puis, si DEMO=oui, charge les données de démonstration
 * quand aucun établissement n'existe encore ou quand elles datent d'une version précédente (voir version-demo.ts).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { VERSION_DONNEES_DEMO } from "./version-demo";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant : renseignez l'adresse de la base de données.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Base de données à jour.");
  const { rows } = await db.execute(sql`select count(*)::int as n from etablissements`);
  const vide = Number(rows[0]?.n ?? 0) === 0;
  const aJour = vide ? false : (await db.execute(sql`
    select 1 from journal where action = 'donnees_demo' and (details->>'version')::int >= ${VERSION_DONNEES_DEMO} limit 1
  `)).rows.length > 0;
  await pool.end();
  if (process.env.DEMO === "oui" && (vide || !aJour)) {
    if (!vide) console.log(`Données de démonstration rechargées (version ${VERSION_DONNEES_DEMO}).`);
    execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit", env: { ...process.env, AUTORISER_SEED: "oui" } });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
