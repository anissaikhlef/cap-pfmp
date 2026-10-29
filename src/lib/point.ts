import "server-only";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { completerReglages, type Reglages } from "@/db/schema";
import { ajouterJours, aujourdhui, dateLongue, jourSemaine } from "./dates";
import { manquesDesEleves } from "./manques";
import { envoyer } from "./messages";
import { professeurAutorise } from "./regles";
import { signatairesRequis } from "./requetes";
import { articlesDesFormations } from "./tenues";
import { taillesManquantes } from "./tenues-def";
import { reglesDesPeriodes } from "./visites";

/**
 * Cap Admin pour le DDFPT (décisions d'Anissa) : les retards de l'équipe (visites que personne n'a prises, comptes rendus
 * non faits, ordres de mission non signés), avec les rappels aux professeurs préparés, que le DDFPT envoie ; et le point
 * de la semaine, en page et par mail chaque lundi.
 */
type Etab = typeof schema.etablissements.$inferSelect;
type EtabC = Etab & { reglages: Reglages };
type Membre = typeof schema.users.$inferSelect;
const complet = (e: Etab): EtabC => ({ ...e, reglages: completerReglages(e.reglages) });

export type Retard = {
  cle: string; type: "visite" | "compte_rendu" | "ordre_mission"; eleveId: string; eleve: string; classe: string; entreprise: string; quoi: string;
  profs: Pick<Membre, "id" | "prenom" | "nom" | "email">[]; rappeleLe: Date | null;
};

export async function retardsEquipe(etabBrut: Etab, jour = aujourdhui()): Promise<Retard[]> {
  const etab = complet(etabBrut);
  const R = etab.reglages.relances;
  const rows = await db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes, ent: schema.entreprises, v: schema.visites }).from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .leftJoin(schema.visites, eq(schema.visites.stageId, schema.stages.id))
    .where(and(eq(schema.classes.etablissementId, etab.id), eq(schema.classes.anneeScolaire, etab.anneeScolaire), eq(schema.eleves.archive, false)))
    .orderBy(asc(schema.periodes.debut), asc(schema.eleves.nom));
  if (!rows.length) return [];
  const equipe = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, etab.id), eq(schema.users.actif, true)));
  const heures = await db.select().from(schema.heuresClasses).where(eq(schema.heuresClasses.etablissementId, etab.id));
  const regles = await reglesDesPeriodes({ etab }, [...new Set(rows.map((r) => r.p.id))]);
  const rappels = await db.select({ cle: schema.journal.entiteId, at: schema.journal.at }).from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etab.id), eq(schema.journal.action, "rappel_equipe"))).orderBy(desc(schema.journal.at));
  const membre = (id: string | null) => equipe.filter((u) => u.id === id);
  const res: Retard[] = [];
  for (const { s, e, p, c, ent, v } of rows) {
    const base = { eleveId: e.id, eleve: `${e.prenom} ${e.nom}`, classe: c.libelle, entreprise: ent.nom };
    const ajouter = (type: Retard["type"], cle: string, quoi: string, profs: Membre[]) =>
      res.push({ ...base, type, cle, quoi, profs: profs.map(({ id, prenom, nom, email }) => ({ id, prenom, nom, email })), rappeleLe: rappels.find((r) => r.cle === cle)?.at ?? null });
    if (!v?.visiteurId && p.fin >= jour && p.debut <= ajouterJours(jour, R.visiteNonPriseAvant)) {
      // Les professeurs de la classe qui peuvent faire cette visite, selon l'organisation du lycée.
      const possibles = equipe.filter((u) => u.roles.includes("professeur") && heures.some((h) => h.classeId === c.id && h.professeurId === u.id) && professeurAutorise(regles.get(p.id) ?? "tous", u));
      ajouter("visite", `visite:${s.id}`, `visite que personne n'a prise (stage du ${dateLongue(p.debut)} au ${dateLongue(p.fin)})`, possibles.length ? possibles : membre(e.referentId ?? c.referentId));
    }
    if (!v?.visiteurId || !v.date) continue;
    if (etab.reglages.compteRendu && !v.compteRendu && ajouterJours(v.date, R.compteRenduApres) <= jour) {
      ajouter("compte_rendu", `compte_rendu:${v.id}`, `compte rendu de la visite du ${dateLongue(v.date)} pas encore fait`, membre(v.visiteurId));
    }
    if (etab.reglages.ordreMission && v.ordreMission !== "signe" && v.date >= jour && v.date <= ajouterJours(jour, R.ordreMissionAvant)) {
      const signataires = equipe.filter((u) => etab.reglages.signatairesOrdreMission.some((r) => u.roles.includes(r)));
      ajouter("ordre_mission", `ordre_mission:${v.id}`, v.ordreMission === "aucun"
        ? `ordre de mission de la visite du ${dateLongue(v.date)} pas encore demandé` : `ordre de mission de la visite du ${dateLongue(v.date)} pas encore signé`,
      v.ordreMission === "aucun" ? membre(v.visiteurId) : signataires);
    }
  }
  return res;
}

