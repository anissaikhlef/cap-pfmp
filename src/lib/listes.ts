import "server-only";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { Signataire } from "@/db/schema";
import type { Contexte } from "./auth";
import { a, gereToutLEtablissement } from "./acces";
import { piecesAllocation } from "./allocations";
import { aujourdhui, dateLongue, ecartJours } from "./dates";
import { concerneLEleve, periodeDeReferenceEleve } from "./periodes";
import { joursEffectues, joursPrevus } from "./regles";
import { signatairesRequis } from "./requetes";
import { LISTES, listePermise, semainesEntre, type Liste } from "./listes-def";
import type { Tableau } from "./tableau-pdf";

/** 2026-10-26 → 26/10/2026, que le tableur reconnaît comme une date. */
const enClair = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "");

const SIGNATAIRES: Record<Signataire, string> = {
  eleve: "élève", parent: "responsable légal", entreprise: "entreprise", tuteur: "tuteur", professeur: "professeur", direction: "direction",
};

export const quiExporte = (ctx: Contexte) => ({ gestion: gereToutLEtablissement(ctx), professeur: a(ctx, "professeur") });
export const peutExporter = (ctx: Contexte, liste: Liste) => listePermise(liste, quiExporte(ctx));

/** Les années scolaires qui ont des classes, la plus récente d'abord. */
export async function anneesDesListes(ctx: Contexte): Promise<string[]> {
  const rows = await db.selectDistinct({ a: schema.classes.anneeScolaire }).from(schema.classes)
    .where(eq(schema.classes.etablissementId, ctx.etab.id)).orderBy(desc(schema.classes.anneeScolaire));
  const annees = rows.map((r) => r.a);
  return annees.includes(ctx.etab.anneeScolaire) ? annees : [ctx.etab.anneeScolaire, ...annees];
}

/**
 * Les classes dont la personne peut exporter les listes, pour une année : toutes pour le DDFPT et la direction ; pour un
 * professeur, ses propres classes (il en est le référent, ou il y a des heures de cours).
 */
export async function classesDesListes(ctx: Contexte, annee: string) {
  const toutes = await db.select({ id: schema.classes.id, libelle: schema.classes.libelle, referentId: schema.classes.referentId }).from(schema.classes)
    .where(and(eq(schema.classes.etablissementId, ctx.etab.id), eq(schema.classes.anneeScolaire, annee))).orderBy(asc(schema.classes.libelle));
  if (gereToutLEtablissement(ctx)) return toutes;
  if (!a(ctx, "professeur")) return [];
  const heures = await db.select({ c: schema.heuresClasses.classeId }).from(schema.heuresClasses)
    .where(and(eq(schema.heuresClasses.etablissementId, ctx.etab.id), eq(schema.heuresClasses.professeurId, ctx.user.id)));
  const mes = new Set(heures.map((h) => h.c));
  return toutes.filter((c) => c.referentId === ctx.user.id || mes.has(c.id));
}

/** Les stages des classes choisies (périodes de ces classes), avec l'élève, la période, l'entreprise et la spécialité. */
async function stagesDes(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes, ent: schema.entreprises, dom: schema.dominantes.libelle })
    .from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .leftJoin(schema.dominantes, eq(schema.dominantes.id, schema.eleves.dominanteId))
    .where(inArray(schema.classes.id, ids))
    .orderBy(asc(schema.classes.libelle), asc(schema.eleves.nom), asc(schema.eleves.prenom), asc(schema.periodes.debut));
}

