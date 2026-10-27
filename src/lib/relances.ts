import "server-only";
import { and, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { envoyer } from "./messages";
import { ageAu, ajouterJours, aujourdhui, dateLongue, ecartJours, jourDe, JOURS, texteDates } from "./dates";
import { chargerConventionEtab } from "./convention";
import { inviterASigner } from "./invitations";
import { adresseDuSite } from "./liens";
import { contactDuStage, documentsManquants, lienDeDepot } from "./entreprises-accueil";
import { responsablesDe } from "./alertes";
import { piecesAllocation } from "./allocations";
import { candidaturesDe } from "./candidatures";
import { campagneDe, relancerEntreprise, reponsesCampagne } from "./campagne";
import { referentDe } from "./requetes";
import { estJourOuvre, jourDeRelance, ouvertureAttestation, piecesManquantes, relanceCyclique, relanceHebdomadaireDue, tachesEleve, texteJour } from "./regles";
import { completerReglages, type Reglages, type Signataire } from "@/db/schema";

type Etab = typeof schema.etablissements.$inferSelect;
type EtabC = Etab & { reglages: Reglages };
type Eleve = typeof schema.eleves.$inferSelect;
type Expediteur = { etab: Etab; user: { id: string } | null };
type Destinataire = { email: string; prenom: string };

/**
 * Les relances déjà envoyées depuis la rentrée (clés du journal), pour ne jamais envoyer deux fois la même
 * et compter celles d'une même demande (clé « demande:jour »).
 */
async function journalDesRelances(etab: Etab) {
  const rows = await db.select({ cle: schema.journal.entiteId }).from(schema.journal)
    .where(and(eq(schema.journal.etablissementId, etab.id), eq(schema.journal.action, "relance_auto"),
      gte(schema.journal.at, new Date(`${etab.anneeScolaire.slice(0, 4)}-08-01T00:00:00Z`))));
  const cles = new Set(rows.map((r) => r.cle ?? ""));
  return {
    fait: (cle: string) => cles.has(cle),
    /** Les jours des relances déjà envoyées pour une demande. */
    dates: (demande: string) => [...cles].filter((c) => c.startsWith(`${demande}:`)).map((c) => c.slice(demande.length + 1)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    noter: async (entite: string, cle: string, details: unknown = {}) => {
      cles.add(cle);
      await db.insert(schema.journal).values({ etablissementId: etab.id, action: "relance_auto", entite, entiteId: cle, details });
    },
  };
}

/** Les entreprises qui n'ont pas répondu malgré tous les rappels : un seul mail par personne du lycée, qui les liste. */
function listeDAppels() {
  const parPersonne = new Map<string, { prenom: string; lignes: string[] }>();
  return {
    ajouter(dest: Destinataire[], ligne: string) {
      for (const d of dest) {
        const x = parPersonne.get(d.email) ?? { prenom: d.prenom, lignes: [] };
        x.lignes.push(ligne);
        parPersonne.set(d.email, x);
      }
    },
    async envoyer(ctx: Expediteur) {
      for (const [email, x] of parPersonne) {
        await envoyer(ctx, {
          canal: "mail", destinataire: email, sujet: "Entreprises à appeler",
          corps: `Bonjour ${x.prenom},\n\nCes entreprises n'ont pas répondu malgré plusieurs rappels par mail. Un appel téléphonique sera plus efficace :\n${x.lignes.map((l) => `- ${l}`).join("\n")}\n\n${ctx.etab.nom}`,
        });
      }
      return parPersonne.size;
    },
  };
}

/**
 * La famille à relancer pour un élève : ses responsables légaux qui ont un compte ;
 * l'élève lui-même s'il est majeur et a un compte (ses responsables, s'il n'en a pas).
 */
async function familleDe(e: Eleve, jour: string) {
  if ((ageAu(e.dateNaissance, jour) ?? 0) >= 18 && e.userId) {
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, e.userId), eq(schema.users.actif, true))).limit(1);
    if (u) return [{ email: u.email, prenom: u.prenom, eleve: true }];
  }
  return (await responsablesDe(e.id)).map((u) => ({ email: u.email, prenom: u.prenom, eleve: false }));
}

