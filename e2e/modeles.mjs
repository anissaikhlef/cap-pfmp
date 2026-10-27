// Modèles de documents : le modèle Cap PFMP adapté (logo, titre, rubriques), le PDF du lycée rempli à l'identique,
// les champs complétés en signant par la famille et l'entreprise, le modèle figé à la première signature.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { writeFileSync } from "node:fs";
import { constants, inflateSync } from "node:zlib";
import { BASE, D, OUT, ok, visible, session, fin, browser } from "./outils.mjs";

/** Tout le texte d'un PDF, flux décompressés compris (le texte écrit par Cap PFMP y est souvent en hexadécimal). */
function texteDuPdf(b) {
  const s = b.toString("latin1");
  let tout = s;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const debut = m.index + m[0].length;
    const fin = s.indexOf("endstream", debut);
    if (fin < 0) break;
    try { tout += inflateSync(b.subarray(debut, fin), { finishFlush: constants.Z_SYNC_FLUSH }).toString("latin1"); } catch { /* flux non compressé */ }
  }
  return tout.toLowerCase();
}
const contient = (b, texte) => {
  const t = texteDuPdf(b);
  return t.includes(texte.toLowerCase()) || t.includes(Buffer.from(texte, "latin1").toString("hex").toLowerCase());
};
const estPdf = (r) => r.status() === 200 && r.headers()["content-type"] === "application/pdf";

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

/* ------------------- Le DDFPT adapte le modèle Cap PFMP ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation");
await Promise.all([ddfpt.waitForURL(/\/organisation\/documents$/), ddfpt.click("a:has-text('Modèles de documents')")]);
let t = await ddfpt.textContent("main");
ok(t.includes("Convention de stage") && t.includes("Modèle Cap PFMP"), "la convention suit le modèle Cap PFMP tant que le lycée n'a rien changé");
// Un logo : une image PNG prise sur la page elle-même
writeFileSync(`${OUT}/logo.png`, await ddfpt.screenshot({ clip: { x: 0, y: 0, width: 240, height: 70 } }));
await ddfpt.setInputFiles("#logo-fichier", `${OUT}/logo.png`);
await ddfpt.click("button:has-text('Déposer le logo')");
ok(await visible(ddfpt.getByText("Logo enregistré")), "le DDFPT dépose le logo du lycée");
await Promise.all([ddfpt.waitForURL(/\/organisation\/documents\/convention/), ddfpt.click("a.row:has-text('Convention de stage')")]);
const pageModele = ddfpt.url();
await ddfpt.fill("#mp-titre", "Convention de PFMP du lycée de démonstration");
await ddfpt.fill("#mp-rt-0", "Assurances");
await ddfpt.fill("#mp-rx-0", "Le lycée a souscrit une assurance pour ses élèves en stage.");
await ddfpt.click("button:has-text('Enregistrer le modèle')");
ok(await visible(ddfpt.getByText("Modèle enregistré")), "le DDFPT change le titre et ajoute une rubrique");
const exemple = await ddfpt.locator("a:has-text('Voir une convention avec ce modèle')").getAttribute("href");
const apercu = await ddfpt.context().newPage();
await apercu.goto(BASE + exemple);
t = await apercu.textContent("main");
ok(t.includes("Convention de PFMP du lycée de démonstration") && t.includes("4. Assurances") && t.includes("5. Signatures") && await apercu.locator("img.logo-document").count() === 1,
  "la convention reprend le titre, la rubrique ajoutée et le logo");

/* ------------------- Une convention signée garde son modèle ------------------- */
const martin = await session("p.martin");
await martin.goto(BASE + "/eleves?q=moreau");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('MOREAU')")]);
const conventionLucas = await martin.locator("a:has-text('Voir la convention à imprimer')").first().getAttribute("href");
await martin.check("input[name=lu]");
await martin.click("button:has-text('Je signe en tant que professeur référent')");
ok(await visible(martin.getByText("Signature enregistrée (professeur référent)")), "le référent signe la convention de Lucas en dernier");
await ddfpt.goto(pageModele);
await ddfpt.fill("#mp-titre", "Titre changé après la signature");
await ddfpt.click("button:has-text('Enregistrer le modèle')");
await visible(ddfpt.getByText("Modèle enregistré"));
await apercu.goto(BASE + conventionLucas);
t = await apercu.textContent("main");
ok(t.includes("Convention de PFMP du lycée de démonstration") && !t.includes("Titre changé"), "une convention signée garde le modèle avec lequel elle a été signée");
await apercu.goto(BASE + exemple);
ok((await apercu.textContent("main")).includes("Titre changé après la signature"), "les conventions pas encore signées suivent le nouveau modèle");

