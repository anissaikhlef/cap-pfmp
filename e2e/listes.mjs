// Listes exportables (décision d'Anissa) : en tableau Excel et en PDF prêt à imprimer ; le DDFPT et la direction exportent
// tout, le professeur les listes de ses propres classes, sauf celle des RIB.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { BASE, OUT, ok, session, fin } from "./outils.mjs";

function texteDuPdf(octets, nom) {
  const f = `${OUT}/${nom}.pdf`;
  writeFileSync(f, octets);
  try { return execFileSync("pdftotext", ["-layout", f, "-"]).toString().replace(/\s+/g, " "); } catch { return null; }
}
const telecharger = async (p, href) => p.context().request.get(BASE + href);

/* ------------------- Le DDFPT : toutes les listes ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/listes");
let t = await ddfpt.textContent("main");
ok(["RIB et pièces d'identité", "Lieux de stage", "Élèves sans stage", "Conventions", "Attestations et livrets", "Absences en stage", "Visites de stage", "Entreprises partenaires", "Bilan de l'année par classe"].every((x) => t.includes(x)), "le DDFPT voit les neuf listes");
let tout = true;
for (const id of await ddfpt.locator("[id^=liste-]").evaluateAll((els) => els.map((e) => e.id))) {
  for (const format of ["Tableau Excel", "PDF"]) {
    const r = await telecharger(ddfpt, await ddfpt.locator(`#${id} a:has-text('${format}')`).getAttribute("href"));
    if (r.status() !== 200) { tout = false; console.log(`  ${id} ${format} : ${r.status()}`); }
  }
}
ok(tout, "chaque liste s'exporte en Excel et en PDF");

await ddfpt.selectOption("#l-classe", { label: "Tle MS" });
await ddfpt.click("button:has-text('Afficher')");
await ddfpt.waitForURL(/classe=/);
let r = await telecharger(ddfpt, await ddfpt.locator("#liste-lieux a:has-text('Tableau Excel')").getAttribute("href"));
const csv = await r.text();
ok(r.headers()["content-type"].includes("text/csv") && csv.includes("Lieux de stage") && csv.includes("MANSOURI") && csv.includes("Garde Ouest") && csv.includes("Semaines") && !csv.includes("MOREAU"), "la liste des lieux de stage d'une classe, en tableau Excel");
r = await telecharger(ddfpt, await ddfpt.locator("#liste-lieux a:has-text('PDF')").getAttribute("href"));
t = texteDuPdf(await r.body(), "liste-lieux");
ok(r.headers()["content-type"] === "application/pdf" && (t === null || (t.includes("Lieux de stage") && t.includes("MANSOURI") && t.includes("Tle MS"))), "et en PDF prêt à imprimer");
await ddfpt.goto(BASE + "/listes");
r = await telecharger(ddfpt, await ddfpt.locator("#liste-rib a:has-text('Tableau Excel')").getAttribute("href"));
t = await r.text();
ok(t.includes("KONÉ") && t.includes("vérifié") && t.includes("RAHMANI") && t.includes("à vérifier") && t.includes("manquant"), "la liste des RIB de tous les élèves");
await ddfpt.selectOption("#l-annee", "2025-2026");
await ddfpt.click("button:has-text('Afficher')");
await ddfpt.waitForURL(/annee=2025-2026/);
r = await telecharger(ddfpt, await ddfpt.locator("#liste-lieux a:has-text('Tableau Excel')").getAttribute("href"));
t = await r.text();
ok(t.includes("année 2025-2026") && t.includes("1re MS") && t.includes("17/11/2025"), "les listes des années précédentes");

/* ------------------- Le professeur : ses classes, sans les RIB ------------------- */
await ddfpt.goto(BASE + "/listes");
const idPremiere = await ddfpt.locator("#l-classe option", { hasText: "1re MS" }).getAttribute("value");
const martin = await session("p.martin");
await martin.goto(BASE + "/listes");
t = await martin.textContent("main");
ok(!t.includes("RIB et pièces d'identité") && t.includes("Lieux de stage"), "le professeur n'a pas la liste des RIB");
const options = await martin.locator("#l-classe option").allTextContents();
ok(options.includes("2nde MS") && options.includes("Tle MS") && !options.includes("1re MS"), "il ne choisit que ses propres classes");
ok((await telecharger(martin, "/listes/rib?format=excel")).status() === 403, "le lien direct vers les RIB lui est refusé");
ok((await telecharger(martin, `/listes/lieux?format=excel&classe=${idPremiere}`)).status() === 403, "la liste d'une autre classe lui est refusée");
r = await telecharger(martin, await martin.locator("#liste-visites a:has-text('Tableau Excel')").getAttribute("href"));
t = await r.text();
ok(t.includes("Visites de stage") && t.includes("mes classes (2nde MS, Tle MS)"), "il exporte les visites de ses classes");

/* ------------------- Accès ------------------- */
const ines = await session("ines.haddad");
await ines.goto(BASE + "/listes");
ok(!ines.url().includes("/listes"), "un élève n'a pas de listes");
ok((await telecharger(ines, "/listes/lieux?format=excel")).status() === 403, "ni de lien direct");

await fin();