/** « Mon enfant » pour un parent, « Mon stage » pour l'élève majeur, avec l'adresse de la page. */
const espace = (eleve: boolean, base: string) => (eleve ? `« Mon stage » : ${base}/mon-stage` : `« Mon enfant » : ${base}/mon-enfant`);

/**
 * Envoie les relances du jour pour un établissement, aux rythmes réglés dans « Organisation », jamais le week-end.
 * Sans doublon : chaque relance n'est envoyée qu'une fois. Si `classes` est fourni, se limite à ces classes ;
 * la campagne de rentrée (qui concerne tout le lycée) n'est relancée qu'avec `campagne`.
 */
export async function relancesDuJour(etab: Etab, opts: { classes?: string[]; userId?: string | null; base?: string; campagne?: boolean } = {}) {
  const jour = aujourdhui();
  if (!estJourOuvre(jour)) return 0;
  const etabC: EtabC = { ...etab, reglages: completerReglages(etab.reglages) };
  const R = etabC.reglages.relances;
  const base = opts.base ?? (await adresseDuSite());
  const conds = [eq(schema.classes.etablissementId, etab.id), eq(schema.classes.anneeScolaire, etab.anneeScolaire)];
  if (opts.classes) { if (!opts.classes.length) return 0; conds.push(inArray(schema.classes.id, opts.classes)); }
  const lignes = await db.select({ s: schema.stages, e: schema.eleves, p: schema.periodes, c: schema.classes, ent: schema.entreprises })
    .from(schema.stages)
    .innerJoin(schema.eleves, eq(schema.eleves.id, schema.stages.eleveId))
    .innerJoin(schema.periodes, eq(schema.periodes.id, schema.stages.periodeId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.periodes.classeId))
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(and(...conds, eq(schema.eleves.archive, false)));
  const ctx: Expediteur = { etab, user: opts.userId ? { id: opts.userId } : null };
  const journal = await journalDesRelances(etab);
  const appels = listeDAppels();
  const equipe = await equipeDuLycee(etab.id);
  const cycle = { jour, intervalle: R.entrepriseIntervalle, max: R.entrepriseMax };
  let n = 0;

  for (const l of lignes) {
    const avant = ecartJours(jour, l.p.debut);
    const quand = avant > 0 ? `Le stage commence le ${dateLongue(l.p.debut)}, dans ${avant} jour${avant > 1 ? "s" : ""} : sans convention signée, l'élève ne peut pas partir en stage.`
      : avant === 0 ? "Le stage commence aujourd'hui : sans convention signée, l'élève ne peut pas partir en stage."
      : `Le stage a commencé le ${dateLongue(l.p.debut)} : la convention doit être signée au plus vite.`;

    // 1. Convention pas encore signée par tous (signature en ligne seulement).
    const jourFixe = avant >= 0 && jourDeRelance(jour, R.convention.map((k) => ajouterJours(l.p.debut, -k)));
    const cycleEntreprise = !!l.s.conventionEnvoyeeLe && R.entrepriseIntervalle > 0;
    if (etabC.reglages.signature !== "papier" && l.p.fin >= jour && (jourFixe || cycleEntreprise)) {
      const cv = await chargerConventionEtab(etabC, l.s.id);
      const manquants = cv ? cv.requis.filter((k) => !cv.s.signatures[k] && k !== "direction" && k !== etabC.reglages.dernierSignataire) : [];
      const estEntreprise = (k: Signataire) => k === "entreprise" || k === "tuteur";
      const pourLEntreprise = manquants.filter(estEntreprise);
      // L'élève qui a un compte reçoit déjà son rappel quotidien.
      const eleveAuQuotidien = R.eleveQuotidien && !!l.e.userId;
      // Aux dates fixes avant le départ : chacun est invité ; l'entreprise seulement tant que ses rappels n'ont pas commencé.
      const cle = `${l.s.id}:convention:${jour}`;
      const auxDatesFixes = manquants.filter((k) => !(k === "eleve" && eleveAuQuotidien) && !(cycleEntreprise && estEntreprise(k)));
      if (cv && jourFixe && auxDatesFixes.length && !journal.fait(cle)) {
        n += (await inviterASigner(ctx, cv, auxDatesFixes, base, true, quand)).messages;
        await journal.noter("stage", cle, { manquants: auxDatesFixes });
      }
      // L'entreprise et le tuteur : tous les N jours depuis l'envoi de la convention.
      if (cv && cycleEntreprise && pourLEntreprise.length) {
        const demande = `signature:${l.s.id}`;
        const action = relanceCyclique({ ...cycle, depuis: jourDe(l.s.conventionEnvoyeeLe!), dejaEnvoyees: journal.dates(demande) });
        if (action === "relancer") {
          n += (await inviterASigner(ctx, cv, pourLEntreprise, base, true, quand)).messages;
          await journal.noter("stage", `${demande}:${jour}`, { pourLEntreprise });
        } else if (action === "appeler" && !journal.fait(`${demande}:appel`)) {
          appels.ajouter(await equipeDuStage(equipe, l.e), `${l.ent.nom}${l.ent.telephone ? ` (${l.ent.telephone})` : ""} : convention de ${l.e.prenom} ${l.e.nom} (${l.c.libelle}) pas encore signée.`);
          await journal.noter("stage", `${demande}:appel`);
        }
      }
    }

    // Le tuteur reçoit les mails de l'entreprise ; à défaut, l'adresse de l'entreprise.
    const contact = contactDuStage(l.s, l.ent);

    // 2. Mail d'accueil au tuteur, quelques jours avant le début du stage ; un stage enregistré plus tard le reçoit
    //    au premier jour ouvré qui suit, jusqu'au premier jour du stage.
    if (R.accueilAvant > 0 && contact && avant >= 0 && avant <= R.accueilAvant && !journal.fait(`accueil:${l.s.id}`)) {
      await envoyer(ctx, {
        canal: "mail", destinataire: contact, sujet: `Accueil de ${l.e.prenom} ${l.e.nom} en stage à partir du ${dateLongue(l.p.debut)}`, eleveId: l.e.id, entrepriseId: l.ent.id,
        corps: await mailDAccueil(etab, l),
      });
      await journal.noter("stage", `accueil:${l.s.id}`);
      n++;
    }

    // 3. Attestation de stage en ligne : quelques jours avant la fin, le tuteur reçoit son lien pour la remplir avec l'élève
    //    encore présent (au premier jour ouvré de cette fenêtre, jusqu'au dernier jour du stage).
    const ouverture = ouvertureAttestation(l.p.debut, l.p.fin, R.attestationAvant);
    if (R.attestationAvant > 0 && contact && jour >= ouverture && jour <= l.p.fin && !journal.fait(`attestation:${l.s.id}`)
      && (await documentsManquants(l.s.id)).includes("attestation")) {
      const lien = await lienDeDepot(etab.id, l.s.id, contact, base);
      await envoyer(ctx, {
        canal: "mail", destinataire: contact, sujet: `Attestation de stage de ${l.e.prenom} ${l.e.nom} à remplir`, eleveId: l.e.id, entrepriseId: l.ent.id,
        corps: `${l.s.tuteur?.nom ? `Bonjour ${l.s.tuteur.nom}` : "Madame, Monsieur"},\n\nLe stage de ${l.e.prenom} ${l.e.nom} se termine le ${dateLongue(l.p.fin)}. Merci de remplir son attestation de stage, avec ${l.e.prenom} si possible, avant son départ : en ligne, sans créer de compte, avec ce lien personnel (valable jusqu'au ${lien.jusquau}) :\n${lien.url}\n\nRien à imprimer ni à scanner : l'attestation signée arrive directement au lycée.\n\n${etab.nom}`,
      });
      await journal.noter("stage", `attestation:${l.s.id}`);
      n++;
    }

    // 4. Attestation et livret : remerciements le lendemain de la fin, puis un rappel tous les N jours tant qu'ils manquent,
    //    chaque fois avec un lien personnel pour les déposer sans compte.
    if (l.p.fin < jour && contact) {
      const demande = `fin:${l.s.id}`;
      const merci = R.remerciementApres > 0 && jourDeRelance(jour, [ajouterJours(l.p.fin, R.remerciementApres)]) && !journal.fait(`merci:${l.s.id}`);
      const action = merci ? null : relanceCyclique({ ...cycle, depuis: l.p.fin, dejaEnvoyees: journal.dates(demande) });
      if (merci || (action && !(action === "appeler" && journal.fait(`${demande}:appel`)))) {
        const manquent = await documentsManquants(l.s.id);
        const quoi = manquent.map((t) => (t === "attestation" ? "l'attestation de stage" : "le livret de compétences")).join(" et ");
        const pluriel = manquent.length > 1;
        // Accord : l'attestation (féminin), le livret, ou les deux
        const accord = pluriel ? "s" : manquent[0] === "attestation" ? "e" : "";
        const pronom = pluriel ? "les" : manquent[0] === "attestation" ? "la" : "le";
        const lien = manquent.length ? await lienDeDepot(etab.id, l.s.id, contact, base) : null;
        // L'attestation se remplit et se signe en ligne avec le même lien ; le livret se dépose.
        const comment = !manquent.includes("attestation") ? `Vous pouvez ${pronom} déposer en ligne`
          : pluriel ? "Vous pouvez remplir et signer l'attestation en ligne, et déposer le livret" : "Vous pouvez la remplir et la signer en ligne, ou la déposer";
        const depot = lien ? `Merci de nous transmettre ${quoi}, complété${accord} et signé${accord}. ${comment}, sans créer de compte, avec ce lien personnel (valable jusqu'au ${lien.jusquau}) :\n${lien.url}` : "";
        if (merci) {
          await envoyer(ctx, {
            canal: "mail", destinataire: contact, sujet: `Merci d'avoir accueilli ${l.e.prenom} ${l.e.nom}`, eleveId: l.e.id, entrepriseId: l.ent.id,
            corps: `${l.s.tuteur?.nom ? `Bonjour ${l.s.tuteur.nom}` : "Madame, Monsieur"},\n\nLe stage de ${l.e.prenom} ${l.e.nom} s'est terminé le ${dateLongue(l.p.fin)}. Merci pour votre accueil et votre accompagnement pendant ces semaines.${depot ? `\n\n${depot}` : ""}\n\n${etab.nom}`,
          });
          await journal.noter("stage", `merci:${l.s.id}`);
          // Les rappels repartent de ce mail : le prochain, N jours plus tard.
          if (manquent.length) await journal.noter("stage", `${demande}:${jour}`, { manquent, remerciements: true });
          n++;
        } else if (manquent.length && action === "relancer") {
          await envoyer(ctx, {
            canal: "mail", destinataire: contact, sujet: `Fin du stage de ${l.e.prenom} ${l.e.nom} : documents à transmettre`, eleveId: l.e.id, entrepriseId: l.ent.id,
            corps: `Madame, Monsieur,\n\nLe stage de ${l.e.prenom} ${l.e.nom} s'est terminé le ${dateLongue(l.p.fin)}. ${depot}\nVous pouvez aussi répondre à ce message avec les documents.\n\nMerci pour l'accueil de notre élève.\n${etab.nom}`,
          });
          await journal.noter("stage", `${demande}:${jour}`, { manquent });
          n++;
        } else if (manquent.length && action === "appeler") {
          appels.ajouter(await equipeDuStage(equipe, l.e), `${l.ent.nom}${l.ent.telephone ? ` (${l.ent.telephone})` : ""} : ${quoi} de ${l.e.prenom} ${l.e.nom} (${l.c.libelle}) pas encore reçu${accord}.`);
          await journal.noter("stage", `${demande}:appel`);
        }
      }
    }
  }

  const eleves = new Map(lignes.map((l) => [l.e.id, l.e]));
  n += await relancerPieces(ctx, etabC, [...eleves.values()], journal, jour, base);
  n += await relancerAbsences(ctx, etabC, lignes.map((l) => l.s.id), eleves, journal, jour, base);
  if (R.eleveQuotidien) n += await rappelerEleves(ctx, etabC, conds, journal, jour, base);
  if (opts.campagne ?? !opts.classes) n += await relancerCampagne(ctx, etabC, journal, appels, equipe, cycle, base);
  n += await appels.envoyer(ctx);
  return n;
}

