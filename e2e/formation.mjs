// Formation incluse (décisions d'Anissa) : visite guidée à la première connexion et bouton « ? », lycée d'entraînement
// (données fictives, on s'y met à la place d'un élève, d'un parent ou d'une entreprise), missions, quiz, attestation.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { BASE, D, MDP, OUT, ok, visible, session, fin, browser } from "./outils.mjs";

function texteDuPdf(octets, nom) {
  const f = `${OUT}/${nom}.pdf`;
  writeFileSync(f, octets);
  try { return execFileSync("pdftotext", [f, "-"]).toString().replace(/\s+/g, " "); } catch { return null; }
}

/* ------------------- La visite guidée, à la première connexion ------------------- */
const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
await p.goto(BASE + "/connexion");
await p.fill("#email", `ddfpt@${D}`);
await p.fill("#motdepasse", MDP);
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/connexion")), p.click("button:has-text('Se connecter')")]);
ok(await visible(p.getByRole("dialog").getByText("Bienvenue dans Cap PFMP")), "la visite guidée s'ouvre à la première connexion");
for (let i = 0; i < 5; i++) await p.click("[role=dialog] button:has-text('Suivant')");
ok((await p.textContent("[role=dialog]")).includes("Pour vous entraîner"), "elle présente les pages de la gestion des PFMP, étape par étape");
await p.click("[role=dialog] button:has-text('Terminer')");
await p.waitForTimeout(500);
await p.reload();
ok(await p.locator("[role=dialog]").count() === 0, "elle ne revient pas à la connexion suivante");
await p.click("button[aria-label='Aide de cette page']");
ok((await p.textContent("[role=dialog]")).includes("Tableau de bord"), "le bouton « ? » explique la page");
await p.click("[role=dialog] button:has-text('Revoir la visite guidée')");
ok(await visible(p.getByRole("dialog").getByText("Visite guidée · 1 sur 6")), "et permet de revoir la visite guidée");
await p.click("[role=dialog] button:has-text('Passer la visite')");

