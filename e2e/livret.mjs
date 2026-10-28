// Livret de compétences en ligne (lot 3.5) : l'élève note chaque jour ses activités dans son carnet de bord ; à la fin du stage,
// le tuteur évalue les attitudes professionnelles (grille du lycée) et les compétences du diplôme, avec l'élève et le professeur
// quand c'est possible, et signe. Le PDF au modèle du lycée, avec le carnet de bord, est rangé dans le dossier de l'élève.
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
  try { return execFileSync("pdftotext", [f, "-"]).toString().replace(/\s+/g, " "); } catch { return null; }
}
const mail = (p, sujet, a) => p.locator("details.row", { hasText: sujet }).filter({ hasText: a ?? "" }).first().locator("pre").textContent();
/** Choisit un niveau pour chaque attitude et chaque compétence d'un formulaire de livret. */
async function evaluer(form, niveauCompetence = () => "Acquise") {
  const nAtt = await form.locator("select[name^=att_]").count();
  for (let i = 0; i < nAtt; i++) await form.locator(`select[name=att_${i}]`).selectOption({ index: 4 });
  const nComp = await form.locator("select[name^=comp_]").count();
  for (let i = 0; i < nComp; i++) await form.locator(`select[name=comp_${i}]`).selectOption({ label: niveauCompetence(i) });
  return { nAtt, nComp };
}

/* ------------------- Le DDFPT : les compétences de chaque diplôme ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/documents");
await Promise.all([ddfpt.waitForURL(/\/organisation\/documents\/livret/), ddfpt.click("a.row:has-text('Livret de compétences')")]);
const bac = ddfpt.locator("label", { hasText: "Compétences du diplôme : Bac Pro Métiers de la sécurité" }).locator("textarea");
const liste = await bac.inputValue();
ok(liste.includes("Contrôler les accès et filtrer les entrées") && (await ddfpt.inputValue("#mp-niveaux")) === "Non évaluée / Non acquise / En cours d'acquisition / Acquise",
  "le modèle du livret donne les compétences du diplôme et les niveaux d'acquisition");
ok(await ddfpt.locator("label", { hasText: "Compétences du diplôme : CAP Agent de sécurité" }).count() === 1, "une liste de compétences par diplôme du lycée");
await bac.fill(liste + "\nRespecter le cadre légal et la déontologie");
await ddfpt.click("button:has-text('Enregistrer le modèle')");
ok(await visible(ddfpt.getByText("Il s'applique aux livrets remplis à partir de maintenant")), "le DDFPT ajoute une compétence au diplôme");
const apercu = await ddfpt.context().request.get(BASE + await ddfpt.locator("a:has-text('Voir un livret avec ce modèle')").getAttribute("href"));
let pdf = texteDuPdf(await apercu.body(), "livret-apercu");
ok(apercu.headers()["content-type"] === "application/pdf" && (pdf === null || (pdf.includes("Livret de compétences") && pdf.includes("Attitudes professionnelles"))), "l'aperçu montre un livret au modèle du lycée");

/* ------------------- L'élève : son carnet de bord, sur son téléphone ------------------- */
const emma = await session("emma.laurent", { width: 390, height: 844 });
let t = await emma.textContent("#carnet");
ok(t.includes("Mon carnet de bord") && t.includes("Dimanche 25 octobre 2026") && t.includes("Main courante remplie avec mon tuteur"), "l'élève retrouve les activités déjà notées");
ok((await emma.inputValue("#cb-date")) === "2026-10-26", "le jour proposé est aujourd'hui");
await emma.fill("#cb-texte", "Poste d'accueil du salon : orientation du public et contrôle des sacs.");
await emma.click("#carnet button:has-text('Enregistrer')");
ok(await visible(emma.getByText("Activités du 26 octobre 2026 enregistrées.")), "elle note les activités du jour");
await emma.fill("#cb-date", "2026-10-24");
await emma.fill("#cb-texte", "Rondes de surveillance dans les allées du salon, avec un agent confirmé. Main courante tenue seule.");
await emma.click("#carnet button:has-text('Enregistrer')");
ok(await visible(emma.getByText("Activités du 24 octobre 2026 enregistrées.")), "elle complète un jour passé");
await emma.reload();
t = await emma.textContent("#carnet");
ok(t.includes("Poste d'accueil du salon") && t.includes("Main courante tenue seule") && !t.includes("Main courante remplie avec mon tuteur"), "une seule note par jour : la nouvelle remplace l'ancienne");
ok((await emma.evaluate(() => document.documentElement.scrollWidth)) <= 390, "le carnet tient sur un téléphone");
await emma.screenshot({ path: `${OUT}/livret-carnet.png`, fullPage: true });

