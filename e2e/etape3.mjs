// Étape 3 : convention (signatures en ligne et dépôt papier), boîte de dépôt, fin de stage, dossiers, droits sur les fichiers.
import { writeFileSync } from "node:fs";
import { BASE, OUT, ok, visible, session, fin } from "./outils.mjs";

const pdf = `${OUT}/convention-signee.pdf`;
writeFileSync(pdf, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const faux = `${OUT}/piege.pdf`;
writeFileSync(faux, "<html><script>alert('x')</script></html>");

// Parent : signe en ligne, puis dépôt d'un faux PDF refusé
const fatou = await session("f.traore");
let t = await fatou.textContent("main");
ok(t.includes("Convention de stage") && t.includes("En cours de signature"), "le parent voit la convention en cours");
await fatou.check("input[name=lu]");
await fatou.click("button:has-text('Je signe en tant que responsable légal')");
ok(await visible(fatou.getByText("Signature enregistrée (responsable légal)")), "le parent signe en ligne");
await fatou.setInputFiles("input[name=fichier]", faux);
await fatou.click("button:has-text('Déposer la convention signée')");
ok(await visible(fatou.getByText("Format non accepté")), "refuse un fichier déguisé en PDF");
await fatou.setInputFiles("input[name=fichier]", pdf);
await fatou.click("button:has-text('Déposer la convention signée')");
ok(await visible(fatou.getByText("Document déposé")), "le parent dépose la convention papier");

// Tuteur : signe pour l'entreprise, dépose le livret de Clara (stage terminé)
const tuteur = await session("k.ferhat");
const moussa = tuteur.locator(".panel.pad.section", { hasText: "TRAORÉ" }).first();
// Le compte du tuteur peut signer pour l'entreprise et en tant que tuteur : on choisit la signature de l'entreprise.
const formEntreprise = moussa.locator("form", { has: tuteur.locator("button:has-text(\"Je signe pour l'entreprise\")") });
await formEntreprise.locator("input[name=lu]").check();
await formEntreprise.locator("button:has-text(\"Je signe pour l'entreprise\")").click();
ok(await visible(tuteur.getByText("Signature enregistrée (représentant de l'entreprise)")), "le tuteur signe pour l'entreprise");
await tuteur.reload();
const clara = tuteur.locator(".panel.pad.section", { hasText: "NGUYEN" }).first();
const depotLivret = clara.locator(".card", { hasText: "Livret de compétences" });
await depotLivret.locator("input[name=fichier]").setInputFiles(pdf);
await depotLivret.locator("button:has-text('Déposer le document signé')").click();
ok(await visible(tuteur.getByText("Document déposé")), "le tuteur dépose le livret");
await tuteur.screenshot({ path: `${OUT}/e3-tuteur.png`, fullPage: true });

// Référent du CAP : valide la convention papier de Moussa
const leroy = await session("h.leroy");
await leroy.goto(BASE + "/documents");
t = await leroy.textContent("main");
ok(t.includes("TRAORÉ") && !t.includes("NGUYEN"), "la boîte de dépôt ne montre que ses classes");
const lienDoc = await leroy.locator(".row", { hasText: "TRAORÉ" }).locator("a:has-text('Ouvrir')").getAttribute("href");
await leroy.locator(".row", { hasText: "TRAORÉ" }).locator("button:has-text('Valider')").click();
await leroy.waitForTimeout(1500);
await leroy.goto(BASE + "/eleves");
await Promise.all([leroy.waitForURL(/\/eleves\/[0-9a-f-]{36}/), leroy.click("a.row:has-text('TRAORÉ')")]);
t = await leroy.textContent("main");
ok(t.includes("Signée par tous") && t.includes("Prêt à partir"), "la convention papier validée vaut signature de tous");
await leroy.screenshot({ path: `${OUT}/e3-fiche.png`, fullPage: true });

// Référente de 1re : refuse l'attestation de Clara, valide le livret
const benali = await session("s.benali");
await benali.goto(BASE + "/documents");
const ligneAtt = benali.locator(".row", { hasText: "Attestation de stage" }).filter({ hasText: "NGUYEN" });
await ligneAtt.locator("summary:has-text('Refuser')").click();
await ligneAtt.locator("input[name=motif]").fill("cachet de l'entreprise manquant");
await ligneAtt.locator("button:has-text('Confirmer le refus')").click();
ok(await visible(benali.getByText("Document refusé")), "refuse un document avec un motif");
await benali.reload();
await benali.locator(".row", { hasText: "Livret de compétences" }).filter({ hasText: "NGUYEN" }).locator("button:has-text('Valider')").click();
await benali.waitForTimeout(1500);
await tuteur.reload();
ok((await tuteur.textContent("main")).includes("Refusé : cachet de l'entreprise manquant"), "le tuteur voit le motif du refus");

// Droits sur les fichiers
let r = await fatou.request.get(BASE + lienDoc);
ok(r.status() === 200 && r.headers()["content-type"] === "application/pdf", "le parent ouvre la convention de son enfant");
const ines = await session("ines.haddad");
r = await ines.request.get(BASE + lienDoc);
ok(r.status() === 404, "un autre élève ne peut pas ouvrir ce document");
r = await tuteur.request.get(BASE + lienDoc);
ok(r.status() === 200, "le tuteur ouvre les documents de son stagiaire");
const anon = await (await (await import("./outils.mjs")).browser.newContext()).newPage();
r = await anon.request.get(BASE + lienDoc);
ok(r.status() === 401, "un visiteur non connecté ne peut rien ouvrir");

// Le référent signe en dernier (organisation du lycée de démonstration) : la direction signe à tout moment,
// le référent ne peut pas signer en dernier la convention de Noah (horaires de nuit).
const dir = await session("direction");
await dir.goto(BASE + "/a-signer");
t = await dir.textContent("main");
ok(t.includes("FONTAINE") && t.includes("Le professeur référent signe en dernier"), "la direction peut signer avant le référent");
const martin = await session("p.martin");
await martin.goto(BASE + "/eleves?q=petit");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('PETIT')")]);
ok((await martin.textContent("main")).includes("ne respecte pas toutes les règles"), "le référent ne peut pas signer en dernier un stage hors règles");
const lea = dir.locator(".row", { hasText: "FONTAINE" }).filter({ hasText: "prête à signer" });
await lea.locator("button:has-text('Signer')").click();
await dir.waitForTimeout(1500);
await dir.reload();
ok(!(await dir.locator(".row", { hasText: "FONTAINE" }).filter({ hasText: "prête à signer" }).count()), "la direction signe la convention de Léa");
await dir.screenshot({ path: `${OUT}/e3-a-signer.png`, fullPage: true });

// Dossier sur plusieurs années
await dir.goto(BASE + "/eleves?q=laurent");
await Promise.all([dir.waitForURL(/\/eleves\/[0-9a-f-]{36}/), dir.click("a.row:has-text('LAURENT')")]);
t = await dir.textContent("#dossier");
ok(t.includes("2026-2027") && t.includes("2025-2026 · 1re MS") && t.includes("Livret de compétences"), "le dossier suit l'élève d'une année sur l'autre");
const lienConv = await dir.locator("a:has-text('Voir la convention à imprimer')").getAttribute("href");
await dir.goto(BASE + lienConv);
ok((await dir.textContent("main")).includes("Convention relative à la période de formation"), "la convention pré-remplie s'affiche");
await dir.screenshot({ path: `${OUT}/e3-convention.png`, fullPage: true });

await fin();
