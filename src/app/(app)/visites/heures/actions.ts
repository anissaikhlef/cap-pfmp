"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { classesGerees } from "@/lib/acces";
import { professeursActifs } from "@/lib/heures";
import { journaliser } from "@/lib/journal";
import { cleNom, lireCsv, lireHeures, normaliserEntete } from "@/lib/csv";
import type { Etat } from "@/components/Formulaire";

type Ctx = Awaited<ReturnType<typeof contexte>>;

/** Classes gérées de l'année en cours : la gestion ne saisit les heures que pour ses classes. */
async function classesDeLAnnee(ctx: Ctx) {
  const ids = await classesGerees(ctx);
  if (!ids.length) return [];
  return db.select().from(schema.classes).where(and(eq(schema.classes.etablissementId, ctx.etab.id), inArray(schema.classes.id, ids)));
}

/** Remplace les heures d'un professeur dans une classe (0 ou vide : retire la ligne). */
async function ecrire(ctx: Ctx, professeurId: string, classeId: string, heures: number) {
  if (heures > 0) {
    await db.insert(schema.heuresClasses).values({ etablissementId: ctx.etab.id, professeurId, classeId, heures })
      .onConflictDoUpdate({ target: [schema.heuresClasses.professeurId, schema.heuresClasses.classeId], set: { heures } });
  } else {
    await db.delete(schema.heuresClasses).where(and(eq(schema.heuresClasses.professeurId, professeurId), eq(schema.heuresClasses.classeId, classeId)));
  }
}

/** Saisie à la main : tableau professeur × classe (champs h_<professeur>_<classe>). */
export async function enregistrerHeures(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const classes = await classesDeLAnnee(ctx);
  if (!classes.length) return { erreur: "Vous ne gérez aucune classe." };
  const profs = await professeursActifs(ctx);
  const erreurs: string[] = [];
  let n = 0;
  for (const p of profs) {
    for (const c of classes) {
      const brut = fd.get(`h_${p.id}_${c.id}`);
      if (brut === null) continue;
      const texte = String(brut).trim();
      const h = texte === "" ? 0 : lireHeures(texte);
      if (h === null) { erreurs.push(`${p.prenom} ${p.nom} en ${c.libelle} : « ${texte} »`); continue; }
      await ecrire(ctx, p.id, c.id, h);
      if (h > 0) n++;
    }
  }
  await journaliser(ctx, "heures_enregistrees", "etablissement", ctx.etab.id, { n });
  revalidatePath("/visites/heures"); revalidatePath("/visites");
  if (erreurs.length) return { erreur: `Heures enregistrées, sauf ${erreurs.length} case(s) illisible(s) : ${erreurs.slice(0, 5).join(" ; ")}. Écrivez par exemple 6, 6,5 ou 6h30.` };
  return { ok: `Heures enregistrées (${n} service${n > 1 ? "s" : ""}). La proposition de visites en tient compte.` };
}

/**
 * Import d'un fichier tiré de l'emploi du temps (CSV). Colonnes reconnues :
 * professeur (« NOM Prénom ») ou nom + prénom, ou e-mail ; classe ; heures.
 * Plusieurs lignes pour un même professeur dans une même classe s'additionnent.
 */
export async function importerHeures(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  const fichier = fd.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez un fichier CSV." };
  if (fichier.size > 2 * 1024 * 1024) return { erreur: "Fichier trop lourd (2 Mo maximum)." };
  const lignes = lireCsv(await fichier.text());
  if (lignes.length < 2) return { erreur: "Le fichier ne contient aucune ligne." };
  const entetes = lignes[0].map(normaliserEntete);
  const col = (...noms: string[]) => entetes.findIndex((h) => noms.includes(h));
  const iProf = col("professeur", "enseignant", "prof", "nom_prenom", "professeurs"), iNom = col("nom"), iPrenom = col("prenom"),
    iEmail = col("email", "mail", "e_mail", "courriel"), iClasse = col("classe", "division", "classes"),
    iHeures = col("heures", "heure", "heures_hebdo", "heures_hebdomadaires", "volume_horaire", "volume", "h");
  if (iClasse < 0 || iHeures < 0 || (iProf < 0 && iNom < 0 && iEmail < 0)) {
    return { erreur: "Colonnes attendues : professeur (ou nom et prénom, ou e-mail), classe, heures." };
  }
  const classes = await classesDeLAnnee(ctx);
  const profs = await professeursActifs(ctx);
  const trouverProf = (l: string[]) => {
    const email = iEmail >= 0 ? (l[iEmail] ?? "").trim().toLowerCase() : "";
    if (email) return profs.find((p) => p.email === email);
    const nom = iProf >= 0 ? cleNom(l[iProf] ?? "") : cleNom(`${l[iNom] ?? ""} ${iPrenom >= 0 ? l[iPrenom] ?? "" : ""}`);
    return profs.find((p) => [cleNom(`${p.nom} ${p.prenom}`), cleNom(`${p.prenom} ${p.nom}`)].includes(nom))
      ?? (iPrenom < 0 && iProf < 0 ? profs.find((p) => cleNom(p.nom) === nom) : undefined);
  };
  const totaux = new Map<string, { prof: string; classe: string; heures: number }>();
  const problemes: string[] = [];
  for (let i = 1; i < lignes.length && i <= 2000; i++) {
    const l = lignes[i];
    const prof = trouverProf(l);
    const classe = classes.find((c) => cleNom(c.libelle) === cleNom(l[iClasse] ?? ""));
    const h = lireHeures(l[iHeures] ?? "");
    if (!prof) { problemes.push(`ligne ${i + 1} : professeur inconnu`); continue; }
    if (!classe) { problemes.push(`ligne ${i + 1} : classe « ${l[iClasse] ?? ""} » inconnue ou non gérée`); continue; }
    if (h === null) { problemes.push(`ligne ${i + 1} : heures illisibles « ${l[iHeures] ?? ""} »`); continue; }
    const cle = `${prof.id}|${classe.id}`;
    const t = totaux.get(cle) ?? { prof: prof.id, classe: classe.id, heures: 0 };
    t.heures += h;
    totaux.set(cle, t);
  }
  for (const t of totaux.values()) await ecrire(ctx, t.prof, t.classe, Math.min(40, Math.round(t.heures * 100) / 100));
  await journaliser(ctx, "heures_importees", "etablissement", ctx.etab.id, { services: totaux.size, problemes: problemes.length });
  revalidatePath("/visites/heures"); revalidatePath("/visites");
  const ok = `${totaux.size} service${totaux.size > 1 ? "s" : ""} importé${totaux.size > 1 ? "s" : ""} (professeur et classe).`;
  if (problemes.length) return { erreur: `${ok} ${problemes.length} ligne(s) ignorée(s) : ${problemes.slice(0, 6).join(" ; ")}${problemes.length > 6 ? "…" : ""}` };
  return { ok };
}
