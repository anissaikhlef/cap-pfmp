// Entreprises : note de partenariat, soucis signalés, entreprises écartées, message aux entreprises d'accueil,
// mails d'accueil et de remerciement, dépôt de l'attestation par lien personnel, sans compte.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { writeFileSync } from "node:fs";
import { BASE, D, OUT, ok, visible, session, fin, browser, heure } from "./outils.mjs";

const pdf = `${OUT}/attestation-entreprise.pdf`;
writeFileSync(pdf, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const ligne = (p, nom) => p.locator("a.row", { hasText: nom });
const mail = (p, sujet, a) => p.locator("details.row", { hasText: sujet }).filter({ hasText: a ?? "" }).first().locator("pre").textContent();

/* ------------------- Le classement des entreprises ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/entreprises");
let t = await ligne(ddfpt, "Héliance").textContent();
ok(t.includes("partenariat 5 sur 5") && t.includes("Partenaire fiable"), "l'annuaire note chaque entreprise sur 5 et repère les partenaires fiables");
ok(!(await ligne(ddfpt, "Centre de secours").textContent()).includes("sur 5"), "pas de note pour une entreprise qui n'a encore accueilli aucun élève");
ok(!(await ligne(ddfpt, "Garde Ouest").textContent()).includes("Partenaire fiable"), "un souci signalé empêche d'être « partenaire fiable »");
t = await ddfpt.locator("a.row").last().textContent();
ok(t.includes("Vigil'Express") && t.includes("Écartée"), "les entreprises écartées viennent en dernier, signalées");
await ddfpt.screenshot({ path: `${OUT}/ent-annuaire.png`, fullPage: true });
await Promise.all([ddfpt.waitForURL(/f=fiables/), ddfpt.click("a.chip:has-text('Partenaires fiables')")]);
t = await ddfpt.textContent(".panel.rows");
ok(t.includes("Héliance") && !t.includes("Garde Ouest") && !t.includes("Vigil"), "filtre : les partenaires fiables");
await Promise.all([ddfpt.waitForURL(/f=ecartees/), ddfpt.click("a.chip:has-text('Écartées')")]);
t = await ddfpt.textContent(".panel.rows");
ok(t.includes("Vigil'Express") && !t.includes("Atlas"), "filtre : les entreprises écartées");
await Promise.all([ddfpt.waitForURL(/\/entreprises\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('Vigil')")]);
t = await ddfpt.textContent("main");
ok(t.includes("Entreprise écartée") && t.includes("Élève laissé seul en poste de nuit") && t.includes("Sécurité de l'élève"), "sa fiche montre le motif et le souci signalé");

/* ------------------- Un professeur signale un souci ------------------- */
const ines = await session("ines.haddad");
const proposeeAInes = async () => (await ines.locator(".card h3", { hasText: "Évent'Sûr" }).count()) + (await ines.locator("#ca-ent option", { hasText: "Évent'Sûr" }).count());
ok(await proposeeAInes() === 2, "avant : Évent'Sûr est proposée à l'élève (suggestions et candidature)");

const martin = await session("p.martin");
await martin.goto(BASE + "/entreprises");
ok(await martin.locator("a:has-text(\"Écrire aux entreprises d'accueil\")").count() === 0, "un professeur n'écrit pas aux entreprises d'accueil : c'est le DDFPT");
await Promise.all([martin.waitForURL(/\/entreprises\/[0-9a-f-]{36}/), martin.click("a.row:has-text(\"Évent'Sûr\")")]);
const ficheEvent = martin.url();
ok((await martin.textContent("main")).includes("Partenaire fiable"), "avant : Évent'Sûr est un partenaire fiable");
ok(await martin.locator("summary:has-text('Écarter cette entreprise')").count() === 0, "un professeur n'écarte pas une entreprise : c'est le DDFPT ou la direction");
await martin.click("summary:has-text('Signaler un souci')");
await martin.selectOption("#so-cat", "taches");
await martin.selectOption("#so-eleve", { label: "Emma LAURENT" });
await martin.fill("#so-desc", "Emma passe ses journées à ranger le dépôt, sans poste de surveillance, depuis le 19 octobre.");
await martin.click("button:has-text('Enregistrer le souci')");
ok(await visible(martin.getByText("Souci enregistré. Le DDFPT et la direction sont prévenus.")), "un professeur signale un souci avec une entreprise");
await martin.reload();
t = await martin.textContent("main");
ok(!t.includes("Partenaire fiable") && t.includes("1 souci signalé") && t.includes("Tâches sans rapport avec la formation · Emma LAURENT"), "le souci compte dans la note : elle n'est plus partenaire fiable");
await martin.goto(BASE + "/entreprises/message");
ok(!martin.url().includes("/message"), "la page du message groupé lui est fermée");

/* ------------------- Le DDFPT écarte l'entreprise, puis lève l'écartement ------------------- */
await ddfpt.goto(BASE + "/messages");
ok((await mail(ddfpt, "Souci signalé avec Évent'Sûr", `ddfpt@${D}`)).includes("ranger le dépôt"), "le DDFPT est prévenu par mail");
await ddfpt.goto(ficheEvent);
await ddfpt.click("summary:has-text('Écarter cette entreprise')");
await ddfpt.fill("#ec-motif", "Élève employée à des tâches sans rapport avec la formation (octobre 2026)");
await ddfpt.click("button:has-text(\"Écarter l'entreprise\")");
ok(await visible(ddfpt.getByText("Évent'Sûr est écartée")), "le DDFPT écarte l'entreprise");
t = await ddfpt.textContent("main");
ok(t.includes("Entreprise écartée") && t.includes("par Julien ROUSSEL") && t.includes("sans rapport avec la formation (octobre 2026)"), "la fiche dit qui l'a écartée, quand et pourquoi");
await ddfpt.screenshot({ path: `${OUT}/ent-ecartee.png`, fullPage: true });

await ines.reload();
t = await ines.textContent("main");
ok(await proposeeAInes() === 0 && !t.includes("écartée"), "elle n'est plus proposée à l'élève, qui n'en sait rien de plus");
await ines.goto(BASE + "/entreprises");
ok(!ines.url().includes("/entreprises"), "les élèves et les familles n'ont pas accès à l'annuaire ni aux notes");

await martin.goto(BASE + "/eleves?q=haddad");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('HADDAD')")]);
const option = martin.locator("#s-ent option", { hasText: "Évent'Sûr" });
ok((await option.textContent()).includes("écartée") && await option.evaluate((o) => o.disabled), "on ne peut plus y enregistrer de stage");
// Même en forçant le formulaire, le serveur refuse
await martin.evaluate(() => { for (const o of document.querySelectorAll("#s-ent option")) o.disabled = false; });
await martin.selectOption("#s-ent", { label: "Évent'Sûr (Paris 15e) · écartée" });
for (let i = 0; i < 5; i++) {
  await heure(martin, `debut_${i}`, "08:00");
  await heure(martin, `fin_${i}`, i === 4 ? "12:00" : "15:00");
  await martin.uncheck(`input[name=repos_${i}]`);
}
await martin.click("button:has-text('Enregistrer le stage')");
ok(await visible(martin.getByText("Évent'Sûr a été écartée par le lycée : choisissez une autre entreprise.")), "même en forçant le formulaire, le stage est refusé");

await ddfpt.goto(BASE + "/campagne");
ok(await ddfpt.locator("label.row", { hasText: "Évent'Sûr" }).count() === 0 && await ddfpt.locator("label.row", { hasText: "Atlas Sûreté" }).count() === 1, "elle ne reçoit plus la campagne de rentrée");

await ddfpt.goto(ficheEvent);
await ddfpt.click("button:has-text(\"Lever l'écartement\")");
ok(await visible(ddfpt.getByText("Évent'Sûr est de nouveau proposée aux élèves.")), "le DDFPT lève l'écartement");
await ines.goto(BASE + "/mon-stage");
ok(await proposeeAInes() === 2, "l'entreprise est de nouveau proposée à l'élève");

/* ------------------- Message à toutes les entreprises d'accueil d'une période ------------------- */
await ddfpt.goto(BASE + "/entreprises");
await Promise.all([ddfpt.waitForURL(/\/entreprises\/message/), ddfpt.click("a:has-text(\"Écrire aux entreprises d'accueil\")")]);
await Promise.all([ddfpt.waitForURL(/periode=/), ddfpt.click("a.chip:has-text('Tle MS')")]);
t = await ddfpt.textContent("main");
ok(t.includes("4 entreprise(s)") && t.includes("Héliance") && t.includes("Évent'Sûr") && t.includes("Garde Ouest"), "le DDFPT voit les entreprises qui accueillent les terminales");
await ddfpt.fill("#me-message", "Madame, Monsieur,\n\nMerci d'accueillir nos élèves de terminale chez {entreprise}. Le professeur référent passera vous voir pendant le stage.\n\nCordialement,\nJulien ROUSSEL");
await ddfpt.click("button:has-text('Envoyer le message')");
ok(await visible(ddfpt.getByText("Message envoyé à 4 entreprise(s)")), "un seul envoi pour toutes les entreprises d'accueil de la période");
await ddfpt.goto(BASE + "/messages");
t = await mail(ddfpt, "Stage des élèves de Tle MS", `rh@heliance.${D}`);
ok(t.includes("chez Héliance Sécurité incendie") && t.includes("Élève accueilli : Léa FONTAINE (Tle MS)"), "chaque entreprise reçoit son nom et la liste de ses élèves");

/* ------------------- Mails d'accueil et de remerciement ------------------- */
// Le DDFPT avance la PFMP des 2nde au jeudi 29 octobre : les tuteurs reçoivent le mail d'accueil 3 jours avant, donc aujourd'hui.
await ddfpt.goto(BASE + "/classes");
await Promise.all([ddfpt.waitForURL(/\/classes\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('2nde MS')")]);
await ddfpt.fill("input[id^='pd-']", "2026-10-29");
await ddfpt.locator(".row", { has: ddfpt.locator("input[id^='pd-']") }).locator("button:has-text('Enregistrer')").click();
ok(await visible(ddfpt.getByText("Période mise à jour.")), "le DDFPT avance la PFMP des 2nde");
await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
ok(await visible(ddfpt.getByText("relance(s) envoyée(s)")), "les mails du jour partent");
await ddfpt.goto(BASE + "/messages");
t = await mail(ddfpt, "Accueil de Lucas MOREAU en stage à partir du 29 octobre 2026", `k.ferhat@${D}`);
ok(t.includes("Horaires prévus") && t.includes("Son professeur référent") && t.includes("jusqu'au 11 décembre 2026"), "le tuteur reçoit le mail d'accueil 3 jours avant : dates, horaires, professeur référent");
t = await mail(ddfpt, "Merci d'avoir accueilli Sarah KONÉ");
ok(t.includes("l'attestation de stage, complétée et signée") && !t.includes("livret") && t.includes("/deposer/"), "le stage des 1re fini, l'entreprise est remerciée et reçoit un lien pour déposer le document manquant");
const lienDepot = t.match(/\/deposer\/[\w-]+/)?.[0];
ok(!(await mail(ddfpt, "Merci d'avoir accueilli Yanis BOUZID")).includes("/deposer/"), "rien à déposer quand tout est déjà reçu : seulement les remerciements");

/* ------------------- L'entreprise dépose l'attestation avec son lien, sans compte ------------------- */
const entreprise = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await entreprise.goto(BASE + lienDepot);
t = await entreprise.textContent("main");
ok(t.includes("Sarah KONÉ") && t.includes("Hôpital Saint-Lucien") && await entreprise.locator("#dl-attestation").count() === 1 && await entreprise.locator("#dl-livret").count() === 0, "l'entreprise ouvre son lien sans compte : seul le document manquant est demandé");
ok((await entreprise.evaluate(() => document.documentElement.scrollWidth)) <= 390, "la page tient sur un téléphone");
await entreprise.setInputFiles("#dl-attestation", pdf);
await entreprise.click("button:has-text('Envoyer les documents')");
ok(await visible(entreprise.getByText("Merci, les documents sont transmis")), "l'entreprise dépose l'attestation");
await entreprise.screenshot({ path: `${OUT}/ent-depot.png`, fullPage: true });
await entreprise.goto(BASE + lienDepot);
ok(await entreprise.locator("#dl-attestation").count() === 0, "le lien ne sert qu'une fois");

await ddfpt.goto(BASE + "/documents");
const depot = ddfpt.locator(".row", { hasText: "Sarah KONÉ" }).filter({ hasText: "Attestation de stage" });
ok((await depot.textContent()).includes("par l'entreprise, avec son lien personnel"), "l'attestation arrive dans les documents à vérifier du lycée");
await depot.locator("summary:has-text('Refuser')").click();
await depot.locator("input[name=motif]").fill("Il manque la signature du tuteur");
await depot.locator("button:has-text('Confirmer le refus')").click();
ok(await visible(ddfpt.getByText("Document refusé")), "le DDFPT refuse le document");
await ddfpt.goto(BASE + "/messages");
t = await mail(ddfpt, "Document à déposer de nouveau : stage de Sarah KONÉ", `securite@st-lucien.${D}`);
const nouveauLien = t.match(/\/deposer\/[\w-]+/)?.[0];
ok(t.includes("Il manque la signature du tuteur") && !!nouveauLien && nouveauLien !== lienDepot, "l'entreprise reçoit le motif et un nouveau lien");
await entreprise.goto(BASE + nouveauLien);
ok(await entreprise.locator("#dl-attestation").count() === 1, "avec ce lien, elle dépose une nouvelle version");

await fin();
