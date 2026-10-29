// Attestation récapitulative des PFMP (décisions d'Anissa) : chaque lycée dépose le fichier Excel de son académie, que
// Cap PFMP remplit pour les classes d'examen, avec aussi une version Cap PFMP en Excel et en PDF. Ne comptent que les PFMP
// effectuées et attestées. La préparent la direction, le DDFPT et le référent de la classe ; seule la direction vise.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { BASE, OUT, ok, session, fin } from "./outils.mjs";

const telecharger = async (p, href) => p.context().request.get(BASE + href);
/** Les cases utiles du fichier de l'académie rempli (avec openpyxl), ou null si l'outil n'est pas installé. */
function lireAcademie(octets, nom) {
  const f = `${OUT}/${nom}.xlsx`;
  writeFileSync(f, octets);
  const code = `import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
v = lambda ws, c: (lambda x: x.strftime('%d/%m/%Y') if hasattr(x, 'strftime') else x)(wb[ws][c].value)
print(json.dumps({
  'onglets': wb.sheetnames,
  'synthese': [[v('synthese ', f'{c}{r}') for c in 'BCD'] for r in range(2, 6)],
  'eleve1': {c: v('ELEVE 1', c) for c in ['A1', 'B3', 'E3', 'A6', 'D6', 'B7', 'C8', 'C10', 'A13', 'B13', 'C13', 'D13', 'E13', 'E19']},
  'eleve5': {c: v('ELEVE 5', c) for c in ['A6', 'C8', 'A13']},
  'garde': [[v('PAGE DE GARDE ', f'{c}{r}') for c in 'ABCDEFG'] for r in range(7, 12)],
  'gardeEtab': v('PAGE DE GARDE ', 'C3'),
}, default=str))`;
  try { return JSON.parse(execFileSync("python3", ["-c", code, f]).toString()); } catch { return null; }
}
function texteDuPdf(octets, nom) {
  const f = `${OUT}/${nom}.pdf`;
  writeFileSync(f, octets);
  try { return execFileSync("pdftotext", ["-layout", f, "-"]).toString().replace(/\s+/g, " "); } catch { return null; }
}

