import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { completerReglages } from "@/db/schema";
import { masquer, masquerCoordonnees, remettre, type Masque } from "./anonymisation";
import { demanderIA } from "./ia";
import { libelleLangue } from "./langues";

/**
 * Langue des familles (décisions d'Anissa) : les messages aux parents et l'espace « Mon enfant » sont traduits dans la
 * langue de la famille, avec le français dessous. Avant l'envoi à l'IA, les noms (élève, parents) sont remplacés par des
 * repères, et les adresses mail, liens et numéros aussi ; tout est remis au retour. Les traductions sont gardées, pour ne
 * pas payer deux fois le même texte.
 */
type Etab = typeof schema.etablissements.$inferSelect;
type Eleve = typeof schema.eleves.$inferSelect;

const cleDe = (langue: string, texte: string) => createHash("sha256").update(`${langue}\n${texte}`).digest("hex");

const Reponse = z.object({ traductions: z.array(z.string()) });

/** Traduit des textes (dans l'ordre) ; null pour un texte qui n'a pas pu l'être (il reste alors en français). */
export async function traduireTextes(etabBrut: Etab, langue: string, textes: string[], noms: Masque[]): Promise<(string | null)[]> {
  const etab = { ...etabBrut, reglages: completerReglages(etabBrut.reglages) };
  const prepares = textes.map((t) => {
    const coord = masquerCoordonnees(masquer(t, noms));
    return { ...coord, cle: cleDe(langue, coord.texte) };
  });
  const cles = [...new Set(prepares.map((p) => p.cle))];
  const deja = new Map(cles.length ? (await db.select().from(schema.traductions)
    .where(and(eq(schema.traductions.etablissementId, etab.id), inArray(schema.traductions.cle, cles)))).map((x) => [x.cle, x.texte]) : []);
  const manquants = prepares.filter((p, i) => !deja.has(p.cle) && prepares.findIndex((q) => q.cle === p.cle) === i);
  if (manquants.length) {
    const r = await demanderIA(etab, {
      agent: "administratif", objet: `Traduction (${langue})`, effort: "low",
      consignes: `Tu traduis du français vers la langue suivante : ${langue}, pour des parents d'élèves qui ne lisent pas le français. Traduis fidèlement, simplement, sans rien ajouter ni retirer. Garde tels quels les repères entre crochets ([ÉLÈVE], [LIEN1], [MAIL1], [TEL1]…), les dates et les nombres. Réponds avec la liste des traductions, dans le même ordre que les textes.`,
      demande: manquants.map((p, i) => `Texte ${i + 1} :\n"""\n${p.texte}\n"""`).join("\n\n"),
      schema: { type: "object", additionalProperties: false, required: ["traductions"], properties: { traductions: { type: "array", items: { type: "string" } } } },
      verifier: (x) => { const v = Reponse.safeParse(x).data; return v && v.traductions.length === manquants.length ? v : null; },
      exemple: () => ({ traductions: manquants.map(() => "") }),
    });
    // Sans IA (démonstration) : rien n'est traduit, le texte reste en français. Pour les parcours de test seulement,
    // une traduction fictive (« [Arabe] … ») montre le chemin complet.
    const fictive = r.ok && r.simule && process.env.CAP_PFMP_TRADUCTION_FICTIVE === "oui";
    if (r.ok && (!r.simule || fictive)) {
      const lignes = manquants.map((p, i) => ({ etablissementId: etab.id, cle: p.cle, langue, texte: fictive ? `[${langue}] ${p.texte}` : r.valeur.traductions[i] })).filter((l) => l.texte.trim());
      if (lignes.length) await db.insert(schema.traductions).values(lignes).onConflictDoNothing();
      lignes.forEach((l) => deja.set(l.cle, l.texte));
    }
  }
  return prepares.map((p) => {
    const t = deja.get(p.cle);
    return t ? remettre(remettre(t, p.masques), noms) : null;
  });
}

/** Les repères des noms de l'élève et de ses parents. */
async function nomsDeLaFamille(e: Eleve): Promise<Masque[]> {
  const parents = await db.select({ prenom: schema.users.prenom, nom: schema.users.nom }).from(schema.responsables)
    .innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId)).where(eq(schema.responsables.eleveId, e.id));
  return [
    { valeur: `${e.prenom} ${e.nom}`, jeton: "[ÉLÈVE]" }, { valeur: `${e.nom} ${e.prenom}`, jeton: "[ÉLÈVE]" },
    { valeur: e.prenom, jeton: "[PRÉNOM]" }, { valeur: e.nom, jeton: "[NOM]" },
    ...parents.flatMap((p, i) => [{ valeur: `${p.prenom} ${p.nom}`, jeton: `[PARENT${i + 1}]` }, { valeur: p.prenom, jeton: `[PRÉNOM_PARENT${i + 1}]` }, { valeur: p.nom, jeton: `[NOM_PARENT${i + 1}]` }]),
  ];
}

/** Traduit pour la famille d'un élève, dans la langue indiquée sur sa fiche (null : en français). */
export async function traduirePourLaFamille(etab: Etab, e: Eleve, textes: string[]): Promise<{ langue: string; textes: (string | null)[] } | null> {
  const langue = libelleLangue(e.langueFamille, completerReglages(etab.reglages).langues);
  if (!langue) return null;
  return { langue, textes: await traduireTextes(etab, langue, textes, await nomsDeLaFamille(e)) };
}

/**
 * Un message à un parent d'élève (appelé par `envoyer()`) : traduit dans la langue de la famille, avec le français dessous.
 * Le message reste en français si la famille n'a pas de langue indiquée, ou si la traduction n'est pas possible.
 */
export async function messagePourLaFamille(etabId: string, eleveId: string, destinataire: string, m: { sujet?: string | null; corps: string }) {
  const [e] = await db.select().from(schema.eleves).where(and(eq(schema.eleves.id, eleveId), eq(schema.eleves.etablissementId, etabId))).limit(1);
  if (!e?.langueFamille) return null;
  // Seulement pour les parents (l'élève, scolarisé en France, lit le français).
  const [parent] = await db.select({ id: schema.users.id }).from(schema.responsables)
    .innerJoin(schema.users, eq(schema.users.id, schema.responsables.userId))
    .where(and(eq(schema.responsables.eleveId, e.id), or(eq(schema.users.email, destinataire), eq(schema.users.telephone, destinataire)))).limit(1);
  if (!parent) return null;
  const [etab] = await db.select().from(schema.etablissements).where(eq(schema.etablissements.id, etabId)).limit(1);
  const t = etab ? await traduirePourLaFamille(etab, e, [m.sujet ?? "", m.corps]) : null;
  if (!t || !t.textes[1]) return null;
  return {
    sujet: m.sujet ? `${t.textes[0] || m.sujet} / ${m.sujet}` : m.sujet,
    corps: `${t.textes[1]}\n\n— Version française —\n\n${m.corps}`,
  };
}
