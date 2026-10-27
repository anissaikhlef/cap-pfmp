// Frais de visite : le barème de chaque lycée, la demande de remboursement du professeur après la visite,
// la validation (ou le refus avec un motif) par la gestion des PFMP, le récapitulatif et l'export.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { BASE, OUT, ok, visible, session, fin } from "./outils.mjs";

/* ------------------- Le DDFPT : le barème du lycée ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation");
await Promise.all([ddfpt.waitForURL(/\/organisation\/frais/), ddfpt.click("a:has-text('Barème des frais')")]);
ok((await ddfpt.inputValue("#v-2")) === "Voiture 5 CV" && (await ddfpt.inputValue("#t-2-0")) === "0,636" && (await ddfpt.inputValue("#f-2-1")) === "1395",
  "le barème du lycée s'affiche, en tranches de kilomètres (exemple de la démonstration)");
await ddfpt.fill("#v-9", "Voiture électrique");
await ddfpt.fill("#j-9-0", "5000");
await ddfpt.fill("#t-9-0", "0,5");
await ddfpt.fill("#j-9-1", "3000");
await ddfpt.fill("#t-9-1", "0,4");
await ddfpt.fill("#j-9-2", "8000");
await ddfpt.fill("#t-9-2", "0,3");
await ddfpt.click("button:has-text('Enregistrer le barème')");
ok(await visible(ddfpt.getByText("les kilomètres des tranches doivent augmenter")), "le barème refuse des tranches qui ne montent pas");
await ddfpt.fill("#j-9-1", "");
await ddfpt.fill("#j-9-2", "");
await ddfpt.fill("#t-9-2", "");
await ddfpt.click("button:has-text('Enregistrer le barème')");
ok(await visible(ddfpt.getByText("Barème enregistré : 10 véhicule(s)")), "le DDFPT ajoute un véhicule au barème");
await ddfpt.screenshot({ path: `${OUT}/frais-bareme.png`, fullPage: true });

/* ------------------- Le professeur : sa demande après la visite ------------------- */
const diallo = await session("a.diallo");
await diallo.goto(BASE + "/mes-visites");
await Promise.all([diallo.waitForURL(/\/visites\/[0-9a-f-]{36}/), diallo.click("a.row:has-text('MANSOURI')")]);
const urlRayan = diallo.url();
let t = await diallo.textContent("#frais");
ok(t.includes("le trajet retenu est celui entre le lycée et le lieu de stage"), "les consignes du lycée accompagnent la demande");
await diallo.selectOption("#fr-vehicule", "Voiture 5 CV");
await diallo.fill("#fr-km", "42");
await diallo.fill("#fr-peage", "3,50");
await diallo.fill("#fr-repas", "1");
await diallo.click("button:has-text('Envoyer la demande')");
ok(await visible(diallo.getByText("Demande de remboursement envoyée : 50,41")), "le professeur envoie sa demande : 42 km en voiture 5 CV, un péage et un repas");
t = await diallo.textContent("#frais");
ok(t.includes("42 km aller et retour · Voiture 5 CV") && t.includes("Envoyée, en attente de validation"), "la demande détaillée attend la validation");
await diallo.screenshot({ path: `${OUT}/frais-demande.png`, fullPage: true });

/* ------------------- La gestion des PFMP : refus avec un motif, puis validation ------------------- */
await ddfpt.goto(BASE + "/");
ok((await ddfpt.textContent("main")).includes("demande(s) de remboursement de frais à valider"), "le tableau de bord signale la demande à valider");
await ddfpt.goto(BASE + "/frais");
const ligne = ddfpt.locator(".row", { hasText: "Awa DIALLO" });
ok((await ligne.textContent()).includes("50,41"), "la demande apparaît avec son total");
await ligne.locator("summary:has-text('Refuser')").click();
await ligne.locator("input[name=motif]").fill("Joignez le ticket de péage, ou retirez-le");
await ligne.locator("button:has-text('Confirmer le refus')").click();
ok(await visible(ddfpt.getByText("Demande refusée")), "le DDFPT renvoie la demande avec un motif");
await diallo.goto(urlRayan);
ok((await diallo.textContent("#frais")).includes("À reprendre : Joignez le ticket de péage"), "le professeur voit le motif");
await diallo.fill("#fr-peage", "");
await diallo.click("button:has-text('Renvoyer la demande')");
ok(await visible(diallo.getByText("Demande de remboursement envoyée : 46,91")), "il corrige et renvoie sa demande");
await ddfpt.goto(BASE + "/frais");
await ddfpt.locator(".row", { hasText: "Awa DIALLO" }).locator("button:has-text('Valider')").click();
ok(await visible(ddfpt.getByText("Demande validée : 46,91")), "le DDFPT valide la demande");
await ddfpt.goto(BASE + "/frais?statut=validee");
t = await ddfpt.textContent("main");
ok(t.includes("Récapitulatif par professeur") && t.includes("Awa DIALLO"), "le récapitulatif par professeur s'affiche");
await ddfpt.screenshot({ path: `${OUT}/frais-gestion.png`, fullPage: true });
const csv = await ddfpt.context().request.get(BASE + "/frais/export");
const texte = await csv.text();
ok(csv.headers()["content-type"].startsWith("text/csv") && texte.includes("DIALLO Awa") && texte.includes("46,91") && texte.includes("validée"), "l'export pour un tableur reprend la demande");
await ddfpt.goto(BASE + "/messages");
ok((await ddfpt.textContent("main")).includes("Frais de déplacement : demande validée"), "le professeur est prévenu par mail");
await diallo.goto(urlRayan);
ok((await diallo.textContent("#frais")).includes("Validée le") && await diallo.locator("summary:has-text('Modifier la demande')").count() === 0, "une demande validée ne se modifie plus");

/* ------------------- Accès ------------------- */
const martin = await session("p.martin");
await martin.goto(BASE + "/frais");
ok(!martin.url().includes("/frais"), "un professeur n'accède pas aux frais de ses collègues");
await martin.goto(BASE + "/organisation/frais");
ok(!martin.url().includes("/organisation/frais"), "ni au barème du lycée");

await fin();