/** Le rappel préparé pour un professeur : ses retards, en quelques lignes, que le DDFPT relit avant l'envoi. */
export function rappelPrepare(prof: { prenom: string }, retards: Retard[], signe: string, base: string): string {
  const lignes = retards.map((r) => `- ${r.eleve} (${r.classe}, ${r.entreprise}) : ${r.quoi}`).join("\n");
  return `Bonjour ${prof.prenom},\n\nPetit rappel pour ces stages :\n${lignes}\n\nTout se fait dans Cap PFMP, « Mes visites » : ${base}/mes-visites\n\nMerci,\n${signe}`;
}

export type PointDeLaSemaine = Awaited<ReturnType<typeof pointDeLaSemaine>>;

/** Le point de la semaine du lycée : ce qui est en retard, à suivre ou à décider. */
export async function pointDeLaSemaine(etabBrut: Etab, jour = aujourdhui()) {
  const etab = complet(etabBrut);
  const classes = await db.select().from(schema.classes).where(and(eq(schema.classes.etablissementId, etab.id), eq(schema.classes.anneeScolaire, etab.anneeScolaire)));
  const ids = classes.map((c) => c.id);
  const eleves = ids.length ? await db.select().from(schema.eleves).where(and(inArray(schema.eleves.classeId, ids), eq(schema.eleves.archive, false))) : [];
  const classe = (id: string | null) => classes.find((c) => c.id === id)?.libelle ?? "";
  const bilans = await manquesDesEleves(etab.id, eleves, jour);
  const manques = eleves.map((e) => ({ e, classe: classe(e.classeId), b: bilans.get(e.id)! })).filter((x) => x.b.total > 0 || x.b.sansStageEnCours)
    .sort((x, y) => x.classe.localeCompare(y.classe) || x.e.nom.localeCompare(y.e.nom));
  const difficultes = (await db.select().from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etab.id), eq(schema.journal.action, "cap_admin_difficulte"), gte(schema.journal.at, new Date(Date.parse(`${jour}T00:00:00Z`) - 30 * 86_400_000))))
    .orderBy(desc(schema.journal.at)))
    .map((j) => ({ j, e: eleves.find((x) => x.id === (j.details as { eleveId?: string })?.eleveId) })).filter((x) => x.e);
  const stages = ids.length ? await db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes }).from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .where(and(inArray(schema.periodes.classeId, ids), eq(schema.eleves.archive, false))) : [];
  const conventions = stages.filter(({ s, e, p }) => p.debut >= jour && p.debut <= ajouterJours(jour, 7) && signatairesRequis(e.dateNaissance, p.debut, !!s.tuteur).some((k) => !s.signatures[k]));
  const attestations = stages.length ? await db.select({ stageId: schema.documents.stageId }).from(schema.documents)
    .where(and(inArray(schema.documents.stageId, stages.map((x) => x.s.id)), eq(schema.documents.type, "attestation"), eq(schema.documents.statut, "valide"))) : [];
  const sansAttestation = stages.filter(({ s, p }) => p.fin < jour && !attestations.some((d) => d.stageId === s.id));
  const nbMails = (await db.select({ id: schema.mailsAValider.id }).from(schema.mailsAValider)
    .where(and(eq(schema.mailsAValider.etablissementId, etab.id), eq(schema.mailsAValider.statut, "a_valider")))).length;
  const campagnes = ids.length ? await db.select().from(schema.campagnesTenues).where(inArray(schema.campagnesTenues.classeId, ids)) : [];
  const articles = await articlesDesFormations(etab.id, [...new Set(classes.map((c) => c.formationId).filter((x): x is string => !!x))]);
  const tailles = campagnes.map((t) => {
    const c = classes.find((x) => x.id === t.classeId)!;
    const liste = c.formationId ? articles.get(c.formationId) ?? [] : [];
    return { classe: c.libelle, dateLimite: t.dateLimite, manquent: eleves.filter((e) => e.classeId === c.id && taillesManquantes(liste, e.tailles).length).length };
  }).filter((x) => x.manquent);
  return {
    manques, difficultes, retards: await retardsEquipe(etab, jour), nbMails, tailles,
    conventions: conventions.map(({ e, p }) => ({ eleveId: e.id, eleve: `${e.prenom} ${e.nom}`, classe: classe(e.classeId), debut: p.debut })),
    sansAttestation: sansAttestation.map(({ e, p }) => ({ eleveId: e.id, eleve: `${e.prenom} ${e.nom}`, classe: classe(e.classeId), periode: p.libelle, fin: p.fin })),
  };
}

