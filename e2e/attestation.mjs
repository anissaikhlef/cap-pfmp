// Attestation de stage en ligne (lot 3.4) : le tuteur la remplit avec l'élève et le professeur quand c'est possible
// (sur le téléphone du professeur), avec l'élève, ou seul (dans son compte ou avec son lien personnel) ; il signe, et le PDF
// au modèle du lycée est rangé dans le dossier de l'élève, validé d'office ou à vérifier si les jours diffèrent de Cap PFMP.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { BASE, D, OUT, ok, visible, session, fin, browser, erreurs } from "./outils.mjs";

/** Dessine une signature dans le cadre désigné, à la souris. */
async function dessiner(p, cadre) {
  const c = p.locator(cadre).first();
  await c.scrollIntoViewIfNeeded();
  const b = await c.boundingBox();
  await p.mouse.move(b.x + 20, b.y + 90);
  await p.mouse.down();
  await p.mouse.move(b.x + 90, b.y + 30, { steps: 8 });
  await p.mouse.move(b.x + 160, b.y + 110, { steps: 8 });
  await p.mouse.up();
}
/** Le texte d'un PDF (avec pdftotext), ou null si l'outil n'est pas installé. */
function texteDuPdf(octets, nom) {
  const f = `${OUT}/${nom}.pdf`;
  writeFileSync(f, octets);
  try { return execFileSync("pdftotext", ["-layout", f, "-"]).toString(); } catch { return null; }
}
const mail = (p, sujet, a) => p.locator("details.row", { hasText: sujet }).filter({ hasText: a ?? "" }).first().locator("pre").textContent();