/** Le mail d'accueil : l'élève, les dates, les horaires prévus et le professeur à contacter. */
async function mailDAccueil(etab: Etab, l: { s: typeof schema.stages.$inferSelect; e: Eleve; p: typeof schema.periodes.$inferSelect; c: typeof schema.classes.$inferSelect; ent: typeof schema.entreprises.$inferSelect }) {
  const refId = await referentDe(l.e);
  const [ref] = refId ? await db.select().from(schema.users).where(eq(schema.users.id, refId)).limit(1) : [];
  const horaires = JOURS.map((j, i) => [j, texteJour(l.s.horaires, i)] as const).filter(([, t]) => t).map(([j, t]) => `- ${j} : ${t}`).join("\n");
  return `${l.s.tuteur?.nom ? `Bonjour ${l.s.tuteur.nom}` : "Madame, Monsieur"},\n\n${l.e.prenom} ${l.e.nom}, élève de ${l.c.libelle}${l.c.filiere ? ` (${l.c.filiere})` : ""} au ${etab.nom}, commence son stage chez ${l.ent.nom} le ${dateLongue(l.p.debut)}, jusqu'au ${dateLongue(l.p.fin)}.\n\nHoraires prévus :\n${horaires}\n\n${ref ? `Son professeur référent : ${ref.prenom} ${ref.nom}, ${ref.email}${ref.telephone ? `, ${ref.telephone}` : ""}. En cas d'absence ou de difficulté, prévenez-le, ou répondez simplement à ce message.` : "En cas d'absence ou de difficulté, répondez simplement à ce message."}\n\nMerci de l'accueillir.\n${etab.nom}`;
}

