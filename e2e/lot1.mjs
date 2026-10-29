// Lot 1 : vie scolaire, rattrapages, absences en stage, heures de face à face et choix des visites par les professeurs.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { writeFileSync } from "node:fs";
import { BASE, D, OUT, ok, visible, session, fin, browser, heure } from "./outils.mjs";

const pdf = `${OUT}/certificat.pdf`;
writeFileSync(pdf, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

/* ------------------------------ Vie scolaire ------------------------------ */
const vs = await session("vie.scolaire");
ok(vs.url().includes("/vie-scolaire"), "la vie scolaire arrive sur son espace");
let t = await vs.textContent("main");
ok(t.includes("Rattrapages en cours et à venir") && t.includes("RAHMANI") && t.includes("Police municipale"), "elle voit le rattrapage de Mehdi et son lieu de stage");
ok(t.includes("En stage le lundi 26 octobre 2026") && t.includes("CISSÉ") && t.includes("LAURENT"), "elle voit les élèves en stage ce jour");
ok(t.includes("repos ce jour"), "elle voit qu'un élève est en repos ce jour-là");
ok(t.includes("Non justifiée") && t.includes("Ne s'est pas présentée") === false, "elle voit les absences non justifiées");
const nav = await vs.locator("nav.tabs").textContent();
ok(nav.includes("Vie scolaire") && !nav.includes("Élèves") && !nav.includes("Documents"), "son menu se limite à la vie scolaire");
await vs.screenshot({ path: `${OUT}/l1-vie-scolaire.png`, fullPage: true });
await vs.goto(BASE + "/vie-scolaire?jour=2026-10-14");
t = await vs.textContent("main");
ok((await vs.locator("a.row", { hasText: "Absent, non justifié" }).filter({ hasText: "RAHMANI" }).count()) === 1, "en choisissant un autre jour, elle voit qui était absent");
await vs.goto(BASE + "/vie-scolaire");
await Promise.all([vs.waitForURL(/\/vie-scolaire\/eleves\/[0-9a-f-]{36}/), vs.locator("a.row", { hasText: "RAHMANI" }).first().click()]);
t = await vs.textContent("main");
ok(t.includes("Rattrapage PFMP 1") && t.includes("absence pour maladie") && t.includes("Leïla RAHMANI"), "la fiche montre les périodes, le motif et les responsables");
await vs.fill("#note-texte", "La mère a appelé : Mehdi sera au lycée le 2 novembre.");
await vs.click("button:has-text('Ajouter la note')");
ok(await visible(vs.getByText("Note enregistrée")), "la vie scolaire ajoute une note");
const ficheVs = vs.url();
await vs.goto(BASE + "/eleves");
ok(!vs.url().includes("/eleves"), "elle n'accède pas à la gestion des élèves");

/* ----------------------- Parent : justifier l'absence ----------------------- */
const mere = await session("l.rahmani");
ok(mere.url().includes("/mon-enfant"), "le parent arrive sur le suivi de son enfant");
t = await mere.textContent("main");
ok(t.includes("Présence en stage") && t.includes("Non justifiée"), "le parent voit l'absence à justifier");
await mere.locator("summary:has-text('Justifier cette absence')").first().click();
const formJ = mere.locator("form", { has: mere.locator("button:has-text('Enregistrer la justification')") }).first();
await formJ.locator("select[name=motif]").selectOption("Maladie");
await formJ.locator("input[name=justification]").fill("certificat du médecin traitant");
await formJ.locator("input[name=fichier]").setInputFiles(pdf);
await formJ.locator("button:has-text('Enregistrer la justification')").click();
ok(await visible(mere.getByText("Absence justifiée")), "le parent justifie l'absence avec un certificat");
t = await mere.textContent("main");
ok(t.includes("Voir le justificatif") && t.includes("Motif : Maladie"), "le motif et le justificatif s'affichent");
await mere.screenshot({ path: `${OUT}/l1-parent.png`, fullPage: true });
const lienJustif = await mere.locator("a:has-text('Voir le justificatif')").first().getAttribute("href");

// La vie scolaire ouvre le justificatif, mais pas une convention
let r = await vs.request.get(BASE + lienJustif);
ok(r.status() === 200, "la vie scolaire ouvre le justificatif d'absence");
const dir = await session("direction");
await dir.goto(BASE + "/eleves?q=rahmani");
await Promise.all([dir.waitForURL(/\/eleves\/[0-9a-f-]{36}/), dir.click("a.row:has-text('RAHMANI')")]);
const lienConvention = await dir.locator("#dossier .row", { hasText: "Convention signée" }).locator("a:has-text('Ouvrir')").first().getAttribute("href");
r = await vs.request.get(BASE + lienConvention);
ok(r.status() === 404, "la vie scolaire n'ouvre pas les autres documents de l'élève");
const idStage = (await dir.locator("a:has-text('Voir la convention à imprimer')").first().getAttribute("href")).split("/").pop();
r = await vs.request.get(`${BASE}/conventions/${idStage}`);
ok(r.status() === 404, "ni la convention de stage");
const tuteur = await session("k.ferhat");
r = await tuteur.request.get(BASE + lienJustif);
ok(r.status() === 404, "l'entreprise n'ouvre jamais un justificatif d'absence");

/* ----------------------- Tuteur : signaler une absence ----------------------- */
const clara = tuteur.locator(".panel.pad.section", { hasText: "NGUYEN" }).first();
await clara.locator("summary:has-text('Signaler une absence')").click();
await clara.locator("input[name=debut]").fill("2026-10-17");
await clara.locator("button:has-text(\"Signaler l'absence\")").click();
ok(await visible(tuteur.getByText("Aucun jour de stage n'est prévu")), "refuse une absence un jour de repos");
await clara.locator("input[name=debut]").fill("2026-10-15");
await clara.locator("input[name=commentaire]").fill("Absente sans prévenir");
await clara.locator("button:has-text(\"Signaler l'absence\")").click();
ok(await visible(tuteur.getByText("Absence enregistrée (1 jour de stage)")), "le tuteur signale une absence");
await tuteur.reload();
t = await tuteur.locator(".panel.pad.section", { hasText: "NGUYEN" }).first().textContent();
ok(t.includes("14 jours effectués sur 15"), "les jours effectués tiennent compte de l'absence");
await tuteur.screenshot({ path: `${OUT}/l1-tuteur.png`, fullPage: true });

/* ------------------ Référente de 1re : rattrapage de Sarah ------------------ */
const benali = await session("s.benali");
await benali.goto(BASE + "/eleves");
await Promise.all([benali.waitForURL(/\/eleves\/[0-9a-f-]{36}/), benali.click("a.row:has-text('RAHMANI')")]);
t = await benali.textContent("main");
ok(t.includes("Rattrapages") && t.includes("Rattrapage PFMP 1") && t.includes("Mehdi sera au lycée le 2 novembre"), "la référente voit le rattrapage et la note de la vie scolaire");
ok(t.includes("10 jours effectués sur 15 prévus") && t.includes("1 jour effectué sur 5 prévus"), "la présence couvre la PFMP 1 et le rattrapage");
await benali.goto(BASE + "/eleves");
await Promise.all([benali.waitForURL(/\/eleves\/[0-9a-f-]{36}/), benali.click("a.row:has-text('KONÉ')")]);
await benali.click("summary:has-text('Programmer un rattrapage')");
await benali.selectOption("#ra-periode", { index: 1 });
await benali.fill("#ra-motif", "stage interrompu par l'entreprise");
await benali.fill("#ra-debut", "2026-10-20");
await benali.fill("#ra-fin", "2026-10-22");
await benali.click("button:has-text('Programmer le rattrapage')");
ok(await visible(benali.getByText("Ces dates chevauchent")), "refuse un rattrapage qui chevauche la période de la classe");
ok((await benali.inputValue("#ra-motif")) === "stage interrompu par l'entreprise", "après une erreur, les champs restent remplis");
await benali.fill("#ra-debut", "2026-11-02");
await benali.fill("#ra-fin", "2026-11-06");
await benali.click("button:has-text('Programmer le rattrapage')");
ok(await visible(benali.getByText("Rattrapage programmé")), "la référente programme un rattrapage");
ok(await visible(benali.locator(".chip", { hasText: "Rattrapage PFMP 1 · 2 nov." })), "le rattrapage devient une période de l'élève");
await benali.selectOption("#s-ent", { label: "Héliance Sécurité incendie (Montrouge)" });
for (let i = 0; i < 5; i++) {
  await heure(benali, `debut_${i}`, "08:00");
  await heure(benali, `fin_${i}`, i === 4 ? "12:00" : "15:00");
  await benali.uncheck(`input[name=repos_${i}]`);
}
await benali.click("button:has-text('Enregistrer le stage')");
ok(await visible(benali.getByText("Stage enregistré")), "enregistre le lieu du rattrapage");
await benali.screenshot({ path: `${OUT}/l1-rattrapage.png`, fullPage: true });
await benali.goto(BASE + "/eleves?statut=rattrapages");
t = await benali.textContent("main");
ok(t.includes("KONÉ") && t.includes("RAHMANI") && !t.includes("BOUZID"), "le filtre « Rattrapages » liste les élèves concernés");

await vs.goto(BASE + "/vie-scolaire");
t = await vs.textContent("main");
ok(t.includes("KONÉ") && t.includes("Héliance") && t.includes("Nouveau"), "la vie scolaire voit le nouveau rattrapage et son lieu");
await vs.goto(ficheVs);

/* ------------------------- Direction : alertes et suivi ------------------------- */
await dir.goto(BASE + "/messages");
t = await dir.textContent("main");
ok(t.includes(`À vie.scolaire@${D}`) && t.includes("Rattrapage de PFMP : Sarah KONÉ"), "la vie scolaire est prévenue du rattrapage par mail");
ok(t.includes("Lieu du rattrapage de Sarah KONÉ"), "puis de son lieu de stage");
ok(t.includes("Absence en stage : Clara NGUYEN") && t.includes("Absence justifiée : Mehdi RAHMANI"), "la vie scolaire et l'équipe sont prévenues des absences");
await dir.goto(BASE + "/");
ok((await dir.textContent("main")).includes("absence(s) en stage non justifiée(s)"), "le tableau de bord signale les absences non justifiées");
await dir.goto(BASE + "/eleves?statut=absences");
t = await dir.textContent("main");
ok(t.includes("LAURENT") && t.includes("NGUYEN") && !t.includes("RAHMANI"), "le filtre « Absences non justifiées » fonctionne");

/* ------------------ Heures de face à face et nombre de visites ------------------ */
await dir.goto(BASE + "/visites");
t = await dir.textContent("main");
ok(t.includes("Nombre de visites par professeur") && !t.includes("Répartir automatiquement"), "en mode « heures », la gestion voit la proposition par professeur");
const tle = dir.locator(".card", { hasText: "Tle MS" }).first();
ok((await tle.locator("input[name^=q_]").count()) === 5, "les cinq professeurs de terminale sont proposés");
ok(await tle.locator("text=À valider").count() === 1, "la proposition de terminale est à valider");
await tle.locator("button:has-text('Valider ces nombres de visites')").click();
ok(await visible(dir.getByText("Nombres de visites validés")), "la gestion valide le nombre de visites");
await dir.screenshot({ path: `${OUT}/l1-repartition.png`, fullPage: true });
await dir.goto(BASE + "/messages");
ok((await dir.textContent("main")).includes("Visites de stage à choisir : Tle MS"), "les professeurs concernés sont prévenus");

await dir.goto(BASE + "/visites/heures");
const champ = dir.locator("input[aria-label='Heures de Karim HADDOU en Tle MS']");
ok((await champ.inputValue()) === "2", "le tableau reprend les heures saisies");
await champ.fill("3,5");
await dir.click("button:has-text('Enregistrer les heures')");
ok(await visible(dir.getByText("Heures enregistrées")), "enregistre les heures saisies à la main");
const csv = `Professeur;Classe;Heures\nMARTIN Paul;CAP AS;2h30\nGARNIER Marie;CAP AS;1\nGARNIER Marie;CAP AS;1,5\nINCONNU Jean;CAP AS;2\n`;
writeFileSync(`${OUT}/heures.csv`, csv);
await dir.setInputFiles("#h-fichier", `${OUT}/heures.csv`);
await dir.click("button:has-text('Importer')");
ok(await visible(dir.getByText("2 services importés")), "importe le fichier de l'emploi du temps");
ok(await visible(dir.getByText("professeur inconnu")), "signale les lignes ignorées");
await dir.reload();
ok((await dir.locator("input[aria-label='Heures de Marie GARNIER en CAP AS']").inputValue()) === "2,5", "additionne les lignes d'un même professeur dans une même classe");

/* ------------------ Professeur : choisir ses lieux de stage ------------------ */
const martin = await session("p.martin");
await martin.goto(BASE + "/mes-visites");
t = await martin.textContent("main");
ok(t.includes("Visites à choisir") && t.includes("Tle MS") && t.includes("0 choisie sur 1"), "le professeur voit le nombre de visites qui lui est confié");
await martin.locator("button[aria-label='Je prends la visite de Adam CISSÉ']").click();
ok(await visible(martin.getByText("Visite ajoutée à vos visites")), "il choisit un lieu de stage");
t = await martin.textContent("main");
ok(t.includes("1 choisie sur 1") && t.includes("Ma visite"), "son compteur se met à jour");
await martin.screenshot({ path: `${OUT}/l1-mes-visites.png`, fullPage: true });
await martin.locator(".row", { hasText: "CISSÉ" }).locator("button:has-text('Rendre')").click();
ok(await visible(martin.getByText("Visite rendue")), "il peut rendre une visite");
const garnier = await session("m.garnier");
t = await garnier.textContent("main");
ok(t.includes("1 choisie sur 1"), "une professeure de général dont la visite est déjà attribuée a fini de choisir");
ok(await garnier.locator(".panel.pad.section", { hasText: "Tle MS" }).locator("button:has-text('Je prends cette visite'):disabled").count() >= 1, "elle ne peut pas dépasser son nombre de visites");

/* ---------------------- Équipe : créer un compte vie scolaire ---------------------- */
await dir.goto(BASE + "/equipe");
await dir.fill("#m-prenom", "Yasmine"); await dir.fill("#m-nom", "Cpe"); await dir.fill("#m-email", `cpe@${D}`);
await dir.uncheck("input[name=roles][value=professeur]");
await dir.check("input[name=roles][value=vie_scolaire]");
await dir.click("button:has-text('Créer le compte')");
ok(await visible(dir.locator(".secret")), "la direction crée un compte vie scolaire");
ok((await dir.textContent("main")).includes("Yasmine CPE") || (await dir.textContent("main")).includes("Yasmine Cpe"), "le compte apparaît dans l'équipe");

await fin();
