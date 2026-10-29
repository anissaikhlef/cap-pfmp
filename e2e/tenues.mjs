// Tenues professionnelles et matériel (décisions d'Anissa) : liste préremplie, articles par formation, saisie des tailles
// par classe avec une date limite (élève, famille, ou l'équipe pour un élève sans compte), fichier de commande, remise
// signée au doigt le jour même par l'élève sur l'appareil de la personne désignée, remise partielle, liste des remises.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { BASE, OUT, ok, session, fin, visible } from "./outils.mjs";

const telecharger = async (p, href) => p.context().request.get(BASE + href);
function lignesXlsx(octets, nom) {
  const f = `${OUT}/${nom}.xlsx`;
  writeFileSync(f, octets);
  try {
    return execFileSync("python3", ["-c", "import sys, openpyxl\nwb = openpyxl.load_workbook(sys.argv[1])\nfor ws in wb:\n  print('##', ws.title)\n  for r in ws.iter_rows(values_only=True): print(' | '.join('' if v is None else str(v) for v in r))", f]).toString();
  } catch { return null; }
}
function texteDuPdf(octets, nom) {
  const f = `${OUT}/${nom}.pdf`;
  writeFileSync(f, octets);
  try { return execFileSync("pdftotext", ["-layout", f, "-"]).toString().replace(/\s+/g, " "); } catch { return null; }
}
async function signer(p) {
  const b = await p.locator("canvas[aria-label='Cadre de signature']").boundingBox();
  await p.mouse.move(b.x + 30, b.y + 100);
  await p.mouse.down();
  for (const [x, y] of [[80, 40], [140, 110], [200, 50], [260, 95]]) await p.mouse.move(b.x + x, b.y + y, { steps: 4 });
  await p.mouse.up();
}

/* ------------------- Le DDFPT : articles de chaque formation ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/tenues");
let t = await ddfpt.textContent("main");
ok(["Polo", "Pantalon de travail", "Blouse", "Parka", "Ceinture", "Chaussures de sécurité", "Boîte à outils", "Gants"].every((x) => t.includes(x)), "une liste préremplie de tenues, de protections et de matériel");
const cap = ddfpt.locator("details:has-text('CAP Agent de sécurité')").first();
ok((await cap.locator("summary").textContent()).includes("4 article(s)"), "les articles déjà choisis pour une formation");
await cap.locator("input[name=libelle]").fill("Gilet pare-lame");
await cap.locator("select[name=mesure]").selectOption("haut");
await cap.locator("button:has-text('Ajouter')").click();
ok(await visible(cap.locator("text=« Gilet pare-lame » ajouté")), "le DDFPT ajoute un article qui manque, avec sa taille à demander");
await ddfpt.goto(BASE + "/organisation/tenues");
const capBis = ddfpt.locator("details:has-text('CAP Agent de sécurité')").first();
await capBis.locator("input[name=c_gants]").check();
await capBis.locator("button:has-text('Enregistrer les articles')").click();
ok(await visible(capBis.locator("text=CAP Agent de sécurité : 6 article(s)")), "et coche un article de la liste");

/* ------------------- Saisie des tailles et commande ------------------- */
await ddfpt.goto(BASE + "/tenues");
const sec = ddfpt.locator(".row:has-text('2nde MS')");
ok((await sec.textContent()).includes("saisie ouverte jusqu'au 6 novembre 2026 · tailles : 2 sur 4"), "l'état de la saisie de chaque classe");
await ddfpt.locator("#ouvrir label:has-text('Tle MS') input").check();
await ddfpt.fill("#t-date", "2026-11-13");
await ddfpt.click("button:has-text('Ouvrir la saisie')");
ok(await visible(ddfpt.locator("text=Saisie des tailles ouverte jusqu'au 13 novembre 2026 pour Tle MS")), "le DDFPT ouvre la saisie d'une classe : élèves et familles sont prévenus");
let r = await telecharger(ddfpt, "/tenues/fichier/commande?classe=tout&format=excel");
t = lignesXlsx(await r.body(), "commande-tenues");
ok(r.status() === 200 && (t === null || (t.includes("## Commande") && t.includes("## Détail par élève") && t.includes("Bac Pro Métiers de la sécurité | Polo | S | 2")
  && t.includes("Bac Pro Métiers de la sécurité | Polo | M | 2") && t.includes("| Polo | à indiquer |") && t.includes("2nde MS | MOREAU | Lucas | Chaussures de sécurité | 42 | 1"))),
  "le fichier de commande : le total par article et par taille, puis le détail par élève");
r = await telecharger(ddfpt, "/tenues/fichier/commande?classe=tout&format=pdf");
t = texteDuPdf(await r.body(), "commande-tenues");
ok(r.headers()["content-type"] === "application/pdf" && (t === null || (t.includes("Commande de tenues et de matériel") && t.includes("Détail par élève"))), "et en PDF");

/* ------------------- L'élève indique ses tailles ------------------- */
const ines = await session("ines.haddad");
await ines.goto(BASE + "/mon-stage");
t = await ines.textContent("#tenue");
ok(t.includes("Ma tenue professionnelle") && t.includes("2 × Polo") && t.includes("Tailles à indiquer avant le 6 novembre 2026"), "l'élève voit sa tenue et la date limite");
await ines.selectOption("#tenue select[name=haut]", "L");
await ines.selectOption("#tenue select[name=bas]", "38");
await ines.selectOption("#tenue select[name=ceinture]", "M");
await ines.selectOption("#tenue select[name=pointure]", "39");
await ines.click("#tenue button:has-text('Enregistrer les tailles')");
ok(await visible(ines.locator("#tenue >> text=Tailles enregistrées")), "et indique ses tailles (haut, bas, ceinture, pointure)");