/* ------------------- Le PDF du lycée, rempli à l'identique ------------------- */
await ddfpt.goto(pageModele);
const lienExemple = await ddfpt.locator("a:has-text('Téléchargez un exemple fictif')").getAttribute("href");
const ex = await ddfpt.context().request.get(BASE + lienExemple);
ok(estPdf(ex), "un PDF d'exemple fictif est proposé pour essayer");
writeFileSync(`${OUT}/convention-lycee.pdf`, await ex.body());
await ddfpt.setInputFiles("#mp-pdf", `${OUT}/convention-lycee.pdf`);
await ddfpt.click("button:has-text('Déposer le PDF')");
ok(await visible(ddfpt.getByText("PDF déposé : 14 champ(s)")), "le DDFPT dépose le PDF de son lycée : Cap PFMP trouve ses champs");
const ligne = (nom) => ddfpt.locator(".champ-pdf").filter({ has: ddfpt.locator(".name").getByText(nom, { exact: true }) });
const choix = (nom) => ligne(nom).locator("select").inputValue();
ok(await choix("NOM et prénom") === "eleve.nomPrenom" && await choix("niveau de classe") === "classe.libelle" && await choix("Élève mineur") === "eleve.mineur"
  && await choix("date début période 1") === "periode.debut" && await choix("Nom prénom signature élève") === "signature.eleve.nom" && await choix("Date signature entreprise") === "signature.entreprise.date",
  "Cap PFMP propose une donnée pour chaque champ d'après son nom");
ok(await choix("Nom de l'assureur") === "entreprise" && await choix("Numéro de portable") === "famille", "ce qu'il ne connaît pas est complété en signant, par l'entreprise ou par la famille");
ok(await choix("Texte_13") === "", "rien n'est proposé pour un nom générique");
const l13 = ligne("Texte_13");
ok(!(await l13.locator("input[name^=fixe_]").isVisible()), "le texte fixe n'apparaît pas tant qu'on ne l'a pas choisi");
await l13.locator("select").selectOption("fixe");
await l13.locator("input[name^=fixe_]").fill("Lycée professionnel de démonstration");
await ligne("Nom de l'assureur").locator("input[name^=q_]").fill("Nom de votre assureur");
await ligne("Numéro de portable").locator("input[name^=q_]").fill("Téléphone portable de l'élève");
await ddfpt.click("button:has-text('Enregistrer les champs')");
ok(await visible(ddfpt.getByText("Champs enregistrés")), "le DDFPT enregistre ce que Cap PFMP écrit dans chaque champ");
await ddfpt.screenshot({ path: `${OUT}/modeles-champs.png`, fullPage: true });
const reperage = await ddfpt.context().request.get(BASE + "/organisation/documents/convention/apercu?reperage=1");
ok(estPdf(reperage) && contient(await reperage.body(), "Texte_13"), "l'aperçu des noms montre chaque champ à sa place");
await ddfpt.check("input[name=mode][value=pdf]");
await ddfpt.click("button:has-text('Enregistrer le choix')");
ok(await visible(ddfpt.getByText("Les nouvelles conventions sont remplies dans le PDF de votre lycée")), "le lycée choisit son propre PDF");

// Aya (2nde) : sa convention s'ouvre remplie dans le PDF du lycée
await martin.goto(BASE + "/eleves?q=benkhelifa");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('BENKHELIFA')")]);
const pdfAya = await martin.locator("a:has-text('Ouvrir la convention (PDF)')").getAttribute("href");
let r = await martin.context().request.get(BASE + pdfAya);
let b = await r.body();
ok(estPdf(r) && contient(b, "BENKHELIFA Aya") && contient(b, "2nde bac pro") && contient(b, "Lycée professionnel de démonstration") && contient(b, "16/11/2026"),
  "la convention est remplie dans le PDF du lycée : élève, classe choisie dans la liste, texte fixe, dates");