/** Les comptes actifs de l'équipe du lycée (gestion des PFMP, référents, direction). */
async function equipeDuLycee(etabId: string) {
  return db.select().from(schema.users).where(and(eq(schema.users.etablissementId, etabId), eq(schema.users.actif, true)));
}

/** Qui appelle l'entreprise pour un élève : son professeur référent et la gestion des PFMP ; à défaut, la direction. */
async function equipeDuStage(equipe: (typeof schema.users.$inferSelect)[], e: Eleve): Promise<Destinataire[]> {
  const refId = await referentDe(e);
  const dest = equipe.filter((u) => u.id === refId || u.roles.includes("gestionnaire"));
  return dest.length ? dest : equipe.filter((u) => u.roles.includes("direction"));
}

type Journal = Awaited<ReturnType<typeof journalDesRelances>>;

/**
 * 3. Pièces de l'allocation (RIB, pièce d'identité) : les familles des élèves qui ont un stage cette année,
 * une fois par semaine tant qu'il en manque, au plus le nombre de fois réglé dans l'année.
 */
async function relancerPieces(ctx: Expediteur, etab: EtabC, eleves: Eleve[], journal: Journal, jour: string, base: string) {
  const max = etab.reglages.relances.piecesMax;
  if (max <= 0 || !eleves.length) return 0;
  const pieces = await piecesAllocation(eleves.map((e) => e.id));
  let n = 0;
  for (const e of eleves) {
    const manquent = piecesManquantes(pieces.get(e.id));
    if (!manquent.length || !relanceHebdomadaireDue(journal.dates(`${e.id}:pieces`), jour, max)) continue;
    const famille = await familleDe(e, jour);
    if (!famille.length) continue;
    const quoi = manquent.map((t) => (t === "rib" ? "le RIB" : "une pièce d'identité")).join(" et ");
    for (const f of famille) {
      await envoyer(ctx, {
        canal: "mail", destinataire: f.email, sujet: `Allocation de stage de ${e.prenom} ${e.nom} : document à déposer`, eleveId: e.id,
        corps: `Bonjour ${f.prenom},\n\nPour le versement de l'allocation de stage${f.eleve ? "" : ` de ${e.prenom}`}, il manque encore ${quoi}. Vous pouvez ${manquent.length > 1 ? "les" : "le"} déposer en quelques secondes dans Cap PFMP, rubrique ${espace(f.eleve, base)}\n\nCes documents sont conservés pour toute la scolarité : vous n'aurez pas à les déposer de nouveau.\n\n${etab.nom}`,
      });
      n++;
    }
    await journal.noter("pieces", `${e.id}:pieces:${jour}`, { manquent, destinataires: famille.length });
  }
  return n;
}