/** Les élèves des classes choisies (ceux qui y sont, et ceux qui y ont eu un stage les années passées). */
async function elevesDes(ids: string[], stages: Awaited<ReturnType<typeof stagesDes>>) {
  if (!ids.length) return [];
  const libelles = new Map((await db.select({ id: schema.classes.id, l: schema.classes.libelle }).from(schema.classes).where(inArray(schema.classes.id, ids))).map((c) => [c.id, c.l]));
  const avecStage = [...new Set(stages.map((x) => x.e.id))];
  const rows = await db.select().from(schema.eleves)
    .where(or(and(inArray(schema.eleves.classeId, ids), eq(schema.eleves.archive, false)), avecStage.length ? inArray(schema.eleves.id, avecStage) : undefined));
  const classeDe = (e: typeof rows[number]) => (e.classeId && libelles.has(e.classeId) ? libelles.get(e.classeId)! : stages.find((x) => x.e.id === e.id)?.c.libelle ?? "");
  return rows.map((e) => ({ e, classe: classeDe(e) }))
    .sort((x, y) => x.classe.localeCompare(y.classe) || x.e.nom.localeCompare(y.e.nom) || x.e.prenom.localeCompare(y.e.prenom));
}

const etatDocument = (d: { statut: string } | undefined, termine: boolean) =>
  !d ? (termine ? "attendu" : "à la fin du stage") : d.statut === "valide" ? "reçu" : d.statut === "refuse" ? "refusé" : "à vérifier";

