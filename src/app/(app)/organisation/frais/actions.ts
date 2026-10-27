"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { peutAdministrer } from "@/lib/acces";
import { journaliser } from "@/lib/journal";
import { NB_LIGNES, NB_TRANCHES, NB_ZONES } from "@/lib/frais";
import type { Etat } from "@/components/Formulaire";
import type { BaremeFrais, LigneBareme, TrancheBareme } from "@/db/schema";


/** « 0,636 » ou « 0.636 » → 0.636 ; vide → null ; illisible → NaN. */
function nombre(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return s ? Number(s) : null;
}

/** Le barème des frais de déplacement du lycée : chaque lycée recopie sa propre méthode (décision d'Anissa). */
export async function enregistrerBareme(_: Etat, fd: FormData): Promise<Etat> {
  const ctx = await contexte();
  if (!peutAdministrer(ctx)) return { erreur: "Seuls le DDFPT et la direction saisissent le barème des frais." };
  const kilometrique: LigneBareme[] = [];
  for (let i = 0; i < NB_LIGNES; i++) {
    const vehicule = String(fd.get(`v_${i}`) ?? "").trim().slice(0, 80);
    if (!vehicule) continue;
    const tranches: TrancheBareme[] = [];
    for (let k = 0; k < NB_TRANCHES; k++) {
      const taux = nombre(fd.get(`t_${i}_${k}`));
      if (taux === null) continue;
      const jusqua = nombre(fd.get(`j_${i}_${k}`));
      const fixe = nombre(fd.get(`f_${i}_${k}`)) ?? 0;
      if (Number.isNaN(taux) || Number.isNaN(fixe) || (jusqua !== null && (Number.isNaN(jusqua) || jusqua <= 0)) || taux < 0 || taux > 10) {
        return { erreur: `${vehicule} : vérifiez les nombres de la tranche ${k + 1} (taux par kilomètre, montant fixe, kilomètres).` };
      }
      tranches.push({ jusqua, taux, fixe });
    }
    if (!tranches.length) return { erreur: `${vehicule} : indiquez au moins le taux par kilomètre de la première tranche.` };
    // Les limites montent d'une tranche à l'autre ; la dernière vaut « au-delà ».
    tranches[tranches.length - 1].jusqua = null;
    for (let k = 1; k < tranches.length; k++) {
      if ((tranches[k - 1].jusqua ?? Infinity) >= (tranches[k].jusqua ?? Infinity)) return { erreur: `${vehicule} : les kilomètres des tranches doivent augmenter d'une tranche à l'autre.` };
    }
    if (tranches.slice(0, -1).some((t) => t.jusqua === null)) return { erreur: `${vehicule} : indiquez jusqu'à combien de kilomètres va chaque tranche, sauf la dernière.` };
    kilometrique.push({ vehicule, tranches });
  }
  const repas = nombre(fd.get("repas")) ?? 0;
  if (Number.isNaN(repas) || repas < 0 || repas > 200) return { erreur: "Montant d'un repas : un nombre en euros (ex. 20,20)." };
  const nuitees: BaremeFrais["nuitees"] = [];
  for (let k = 0; k < NB_ZONES; k++) {
    const zone = String(fd.get(`nz_${k}`) ?? "").trim().slice(0, 80);
    const montant = nombre(fd.get(`nm_${k}`));
    if (!zone && montant === null) continue;
    if (!zone || montant === null || Number.isNaN(montant) || montant < 0 || montant > 1000) return { erreur: "Nuitées : indiquez pour chaque lieu son nom et son montant en euros." };
    nuitees.push({ zone, montant });
  }
  const frais: BaremeFrais = { kilometrique, repas, nuitees, consignes: String(fd.get("consignes") ?? "").trim().slice(0, 3000) };
  await db.update(schema.etablissements).set({ reglages: { ...ctx.etab.reglages, frais } }).where(eq(schema.etablissements.id, ctx.etab.id));
  await journaliser(ctx, "bareme_frais", "etablissement", ctx.etab.id, { lignes: kilometrique.length });
  revalidatePath("/organisation/frais");
  return { ok: `Barème enregistré : ${kilometrique.length} véhicule(s). Il s'applique aux prochaines demandes de remboursement.` };
}
