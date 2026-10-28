// Pôles, formations et spécialités (décisions d'Anissa) : plusieurs pôles par lycée ; dans une même classe, une spécialité peut
// partir en PFMP à d'autres dates ; qui visite quoi selon l'organisation du lycée ; le professeur prend sa visite, indique sur
// place ou à distance, et voit aussitôt les coordonnées de l'entreprise.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { BASE, ok, visible, session, fin } from "./outils.mjs";

/* ------------------- Pôles et formations ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/formations");
let t = await ddfpt.textContent("main");
ok(["Sécurité", "Automobile", "Maintenance industrielle", "Informatique, réseaux et électronique"].every((p) => t.includes(p)), "le lycée a plusieurs pôles");
ok(t.includes("Bac Pro Cybersécurité, informatique et réseaux, électronique (CIEL)") && t.includes("CAP Maintenance des véhicules, option véhicules légers"), "chaque pôle a ses formations en voie scolaire");
ok(t.includes("Sûreté / gardiennage") && t.includes("Classes : 1re MS, 2nde MS, Tle MS"), "les spécialités sont rattachées à leur formation");
await ddfpt.fill("#pole-libelle", "Hôtellerie-restauration");
await ddfpt.click("button:has-text('Ajouter le pôle')");
ok(await visible(ddfpt.getByText("Pôle « Hôtellerie-restauration » ajouté.")), "le DDFPT ajoute un pôle");
await ddfpt.reload();
await ddfpt.selectOption("#f-pole", { label: "Hôtellerie-restauration" });
await ddfpt.fill("#f-libelle", "CAP Cuisine");
await ddfpt.click("button:has-text('Ajouter la formation')");
ok(await visible(ddfpt.getByText("Formation « CAP Cuisine » ajoutée au pôle Hôtellerie-restauration.")), "puis une formation");
await ddfpt.reload();
const cuisine = ddfpt.locator(".row", { hasText: "CAP Cuisine" });
await cuisine.locator("button:has-text('Retirer')").click();
ok(await visible(ddfpt.getByText("Formation « CAP Cuisine » retirée.")), "une formation sans classe se retire");

/* ------------------- Des dates de PFMP pour une seule spécialité ------------------- */
await ddfpt.goto(BASE + "/classes");
await Promise.all([ddfpt.waitForURL(/\/classes\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('Tle MS')")]);
await ddfpt.fill("#np-l", "PFMP 2");
await ddfpt.fill("#np-d", "2027-01-11");
await ddfpt.fill("#np-f", "2027-02-05");
await ddfpt.selectOption("#np-s", { label: "Spécialité Sécurité incendie" });
await ddfpt.click("button:has-text('Ajouter la période')");
ok(await visible(ddfpt.getByText("Période ajoutée.")), "le DDFPT fixe des dates pour la seule spécialité sécurité incendie");
await ddfpt.reload();
ok((await ddfpt.textContent("main")).includes("Spécialité Sécurité incendie"), "la période porte le nom de la spécialité");
await ddfpt.goto(BASE + "/calendrier");
ok((await ddfpt.textContent("main")).includes("PFMP 2 · spécialité Sécurité incendie"), "le calendrier montre les dates de chaque spécialité");
await ddfpt.goto(BASE + "/eleves?q=fontaine");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('FONTAINE')")]);
ok((await ddfpt.textContent("[aria-label='Périodes']")).includes("PFMP 2"), "une élève de la spécialité suit ces dates");
await ddfpt.goto(BASE + "/eleves?q=laurent");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('LAURENT')")]);
ok(!(await ddfpt.textContent("main")).includes("PFMP 2"), "une élève d'une autre spécialité ne les suit pas");

/* ------------------- Qui visite quoi, selon le lycée ------------------- */
await ddfpt.goto(BASE + "/organisation");
await ddfpt.selectOption("#quiPremiere", "pro");
await ddfpt.selectOption("#quiDerniere", "general");
await ddfpt.selectOption("#quiAutres", "tous");
await ddfpt.selectOption("#quiExamen", "pro");
await ddfpt.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(ddfpt.getByText("Organisation enregistrée")), "le lycée règle qui fait quelles visites");
await ddfpt.goto(BASE + "/visites");
t = await ddfpt.textContent("main");
ok(t.includes("Cap Admin propose le nombre de visites"), "Cap Admin propose le nombre de visites de chaque professeur");
const tle = ddfpt.locator(".card", { hasText: "Tle MS" }).first();
ok(await tle.locator("input[name^=q_]").count() === 3 && !(await tle.textContent()).includes("GARNIER"), "classe d'examen : seuls les professeurs de l'enseignement professionnel sont proposés");
const options = await ddfpt.locator("select[aria-label='Visiteur de Adam CISSÉ'] option").allTextContents();
ok(!options.some((o) => o.includes("GARNIER")) && options.some((o) => o.includes("MARTIN")), "la gestion ne peut pas confier la visite d'une classe d'examen à un professeur de l'enseignement général");
await tle.locator("button:has-text('Valider ces nombres de visites')").click();
await visible(ddfpt.getByText("Nombres de visites validés"));

/* ------------------- Le professeur prend sa visite ------------------- */
const martin = await session("p.martin");
await martin.goto(BASE + "/mes-visites");
const ligne = martin.locator(".row", { hasText: "Adam CISSÉ" }).filter({ has: martin.locator("button[aria-label='Je prends la visite de Adam CISSÉ']") });
await ligne.locator("select[name=forme]").selectOption("distanciel");
await ligne.locator("button[aria-label='Je prends la visite de Adam CISSÉ']").click();
ok(await visible(martin.getByText("les coordonnées de l'entreprise s'affichent ci-dessous")), "premier arrivé, premier servi : il prend la visite");
const mienne = martin.locator(".row", { hasText: "Adam CISSÉ" }).filter({ hasText: "Ma visite" });
t = await mienne.textContent();
ok(t.includes("Lieu de stage :") && t.includes("Tuteur :") && await mienne.locator("a[href^='tel:']").count() === 1, "il voit aussitôt le lieu de stage, le tuteur et son téléphone");
ok(await mienne.locator("select[name=forme]").inputValue() === "distanciel", "il a indiqué une visite à distance");
await mienne.locator("select[name=forme]").selectOption("presentiel");
await mienne.locator("button:has-text('Changer')").click();
ok(await visible(martin.getByText("Visite de Adam CISSÉ : sur place.")), "il la passe sur place, selon les disponibilités du tuteur");
const visite = martin.locator(".row", { hasText: "Adam CISSÉ" }).filter({ has: martin.locator("a:has-text('Détails')") });
await Promise.all([martin.waitForURL(/\/visites\/[0-9a-f-]{36}/), visite.locator("a:has-text('Détails')").click()]);
ok(await martin.locator("input[name=mode][value=presentiel]").isChecked(), "la proposition de rendez-vous reprend sa forme prévue");

await fin();
