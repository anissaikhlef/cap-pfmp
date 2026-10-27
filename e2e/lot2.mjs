// Lot 2 : signatures (simple ou dessinée, lien personnel sans compte, référent en dernier), horaires en deux plages, règles des mineurs.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { BASE, D, OUT, ok, visible, session, fin, browser } from "./outils.mjs";

/** Dessine une signature dans le cadre, à la souris. */
async function dessiner(p) {
  await p.locator("canvas").first().scrollIntoViewIfNeeded();
  const b = await p.locator("canvas").first().boundingBox();
  await p.mouse.move(b.x + 20, b.y + 90);
  await p.mouse.down();
  await p.mouse.move(b.x + 90, b.y + 30, { steps: 8 });
  await p.mouse.move(b.x + 160, b.y + 110, { steps: 8 });
  await p.mouse.move(b.x + 240, b.y + 50, { steps: 8 });
  await p.mouse.up();
}

/* ------------------- Référent : envoyer la convention d'Aya ------------------- */
const martin = await session("p.martin");
await martin.goto(BASE + "/eleves?q=benkhelifa");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('BENKHELIFA')")]);
const ficheAya = martin.url();
let t = await martin.textContent("main");
ok(t.includes("Tuteur de stage") && t.includes("Représentant de l'entreprise") && t.includes("Signe en dernier"), "la convention attend le représentant, le tuteur, et le référent en dernier");
await martin.click("button:has-text('Envoyer la convention aux signataires')");
ok(await visible(martin.getByText("Convention envoyée : 2 message(s), dont 2 lien(s) personnel(s)")), "envoie un lien personnel au représentant et au tuteur, qui n'ont pas de compte");

const dir = await session("direction");
await dir.goto(BASE + "/messages");
const corpsRep = await dir.locator("details.row", { hasText: `À police@ville-demo.${D}` }).first().locator("pre").textContent();
const corpsSms = await dir.locator("details.row", { hasText: "À 06 39 98 00 07" }).first().locator("pre").textContent();
const lienRep = corpsRep.match(/\/signer\/[\w-]+/)?.[0];
const lienTuteur = corpsSms.match(/\/signer\/[\w-]+/)?.[0];
ok(!!lienRep && corpsRep.includes("sans créer de compte"), "le représentant reçoit le lien par mail");
ok(!!lienTuteur, "le tuteur, sans adresse e-mail, reçoit le lien par SMS");

/* ------------- Représentant de l'entreprise : signature dessinée, sur téléphone ------------- */
const rep = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await rep.goto(BASE + lienRep);
t = await rep.textContent("body");
ok(t.includes("Vous signez en tant que représentant de l'entreprise") && t.includes("Convention relative à la période de formation"), "le lien ouvre la convention à signer, sans compte");
ok((await rep.evaluate(() => document.documentElement.scrollWidth)) <= 390, "la page de signature tient sur un téléphone");
await rep.fill("#sl-nom", "D. Roche");
await rep.check("input[name=modele][value=dessinee]");
await rep.check("input[name=lu]");
await rep.click("button:has-text(\"Je signe pour l'entreprise\")");
ok(await visible(rep.getByText("Dessinez votre signature dans le cadre")), "refuse une signature dessinée vide");
await dessiner(rep);
await rep.click("button:has-text(\"Je signe pour l'entreprise\")");
ok(await visible(rep.getByText("Merci, la convention est signée")), "le représentant signe en dessinant sa signature");
await rep.screenshot({ path: `${OUT}/l2-signature-lien.png`, fullPage: true });
await rep.goto(BASE + lienRep);
ok((await rep.textContent("body")).includes("Merci, la convention est signée"), "le lien ne permet pas de signer deux fois");
await rep.goto(BASE + "/signer/" + "x".repeat(43));
ok((await rep.textContent("body")).includes("Lien introuvable"), "un lien inventé ne mène à rien");

/* ------------------- Tuteur : signature simple avec le lien reçu par SMS ------------------- */
const tut = await (await browser.newContext()).newPage();
await tut.goto(BASE + lienTuteur);
ok((await tut.inputValue("#sl-nom")) === "N. Simon", "le nom du tuteur est proposé");
await tut.check("input[name=lu]");
await tut.click("button:has-text('Je signe en tant que tuteur de stage')");
ok(await visible(tut.getByText("Merci, la convention est signée")), "le tuteur signe avec la signature simple");

/* ------------- Convention imprimable : la signature dessinée apparaît ------------- */
await martin.goto(ficheAya);
t = await martin.textContent("main");
ok(t.includes("(signature dessinée) par lien") && t.includes("En attente de : direction"), "le référent voit les signatures et attend la direction");
const lienConvention = await martin.locator("a:has-text('Voir la convention à imprimer')").getAttribute("href");
await martin.goto(BASE + lienConvention);
ok(await martin.locator("img[alt=\"Signature : représentant de l'entreprise\"]").count() === 1, "la signature dessinée apparaît sur la convention");
ok((await martin.textContent("main")).includes("D. Roche"), "avec le nom du signataire");
await martin.screenshot({ path: `${OUT}/l2-convention.png`, fullPage: true });

