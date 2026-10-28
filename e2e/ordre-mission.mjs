// Ordre de mission et compte rendu de visite sur le modèle du lycée : questions de l'appel au tuteur la première semaine,
// grille des attitudes professionnelles, signature avant la visite par la gestion des PFMP ou la direction,
// signature de l'entreprise sur le téléphone du professeur (ou photo du document tamponné), document imprimable.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { writeFileSync } from "node:fs";
import { BASE, OUT, ok, visible, session, fin } from "./outils.mjs";

/** Dessine une signature dans le cadre, à la souris. */
async function dessiner(p) {
  await p.locator("canvas").first().scrollIntoViewIfNeeded();
  const b = await p.locator("canvas").first().boundingBox();
  await p.mouse.move(b.x + 20, b.y + 90);
  await p.mouse.down();
  await p.mouse.move(b.x + 90, b.y + 30, { steps: 8 });
  await p.mouse.move(b.x + 160, b.y + 110, { steps: 8 });
  await p.mouse.up();
}

/* ------------------- Le DDFPT adapte le modèle de l'ordre de mission ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/documents");
await Promise.all([ddfpt.waitForURL(/\/organisation\/documents\/ordre_mission/), ddfpt.click("a.row:has-text('Ordre de mission')")]);
const questions = await ddfpt.inputValue("#mp-questions");
const grille = await ddfpt.inputValue("#mp-grille");
ok(questions.includes("L'élève est-il présent et ponctuel ?") && grille.includes("Intérêt porté au travail : Exécute sans intérêt"), "le modèle propose les questions de l'appel et la grille des attitudes de Cap PFMP");
await ddfpt.fill("#mp-questions", questions + "\nLe tuteur a-t-il reçu la convention signée ?");
await ddfpt.fill("#mp-grille", grille + "\nPonctualité : Souvent en retard / Parfois en retard / Toujours à l'heure");
await ddfpt.click("button:has-text('Enregistrer le modèle')");
ok(await visible(ddfpt.getByText("Modèle enregistré")), "le DDFPT ajoute une question à l'appel et un critère à la grille");

/* ------------------- Appel au tuteur, première semaine ------------------- */
const garnier = await session("m.garnier");
let t = await garnier.textContent("main");
ok(t.includes("Appels au tuteur à passer") && t.includes("Léa FONTAINE"), "le professeur voit les appels de la première semaine à passer");
await Promise.all([garnier.waitForURL(/\/visites\/[0-9a-f-]{36}/), garnier.locator("a.row", { hasText: "Léa FONTAINE" }).first().click()]);
const urlLea = garnier.url().replace(/#.*$/, "");
const appel = garnier.locator("#appel");
ok(await appel.locator("fieldset").count() === 5 && (await appel.textContent()).includes("Le tuteur a-t-il reçu la convention signée ?"), "l'appel reprend les questions du lycée");
for (let i = 0; i < 5; i++) await appel.locator(`input[name=q_${i}][value=${i === 1 ? "non" : "oui"}]`).check();
await garnier.fill("#ap-com", "Léa trouve sa place doucement ; le tuteur la rassure.");
await garnier.click("button:has-text(\"Enregistrer l'appel\")");
ok(await visible(garnier.getByText("Appel enregistré")), "le professeur note l'appel au tuteur");
await garnier.goto(BASE + "/mes-visites");
ok(!(await garnier.textContent("main")).includes("Appels au tuteur à passer"), "l'appel n'est plus à passer");

/* ------------------- Le DDFPT signe l'ordre de mission avant la visite ------------------- */
await ddfpt.goto(BASE + "/");
ok(await ddfpt.locator("nav a:has-text('À signer')").count() === 1, "la gestion des PFMP signe aussi les ordres de mission (réglage du lycée)");
await ddfpt.goto(BASE + "/a-signer");
await ddfpt.locator(".row", { hasText: "visite de Léa FONTAINE" }).locator("button:has-text('Signer')").click();
ok(await visible(ddfpt.getByText("Ordre de mission signé")), "le DDFPT signe l'ordre de mission");
await garnier.goto(urlLea);
t = await garnier.textContent("#ordre-mission");
ok(t.includes("Signé le") && t.includes("véhicule personnel"), "le professeur voit l'ordre de mission signé et son mode de transport");
ok(await garnier.locator("#cachet").count() === 0, "la signature de l'entreprise se recueille à partir du jour de la visite");

/* ------------------- Pendant la visite : signature de l'entreprise, compte rendu ------------------- */
const diallo = await session("a.diallo");
await diallo.goto(BASE + "/mes-visites");
await Promise.all([diallo.waitForURL(/\/visites\/[0-9a-f-]{36}/), diallo.click(".row:has-text(\'MANSOURI\') a:has-text(\'Détails\')")]);
const urlRayan = diallo.url();
ok((await diallo.textContent("#appel")).includes("Tuteur joint au téléphone"), "l'appel de la première semaine est noté");
ok((await diallo.inputValue("#ca-nom")) === "S. Roux", "le nom du tuteur est proposé pour la signature de l'entreprise");
await dessiner(diallo);
await diallo.click("button:has-text('Enregistrer la signature')");
ok(await visible(diallo.getByText("Signature de S. Roux enregistrée")), "le tuteur signe sur le téléphone du professeur");
writeFileSync(`${OUT}/tampon.png`, await diallo.screenshot({ clip: { x: 0, y: 0, width: 300, height: 120 } }));
await diallo.click("summary:has-text(\"Prendre en photo l'ordre de mission tamponné\")");
await diallo.setInputFiles("#ca-photo", `${OUT}/tampon.png`);
await diallo.click("button:has-text('Enregistrer la photo')");
ok(await visible(diallo.getByText("Photo enregistrée dans le dossier de l'élève")), "le professeur peut aussi photographier l'ordre de mission tamponné");
const att = diallo.locator("[id^=cr-att-]");
ok(await att.count() === 9 && (await diallo.locator("label[for=cr-att-8]").textContent()).startsWith("Ponctualité"), "le compte rendu reprend la grille du lycée");
for (let i = 0; i < 9; i++) await diallo.selectOption(`#cr-att-${i}`, { index: i === 8 ? 3 : 4 });
await diallo.selectOption("#cr-adequation", "en_partie");
await diallo.selectOption("#cr-accueil", "Satisfaisant");
await diallo.fill("#cr-obs", "Rayan est impliqué ; il gagne en assurance au poste de contrôle.");
await diallo.fill("#cr-ent", "Des rondes de nuit à éviter pour un élève de terminale.");
await diallo.click("button:has-text('Enregistrer le compte rendu')");
ok(await visible(diallo.getByText("Compte rendu enregistré dans le dossier de l'élève")), "le professeur rédige le compte rendu");
t = await diallo.textContent("#compte-rendu");
ok(t.includes("Ponctualité") && t.includes("Toujours à l'heure") && t.includes("En partie"), "le compte rendu affiche la grille et l'avis sur l'entreprise");
await diallo.screenshot({ path: `${OUT}/om-visite.png`, fullPage: true });

/* ------------------- Le document imprimable, sur le modèle du lycée ------------------- */
await diallo.goto(BASE + (await diallo.locator("a:has-text(\"Voir l'ordre de mission\")").getAttribute("href")));
t = await diallo.textContent("main");
ok(t.includes("Compte rendu de visite et ordre de mission") && t.includes("Appel du 20 octobre 2026") && t.includes("S. Roux, Chef d'équipe")
  && t.includes("Rayan est impliqué") && t.includes("Des rondes de nuit") && await diallo.locator("img.signature-image").count() === 1,
  "l'ordre de mission imprimable reprend l'appel, la signature de l'entreprise et les commentaires");
const ponctualite = diallo.locator(".grille-attitudes table", { hasText: "Ponctualité" });
ok((await ponctualite.locator("tr", { hasText: "Toujours à l'heure" }).locator("td.croix").textContent()) === "✕", "la grille des attitudes porte une croix sur le niveau retenu");
await diallo.screenshot({ path: `${OUT}/om-document.png`, fullPage: true });

/* ------------------- Qui signe : réglage du lycée ------------------- */
const dir = await session("direction");
await dir.goto(BASE + "/organisation");
await dir.uncheck("input[name=signatairesOrdreMission][value=gestionnaire]");
await dir.uncheck("input[name=signatairesOrdreMission][value=direction]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(dir.getByText("cochez qui le signe")), "il faut au moins un signataire de l'ordre de mission");
await dir.check("input[name=signatairesOrdreMission][value=direction]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(dir.getByText("Organisation enregistrée")), "la direction se réserve la signature des ordres de mission");
await ddfpt.goto(BASE + "/a-signer");
ok(!ddfpt.url().includes("/a-signer") && await ddfpt.locator("nav a:has-text('À signer')").count() === 0, "la gestion des PFMP ne signe plus les ordres de mission");

await fin();
