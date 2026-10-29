// Cap Veille, après l'audit des agents (décisions d'Anissa) : pages de chaque académie (par l'administration) et du lycée
// (alertes directes), calendrier des échéances (proposées par Cap Veille, retenues ou corrigées par le DDFPT, rappels aux
// jours réglés), comparaison avec tous les documents du lycée, application en un clic (le DDFPT propose, la direction valide).
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { BASE, ok, session, fin, visible } from "./outils.mjs";

// Les alertes de veille sont communes à tous les lycées (elles restent d'un essai à l'autre) : titres propres à cet essai.
const essai = Date.now().toString(36);
const sql = (q) => execFileSync("psql", [process.env.DATABASE_URL, "-Atc", q]).toString().trim();

/* ------------------- L'administration : pages des académies, alerte d'une académie ------------------- */
const admin = await session("admin");
await admin.goto(BASE + "/admin/veille");
await admin.fill("#v-academies", "Versailles | https://exemple.com/pfmp");
await admin.click("button:has-text('Enregistrer les sources')");
ok(await visible(admin.getByText("Ce ne sont pas des sites d'académie")), "seuls les sites des académies sont acceptés");
await admin.fill("#v-academies", "Versailles | https://www.ac-versailles.fr/pfmp");
await admin.click("button:has-text('Enregistrer les sources')");
ok(await visible(admin.getByText("source(s) enregistrée(s)").or(admin.getByText("Aucune page à lire"))), "l'administration indique les pages de l'académie de Versailles");
await admin.reload();
ok((await admin.inputValue("#v-academies")) === "VERSAILLES | https://www.ac-versailles.fr/pfmp", "elles sont gardées par académie");

const nouvelle = async (titre, academie) => {
  await admin.fill("#v-titre", titre);
  await admin.fill("#v-source", "https://www.ac-versailles.fr/pfmp/circulaire-2027");
  await admin.fill("#v-academie", academie);
  await admin.fill("#v-texte", "Circulaire académique sur les périodes de formation en milieu professionnel. Les attestations récapitulatives des PFMP des classes de terminale doivent être envoyées à la division des examens avant le 15 avril 2027, par le dépôt prévu à cet effet.");
  await admin.click("button:has-text(\"Préparer l'alerte\")");
  await visible(admin.getByText("Cap Veille a préparé l'alerte"));
};
await nouvelle(`Circulaire PFMP de l'académie de Versailles ${essai}`, "Versailles");
// Un brouillon : son titre est dans la case « Titre ».
const brouillonDe = (titre) => admin.locator(".panel.agent-ia").filter({ has: admin.locator(`input[name=titre][value="${titre}"]`) });
const brouillon = brouillonDe(`Circulaire PFMP de l'académie de Versailles ${essai}`);
ok(await brouillon.count() === 1, "une alerte pour une seule académie");
await brouillon.locator("textarea[name=echeances]").fill("2027-04-15 | Envoi des attestations récapitulatives à l'académie | examen");
await brouillon.locator("button:has-text('Enregistrer les corrections')").click();
await visible(admin.getByText("Alerte corrigée"));
await brouillonDe(`Circulaire PFMP de l'académie de Versailles ${essai}`).locator("button:has-text(\"Publier l'alerte\")").click();
ok(await visible(admin.getByText("Alerte publiée")), "l'administration publie l'alerte, avec son échéance");
await nouvelle(`Circulaire PFMP de l'académie de Paris ${essai}`, "Paris");
await brouillonDe(`Circulaire PFMP de l'académie de Paris ${essai}`).locator("button:has-text(\"Publier l'alerte\")").click();
await visible(admin.getByText("Alerte publiée"));

