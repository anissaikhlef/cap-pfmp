"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import { revenirAvec } from "@/lib/retour";
import { anneeSuivante, type Niveau } from "@/lib/passage";
import type { Etat } from "@/components/Formulaire";

const REGLE = { CAP: "prive", "2NDE": "prive", "1RE": "dominante", TLE: "dominante" } as const;

export async function passerAnneeSuivante(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  if (fd.get("confirmer") !== "on") return { erreur: "Cochez la case de confirmation." };
  const suivante = anneeSuivante(ctx.etab.anneeScolaire);
  const classes = await db.select().from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, ctx.etab.anneeScolaire)));
  let crees = 0, deplaces = 0, sortis = 0;
  await db.transaction(async (tx) => {
    for (const c of classes) {
      const dest = String(fd.get(`dest_${c.id}`) ?? "fin");
      const eleves = await tx.select({ id: schema.eleves.id }).from(schema.eleves).where(and(eq(schema.eleves.classeId, c.id), eq(schema.eleves.archive, false)));
      if (dest === "suivante") {
        const libelle = String(fd.get(`libelle_${c.id}`) ?? c.libelle).trim().slice(0, 60) || c.libelle;
        const niv = String(fd.get(`niveau_${c.id}`) ?? c.niveau);
        const niveau = (["CAP", "2NDE", "1RE", "TLE"].includes(niv) ? niv : c.niveau) as Niveau;
        const [n] = await tx.insert(schema.classes).values({
          etablissementId: ctx.etab.id, libelle, niveau, filiere: c.filiere, anneeScolaire: suivante, regleStructure: REGLE[niveau], referentId: c.referentId,
        }).returning();
        crees++;
        for (const e of eleves) { await tx.update(schema.eleves).set({ classeId: n.id }).where(eq(schema.eleves.id, e.id)); deplaces++; }
      } else {
        // Fin de formation : l'élève est archivé, son dossier reste consultable.
        for (const e of eleves) { await tx.update(schema.eleves).set({ archive: true }).where(eq(schema.eleves.id, e.id)); sortis++; }
      }
    }
    await tx.update(schema.etablissements).set({ anneeScolaire: suivante }).where(eq(schema.etablissements.id, ctx.etab.id));
  });
  await journaliser(ctx, "annee_suivante", "etablissement", ctx.etab.id, { suivante, crees, deplaces, sortis });
  revalidatePath("/", "layout");
  revenirAvec("/classes", `Année ${suivante} ouverte : ${crees} classe(s) créée(s), ${deplaces} élève(s) passé(s) en classe supérieure, ${sortis} élève(s) en fin de formation. Ajoutez maintenant les dates de PFMP de chaque classe.`);
}
