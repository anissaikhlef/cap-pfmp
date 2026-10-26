/**
 * Lecture et écriture des octets d'un fichier, selon STOCKAGE :
 *  - « disque » (par défaut) : dossier UPLOAD_DIR ;
 *  - « base » : table `fichiers` de PostgreSQL (hébergement sans disque permanent).
 * En production, prévoir un stockage objet chiffré hébergé dans l'UE.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

const RACINE = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
export const enBase = () => process.env.STOCKAGE === "base";

export async function ecrireOctets(db: NodePgDatabase<typeof schema>, cle: string, b: Buffer) {
  if (enBase()) { await db.insert(schema.fichiers).values({ cle, contenu: b }); return; }
  await mkdir(path.dirname(path.join(RACINE, cle)), { recursive: true });
  await writeFile(path.join(RACINE, cle), b, { flag: "wx" });
}

export async function lireOctets(db: NodePgDatabase<typeof schema>, cle: string): Promise<Buffer> {
  if (enBase()) {
    const [f] = await db.select().from(schema.fichiers).where(eq(schema.fichiers.cle, cle)).limit(1);
    if (!f) throw new Error("Fichier introuvable");
    return f.contenu;
  }
  return readFile(path.join(RACINE, cle));
}