// La PFMP des terminales se termine plus tôt, le 27 octobre : le livret s'ouvre 2 jours avant la fin (réglage du lycée).
await ddfpt.goto(BASE + "/classes");
await Promise.all([ddfpt.waitForURL(/\/classes\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('Tle MS')")]);
await ddfpt.fill("input[id^='pf-']", "2026-10-27");
await ddfpt.locator(".row", { has: ddfpt.locator("input[id^='pf-']") }).locator("button:has-text('Enregistrer')").click();
ok(await visible(ddfpt.getByText("Période mise à jour.")), "le DDFPT avance la fin de la PFMP des terminales");

/* ------------------- Avec le professeur : le tuteur évalue sur son téléphone, avec l'élève ------------------- */
const leroy = await session("h.leroy");
await leroy.goto(BASE + "/mes-visites");
await Promise.all([leroy.waitForURL(/\/visites\/[0-9a-f-]{36}/), leroy.click("a.row:has-text('LAURENT')")]);
const urlEmma = leroy.url().replace(/#.*/, "");
const liv = leroy.locator("#livret");
ok(await liv.locator("input[name=rempliePar][value=tuteur_eleve_professeur]").isChecked(), "sur le téléphone du professeur : « le tuteur, avec l'élève et le professeur » est proposé");
await liv.locator("summary:has-text('Carnet de bord')").click();
ok((await liv.textContent()).includes("Poste d'accueil du salon"), "le carnet de bord de l'élève aide à l'évaluer");
const { nAtt, nComp } = await evaluer(liv, (i) => (i === 6 ? "En cours d'acquisition" : "Acquise"));
ok(nAtt === 8 && nComp === 7, "les 8 attitudes de la grille du lycée et les 7 compétences du diplôme de la classe");
await liv.locator("textarea[name=bilan]").fill("Emma est fiable et à l'écoute ; elle doit gagner en assurance face au public.");
await liv.locator("input[name=lu]").check();
await dessiner(leroy, "#livret canvas");
await liv.locator("button:has-text('Signer le livret')").click();
ok(await visible(leroy.getByText("Livret signé par le tuteur : il est rangé dans le dossier de l'élève")), "le tuteur signe le livret sur le téléphone du professeur");
t = await leroy.textContent("#livret");
ok(t.includes("par le tuteur, avec l'élève et le professeur (Hugo LEROY)") && t.includes("8 attitudes et 7 compétences évaluées"), "la page de la visite résume le livret");
await leroy.screenshot({ path: `${OUT}/livret-visite.png`, fullPage: true });
const fichier = await leroy.context().request.get(BASE + await leroy.locator("#livret a:has-text('Ouvrir le livret')").getAttribute("href"));
pdf = texteDuPdf(await fichier.body(), "livret-emma");
ok(fichier.headers()["content-type"] === "application/pdf" && (pdf === null || (pdf.includes("LAURENT Emma") && pdf.includes("Respecter le cadre légal")
  && pdf.includes("En cours d'acquisition") && pdf.includes("Poste d'accueil du salon") && pdf.includes("gagner en assurance"))), "le PDF reprend les évaluations, le bilan et le carnet de bord");
await emma.goto(BASE + "/mon-stage");
// Terminale, année du bac : ni l'élève ni sa famille ne consultent le livret (décision d'Anissa).
const lienLivretEmma = await leroy.locator("#livret a:has-text('Ouvrir le livret')").getAttribute("href");
t = await emma.textContent("main");
ok(!t.includes("Rempli en ligne le") && t.includes("Année d'examen : le livret est transmis au lycée") && await emma.locator(`a[href='${lienLivretEmma}']`).count() === 0,
  "en terminale, l'élève ne voit pas son livret");
ok((await emma.request.get(BASE + lienLivretEmma)).status() === 404, "même en ouvrant directement le fichier");

/* ------------------- Avec son lien, sans compte : le livret de Léa ------------------- */
await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
ok(await visible(ddfpt.getByText("relance(s) envoyée(s)")), "les mails du jour partent");
await ddfpt.goto(BASE + "/messages");
t = await mail(ddfpt, "Attestation et livret de compétences de Léa FONTAINE à remplir", `rh@heliance.${D}`);
const lienLea = t.match(/\/deposer\/[\w-]+/)?.[0];
ok(!!lienLea, "le tuteur de Léa reçoit son lien pour l'attestation et le livret");
const entreprise = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
entreprise.on("pageerror", (e) => erreurs.push(`JS entreprise: ${e.message}`));
await entreprise.goto(BASE + lienLea);
const formLivret = entreprise.locator("form", { has: entreprise.locator("button:has-text('Signer le livret')") });
ok((await entreprise.textContent("main")).includes("Livret de compétences, en ligne") && await formLivret.count() === 1, "le lien propose aussi le livret en ligne");
ok((await entreprise.evaluate(() => document.documentElement.scrollWidth)) <= 390, "la page tient sur un téléphone");
await evaluer(formLivret);
await formLivret.locator("input[name=lu]").check();
await formLivret.locator("button:has-text('Signer le livret')").click();
ok(await visible(entreprise.getByText("Livret de compétences signé en ligne : merci.")), "le tuteur signe le livret avec son lien");
ok(await entreprise.locator("button:has-text(\"Signer l'attestation\")").count() === 1, "le lien sert encore pour l'attestation");

// En première, la famille consulte le livret : celui du premier stage de Mehdi, rempli avec le lien de l'entreprise.
await ddfpt.goto(BASE + "/messages");
const lienMehdi = (await mail(ddfpt, "Merci d'avoir accueilli Mehdi RAHMANI")).match(/\/deposer\/[\w-]+/)?.[0];
await entreprise.goto(BASE + lienMehdi);
const formMehdi = entreprise.locator("form", { has: entreprise.locator("button:has-text('Signer le livret')") });
await evaluer(formMehdi);
await formMehdi.locator("input[name=lu]").check();
await formMehdi.locator("button:has-text('Signer le livret')").click();
ok(await visible(entreprise.getByText("Livret de compétences signé en ligne : merci.")), "le livret de Mehdi (première) est signé");
const parent = await session("l.rahmani");
await parent.goto(BASE + "/mon-enfant");
const ligneLivret = parent.locator(".row", { hasText: "Livret de compétences" }).first();
const lienLivretMehdi = await ligneLivret.locator("a:has-text('Ouvrir')").getAttribute("href");
ok((await parent.request.get(BASE + lienLivretMehdi)).status() === 200, "en première, la famille consulte le livret");

/* ------------------- Dans son compte : le livret de Clara ------------------- */
const tuteur = await session("k.ferhat");
await tuteur.goto(BASE + "/stagiaires");
const clara = tuteur.locator(".panel.pad.section", { hasText: "Clara NGUYEN" }).locator("form", { has: tuteur.locator("button:has-text('Signer le livret')") });
ok(await clara.count() === 1 && await clara.locator("input[name=rempliePar][value=tuteur_eleve]").isChecked(), "le tuteur remplit le livret dans son compte, avec l'élève");
await evaluer(clara);
await clara.locator("input[name=lu]").check();
await clara.locator("button:has-text('Signer le livret')").click();
ok(await visible(tuteur.getByText("Livret de Clara NGUYEN signé et transmis au lycée")), "le tuteur signe le livret de Clara");
await ddfpt.goto(BASE + "/eleves");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('NGUYEN')")]);
t = await ddfpt.locator(".card", { hasText: "Livret de compétences" }).first().textContent();
ok(t.includes("Reçu et validé") && t.includes("Rempli en ligne le"), "le livret est rangé, validé, dans le dossier de l'élève");

/* ------------------- Accès ------------------- */
const garnier = await session("m.garnier");
await garnier.goto(urlEmma);
ok(await garnier.locator("#livret form").count() === 0, "un professeur qui ne suit pas l'élève ne remplit pas son livret");

await fin();