/** 4. Absence pas encore justifiée : la famille, aux jours réglés après le signalement de l'absence. */
async function relancerAbsences(ctx: Expediteur, etab: EtabC, stageIds: string[], eleves: Map<string, Eleve>, journal: Journal, jour: string, base: string) {
  const jours = etab.reglages.relances.absences;
  if (!jours.length || !stageIds.length) return 0;
  const absences = await db.select().from(schema.absences).where(and(inArray(schema.absences.stageId, stageIds), isNull(schema.absences.justifieeLe)));
  let n = 0;
  for (const a of absences) {
    const e = eleves.get(a.eleveId);
    const cle = `${a.id}:absence:${jour}`;
    const signalee = jourDe(a.createdAt);
    if (!e || !jourDeRelance(jour, jours.map((k) => ajouterJours(signalee, k))) || journal.fait(cle)) continue;
    const famille = await familleDe(e, jour);
    for (const f of famille) {
      await envoyer(ctx, {
        canal: "mail", destinataire: f.email, sujet: `Absence de ${e.prenom} en stage : à justifier`, eleveId: e.id,
        corps: `Bonjour ${f.prenom},\n\n${f.eleve ? "Votre absence" : `L'absence de ${e.prenom} ${e.nom}`} en stage ${texteDates(a.debut, a.fin)} n'est pas encore justifiée. Merci d'en indiquer le motif dans Cap PFMP, rubrique ${espace(f.eleve, base)}\nVous pouvez joindre un justificatif (certificat médical, convocation…).\n\nLes jours d'absence sont déduits des jours de stage effectués.\n\n${etab.nom}`,
      });
      n++;
    }
    if (famille.length) await journal.noter("absence", cle, { destinataires: famille.length });
  }
  return n;
}

/**
 * 5. Rappel quotidien à chaque élève qui a un compte : ce qui lui reste à faire (trouver son stage, relancer
 * les entreprises contactées, déposer son CV, signer sa convention). Rien à faire : pas de message.
 */
async function rappelerEleves(ctx: Expediteur, etab: EtabC, conds: SQL[], journal: Journal, jour: string, base: string) {
  const eleves = await db.select({ e: schema.eleves, u: schema.users }).from(schema.eleves)
    .innerJoin(schema.classes, eq(schema.classes.id, schema.eleves.classeId))
    .innerJoin(schema.users, eq(schema.users.id, schema.eleves.userId))
    .where(and(...conds, eq(schema.eleves.archive, false), eq(schema.users.actif, true)));
  if (!eleves.length) return 0;
  const ids = eleves.map((x) => x.e.id);
  const classes = [...new Set(eleves.map((x) => x.e.classeId!))];
  const periodes = await db.select().from(schema.periodes).where(inArray(schema.periodes.classeId, classes));
  const stages = await db.select({ s: schema.stages, ent: schema.entreprises.nom }).from(schema.stages)
    .innerJoin(schema.entreprises, eq(schema.entreprises.id, schema.stages.entrepriseId))
    .where(inArray(schema.stages.eleveId, ids));
  const demarches = await db.select().from(schema.demarches).where(and(inArray(schema.demarches.eleveId, ids), eq(schema.demarches.reponse, "attente")));
  const candidatures = await candidaturesDe(ids);
  let n = 0;
  for (const { e, u } of eleves) {
    const cle = `eleve:${e.id}:${jour}`;
    if (journal.fait(cle)) continue;
    const taches = tachesEleve({
      jour, rechercheJours: etab.reglages.relances.eleveRechercheJours, signatureEnLigne: etab.reglages.signature !== "papier", aUnCv: !!candidatures.get(e.id)?.cv,
      periodes: periodes.filter((p) => p.classeId === e.classeId && (!p.eleveId || p.eleveId === e.id)),
      stages: stages.filter((x) => x.s.eleveId === e.id).map((x) => ({ periodeId: x.s.periodeId, entreprise: x.ent, signeeParLEleve: !!x.s.signatures.eleve })),
      demarchesEnAttente: demarches.filter((d) => d.eleveId === e.id).map((d) => ({ entreprise: d.entrepriseNom, date: d.date })),
    });
    if (!taches.length) continue;
    await envoyer(ctx, {
      canal: "mail", destinataire: u.email, sujet: "Votre stage : ce qu'il vous reste à faire", eleveId: e.id,
      corps: `Bonjour ${e.prenom},\n\nVoici ce qu'il vous reste à faire pour votre stage :\n${taches.map((t) => (t.startsWith("  ·") ? t : `- ${t}`)).join("\n")}\n\nTout se fait dans Cap PFMP, rubrique « Mon stage » : ${base}/mon-stage\n\n${etab.nom}`,
    });
    await journal.noter("eleve", cle, { taches: taches.length });
    n++;
  }
  return n;
}

/** 6. Campagne de rentrée : les entreprises sans réponse, tous les N jours après l'envoi, avec un nouveau lien personnel. */
async function relancerCampagne(ctx: Expediteur, etab: EtabC, journal: Journal, appels: ReturnType<typeof listeDAppels>,
  equipe: (typeof schema.users.$inferSelect)[], cycle: { jour: string; intervalle: number; max: number }, base: string) {
  const c = await campagneDe(etab);
  if (!c?.envoyeeLe) return 0;
  // La personne qui a lancé la campagne appelle les entreprises silencieuses ; à défaut, la gestion des PFMP ou la direction.
  const auteur = equipe.filter((u) => u.id === c.creeParId);
  const quiAppelle = auteur.length ? auteur : equipe.filter((u) => u.roles.includes("gestionnaire") || u.roles.includes("direction"));
  let n = 0;
  for (const { r, e } of await reponsesCampagne(c.id)) {
    if (r.reponduLe || !e.email || e.ecarteeLe) continue;
    const demande = `campagne:${c.id}:${e.id}`;
    const action = relanceCyclique({ ...cycle, depuis: jourDe(c.envoyeeLe), dejaEnvoyees: journal.dates(demande) });
    if (action === "relancer" && (await relancerEntreprise(ctx, c, e, base))) {
      await journal.noter("entreprise", `${demande}:${cycle.jour}`);
      n++;
    } else if (action === "appeler" && !journal.fait(`${demande}:appel`)) {
      appels.ajouter(quiAppelle, `${e.nom}${e.telephone ? ` (${e.telephone})` : ""} : pas de réponse à la campagne de rentrée.`);
      await journal.noter("entreprise", `${demande}:appel`);
    }
  }
  return n;
}