/** Le DDFPT (à défaut, la direction). */
async function ddfptDe(etabId: string) {
  const equipe = await db.select().from(schema.users).where(and(eq(schema.users.etablissementId, etabId), eq(schema.users.actif, true)));
  const g = equipe.filter((u) => u.roles.includes("gestionnaire"));
  return g.length ? g : equipe.filter((u) => u.roles.includes("direction"));
}

/**
 * Chaque matin : une alerte au DDFPT quand de nouveaux retards de l'équipe apparaissent ; le lundi, le point de la
 * semaine. Renvoie le nombre de mails envoyés.
 */
export async function alertesDuDdfpt(etabBrut: Etab, base: string, jour = aujourdhui()): Promise<number> {
  const etab = complet(etabBrut);
  const deja = new Set((await db.select({ cle: schema.journal.entiteId }).from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etab.id), inArray(schema.journal.action, ["alerte_ddfpt", "point_semaine"])))).map((x) => x.cle));
  const dest = await ddfptDe(etab.id);
  if (!dest.length) return 0;
  let n = 0;
  const nouveaux = (await retardsEquipe(etab, jour)).filter((r) => !deja.has(r.cle));
  if (nouveaux.length) {
    for (const u of dest) {
      await envoyer({ etab }, {
        canal: "mail", destinataire: u.email, sujet: `Cap Admin : ${nouveaux.length} retard(s) de l'équipe à suivre`,
        corps: `Bonjour ${u.prenom},\n\n${nouveaux.map((r) => `- ${r.eleve} (${r.classe}) : ${r.quoi}`).join("\n")}\n\nLes rappels aux professeurs sont prêts : relisez-les et envoyez-les en un clic.\n${base}/point-de-la-semaine#equipe\n\n${etab.nom}`,
      });
      n++;
    }
    await db.insert(schema.journal).values(nouveaux.map((r) => ({ etablissementId: etab.id, action: "alerte_ddfpt", entite: "visite", entiteId: r.cle })));
  }
  if (jourSemaine(jour) === 0 && !deja.has(`point:${jour}`)) {
    const p = await pointDeLaSemaine(etab, jour);
    const lignes = [
      [p.manques.length, "élève(s) avec des jours de stage manquants ou pas en stage"],
      [p.difficultes.length, "élève(s) en difficulté signalé(s) ces 30 derniers jours"],
      [p.retards.length, "retard(s) de l'équipe (visites, comptes rendus, ordres de mission)"],
      [p.conventions.length, "convention(s) pas encore signée(s), stage dans moins de 7 jours"],
      [p.sansAttestation.length, "stage(s) terminé(s) sans attestation validée"],
      [p.nbMails, "mail(s) préparé(s) par Cap Admin à relire"],
      [p.tailles.reduce((t, x) => t + x.manquent, 0), "élève(s) sans tailles de tenue"],
    ].filter(([k]) => Number(k) > 0).map(([k, l]) => `- ${k} ${l}`);
    for (const u of dest) {
      await envoyer({ etab }, {
        canal: "mail", destinataire: u.email, sujet: `Point de la semaine du ${dateLongue(jour)}`,
        corps: `Bonjour ${u.prenom},\n\n${lignes.length ? `Cette semaine :\n${lignes.join("\n")}` : "Rien en retard cette semaine."}\n\nLe détail : ${base}/point-de-la-semaine\n\n${etab.nom}`,
      });
      n++;
    }
    await db.insert(schema.journal).values({ etablissementId: etab.id, action: "point_semaine", entite: "etablissement", entiteId: `point:${jour}` });
  }
  return n;
}

