// PDF du lycée sans champs (décision d'Anissa : « chaque lycée a ses modèles de documents, et au final on a la trace des
// documents signés ») : le DDFPT dépose son PDF, trace les zones à la souris et choisit ce que Cap PFMP y écrit ; les documents
// sont ensuite remplis dans ce PDF. Un ordre de mission signé garde le modèle du jour de sa signature.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { BASE, OUT, ok, visible, session, fin } from "./outils.mjs";

/** Le texte d'un PDF (avec pdftotext), ou null si l'outil n'est pas installé. */
function texteDuPdf(octets, nom) {
  const f = `${OUT}/${nom}.pdf`;
  writeFileSync(f, octets);
  try { return execFileSync("pdftotext", [f, "-"]).toString().replace(/\s+/g, " "); } catch { return null; }
}
/** Trace une zone sur la page 1 du PDF affiché, en points PDF (origine en bas à gauche, page A4 de 595 × 842). */
async function tracer(p, x, y, l, h) {
  const calque = p.locator("#zones-page-1");
  await calque.scrollIntoViewIfNeeded();
  const b = await calque.boundingBox();
  const k = b.width / 595;
  const vers = (px, py) => [b.x + px * k, b.y + (842 - py) * k];
  await p.mouse.move(...vers(x, y + h));
  await p.mouse.down();
  await p.mouse.move(...vers(x + l / 2, y + h / 2), { steps: 4 });
  await p.mouse.move(...vers(x + l, y), { steps: 4 });
  await p.mouse.up();
}
/** Dépose l'exemple de PDF sans champs du document, comme le ferait le DDFPT avec celui de son lycée. */
async function deposerExemple(p, type) {
  const r = await p.context().request.get(`${BASE}/organisation/documents/${type}/exemple`);
  const f = `${OUT}/exemple-${type}.pdf`;
  writeFileSync(f, await r.body());
  await p.setInputFiles("#mp-pdf", f);
  await p.click("button:has-text('Déposer le PDF')");
}

/* ------------------- L'attestation : le PDF du lycée, sans champs ------------------- */
const ddfpt = await session("ddfpt", { width: 1200, height: 1500 });
await ddfpt.goto(BASE + "/organisation/documents/attestation");
await deposerExemple(ddfpt, "attestation");
ok(await visible(ddfpt.getByText("PDF déposé : 1 page(s), sans champs à remplir")), "le DDFPT dépose un PDF sans champs");
await ddfpt.locator("#zones-page-1").waitFor();
await ddfpt.waitForTimeout(800);
// Les lignes de l'exemple : « Nom et prénom de l'élève » (y = 735), « Jours effectués » (y = 605), « Activités » (y = 553), cadre de signature.
await tracer(ddfpt, 232, 734, 300, 14);
await ddfpt.selectOption("#zone-src-0", "eleve.nomPrenom");
await tracer(ddfpt, 232, 604, 80, 14);
await ddfpt.selectOption("#zone-src-1", "attestation.joursEffectues");
await tracer(ddfpt, 232, 552, 300, 14);
await ddfpt.selectOption("#zone-src-2", "attestation.activites");
await tracer(ddfpt, 60, 420, 200, 60);
await ddfpt.selectOption("#zone-src-3", "attestation.signature");
await tracer(ddfpt, 320, 470, 200, 14);
await ddfpt.selectOption("#zone-src-4", "fixe");
await ddfpt.fill("#zone-fixe-4", "Fait à Ville-démo");
ok(await ddfpt.locator(".zone-pdf").count() === 5, "il trace cinq zones sur la page, à la souris");
await ddfpt.click("button:has-text('Enregistrer les zones')");
ok(await visible(ddfpt.getByText("5 zone(s) enregistrée(s).")) && (await ddfpt.inputValue("#zone-src-0")) === "eleve.nomPrenom", "et choisit ce que Cap PFMP écrit dans chacune");
await ddfpt.screenshot({ path: `${OUT}/zones-editeur.png`, fullPage: true });
await ddfpt.reload();
await ddfpt.locator("#zones-page-1").waitFor();
ok(await ddfpt.locator(".zone-pdf").count() === 5 && (await ddfpt.inputValue("#zone-src-1")) === "attestation.joursEffectues", "les zones sont gardées");
const reperage = await ddfpt.context().request.get(BASE + "/organisation/documents/attestation/apercu?reperage=1");
let t = texteDuPdf(await reperage.body(), "zones-reperage");
ok(t === null || (t.includes("Jours de stage effectués") && t.includes("Fait à Ville-démo")), "l'aperçu montre chaque zone avec sa donnée");
const apercu = await ddfpt.context().request.get(BASE + await ddfpt.locator("a:has-text('Aperçu rempli avec un stage')").getAttribute("href"));
t = texteDuPdf(await apercu.body(), "zones-apercu");
ok(t === null || (t.includes("ATTESTATION DE STAGE") && t.includes("Exemple : les activités réalisées")), "l'aperçu rempli avec un stage, dans le PDF du lycée");
await ddfpt.check("input[name=mode][value=pdf]");
await ddfpt.click("button:has-text('Enregistrer le choix')");
ok(await visible(ddfpt.getByText("Les nouveaux documents (attestations) sont remplis dans le PDF de votre lycée")), "le lycée choisit son propre PDF pour l'attestation");

