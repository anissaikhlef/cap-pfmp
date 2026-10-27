import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { versCsv } from "@/lib/csv";
import { journaliser } from "@/lib/journal";

/** 2026-10-26 → 26/10/2026 ; 4914 centimes → 49,14 : lus tels quels par le tableur. */
const enClair = (iso: string) => iso.split("-").reverse().join("/");
const montant = (centimes: number) => (centimes / 100).toFixed(2).replace(".", ",");
const STATUTS = { envoyee: "à valider", validee: "validée", refusee: "refusée" } as const;

/** Export des frais de déplacement pour un tableur (Excel, LibreOffice) : une ligne par visite. */
export async function GET() {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return new Response("Accès réservé", { status: 403 });
  const rows = await db.select({ f: schema.fraisDeplacement, u: schema.users, e: schema.eleves, c: schema.classes, ent: schema.entreprises })
    .from(schema.fraisDeplacement)
    .innerJoin(schema.users, eq(schema.users.id, schema.fraisDeplacement.professeurId))
    .innerJoin(schema.visites, eq(schema.visites.id, schema.fraisDeplacement.visiteId))
    .innerJoin(schema.stages, eq(schema.stages.id, schema.visites.stageId))
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(eq(schema.fraisDeplacement.etablissementId, ctx.etab.id))
    .orderBy(schema.users.nom, desc(schema.fraisDeplacement.date));
  const lignes = [
    ["Professeur", "Date de la visite", "Élève", "Classe", "Entreprise", "Transport", "Véhicule", "Km aller-retour", "Montant km", "Péage", "Billets", "Repas", "Montant repas", "Nuitées", "Lieu", "Montant nuitées", "Total", "Statut", "Validée le"],
    ...rows.map(({ f, u, e, c, ent }) => [
      `${u.nom} ${u.prenom}`, enClair(f.date), `${e.nom} ${e.prenom}`, c.libelle, ent.nom, f.transport === "vehicule" ? "véhicule personnel" : "transport en commun",
      f.vehicule ?? "", String(f.km).replace(".", ","), montant(f.montantKm), montant(f.peage), montant(f.billets), f.repas, montant(f.montantRepas),
      f.nuitees, f.zoneNuitee ?? "", montant(f.montantNuitees), montant(f.total), STATUTS[f.statut], f.valideLe ? enClair(f.valideLe.toISOString().slice(0, 10)) : "",
    ]),
  ];
  await journaliser(ctx, "frais_exportes", "etablissement", ctx.etab.id, { lignes: rows.length });
  return new Response(versCsv(lignes), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="frais-de-deplacement-${ctx.etab.anneeScolaire}.csv"`, "Cache-Control": "private, no-store" },
  });
}
