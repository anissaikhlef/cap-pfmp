// Prise de rendez-vous pour la visite de stage (demande d'Anissa) : le professeur propose ses créneaux et la forme de
// la visite — sur place, à distance, ou au choix de l'entreprise. L'entreprise choisit en ligne avec son lien personnel,
// sans compte, ou indique qu'aucun créneau ne lui convient ; le professeur et l'entreprise reçoivent la confirmation.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { BASE, D, OUT, ok, visible, session, fin, browser, erreurs } from "./outils.mjs";

const mail = (p, sujet, a) => p.locator("details.row", { hasText: sujet }).filter({ hasText: a ?? "" }).first().locator("pre").textContent();
const lienRdv = (t) => t?.match(/\/rendez-vous\/[\w-]+/)?.[0];
const visio = `https://visio.${D}/p-martin`;

/* ------------------- Le professeur propose ses créneaux, au choix de l'entreprise ------------------- */
const martin = await session("p.martin");
await martin.goto(BASE + "/visites");
const lucas = martin.locator(".row", { hasText: "MOREAU" });
await lucas.locator("select[name=visiteurId]").selectOption({ label: "Paul MARTIN" });
await lucas.locator("button:has-text('Enregistrer')").click();
await martin.waitForTimeout(1200);
await Promise.all([martin.waitForURL(/\/visites\/[0-9a-f-]{36}/), martin.locator(".row", { hasText: "MOREAU" }).locator("a:has-text('Détails')").click()]);
const urlLucas = martin.url();
ok(await martin.isChecked("#rendez-vous input[name=mode][value=les2]"), "par défaut, l'entreprise choisit entre une visite sur place et à distance");
await martin.fill("#cd-lien", visio);
await martin.click("button:has-text(\"Envoyer à l'entreprise\")");
ok(await visible(martin.getByText(`par mail à k.ferhat@${D}, avec un lien pour prendre rendez-vous en ligne`)), "le professeur envoie ses créneaux à l'entreprise, par SMS et par mail");
ok((await martin.textContent("#rendez-vous")).includes("en attente du choix de l'entreprise"), "la visite attend le choix de l'entreprise");
await martin.screenshot({ path: `${OUT}/rdv-professeur.png`, fullPage: true });

const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/messages");
let t = await mail(ddfpt, "Visite de stage de Lucas MOREAU : choisissez votre rendez-vous", `k.ferhat@${D}`);
const lien = lienRdv(t);
ok(!!lien && t.includes("sur place ou à distance, à votre choix") && t.includes("sans créer de compte"), "le tuteur reçoit les créneaux et son lien personnel par mail");
const envois = (await ddfpt.locator("details.row pre", { hasText: "Lucas MOREAU" }).allTextContents()).filter((x) => x.includes("/rendez-vous/"));
ok(envois.length === 2 && envois.every((x) => lienRdv(x) === lien), "le SMS porte le même lien");

/* ------------------- L'entreprise choisit en ligne, sans compte, depuis son téléphone ------------------- */
const entreprise = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
entreprise.on("pageerror", (e) => erreurs.push(`JS entreprise: ${e.message}`));
await entreprise.goto(BASE + lien);
t = await entreprise.textContent("main");
ok(t.includes("Paul MARTIN") && t.includes("Lucas MOREAU") && t.includes("sur place ou à distance, à votre choix") && await entreprise.locator("input[name=creneau]").count() === 3,
  "l'entreprise ouvre son lien sans compte : les trois créneaux du professeur");
ok((await entreprise.evaluate(() => document.documentElement.scrollWidth)) <= 390, "la page tient sur un téléphone");
const creneau = (await entreprise.locator("label.choice", { has: entreprise.locator("input[name=creneau][value='1']") }).textContent()).trim();
await entreprise.check("input[name=creneau][value='1']");
await entreprise.check("input[name=mode][value=distanciel]");
await entreprise.fill("#rdv-com", "Appelez le standard, je vous transfère.");
await entreprise.screenshot({ path: `${OUT}/rdv-choix.png`, fullPage: true });
await entreprise.click("button:has-text('Confirmer le rendez-vous')");
ok(await visible(entreprise.getByRole("heading", { name: "Rendez-vous confirmé" })), "l'entreprise confirme le deuxième créneau, à distance");
t = await entreprise.textContent("main");
ok(t.includes("à 14h") && t.includes("à distance") && await entreprise.locator(`a[href="${visio}"]`).count() === 1, "la confirmation reprend le créneau et le lien de visio du professeur, cliquable");
await entreprise.screenshot({ path: `${OUT}/rdv-entreprise.png`, fullPage: true });
await entreprise.goto(BASE + lien);
ok(await entreprise.locator("button:has-text('Confirmer le rendez-vous')").count() === 0 && (await entreprise.textContent("main")).includes("Rendez-vous confirmé"),
  "le lien ne sert qu'une fois : il rappelle ensuite le rendez-vous pris");

