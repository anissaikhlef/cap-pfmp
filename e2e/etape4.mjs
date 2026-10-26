// Étape 4 : visites, répartition, créneaux par SMS, ordre de mission, compte rendu.
import { BASE, OUT, ok, visible, session, fin } from "./outils.mjs";

// Le lycée de démonstration répartit selon les heures de face à face (voir e2e/lot1.mjs) : ce parcours teste la répartition automatique.
const dir = await session("direction");
await dir.goto(BASE + "/organisation");
await dir.check("input[name=repartition][value=auto]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(dir.getByText("Organisation enregistrée")), "la direction choisit la répartition automatique");

// Référente de terminale : répartition automatique
const diallo = await session("a.diallo");
await diallo.goto(BASE + "/visites");
let t = await diallo.textContent("main");
ok(t.includes("LAURENT") && t.includes("Sans visiteur"), "liste les visites de ses classes, dont une sans visiteur");
await diallo.click("button:has-text('Répartir automatiquement')");
ok(await visible(diallo.getByText("visite(s) attribuée(s)")), "répartit automatiquement les visites");
t = await diallo.textContent("main");
ok(!t.includes("Sans visiteur"), "plus aucun élève sans visiteur");
await diallo.screenshot({ path: `${OUT}/e4-visites.png`, fullPage: true });

// Compte rendu de la visite passée de Rayan, avec alerte
await diallo.goto(BASE + "/mes-visites");
await Promise.all([diallo.waitForURL(/\/visites\/[0-9a-f-]{36}/), diallo.click("a.row:has-text('MANSOURI')")]);
await diallo.fill("#cr-obs", "Bonne intégration, mais horaires dépassés deux jours de suite.");
await diallo.selectOption("#cr-suite", "alerte");
await diallo.click("button:has-text('Enregistrer le compte rendu')");
ok(await visible(diallo.getByText("L'alerte a été transmise")), "enregistre le compte rendu et transmet l'alerte");
ok((await diallo.textContent("main")).includes("Bonne intégration"), "le compte rendu s'affiche");

// Visite d'Adam : créneaux par SMS puis ordre de mission
await diallo.goto(BASE + "/visites");
await Promise.all([diallo.waitForURL(/\/visites\/[0-9a-f-]{36}/), diallo.locator(".row", { hasText: "CISSÉ" }).locator("a:has-text('Détails')").click()]);
const urlAdam = diallo.url();
await diallo.click("button:has-text('Envoyer par SMS')");
ok(await visible(diallo.getByText("Créneaux envoyés par SMS")), "envoie les créneaux au tuteur par SMS (simulé)");
await diallo.click("button:has-text('Le tuteur a choisi ce créneau')");
ok(await visible(diallo.getByText("Visite confirmée")), "enregistre le créneau choisi");
await diallo.click("button:has-text(\"Créer l'ordre de mission\")");
ok(await visible(diallo.getByText("transmis à la direction")), "transmet l'ordre de mission à la direction");

// Direction : signe l'ordre de mission
await dir.goto(BASE + "/a-signer");
t = await dir.textContent("main");
ok(t.includes("visite de Adam CISSÉ") && t.includes("visite de Léa FONTAINE"), "la direction voit les ordres de mission à signer");
await dir.locator(".row", { hasText: "visite de Adam CISSÉ" }).locator("button:has-text('Signer')").click();
ok(await visible(dir.getByText("Ordre de mission signé")), "la direction signe l'ordre de mission");
await diallo.goto(urlAdam);
ok((await diallo.textContent("main")).includes("Ordre de mission signé"), "le visiteur voit l'ordre de mission signé");
const lienOm = await diallo.locator("a:has-text(\"Voir l'ordre de mission\")").getAttribute("href");
await diallo.goto(BASE + lienOm);
ok((await diallo.textContent("main")).includes("Signé le"), "l'ordre de mission imprimable est signé");

// Le tuteur choisit lui-même un créneau
const martin = await session("p.martin");
await martin.goto(BASE + "/visites");
const lucas = martin.locator(".row", { hasText: "MOREAU" });
await lucas.locator("select[name=visiteurId]").selectOption({ label: "Paul MARTIN" });
await lucas.locator("button:has-text('Enregistrer')").click();
await martin.waitForTimeout(1200);
await Promise.all([martin.waitForURL(/\/visites\/[0-9a-f-]{36}/), martin.locator(".row", { hasText: "MOREAU" }).locator("a:has-text('Détails')").click()]);
await martin.click("button:has-text('Envoyer par SMS')");
await visible(martin.getByText("Créneaux envoyés"));
const tuteur = await session("k.ferhat");
await tuteur.locator(".panel.pad.section", { hasText: "MOREAU" }).locator("button:has-text('Choisir ce créneau')").click();
ok(await visible(tuteur.getByText("Visite confirmée")), "le tuteur choisit un créneau dans son espace");
await martin.reload();
ok((await martin.textContent("main")).includes(" à 10h"), "le professeur voit le créneau choisi par le tuteur");

// Professeure d'enseignement général : accès limité à ses visites
const garnier = await session("m.garnier");
ok(garnier.url().includes("/mes-visites"), "un professeur sans classe arrive sur ses visites");
ok((await garnier.textContent("main")).includes("FONTAINE"), "il voit la visite qui lui est attribuée");
await garnier.goto(BASE + "/eleves");
ok(!garnier.url().includes("/eleves"), "il n'accède pas à la gestion des élèves");

// Organisation : visites réservées à l'enseignement professionnel
await dir.goto(BASE + "/organisation");
await dir.check("input[name=visiteurs][value=pro]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
await visible(dir.getByText("Organisation enregistrée"));
await dir.goto(BASE + "/visites");
ok(!(await dir.locator(".panel.pad.section").first().textContent()).includes("GARNIER"), "en mode « enseignement professionnel », les professeurs de général ne sont plus visiteurs");

// Dossier : le compte rendu y apparaît
await dir.goto(BASE + "/eleves?q=mansouri");
await Promise.all([dir.waitForURL(/\/eleves\/[0-9a-f-]{36}/), dir.click("a.row:has-text('MANSOURI')")]);
ok((await dir.textContent("#dossier")).includes("Comptes rendus de visite"), "le compte rendu est rangé dans le dossier de l'élève");

await fin();
