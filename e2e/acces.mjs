// Accès et droits du DDFPT : comptes et fiches de connexion, connexion sans mot de passe, calendrier des PFMP,
// rattrapages vus par les professeurs de la classe, dépôt d'un document papier par le professeur référent.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { writeFileSync } from "node:fs";
import { BASE, D, OUT, ok, visible, session, fin, browser } from "./outils.mjs";

const pdf = `${OUT}/attestation.pdf`;
writeFileSync(pdf, "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");

/* ------------------- Le référent ne crée pas les comptes et ne fixe pas les dates ------------------- */
const martin = await session("p.martin");
await martin.goto(BASE + "/eleves?q=moreau");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('MOREAU')")]);
let t = await martin.textContent("main");
ok(t.includes("Les comptes et les mots de passe sont créés par le DDFPT") && await martin.locator("summary:has-text('Ajouter un responsable')").count() === 0, "le professeur référent ne crée pas les comptes : c'est le DDFPT");
await martin.goto(BASE + "/classes");
await Promise.all([martin.waitForURL(/\/classes\/[0-9a-f-]{36}/), martin.click("a.row:has-text('2nde MS')")]);
const ficheClasse = martin.url();
t = await martin.textContent("main");
ok(t.includes("Les dates de PFMP sont fixées par le DDFPT") && await martin.locator("button:has-text('Ajouter la période')").count() === 0, "ni les dates de PFMP de sa classe");

/* ------------------- Le DDFPT : comptes et fiches de connexion de la classe ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(ficheClasse);
ok(await ddfpt.locator("button:has-text('Ajouter la période')").count() === 1, "le DDFPT fixe les dates de PFMP");
await ddfpt.goto(BASE + "/eleves");
await Promise.all([ddfpt.waitForURL(/\/eleves\/acces/), ddfpt.click("a:has-text('Comptes et fiches de connexion')")]);
await Promise.all([ddfpt.waitForURL(/classe=/), ddfpt.click("a.chip:has-text('CAP AS')")]);
t = await ddfpt.textContent("main");
ok(t.includes("AMRANI") && t.includes("Pas de compte") && t.includes("Fatou TRAORÉ (jamais connecté)"), "il voit où en sont les comptes des élèves et des parents");
await ddfpt.click("button:has-text('Créer les comptes et préparer les fiches')");
ok(await visible(ddfpt.getByText("5 fiche(s) prête(s) : 4 compte(s) d'élève créé(s), 1 nouveau(x) mot(s) de passe")), "il crée les comptes de la classe en un clic");
ok(await ddfpt.locator(".fiche").count() === 5 && await ddfpt.locator(".fiche-qr svg").count() === 5, "une fiche par élève et par parent, avec un QR code");
t = await ddfpt.textContent(".fiches");
ok(t.includes(`kenza.amrani@${D}`) && t.includes("Responsable de Moussa TRAORÉ") && t.includes("Mot de passe provisoire"), "chaque fiche porte l'identifiant et le mot de passe provisoire");
await ddfpt.screenshot({ path: `${OUT}/acces-fiches.png`, fullPage: true });
const mdpKenza = (await ddfpt.locator(".fiche", { hasText: "Kenza AMRANI" }).locator(".fiche-mdp").textContent()).trim();
{
  const p = await (await browser.newContext()).newPage();
  await p.goto(BASE + `/connexion?email=${encodeURIComponent(`kenza.amrani@${D}`)}`);
  ok((await p.inputValue("#email")) === `kenza.amrani@${D}`, "le QR code ouvre la page de connexion avec l'identifiant déjà rempli");
  await p.fill("#motdepasse", mdpKenza);
  await Promise.all([p.waitForURL(/mot-de-passe/), p.click("button:has-text('Se connecter')")]);
  ok(true, "l'élève se connecte avec sa fiche et doit choisir son mot de passe");
}

/* ------------------- Connexion sans mot de passe ------------------- */
const anonyme = await (await browser.newContext()).newPage();
await anonyme.goto(BASE + "/connexion");
await anonyme.click("summary:has-text('Me connecter sans mot de passe')");
await anonyme.fill("#lien-email", `l.rahmani@${D}`);
await anonyme.click("button:has-text('Recevoir le lien')");
ok(await visible(anonyme.getByText("un lien de connexion vient d'y être envoyé")), "un parent demande un lien de connexion");
await anonyme.fill("#lien-email", `p.martin@${D}`);
await anonyme.click("button:has-text('Recevoir le lien')");
await visible(anonyme.getByText("un lien de connexion vient d'y être envoyé"));
const dir = await session("direction");
await dir.goto(BASE + "/messages");
const corps = await dir.locator("details.row", { hasText: "Votre lien de connexion à Cap PFMP" }).filter({ hasText: `l.rahmani@${D}` }).first().locator("pre").textContent();
const lien = corps.match(/\/connexion\/lien\/[\w-]+/)?.[0];
ok(!!lien && corps.includes("valable 15 minutes"), "le lien arrive par mail, valable 15 minutes");
ok(await dir.locator("details.row", { hasText: "Votre lien de connexion" }).filter({ hasText: `p.martin@${D}` }).count() === 0, "l'équipe du lycée garde son mot de passe : pas de lien pour elle");
const leila = await (await browser.newContext()).newPage();
await leila.goto(BASE + lien);
ok((await leila.textContent("main")).includes("Bonjour Leïla"), "le lien ouvre une page de connexion personnelle");
await Promise.all([leila.waitForURL((u) => !u.pathname.startsWith("/connexion")), leila.click("button:has-text('Me connecter')")]);
await leila.waitForLoadState("networkidle");
ok(leila.url().includes("/mon-enfant"), "le parent est connecté sans mot de passe");
const autre = await (await browser.newContext()).newPage();
await autre.goto(BASE + lien);
ok((await autre.textContent("main")).includes("Lien expiré"), "le lien ne sert qu'une fois");