await martin.goto(urlLucas);
t = await martin.textContent("#rendez-vous");
ok(t.includes("à 14h00, à distance") && t.includes(visio) && t.includes("Appelez le standard"), "le professeur voit le rendez-vous, la forme choisie et le message de l'entreprise");
await martin.goto(BASE + "/mes-visites");
ok((await martin.textContent("main")).includes("à 14h00 · à distance"), "ses visites indiquent la visite à distance");
await ddfpt.goto(BASE + "/messages");
t = await mail(ddfpt, "Visite de Lucas MOREAU : rendez-vous pris", `p.martin@${D}`);
ok(t.includes(creneau) && t.includes("à distance") && t.includes("Appelez le standard"), "le professeur est prévenu par mail");
t = await mail(ddfpt, `Visite de stage de Lucas MOREAU : ${creneau}`, `k.ferhat@${D}`);
ok(t.includes("est confirmée") && t.includes("avec Paul MARTIN") && t.includes(visio), "l'entreprise reçoit la confirmation, avec le lien de visio");
const tuteur = await session("k.ferhat");
await tuteur.goto(BASE + "/stagiaires");
t = await tuteur.locator(".panel.pad.section", { hasText: "MOREAU" }).textContent();
ok(t.includes("Visite à distance prévue le") && t.includes(visio), "le tuteur retrouve le rendez-vous dans son espace");

/* ------------------- Sur place seulement : aucun créneau ne convient, le professeur en propose d'autres ------------------- */
const garnier = await session("m.garnier");
await Promise.all([garnier.waitForURL(/\/visites\/[0-9a-f-]{36}/), garnier.click("a.row:has-text('FONTAINE')")]);
const urlLea = garnier.url();
await garnier.check("#rendez-vous input[name=mode][value=presentiel]");
await garnier.click("button:has-text(\"Envoyer à l'entreprise\")");
ok(await visible(garnier.getByText(`par mail à rh@heliance.${D}`)), "une visite sur place : les créneaux partent vers l'entreprise");
await ddfpt.goto(BASE + "/messages");
t = await mail(ddfpt, "Visite de stage de Léa FONTAINE : choisissez votre rendez-vous", `rh@heliance.${D}`);
const lienLea = lienRdv(t);
ok(!!lienLea && t.includes("visite de stage sur place"), "le mail annonce une visite sur place");
await entreprise.goto(BASE + lienLea);
t = await entreprise.textContent("main");
ok(t.includes("Léa FONTAINE") && t.includes(", sur place.") && await entreprise.locator("input[name=mode]").count() === 0, "sur place seulement : l'entreprise n'a que le créneau à choisir");
await entreprise.click("summary:has-text('Aucun créneau ne me convient')");
await entreprise.fill("#rdv-dispo", "Plutôt le jeudi après-midi, après 14h.");
await entreprise.click("button:has-text('Envoyer au professeur')");
ok(await visible(entreprise.getByText("votre message est transmis au professeur")), "aucun créneau ne convient : l'entreprise donne ses disponibilités");
await garnier.goto(BASE + "/mes-visites");
ok((await garnier.textContent("main")).includes("Aucun créneau ne convient"), "ses visites le signalent au professeur");
await ddfpt.goto(BASE + "/messages");
ok((await mail(ddfpt, "Visite de Léa FONTAINE : aucun créneau ne convient", `m.garnier@${D}`)).includes("Plutôt le jeudi après-midi"), "il reçoit les disponibilités par mail");
await garnier.goto(urlLea);
ok((await garnier.textContent("#rendez-vous")).includes("Plutôt le jeudi après-midi"), "et les lit sur la page de la visite");
await garnier.fill("#cd-0", "2026-11-05");
await garnier.fill("#ch-0", "14:30");
await garnier.click("button:has-text('Renvoyer de nouveaux créneaux')");
ok(await visible(garnier.getByText("Créneaux envoyés")), "le professeur propose un jeudi après-midi");
await entreprise.goto(BASE + lienLea);
t = await entreprise.textContent("main");
ok(t.includes("Lien expiré") && t.includes("dernier message"), "l'ancien lien ne sert plus : la page renvoie au dernier message");
await ddfpt.goto(BASE + "/messages");
const nouveauLien = lienRdv(await mail(ddfpt, "Visite de stage de Léa FONTAINE : choisissez votre rendez-vous", `rh@heliance.${D}`));
ok(!!nouveauLien && nouveauLien !== lienLea, "un nouveau lien part avec les nouveaux créneaux");
await entreprise.goto(BASE + nouveauLien);
await entreprise.check("input[name=creneau][value='0']");
await entreprise.click("button:has-text('Confirmer le rendez-vous')");
ok(await visible(entreprise.getByRole("heading", { name: "Rendez-vous confirmé" })), "l'entreprise choisit le jeudi");
await garnier.goto(urlLea);
ok((await garnier.textContent("#rendez-vous")).includes("Rendez-vous le 5 novembre 2026 à 14h30, sur place"), "le professeur voit le rendez-vous sur place");

/* ------------------- Lien inventé ------------------- */
await entreprise.goto(BASE + "/rendez-vous/" + "x".repeat(43));
ok((await entreprise.textContent("main")).includes("Lien introuvable"), "un lien inventé ne mène à rien");

await fin();