/* ------------------- Le référent : un élève sans compte ------------------- */
const martin = await session("p.martin");
await martin.goto(BASE + "/tenues");
await martin.locator(".row:has-text('2nde MS') a:has-text('Voir la classe')").click();
await martin.waitForURL(/\/tenues\/[0-9a-f-]{36}$/);
const idSec = martin.url().split("/").pop();
const petit = martin.locator(".row:has-text('PETIT Noah')");
ok((await petit.textContent()).includes("pas de compte élève"), "le référent voit les élèves sans compte");
await petit.locator("select[name=haut]").selectOption("XL");
await petit.locator("select[name=bas]").selectOption("44");
await petit.locator("select[name=ceinture]").selectOption("L");
await petit.locator("select[name=pointure]").selectOption("44");
await petit.locator("button:has-text('Enregistrer les tailles')").click();
ok(await visible(petit.locator("text=Tailles enregistrées")), "et indique les tailles à sa place");
ok(await martin.locator("a:has-text('Remettre')").count() === 0, "le référent ne distribue pas s'il n'est pas désigné");
ok((await telecharger(martin, "/tenues/fichier/commande?classe=tout&format=excel")).status() === 403, "ni ne télécharge la commande");

/* ------------------- La distribution : remise signée, partielle puis complète ------------------- */
const nadia = await session("vie.scolaire");
await nadia.goto(BASE + `/tenues/${idSec}`);
await nadia.locator(".row:has-text('MOREAU Lucas') a:has-text('Remettre')").click();
await nadia.waitForURL(/\/remise\//);
ok((await nadia.textContent("main")).includes("Polo · taille M") && (await nadia.textContent("main")).includes("Chaussures de sécurité · taille 42"), "la personne désignée voit les articles et les tailles de l'élève");
await nadia.locator("label:has-text('Parka') input").uncheck();
await nadia.click("button:has-text('Valider la remise')");
ok(await visible(nadia.locator("text=L'élève doit signer dans le cadre")), "sans signature, la remise n'est pas enregistrée");
await signer(nadia);
await nadia.click("button:has-text('Valider la remise')");
ok(await visible(nadia.locator("text=Remise signée par Lucas MOREAU : 6 article(s) ; 1 reste(nt) à remettre")), "l'élève signe au doigt la remise du jour ; l'article manquant reste à remettre");
await nadia.goto(BASE + `/tenues/${idSec}`);
t = await nadia.textContent(".row:has-text('MOREAU Lucas')");
ok(t.includes("remise partielle") && t.includes("Reste à remettre : Parka (M)") && t.includes("par Nadia BERRADA"), "la classe montre la remise partielle et ce qui reste");
await nadia.locator(".row:has-text('MOREAU Lucas') a:has-text('Remettre')").click();
await nadia.waitForURL(/\/remise\//);
await signer(nadia);
await nadia.click("button:has-text('Valider la remise')");
ok(await visible(nadia.locator("text=Tout a été remis à Lucas")), "la parka est remise plus tard, avec une nouvelle signature");
await nadia.goto(BASE + `/tenues/${idSec}`);
ok((await nadia.textContent(".row:has-text('MOREAU Lucas')")).includes("tout remis"), "tout est remis");
r = await telecharger(nadia, `/tenues/fichier/remises?classe=${idSec}&format=excel`);
t = lignesXlsx(await r.body(), "remises-tenues");
ok(r.status() === 200 && (t === null || (/2nde MS \| MOREAU \| Lucas \| Parka \| M \| 1 \| [^|]+ \| Nadia BERRADA \| remis, signé/.test(t) && t.includes("2nde MS | HADDAD | Inès | Polo | L | 2 |  |  | à remettre"))),
  "la liste des remises : qui a reçu quoi, quand, de qui, et ce qui reste à remettre");
ok((await telecharger(nadia, "/tenues/fichier/commande?classe=tout&format=excel")).status() === 403, "la personne désignée ne télécharge pas la commande");

/* ------------------- La fiche signée, dans les documents de l'élève ------------------- */
await ddfpt.goto(BASE + `/tenues/${idSec}`);
ok((await ddfpt.textContent(".row:has-text('MOREAU Lucas')")).includes("signé"), "le DDFPT voit les remises signées");
await ddfpt.goto(BASE + "/eleves");
await ddfpt.locator("a:has-text('MOREAU')").first().click();
await ddfpt.locator("#dossier").waitFor();
const fiches = ddfpt.locator("#dossier .row:has-text('Remise de la tenue et du matériel')");
ok(await fiches.count() === 2, "les deux fiches de remise signées sont rangées dans les documents de l'élève");
r = await telecharger(ddfpt, await fiches.first().locator("a:has-text('Ouvrir')").getAttribute("href"));
t = texteDuPdf(await r.body(), "fiche-remise");
ok(r.headers()["content-type"] === "application/pdf" && (t === null || (t.includes("Remise de la tenue professionnelle et du matériel") && t.includes("Lucas MOREAU") && t.includes("Je reconnais avoir reçu") && t.includes("Remis par Nadia BERRADA"))),
  "la fiche : articles, tailles, date, signature de l'élève et personne qui a remis");

/* ------------------- Accès ------------------- */
const ferhat = await session("k.ferhat");
await ferhat.goto(BASE + "/tenues");
ok(!ferhat.url().includes("/tenues"), "une entreprise n'a pas accès aux tenues");
ok((await telecharger(ferhat, "/tenues/fichier/remises?classe=tout&format=excel")).status() === 403, "ni aux fichiers");

await fin();