/* ------------- Direction, puis le référent prévenu qu'il signe en dernier ------------- */
await dir.goto(BASE + "/a-signer");
await dir.locator(".row", { hasText: "BENKHELIFA" }).locator("button:has-text('Signer')").click();
ok(await visible(dir.getByText("Signature enregistrée (direction)")), "la direction signe avant le référent");
await dir.goto(BASE + "/messages");
ok((await dir.textContent("main")).includes("Convention de Aya BENKHELIFA : à vous de signer en dernier"), "le référent est prévenu quand il ne manque plus que lui");
await martin.goto(ficheAya);
ok((await martin.textContent("main")).includes("ne respecte pas toutes les règles"), "il ne peut pas signer un stage hors règles (secteur public en 2nde)");

/* ------------- Lucas : le référent signe en dernier, en dessinant ------------- */
await martin.goto(BASE + "/eleves?q=moreau");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('MOREAU')")]);
await martin.check("input[name=modele][value=dessinee]");
await dessiner(martin);
await martin.check("input[name=lu]");
await martin.click("button:has-text('Je signe en tant que professeur référent')");
ok(await visible(martin.getByText("Signature enregistrée (professeur référent)")), "le référent signe en dernier avec sa signature dessinée");
ok(await visible(martin.locator(".pill", { hasText: "Signée par tous" })), "la convention de Lucas est complète");

/* ------------- Tuteur avec un compte : il signe en tant que tuteur dans son espace ------------- */
const ferhat = await session("k.ferhat");
const moussa = ferhat.locator(".panel.pad.section", { hasText: "TRAORÉ" }).first();
ok(await moussa.locator("button:has-text('Je signe en tant que tuteur de stage')").count() === 1, "le tuteur désigné signe aussi depuis son compte");

/* ------------------- Horaires en deux plages et règles des mineurs ------------------- */
await martin.goto(BASE + "/eleves?q=haddad");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('HADDAD')")]);
const ficheInes = martin.url();
await martin.selectOption("#s-ent", { label: "Atlas Sûreté (Issy-les-Moulineaux)" });
for (let i = 0; i < 5; i++) {
  await martin.uncheck(`input[name=repos_${i}]`);
  await martin.fill(`input[name=debut_${i}]`, "08:30");
  await martin.fill(`input[name=fin_${i}]`, "12:00");
  if (i < 4) { await martin.fill(`input[name=debut2_${i}]`, "13:00"); await martin.fill(`input[name=fin2_${i}]`, "16:30"); }
}
await martin.click("button:has-text('Enregistrer le stage')");
ok(await visible(martin.getByText("Stage enregistré")), "enregistre des horaires en deux plages");
await martin.goto(ficheInes);
t = await martin.textContent("main");
ok(t.includes("08:30 – 12:00 · 13:00 – 16:30") && t.includes("31 h 30 par semaine"), "affiche le matin et l'après-midi, et le total");
ok(t.includes("Élève mineur : 8 h de travail par jour au maximum") && !t.includes("Non respecté : Élève mineur"), "les règles des mineurs sont respectées");
ok(t.includes("Tuteur : K. Ferhat"), "le tuteur de la fiche entreprise est désigné par défaut");
await martin.click("summary:has-text('Modifier le lieu ou les horaires')");
for (let i = 0; i < 4; i++) { await martin.fill(`input[name=fin_${i}]`, "15:00"); await martin.fill(`input[name=debut2_${i}]`, ""); await martin.fill(`input[name=fin2_${i}]`, ""); }
await martin.click("button:has-text('Enregistrer le stage')");
await visible(martin.getByText("Stage"));
await martin.goto(ficheInes);
t = await martin.textContent("main");
ok(t.includes("Non respecté : Élève mineur : jamais plus de 4 h 30 sans pause"), "repère 6 h 30 de travail sans pause pour une élève mineure");
await martin.screenshot({ path: `${OUT}/l2-horaires.png`, fullPage: true });

/* ------------------- Organisation : modèles de signature et dernier signataire ------------------- */
await dir.goto(BASE + "/organisation");
await dir.check("input[name=signatureModele][value=simple]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(dir.getByText("Organisation enregistrée")), "la direction choisit la signature simple seulement");
const fatou = await session("f.traore");
ok(await fatou.locator("input[name=modele][value=dessinee]").count() === 0 && await fatou.locator("input[name=lu]").count() >= 1, "le parent ne voit plus que la signature simple");

await fin();