/* ------------------- Le DDFPT : fichier de l'académie et préparation ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/recapitulatif");
let t = await ddfpt.textContent("main");
ok(t.includes("Attestation_de_PFMP_academie_2026.xlsx") && t.includes("Le fichier est prêt : 30 onglets"), "le fichier de l'académie est déposé et ses cases reconnues");
ok(await ddfpt.inputValue("#mr-nom") === "D6" && await ddfpt.inputValue("#mr-visa") === "B7" && await ddfpt.inputValue("#mr-premiere") === "13"
  && await ddfpt.inputValue("#mr-nombre") === "5" && await ddfpt.inputValue("#mr-academie") === "VERSAILLES", "les cases reconnues sont affichées (nom en D6, visa en B7, PFMP à partir de la ligne 13)");
await ddfpt.setInputFiles("#mr-fichier", { name: "faux.xlsx", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 pas un classeur") });
await ddfpt.click("button:has-text('Remplacer le fichier')");
ok(await ddfpt.locator("text=Format non accepté").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "un fichier qui n'est pas un classeur Excel est refusé");

await ddfpt.goto(BASE + "/listes");
ok((await ddfpt.textContent("#recapitulatif")).includes("Tle MS"), "les listes mènent à l'attestation récapitulative des classes d'examen");
await ddfpt.goto(BASE + "/recapitulatif");
await ddfpt.locator("#candidats").waitFor();
t = await ddfpt.textContent("main");
ok((await ddfpt.locator("#r-classe option").allTextContents()).join() === "Tle MS", "seules les classes d'examen sont proposées");
ok(t.includes("Baccalauréat professionnel Métiers de la sécurité") && t.includes("session 2027") && t.includes("Académie de VERSAILLES"), "diplôme, session et académie");
const cisse = await ddfpt.textContent(".row:has-text('CISSÉ Adam')");
ok(cisse.includes("4 semaine(s) sur 20") && cisse.includes("20 jour(s) attesté(s)") && cisse.includes("du 17/11/2025 au 12/12/2025"), "seules les PFMP effectuées et attestées comptent (20 jours en 1re, sur 20 semaines attendues)");
ok(cisse.includes("en cours, comptera une fois terminée et attestée"), "la PFMP en cours ne compte pas encore");
const fontaine = ddfpt.locator(".row:has-text('FONTAINE Léa')");
ok((await fontaine.textContent()).includes("numéro de candidat à indiquer"), "un numéro de candidat manquant est signalé");
ok(!t.includes("Viser les attestations"), "le DDFPT ne vise pas : seule la direction vise");
await fontaine.locator("input[name=numero]").fill("0269990004");
await fontaine.locator("input[name=derogation]").check();
await fontaine.locator("button:has-text('Enregistrer')").click();
ok(await fontaine.locator("text=FONTAINE : enregistré").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "le DDFPT indique le numéro de candidat et la dérogation");

let r = await telecharger(ddfpt, await ddfpt.locator("a:has-text(\"Fichier de l'académie (Excel)\")").getAttribute("href"));
let x = lireAcademie(await r.body(), "academie-ddfpt");
ok(r.status() === 200 && r.headers()["content-disposition"].includes(".xlsx"), "le fichier de l'académie rempli se télécharge");
if (x) {
  ok(x.onglets.length === 33 && x.onglets.includes("ELEVE 30"), "ses onglets restent ceux de l'académie");
  ok(JSON.stringify(x.synthese) === JSON.stringify([["0269990002", "CISSÉ", "Adam"], ["0269990004", "FONTAINE", "Léa"], ["0269990001", "LAURENT", "Emma"], ["0269990003", "MANSOURI", "Rayan"]]),
    "la synthèse liste les élèves par ordre alphabétique, avec leur numéro");
  const e = x.eleve1;
  ok(e.A1 === "BACCALAURÉAT PROFESSIONNEL MÉTIERS DE LA SÉCURITÉ" && e.B3 === "VERSAILLES" && e.E3 === 2027 && e.A6 === "Lycée professionnel de démonstration – Ville-démo", "titre, académie, session et établissement");
  ok(e.D6 === "='synthese '!C2" && e.E13 === "=SUM(D13:D181)" && e.E19 === "=E13/5", "les formules de l'académie sont gardées");
  ok(e.C8 === "3 ans" && e.C10 === "NON" && e.B7 === null, "durée du cycle, dérogation, pas de visa");
  ok(e.A13 === "17/11/2025" && e.B13 === "12/12/2025" && String(e.C13).startsWith("Centre commercial Les Arcades") && e.D13 === 20, "la PFMP attestée : dates, entreprise et jours");
  ok(x.eleve5.A6 === "='ELEVE 1'!A6" && x.eleve5.C8 === null && x.eleve5.A13 === null, "les onglets sans élève restent vides");
  ok(x.gardeEtab === "Lycée professionnel de démonstration – Ville-démo" && x.garde[1][0] === "0269990004" && x.garde[1][5] === "OUI" && x.garde[1][6] === "16 semaine(s) manquante(s) sur 20",
    "la page de garde liste les élèves à qui il manque des semaines, avec la dérogation");
}
r = await telecharger(ddfpt, await ddfpt.locator("a:has-text('Version Cap PFMP (Excel)')").getAttribute("href"));
ok(r.status() === 200 && r.headers()["content-type"].includes("spreadsheetml"), "la version Cap PFMP en Excel");
r = await telecharger(ddfpt, await ddfpt.locator("a:has-text('Version Cap PFMP (PDF)')").getAttribute("href"));
t = texteDuPdf(await r.body(), "recapitulatif");
ok(r.headers()["content-type"] === "application/pdf" && (t === null || (t.includes("ATTESTATION RÉCAPITULATIVE DES PFMP") && t.includes("CISSÉ Adam") && t.includes("Centre commercial Les Arcades") && t.includes("17/11/2025") && t.includes("En attente du visa"))), "et en PDF, une page par élève");

/* ------------------- Semaines attendues de la formation ------------------- */
await ddfpt.goto(BASE + "/organisation/formations");
const bac = ddfpt.locator(".row:has-text('Bac Pro Métiers de la sécurité')").first();
await bac.locator("input[name=semaines3]").fill("22");
await bac.locator("button:has-text('Enregistrer le cycle')").click();
ok(await bac.locator("text=Cycle de la formation").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "le lycée règle les semaines attendues de la formation");
await ddfpt.goto(BASE + "/recapitulatif");
ok((await ddfpt.textContent(".row:has-text('CISSÉ Adam')")).includes("4 semaine(s) sur 22"), "l'attestation en tient compte");

/* ------------------- La direction vise ------------------- */
const dir = await session("direction");
await dir.goto(BASE + "/recapitulatif");
await dir.click("button:has-text('Viser les attestations de la classe')");
ok(await dir.locator("text=Attestations visées : 4 élève(s)").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "la direction vise les attestations de la classe");
await dir.locator(".row:has-text('LAURENT Emma') button:has-text('Retirer le visa')").click();
ok(await dir.locator("text=Visa retiré pour Emma LAURENT").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "et peut retirer un visa");
r = await telecharger(dir, await dir.locator("a:has-text(\"Fichier de l'académie (Excel)\")").getAttribute("href"));
x = lireAcademie(await r.body(), "academie-direction");
if (x) ok(x.eleve1.B7 === "X", "la croix du visa figure dans le fichier de l'académie");

/* ------------------- Le référent de la classe, et les autres ------------------- */
const diallo = await session("a.diallo");
await diallo.goto(BASE + "/listes");
ok(await diallo.locator("#recapitulatif").count() === 1, "le professeur référent de la terminale a l'attestation récapitulative");
await diallo.goto(BASE + "/recapitulatif");
t = await diallo.textContent("main");
ok(t.includes("CISSÉ") && !t.includes("Viser les attestations") && t.includes("visa de la direction : 3 sur 4"), "il la prépare, sans viser");
const idTle = await diallo.locator("#r-classe option").first().getAttribute("value");
ok((await telecharger(diallo, `/recapitulatif/${idTle}?format=academie`)).status() === 200, "et télécharge le fichier de l'académie");
const martin = await session("p.martin");
await martin.goto(BASE + "/recapitulatif");
ok(!martin.url().includes("/recapitulatif"), "un professeur qui n'est pas référent d'une classe d'examen n'y a pas accès");
ok((await telecharger(martin, `/recapitulatif/${idTle}?format=excel`)).status() === 403, "ni par le lien direct");
ok((await telecharger(martin, "/organisation/recapitulatif/modele")).status() === 403, "ni au fichier de l'académie déposé");

await fin();