/** Le contenu d'une liste : colonnes et lignes, pour le tableur et pour le PDF. */
export async function construireListe(ctx: Contexte, liste: Liste, classes: { id: string; libelle: string }[], annee: string): Promise<Tableau> {
  const ids = classes.map((c) => c.id);
  const jour = aujourdhui();
  const quelles = classes.length === 1 ? classes[0].libelle : gereToutLEtablissement(ctx) ? "toutes les classes" : `mes classes (${classes.map((c) => c.libelle).join(", ")})`;
  const t: Tableau = { titre: LISTES[liste].titre, sousTitre: `${ctx.etab.nom} · ${quelles} · année ${annee} · éditée le ${dateLongue(jour)}`, colonnes: [], lignes: [] };
  const stages = await stagesDes(ids);
  const stageIds = stages.map((x) => x.s.id);
  const docs = stageIds.length ? await db.select().from(schema.documents)
    .where(and(inArray(schema.documents.stageId, stageIds), inArray(schema.documents.type, ["attestation", "livret"]))).orderBy(desc(schema.documents.deposeLe)) : [];
  const docDe = (stageId: string, type: "attestation" | "livret") => {
    const d = docs.filter((x) => x.stageId === stageId && x.type === type);
    return d.find((x) => x.statut === "valide") ?? d[0];
  };

  switch (liste) {
    case "rib": {
      const eleves = await elevesDes(ids, stages);
      const pieces = await piecesAllocation(eleves.map((x) => x.e.id));
      const etat = (d: { statut: string } | undefined) => (!d ? "manquant" : d.statut === "valide" ? "vérifié" : d.statut === "refuse" ? "refusé" : "à vérifier");
      t.colonnes = ["Classe", "Nom", "Prénom", "RIB", "RIB déposé le", "Pièce d'identité", "Pièce déposée le"];
      t.lignes = eleves.map(({ e, classe }) => {
        const p = pieces.get(e.id);
        return [classe, e.nom, e.prenom, etat(p?.rib), enClair(p?.rib?.deposeLe.toISOString().slice(0, 10)), etat(p?.piece_identite), enClair(p?.piece_identite?.deposeLe.toISOString().slice(0, 10))];
      });
      break;
    }
    case "lieux": {
      t.colonnes = ["Classe", "Nom", "Prénom", "Spécialité", "Période", "Entreprise", "Adresse", "Ville", "Tuteur", "Téléphone", "Du", "Au", "Semaines", "Jours prévus"];
      t.largeurs = [6, 8, 7, 9, 6, 12, 12, 11, 9, 9, 7, 7, 7, 6];
      t.lignes = stages.map(({ s, e, p, c, ent, dom }) => [
        c.libelle, e.nom, e.prenom, dom ?? "", p.libelle, ent.nom, ent.adresse ?? "", ent.ville ?? "", s.tuteur?.nom ?? ent.tuteurNom ?? "",
        s.tuteur?.telephone ?? ent.telephone ?? "", enClair(p.debut), enClair(p.fin), semainesEntre(p.debut, p.fin), joursPrevus(s.horaires, p.debut, p.fin).length,
      ]);
      break;
    }
    case "sans-stage": {
      const eleves = (await elevesDes(ids, stages)).filter((x) => x.e.classeId && ids.includes(x.e.classeId));
      const periodes = ids.length ? await db.select().from(schema.periodes).where(inArray(schema.periodes.classeId, ids)) : [];
      const demarches = eleves.length ? await db.select().from(schema.demarches).where(inArray(schema.demarches.eleveId, eleves.map((x) => x.e.id))) : [];
      t.colonnes = ["Classe", "Nom", "Prénom", "Période", "Début", "Dans (jours)", "Entreprises contactées"];
      for (const { e, classe } of eleves) {
        const p = periodeDeReferenceEleve(periodes.filter((x) => x.classeId === e.classeId && concerneLEleve(x, e)), jour);
        if (!p || p.fin < jour || stages.some((x) => x.e.id === e.id && x.p.id === p.id)) continue;
        const contactees = demarches.filter((d) => d.eleveId === e.id).map((d) => d.entrepriseNom);
        t.lignes.push([classe, e.nom, e.prenom, p.libelle, enClair(p.debut), p.debut > jour ? ecartJours(jour, p.debut) : "en cours", contactees.join(", ") || "aucune"]);
      }
      break;
    }
    case "conventions": {
      t.colonnes = ["Classe", "Nom", "Prénom", "Entreprise", "Période", "Début", "Ont signé", "Doivent encore signer", "Complète"];
      t.lignes = stages.map(({ s, e, p, c, ent }) => {
        const requis = signatairesRequis(e.dateNaissance, p.debut, !!s.tuteur);
        const ont = requis.filter((k) => s.signatures[k]);
        const manquent = requis.filter((k) => !s.signatures[k]);
        return [c.libelle, e.nom, e.prenom, ent.nom, p.libelle, enClair(p.debut), ont.map((k) => SIGNATAIRES[k]).join(", ") || "personne", manquent.map((k) => SIGNATAIRES[k]).join(", ") || "—", manquent.length ? "non" : "oui"];
      });
      break;
    }
    case "fin-de-stage": {
      t.colonnes = ["Classe", "Nom", "Prénom", "Entreprise", "Période", "Fin du stage", "Attestation", "Livret de compétences"];
      t.lignes = stages.map(({ s, e, p, c, ent }) => [c.libelle, e.nom, e.prenom, ent.nom, p.libelle, enClair(p.fin), etatDocument(docDe(s.id, "attestation"), p.fin < jour), etatDocument(docDe(s.id, "livret"), p.fin < jour)]);
      break;
    }
    case "absences": {
      const abs = stageIds.length ? await db.select().from(schema.absences).where(inArray(schema.absences.stageId, stageIds)).orderBy(asc(schema.absences.debut)) : [];
      const origine = { entreprise: "le tuteur", famille: "la famille", lycee: "le lycée" } as const;
      t.colonnes = ["Classe", "Nom", "Prénom", "Entreprise", "Du", "Au", "Signalée par", "Justifiée"];
      t.lignes = stages.flatMap(({ s, e, c, ent }) => abs.filter((x) => x.stageId === s.id).map((x) => [
        c.libelle, e.nom, e.prenom, ent.nom, enClair(x.debut), enClair(x.fin), origine[x.origine], x.justifieeLe ? `oui, le ${enClair(x.justifieeLe.toISOString().slice(0, 10))}` : "non",
      ]));
      break;
    }
    case "visites": {
      const visiteur = alias(schema.users, "visiteur");
      const vs = stageIds.length ? await db.select({ v: schema.visites, prenom: visiteur.prenom, nom: visiteur.nom }).from(schema.visites)
        .leftJoin(visiteur, eq(visiteur.id, schema.visites.visiteurId)).where(inArray(schema.visites.stageId, stageIds)) : [];
      const forme = (v: typeof schema.visites.$inferSelect) => {
        const f = v.heure ? v.mode : v.formePrevue;
        return f === "distanciel" ? "à distance" : f === "presentiel" ? "sur place" : "à décider";
      };
      const om = { aucun: "pas encore", a_signer: "à signer", signe: "signé" } as const;
      t.colonnes = ["Classe", "Élève", "Entreprise", "Ville", "Professeur", "Date", "Heure", "Forme", "Ordre de mission", "Compte rendu"];
      t.lignes = stages.map(({ s, e, c, ent }) => {
        const x = vs.find((y) => y.v.stageId === s.id);
        return [c.libelle, `${e.nom} ${e.prenom}`, ent.nom, ent.ville ?? "", x?.nom ? `${x.prenom} ${x.nom}` : "à attribuer", enClair(x?.v.date), x?.v.heure ?? "",
          x ? forme(x.v) : "", x ? (ctx.etab.reglages.ordreMission ? om[x.v.ordreMission] : "non demandé") : "", x?.v.compteRendu ? "rédigé" : "à faire"];
      });
      break;
    }
    case "entreprises": {
      const tous = gereToutLEtablissement(ctx) && classes.length > 1;
      const ents = await db.select().from(schema.entreprises).where(eq(schema.entreprises.etablissementId, ctx.etab.id)).orderBy(asc(schema.entreprises.nom));
      const accueils = (id: string) => new Set(stages.filter((x) => x.ent.id === id).map((x) => x.e.id)).size;
      t.colonnes = ["Entreprise", "Secteur", "Domaine", "Adresse", "Ville", "Tuteur", "Téléphone", "Mail", "Places", "Élèves accueillis"];
      t.lignes = ents.filter((x) => tous || accueils(x.id) > 0).map((x) => [
        x.nom, x.secteur === "prive" ? "privé" : "public", x.domaine ?? "", x.adresse ?? "", x.ville ?? "", x.tuteurNom ?? "", x.telephone ?? "", x.email ?? "", x.placesParDefaut, accueils(x.id),
      ]);
      break;
    }
    case "bilan": {
      const eleves = await elevesDes(ids, stages);
      const abs = stageIds.length ? await db.select().from(schema.absences).where(inArray(schema.absences.stageId, stageIds)) : [];
      t.colonnes = ["Classe", "Élèves", "Avec un stage", "Sans stage", "Stages", "Conventions complètes", "Jours effectués", "Attestations reçues", "Livrets reçus"];
      t.lignes = classes.map((c) => {
        const deLaClasse = stages.filter((x) => x.c.id === c.id);
        const effectif = eleves.filter((x) => x.classe === c.libelle).length;
        const avec = new Set(deLaClasse.map((x) => x.e.id)).size;
        const completes = deLaClasse.filter(({ s, e, p }) => signatairesRequis(e.dateNaissance, p.debut, !!s.tuteur).every((k) => s.signatures[k])).length;
        const jours = deLaClasse.reduce((n, { s, p }) => n + joursEffectues(s.horaires, p.debut, p.fin, abs.filter((x) => x.stageId === s.id), jour).effectues, 0);
        const termines = deLaClasse.filter((x) => x.p.fin < jour);
        const recus = (type: "attestation" | "livret") => `${termines.filter((x) => docDe(x.s.id, type)?.statut === "valide").length} sur ${termines.length}`;
        return [c.libelle, effectif, avec, Math.max(0, effectif - avec), deLaClasse.length, `${completes} sur ${deLaClasse.length}`, jours, recus("attestation"), recus("livret")];
      });
      break;
    }
  }
  return t;
}