/* ------------------- Calendrier des PFMP, visible par tous ------------------- */
const ines = await session("ines.haddad");
ok(await ines.locator("nav a", { hasText: "Calendrier" }).count() === 1, "le calendrier est dans le menu de l'élève");
await ines.goto(BASE + "/calendrier");
t = await ines.textContent("main");
ok(["CAP AS", "2nde MS", "1re MS", "Tle MS"].every((c) => t.includes(c)) && t.includes("du 16 novembre 2026 au 11 décembre 2026"), "l'élève voit les dates de PFMP de toutes les classes");
ok(!t.includes("Rattrapages") && !t.includes("Modifier les dates"), "sans les rattrapages des autres élèves, et sans pouvoir modifier les dates");
ok(await ines.locator(".frise-barre").count() >= 4, "une frise montre toute l'année d'un coup d'œil");
const ferhat = await session("k.ferhat");
await ferhat.goto(BASE + "/calendrier");
ok((await ferhat.textContent("main")).includes("Tle MS"), "l'entreprise voit aussi le calendrier");
await ddfpt.goto(BASE + "/calendrier");
ok(await ddfpt.locator("a:has-text('Modifier les dates')").count() === 1, "le DDFPT peut modifier les dates");
await ddfpt.screenshot({ path: `${OUT}/acces-calendrier.png`, fullPage: true });

/* ------------------- Rattrapages : les professeurs de la classe ------------------- */
const garnier = await session("m.garnier");
await garnier.goto(BASE + "/calendrier");
t = await garnier.textContent("#rattrapages");
ok(t.includes("RAHMANI") && t.includes("du 26 octobre 2026 au 30 octobre 2026") && !t.includes("maladie"), "un professeur de la classe voit le rattrapage, sans le motif");
const benali = await session("s.benali");
await benali.goto(BASE + "/calendrier");
ok((await benali.textContent("#rattrapages")).includes("absence pour maladie"), "la professeure référente voit aussi le motif");
const leroy = await session("h.leroy");
await leroy.goto(BASE + "/calendrier");
ok(!(await leroy.textContent("main")).includes("RAHMANI"), "un professeur qui n'enseigne pas dans la classe ne le voit pas");
await benali.goto(BASE + "/eleves?q=nguyen");
await Promise.all([benali.waitForURL(/\/eleves\/[0-9a-f-]{36}/), benali.click("a.row:has-text('NGUYEN')")]);
await benali.click("summary:has-text('Programmer un rattrapage')");
await benali.selectOption("#ra-periode", { index: 1 });
await benali.fill("#ra-motif", "stage interrompu par l'entreprise");
await benali.fill("#ra-debut", "2026-11-09");
await benali.fill("#ra-fin", "2026-11-13");
await benali.click("button:has-text('Programmer le rattrapage')");
ok(await visible(benali.getByText("Rattrapage programmé")), "la référente programme un rattrapage");
await dir.goto(BASE + "/messages");
const pourGarnier = await dir.locator("details.row", { hasText: "Rattrapage de PFMP : Clara NGUYEN" }).filter({ hasText: `m.garnier@${D}` }).first().locator("pre").textContent();
ok(pourGarnier.includes("absent de vos cours") && !pourGarnier.includes("interrompu"), "les professeurs de la classe sont prévenus par mail, sans le motif");
const pourVieScolaire = await dir.locator("details.row", { hasText: "Rattrapage de PFMP : Clara NGUYEN" }).filter({ hasText: `vie.scolaire@${D}` }).first().locator("pre").textContent();
ok(pourVieScolaire.includes("stage interrompu par l'entreprise"), "la vie scolaire reçoit le motif");

/* ------------------- Dépôt d'un document papier par le professeur référent ------------------- */
await dir.goto(BASE + "/organisation");
await dir.check("input[name=gestion][value=ddfpt]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(dir.getByText("Organisation enregistrée")), "le lycée confie la gestion des PFMP au DDFPT");
await martin.goto(BASE + "/mes-eleves");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('MOREAU')")]);
const carte = martin.locator(".card", { hasText: "Attestation de stage" }).first();
await carte.locator("[id^='f-attestation-']").setInputFiles(pdf);
await carte.locator("button:has-text('Déposer le document signé')").click();
ok(await visible(martin.getByText("Document déposé et validé")), "le référent dépose une attestation reçue sur papier, validée d'office");

/* ------------------- Calendrier public, sans compte ------------------- */
await dir.goto(BASE + "/organisation");
await dir.check("input[name=calendrierPublic][value=oui]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(dir.getByText("Organisation enregistrée")), "la direction rend le calendrier public");
await dir.goto(BASE + "/organisation");
const lienPublic = await dir.locator("a[href^='/pfmp/']").getAttribute("href");
const public_ = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await public_.goto(BASE + lienPublic);
t = await public_.textContent("main");
ok(t.includes("Calendrier des PFMP") && t.includes("Tle MS") && !t.includes("RAHMANI"), "le calendrier public montre les dates, sans aucun nom d'élève");
ok((await public_.evaluate(() => document.documentElement.scrollWidth)) <= 390, "il tient sur un téléphone");

await fin();