// Le tuteur remplit l'attestation de Clara en ligne : elle est produite dans le PDF du lycée.
await ddfpt.goto(BASE + "/documents");
const deposee = ddfpt.locator(".row", { hasText: "Clara NGUYEN" }).filter({ hasText: "Attestation de stage" });
await deposee.locator("summary:has-text('Refuser')").click();
await deposee.locator("input[name=motif]").fill("Le cachet de l'entreprise manque");
await deposee.locator("button:has-text('Confirmer le refus')").click();
await visible(ddfpt.getByText("Document refusé"));
const tuteur = await session("k.ferhat");
await tuteur.goto(BASE + "/stagiaires");
const carte = tuteur.locator(".panel.pad.section", { hasText: "Clara NGUYEN" });
const form = carte.locator("form", { has: tuteur.locator("button:has-text(\"Signer l'attestation\")") });
await form.locator("textarea[name=activites]").fill("Contrôle d'accès et rondes sur le site client.");
await form.locator("input[name=lu]").check();
await form.locator("button:has-text(\"Signer l'attestation\")").click();
ok(await visible(tuteur.getByText("Attestation de Clara NGUYEN signée et transmise")), "le tuteur signe l'attestation");
const lien = await tuteur.locator(".panel.pad.section", { hasText: "Clara NGUYEN" }).locator("a[href^='/fichiers/']", { hasText: "attestation_nguyen" }).getAttribute("href");
t = texteDuPdf(await (await tuteur.context().request.get(BASE + lien)).body(), "zones-attestation-clara");
ok(t === null || (t.includes("ATTESTATION DE STAGE") && t.includes("Exemple fictif de document sans champs") && t.includes("NGUYEN Clara")
  && t.includes("Contrôle d'accès et rondes") && t.includes("Signé en ligne dans Cap PFMP") && t.includes("Fait à Ville-démo")), "l'attestation signée est le PDF du lycée, rempli dans ses zones");

/* ------------------- L'ordre de mission : figé à sa signature ------------------- */
await ddfpt.goto(BASE + "/organisation/documents/ordre_mission");
await deposerExemple(ddfpt, "ordre_mission");
await visible(ddfpt.getByText("PDF déposé"));
await ddfpt.locator("#zones-page-1").waitFor();
await ddfpt.waitForTimeout(800);
// « Élève » (y = 709), case « Véhicule personnel » (x = 50, y = 576), cadre « Signature de la direction ».
await tracer(ddfpt, 232, 708, 300, 14);
await ddfpt.selectOption("#zone-src-0", "eleve.nomPrenom");
await tracer(ddfpt, 50, 575, 10, 10);
await ddfpt.selectOption("#zone-src-1", "om.transport.vehicule");
await tracer(ddfpt, 60, 440, 200, 40);
await ddfpt.selectOption("#zone-src-2", "om.signature");
await ddfpt.click("button:has-text('Enregistrer les zones')");
ok(await visible(ddfpt.getByText("3 zone(s) enregistrée(s).")), "le DDFPT place les zones de son ordre de mission");
await ddfpt.check("input[name=mode][value=pdf]");
await ddfpt.click("button:has-text('Enregistrer le choix')");
await visible(ddfpt.getByText("sont remplis dans le PDF de votre lycée"));

// La direction signe l'ordre de mission de Léa : il garde le PDF du lycée, même si le lycée revient ensuite au modèle Cap PFMP.
const dir = await session("direction");
await dir.goto(BASE + "/a-signer");
await dir.locator(".row", { hasText: "visite de Léa FONTAINE" }).locator("button:has-text('Signer')").click();
ok(await visible(dir.getByText("Ordre de mission signé")), "la direction signe l'ordre de mission");
await ddfpt.goto(BASE + "/organisation/documents/ordre_mission");
await ddfpt.check("input[name=mode][value=cap_pfmp]");
await ddfpt.click("button:has-text('Enregistrer le choix')");
await visible(ddfpt.getByText("suivent le modèle Cap PFMP"));
await ddfpt.goto(BASE + "/visites");
await Promise.all([ddfpt.waitForURL(/\/visites\/[0-9a-f-]{36}/), ddfpt.locator(".row", { hasText: "FONTAINE" }).locator("a:has-text('Détails')").click()]);
const idVisite = ddfpt.url().match(/visites\/([0-9a-f-]{36})/)[1];
await ddfpt.goto(`${BASE}/ordres-mission/${idVisite}`);
ok(await ddfpt.locator("a:has-text('Ouvrir le document du lycée (PDF)')").count() === 1, "l'ordre de mission signé garde le modèle du jour de sa signature");
const om = await ddfpt.context().request.get(`${BASE}/ordres-mission/${idVisite}/pdf`);
t = texteDuPdf(await om.body(), "zones-ordre-mission");
ok(om.headers()["content-type"] === "application/pdf" && (t === null || (t.includes("ORDRE DE MISSION") && t.includes("FONTAINE Léa") && t.includes("Signé en ligne dans Cap PFMP"))),
  "il s'ouvre dans le PDF du lycée, rempli et signé");

/* ------------------- Accès ------------------- */
const martin = await session("p.martin");
ok((await martin.context().request.get(BASE + "/organisation/documents/attestation/apercu?original=1")).status() === 403, "seuls le DDFPT et la direction voient le PDF du modèle");

await fin();