/* ------------------- Le DDFPT adapte le modèle de l'attestation ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/documents");
await Promise.all([ddfpt.waitForURL(/\/organisation\/documents\/attestation/), ddfpt.click("a.row:has-text('Attestation de stage')")]);
await ddfpt.fill("#mp-titre", "Attestation de PFMP");
await ddfpt.fill("#mp-rt-0", "Compétences visées");
await ddfpt.fill("#mp-rx-0", "Les compétences du référentiel du diplôme travaillées pendant la période.");
await ddfpt.click("button:has-text('Enregistrer le modèle')");
ok(await visible(ddfpt.getByText("Il s'applique aux attestations remplies à partir de maintenant")), "le DDFPT adapte le modèle de l'attestation (titre, rubrique)");
const apercu = await ddfpt.context().request.get(BASE + await ddfpt.locator("a:has-text('Voir une attestation avec ce modèle')").getAttribute("href"));
let pdf = texteDuPdf(await apercu.body(), "attestation-apercu");
ok(apercu.headers()["content-type"] === "application/pdf" && (pdf === null || (pdf.includes("Attestation de PFMP") && pdf.includes("Compétences visées"))), "l'aperçu montre une attestation au modèle du lycée");

// La PFMP des terminales se termine plus tôt, le 27 octobre : l'attestation s'ouvre 2 jours avant la fin (réglage du lycée).
await ddfpt.goto(BASE + "/classes");
await Promise.all([ddfpt.waitForURL(/\/classes\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('Tle MS')")]);
await ddfpt.fill("input[id^='pf-']", "2026-10-27");
await ddfpt.locator(".row", { has: ddfpt.locator("input[id^='pf-']") }).locator("button:has-text('Enregistrer')").click();
ok(await visible(ddfpt.getByText("Période mise à jour.")), "le DDFPT avance la fin de la PFMP des terminales");

/* ------------------- Avec le professeur : le tuteur remplit sur son téléphone, avec l'élève ------------------- */
const diallo = await session("a.diallo");
await diallo.goto(BASE + "/mes-visites");
await Promise.all([diallo.waitForURL(/\/visites\/[0-9a-f-]{36}/), diallo.click(".row:has-text(\'MANSOURI\') a:has-text(\'Détails\')")]);
const urlRayan = diallo.url().replace(/#.*/, "");
const att = diallo.locator("#attestation");
ok(await att.locator("input[name=rempliePar][value=tuteur_eleve_professeur]").isChecked(), "sur le téléphone du professeur : « le tuteur, avec l'élève et le professeur » est proposé");
const prevus = await att.locator("input[name=joursEffectues]").inputValue();
ok(Number(prevus) > 0 && (await att.textContent()).includes("aucune absence signalée au lycée"), "les jours de stage sont comptés par Cap PFMP");
await att.locator("textarea[name=activites]").fill("Rondes de surveillance, contrôle d'accès des visiteurs, tenue de la main courante.");
await att.locator("textarea[name=appreciation]").fill("Élève ponctuel et motivé.");
await att.locator("input[name=lu]").check();
await att.locator("button:has-text(\"Signer l'attestation\")").click();
ok(await visible(diallo.getByText("Dessinez votre signature dans le cadre")), "la signature dessinée du tuteur est demandée");
await dessiner(diallo, "#attestation canvas");
await att.locator("button:has-text(\"Signer l'attestation\")").click();
ok(await visible(diallo.getByText("Attestation signée par le tuteur : elle est rangée dans le dossier de l'élève")), "le tuteur signe sur le téléphone du professeur");
let t = await diallo.textContent("#attestation");
ok(t.includes("par le tuteur, avec l'élève et le professeur (Awa DIALLO)") && t.includes(`${prevus} jours effectués`), "la page de la visite résume l'attestation");
await diallo.screenshot({ path: `${OUT}/attestation-visite.png`, fullPage: true });
const lienPdf = await diallo.locator("#attestation a:has-text(\"Ouvrir l'attestation\")").getAttribute("href");
const fichier = await diallo.context().request.get(BASE + lienPdf);
pdf = texteDuPdf(await fichier.body(), "attestation-rayan");
ok(fichier.headers()["content-type"] === "application/pdf" && (pdf === null || (pdf.includes("Attestation de PFMP") && pdf.includes("MANSOURI Rayan")
  && pdf.includes("Rondes de surveillance") && pdf.includes("le tuteur, avec l'élève et le professeur (Awa DIALLO)"))), "le PDF reprend le modèle du lycée, l'élève, les activités et qui l'a remplie");

/* ------------------- Le lien envoyé quelques jours avant la fin ------------------- */
await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
ok(await visible(ddfpt.getByText("relance(s) envoyée(s)")), "les mails du jour partent");
await ddfpt.goto(BASE + "/messages");
t = await mail(ddfpt, "Attestation et livret de compétences de Léa FONTAINE à remplir", `rh@heliance.${D}`);
ok(t.includes("se termine le 27 octobre 2026") && t.includes("son attestation de stage et son livret de compétences, avec Léa si possible") && t.includes("/deposer/"),
  "avant la fin, le tuteur reçoit son lien pour remplir l'attestation et le livret avec l'élève");
t = await mail(ddfpt, "Livret de compétences de Rayan MANSOURI à remplir");
ok(!t.includes("attestation") && await ddfpt.locator("details.row", { hasText: "Attestation de stage de Rayan MANSOURI" }).count() === 0, "une attestation déjà remplie n'est plus demandée : seulement le livret");
t = await mail(ddfpt, "Merci d'avoir accueilli Sarah KONÉ");
ok(t.includes("Vous pouvez la remplir et la signer en ligne, ou la déposer"), "les remerciements de fin de stage proposent l'attestation en ligne");
const lienSarah = t.match(/\/deposer\/[\w-]+/)?.[0];

/* ------------------- Avec son lien, sans compte : le tuteur seul ------------------- */
const entreprise = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
entreprise.on("pageerror", (e) => erreurs.push(`JS entreprise: ${e.message}`));
await entreprise.goto(BASE + lienSarah);
ok((await entreprise.textContent("main")).includes("Attestation de stage, en ligne") && await entreprise.locator("#dl-attestation").count() === 1, "le lien propose l'attestation en ligne, ou le dépôt du document signé");
ok((await entreprise.evaluate(() => document.documentElement.scrollWidth)) <= 390, "la page tient sur un téléphone");
await entreprise.check("input[name=rempliePar][value=tuteur]");
await entreprise.fill("textarea[name=activites]", "Surveillance des accès du service des urgences, aide aux rondes incendie.");
await entreprise.check("input[name=lu]");
await entreprise.screenshot({ path: `${OUT}/attestation-lien.png`, fullPage: true });
await entreprise.click("button:has-text(\"Signer l'attestation\")");
ok(await visible(entreprise.getByText("Merci, les documents sont transmis")), "le tuteur signe seul, en signature simple : le dossier de fin de stage est complet");

/* ------------------- Dans son compte : jours différents, à vérifier ------------------- */
await ddfpt.goto(BASE + "/documents");
const deposee = ddfpt.locator(".row", { hasText: "Clara NGUYEN" }).filter({ hasText: "Attestation de stage" });
await deposee.locator("summary:has-text('Refuser')").click();
await deposee.locator("input[name=motif]").fill("Le cachet de l'entreprise manque");
await deposee.locator("button:has-text('Confirmer le refus')").click();
ok(await visible(ddfpt.getByText("Document refusé")), "le DDFPT refuse l'attestation déposée pour Clara");
const tuteur = await session("k.ferhat");
await tuteur.goto(BASE + "/stagiaires");
const carteClara = tuteur.locator(".panel.pad.section", { hasText: "Clara NGUYEN" });
ok(await carteClara.locator("summary:has-text(\"Remplir l'attestation en ligne\")").count() === 1, "le tuteur peut la remplir en ligne dans son compte");
const clara = carteClara.locator("form", { has: tuteur.locator("button:has-text(\"Signer l'attestation\")") });
ok(await tuteur.locator(".panel.pad.section", { hasText: "Lucas MOREAU" }).locator("summary:has-text(\"Remplir l'attestation en ligne\")").count() === 0, "pas avant les derniers jours du stage");
ok(await clara.locator("input[name=rempliePar][value=tuteur_eleve]").isChecked(), "dans son compte, « avec l'élève » est proposé");
const jours = Number(await clara.locator("input[name=joursEffectues]").inputValue());
await clara.locator("input[name=joursEffectues]").fill(String(jours - 1));
await clara.locator("input[name=joursAbsence]").fill("1");
await clara.locator("textarea[name=activites]").fill("Contrôle d'accès et rondes sur le site client.");
await clara.locator("input[name=lu]").check();
await clara.locator("button:has-text(\"Signer l'attestation\")").click();
ok(await visible(tuteur.getByText("le lycée vérifie les jours indiqués")), "un jour d'absence non signalé au lycée : l'attestation est à vérifier");
await ddfpt.goto(BASE + "/documents");
t = await ddfpt.locator(".row", { hasText: "Clara NGUYEN" }).filter({ hasText: "Attestation de stage" }).textContent();
ok(t.includes("remplie en ligne par Karim FERHAT") && t.includes(`Jours déclarés par l'entreprise : ${jours - 1} effectué(s), 1 d'absence`) && t.includes(`d'après Cap PFMP : ${jours} effectué(s), 0 d'absence`),
  "le DDFPT voit l'écart entre les jours déclarés et ceux de Cap PFMP");
await ddfpt.screenshot({ path: `${OUT}/attestation-a-verifier.png`, fullPage: true });

/* ------------------- Accès ------------------- */
const martin = await session("p.martin");
await martin.goto(urlRayan);
ok(await martin.locator("#attestation form").count() === 0, "un professeur qui ne suit pas l'élève ne remplit pas son attestation");

await fin();