/* ------------------- Le lycée : alertes de son académie, calendrier des échéances ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/veille");
let t = await ddfpt.textContent("main");
ok(t.includes(`Circulaire PFMP de l'académie de Versailles ${essai}`) && t.includes("académie de VERSAILLES") && !t.includes(`Circulaire PFMP de l'académie de Paris ${essai}`), "le lycée ne reçoit que les alertes de son académie");
const proposee = ddfpt.locator("#echeances .row", { hasText: "Envoi des attestations récapitulatives" });
ok((await proposee.textContent()).includes("Proposée par Cap Veille") && (await proposee.textContent()).includes("15 avril 2027"), "l'échéance du texte est proposée au calendrier du lycée");
await proposee.locator("input[name=date]").fill("2027-04-14");
await proposee.locator("button:has-text('Retenir')").click();
ok(await visible(ddfpt.getByText("Échéance retenue : Envoi des attestations récapitulatives à l'académie, le 14/04/2027")), "le DDFPT la retient en corrigeant la date");
const ajout = ddfpt.locator("#echeances > form").first();
await ajout.locator("input[name=titre]").fill("Réunion bilan des PFMP des terminales");
await ajout.locator("input[name=date]").fill("2026-11-10");
await ajout.locator("select[name=concerne]").selectOption("examen");
await ajout.locator("button:has-text(\"Ajouter l'échéance\")").click();
ok(await visible(ddfpt.getByText("Échéance ajoutée : Réunion bilan des PFMP des terminales")), "le DDFPT ajoute une échéance");

await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
await ddfpt.waitForURL(/msg=/);
await ddfpt.goto(BASE + "/messages");
t = await ddfpt.textContent("main");
ok(t.includes("Échéance dans 15 jour(s) : Réunion bilan des PFMP des terminales") && t.includes("a.diallo@") && !/p\.martin@[^\n]*Réunion bilan/.test(t), "15 jours avant, le rappel part au DDFPT, à la direction et au référent de la classe d'examen");

/* ------------------- Les pages du lycée ------------------- */
await ddfpt.goto(BASE + "/veille");
await ddfpt.fill("#v-pages", "https://exemple.com/actu");
await ddfpt.click("#echeances form:has(#v-pages) button:has-text('Enregistrer')");
ok(await visible(ddfpt.getByText("Seuls les sites officiels sont acceptés")), "le lycée ne fait lire que des sites officiels");
await ddfpt.fill("#v-pages", "https://www.ac-versailles.fr/actualites-pfmp");
await ddfpt.click("#echeances form:has(#v-pages) button:has-text('Enregistrer')");
ok(await visible(ddfpt.getByText("Réglages de la veille enregistrés")), "le lycée choisit les pages de son académie à lire chaque semaine");

/* ------------------- Comparer avec les documents du lycée ------------------- */
const alerte = ddfpt.locator(".panel.agent-ia", { hasText: `Circulaire PFMP de l'académie de Versailles ${essai}` });
await alerte.locator("button:has-text('Comparer avec nos documents')").click();
ok(await visible(ddfpt.getByText(/Cap Veille a trouvé \d+ écart\(s\) avec vos documents/)), "Cap Veille compare le texte avec les documents du lycée");
ok((await ddfpt.locator(".panel.agent-ia", { hasText: `Circulaire PFMP de l'académie de Versailles ${essai}` }).textContent()).includes("Comparaison avec vos documents"), "et montre les écarts");

/* ------------------- Appliquer en un clic : le DDFPT propose, la direction valide ------------------- */
sql(`insert into alertes_veille (titre, source, resume, propositions, changements, publiee_le) values ('Durée maximale des PFMP ${essai}', 'https://www.legifrance.gouv.fr/exemple', 'Exemple de test : la durée hebdomadaire maximale passe à 32 heures pour les élèves en PFMP.', '[]', '[{"libelle": "Durée hebdomadaire maximale portée à 32 heures", "cible": "regles.heuresMax", "valeur": "32"}]', now())`);
await ddfpt.goto(BASE + "/veille");
const ligneChangement = (p) => p.locator(".panel.agent-ia", { hasText: `Durée maximale des PFMP ${essai}` }).locator(".row", { hasText: "Durée hebdomadaire maximale portée à 32 heures" });
let changement = ligneChangement(ddfpt);
ok((await changement.textContent()).includes("aujourd'hui 35, proposé 32"), "le changement montre la valeur actuelle et la valeur proposée");
await changement.locator("button:has-text(\"Proposer d'appliquer\")").click();
ok(await visible(ddfpt.getByText("Changement proposé : la direction le valide")), "le DDFPT propose de l'appliquer");
ok((await ligneChangement(ddfpt).textContent()).includes("en attente de la direction"), "le DDFPT ne peut pas valider lui-même");
const dir = await session("direction");
await dir.goto(BASE + "/veille");
changement = ligneChangement(dir);
await changement.locator("button:has-text('Valider et appliquer')").click();
ok(await visible(dir.getByText("Changement appliqué : Durée hebdomadaire maximale du stage (heures) = 32")), "la direction valide : le réglage change aussitôt");
await dir.goto(BASE + "/organisation");
ok(await dir.inputValue("input[name=heuresMax]") === "32", "le nouveau réglage figure dans l'organisation du lycée");

await fin();