r = await martin.context().request.get(BASE + conventionLucas, { maxRedirects: 0 });
ok(r.status() === 200, "celle de Lucas, signée avec le modèle Cap PFMP, le garde");

/* ------------------- L'entreprise complète ses champs en signant, par lien ------------------- */
await martin.click("button:has-text('Envoyer la convention aux signataires')");
await visible(martin.getByText("Convention envoyée"));
await ddfpt.goto(BASE + "/messages");
const corpsRep = await ddfpt.locator("details.row", { hasText: `À police@ville-demo.${D}` }).first().locator("pre").textContent();
const lienRep = corpsRep.match(/\/signer\/[\w-]+/)?.[0];
const rep = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await rep.goto(BASE + lienRep);
t = await rep.textContent("body");
ok(t.includes("utilise son propre modèle de convention") && await rep.locator("a:has-text('Lire la convention (PDF)')").count() === 1, "par son lien, le représentant lit la convention dans le PDF du lycée");
ok(t.includes("À compléter sur la convention") && t.includes("Nom de votre assureur") && !t.includes("Téléphone portable de l'élève"), "il complète seulement les champs de l'entreprise");
ok((await rep.evaluate(() => document.documentElement.scrollWidth)) <= 390, "la page tient sur un téléphone");
r = await rep.context().request.get(BASE + lienRep + "/pdf");
ok(estPdf(r), "le PDF s'ouvre avec le lien personnel, sans compte");
await rep.getByLabel("Nom de votre assureur").fill("Mutuelle des communes");
await rep.check("input[name=modele][value=dessinee]");
await dessiner(rep);
await rep.check("input[name=lu]");
await rep.click("button:has-text(\"Je signe pour l'entreprise\")");
ok(await visible(rep.getByText("Merci, la convention est signée")), "le représentant signe");
b = await (await rep.context().request.get(BASE + lienRep + "/pdf")).body();
ok(contient(b, "Mutuelle des communes"), "sa réponse est écrite dans le PDF du lycée");
ok(texteDuPdf(b).includes("/subtype /image") && contient(b, "D. Roche"), "sa signature dessinée est placée au-dessus de son nom");

/* ------------------- La famille complète ses champs en signant ------------------- */
const fatou = await session("f.traore");
t = await fatou.textContent("main");
ok(t.includes("Téléphone portable de l'élève") && !t.includes("Nom de votre assureur"), "le parent complète seulement les champs de la famille");
await fatou.getByLabel("Téléphone portable de l'élève").fill("06 39 98 10 05");
await fatou.check("input[name=lu]");
await fatou.click("button:has-text('Je signe en tant que responsable légal')");
ok(await visible(fatou.getByText("Signature enregistrée (responsable légal)")), "le parent signe");
const pdfMoussa = await fatou.locator("a:has-text('Ouvrir la convention (PDF)')").getAttribute("href");
b = await (await fatou.context().request.get(BASE + pdfMoussa)).body();
ok(contient(b, "06 39 98 10 05") && contient(b, "TRAOR"), "le téléphone donné par la famille est écrit dans le PDF");

/* ------------------- Retour au modèle Cap PFMP : les conventions signées gardent leur PDF ------------------- */
await ddfpt.goto(pageModele);
await ddfpt.check("input[name=mode][value=cap_pfmp]");
await ddfpt.click("button:has-text('Enregistrer le choix')");
await visible(ddfpt.getByText("Les nouvelles conventions suivent le modèle Cap PFMP"));
r = await fatou.context().request.get(BASE + pdfMoussa.replace(/\/pdf$/, ""), { maxRedirects: 0 });
ok(r.status() === 307 && (r.headers().location ?? "").endsWith("/pdf"), "la convention de Moussa, déjà signée, reste dans le PDF du lycée");

/* ------------------- Accès ------------------- */
await martin.goto(BASE + "/organisation/documents");
ok(!martin.url().includes("/organisation/documents"), "un professeur n'accède pas aux modèles de documents");
r = await martin.context().request.get(BASE + "/organisation/documents/convention/apercu?reperage=1");
ok(r.status() === 403, "ni à leurs aperçus");

await fin();