/* ------------------- Le lycée d'entraînement ------------------- */
const ddfpt = p;
await ddfpt.goto(BASE + "/formation");
let t = await ddfpt.textContent("main");
ok(t.includes("Fixer les dates d'une PFMP") && t.includes("À faire"), "la formation liste les missions de la gestion des PFMP");
await ddfpt.click("button:has-text(\"Créer et ouvrir mon lycée d'entraînement\")");
await ddfpt.waitForURL(BASE + "/");
t = await ddfpt.textContent("body");
ok(t.includes("Lycée d'entraînement : données fictives, rien n'en sort") && t.includes("Lycée d'entraînement de Julien"), "le DDFPT entre dans son lycée d'entraînement");
await ddfpt.screenshot({ path: `${OUT}/formation-entrainement.png`, fullPage: true });
// Mission : fixer les dates d'une PFMP
await ddfpt.goto(BASE + "/classes");
await Promise.all([ddfpt.waitForURL(/\/classes\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('2nde (entraînement)')")]);
await ddfpt.locator(".row", { has: ddfpt.locator("input[id^='pd-']") }).locator("button:has-text('Enregistrer')").click();
await visible(ddfpt.getByText("Période mise à jour."));
// Mission : les fiches de connexion d'une classe
await ddfpt.goto(BASE + "/eleves/acces");
await Promise.all([ddfpt.waitForURL(/classe=/), ddfpt.click("a.chip:has-text('2nde (entraînement)')")]);
await ddfpt.click("button:has-text('Créer les comptes et préparer les fiches')");
await visible(ddfpt.getByText("fiche(s) prête(s)"));
// Mission : envoyer une convention, puis la signer à la place de l'élève
await ddfpt.goto(BASE + "/eleves");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('ESSAI')")]);
await ddfpt.click("button:has-text('Envoyer la convention aux signataires')");
await ddfpt.waitForTimeout(800);
await ddfpt.click(".bandeau-entrainement button:has-text('Un élève')");
await ddfpt.waitForURL(/\/mon-stage/);
ok((await ddfpt.textContent("main")).includes("Bonjour Léo"), "il se met à la place d'un élève");
const signature = ddfpt.locator("form", { has: ddfpt.locator("button:has-text(\"Je signe en tant qu'élève\")") });
await signature.locator("input[name=lu]").check();
await signature.locator("button:has-text(\"Je signe en tant qu'élève\")").click();
await visible(ddfpt.getByText("Signature enregistrée"));
await ddfpt.click(".bandeau-entrainement button:has-text(\"L'équipe (moi)\")");
await ddfpt.waitForURL(BASE + "/");
// Mission : adapter un modèle de document
await ddfpt.goto(BASE + "/organisation/documents/attestation");
await ddfpt.fill("#mp-titre", "Attestation d'entraînement");
await ddfpt.click("button:has-text('Enregistrer le modèle')");
await visible(ddfpt.getByText("Modèle enregistré"));
// Mission : les relances du jour, sans que rien ne sorte
await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
await ddfpt.waitForTimeout(800);
await ddfpt.click(".bandeau-entrainement button:has-text('Revenir à mon lycée')");
await ddfpt.waitForURL(/\/formation/);
t = await ddfpt.textContent("#missions");
ok(await ddfpt.locator("#missions .row").filter({ hasText: "Réussie" }).count() === 6, "les six missions sont réussies, cochées toutes seules");
ok(!(await ddfpt.textContent("body")).includes("Lycée d'entraînement : données fictives"), "il revient dans son vrai lycée");

/* ------------------- Le quiz et l'attestation ------------------- */
ok((await ddfpt.textContent("#attestation")).includes("dès que toutes les missions et le quiz sont réussis"), "l'attestation attend le quiz");
const bonnes = [1, 0, 1, 1, 1];
// Deux erreurs : 3 sur 5.
for (let i = 0; i < 5; i++) await ddfpt.check(`input[name=q_${i}][value='${i < 2 ? 1 - bonnes[i] : bonnes[i]}']`);
await ddfpt.click("button:has-text('Valider mes réponses')");
ok(await visible(ddfpt.getByText("il faut 4 bonnes réponses")), "un quiz raté se repasse");
for (let i = 0; i < 5; i++) await ddfpt.check(`input[name=q_${i}][value='${bonnes[i]}']`);
await ddfpt.click("button:has-text('Valider mes réponses')");
ok(await visible(ddfpt.getByText("Quiz réussi : 5 sur 5.")), "le quiz est réussi");
await ddfpt.reload();
const att = await ddfpt.context().request.get(BASE + await ddfpt.locator("a:has-text('Ouvrir mon attestation (PDF)')").getAttribute("href"));
t = texteDuPdf(await att.body(), "formation-attestation");
ok(att.headers()["content-type"] === "application/pdf" && (t === null || (t.includes("Attestation de prise en main de Cap PFMP") && t.includes("Julien ROUSSEL") && t.includes("5 sur 5"))), "l'attestation de prise en main est prête");

/* ------------------- Rien ne sort du lycée d'entraînement ; remise à zéro ------------------- */
await ddfpt.goto(BASE + "/messages");
ok(!(await ddfpt.textContent("main")).includes("ESSAI"), "aucun message du lycée d'entraînement dans le vrai lycée");
await ddfpt.goto(BASE + "/formation");
await ddfpt.click("#entrainement button:has-text('Remettre à zéro')");
ok(await visible(ddfpt.getByText("Lycée d'entraînement remis à zéro")), "le lycée d'entraînement se remet à zéro");

/* ------------------- Accès ------------------- */
const ines = await session("ines.haddad");
await ines.goto(BASE + "/formation");
ok(await ines.locator("button:has-text(\"lycée d'entraînement\")").count() === 0, "un élève n'a pas de lycée d'entraînement : la visite guidée suffit");

await fin();
