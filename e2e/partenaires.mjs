// Cap Partenaires, après l'audit des agents (décisions d'Anissa) : CV et lettre déposés (PDF ou photo, lus sur le serveur,
// nom et coordonnées retirés), lettre guidée sans écrire à la place de l'élève, fiche d'appel et d'entretien, entraînement,
// propositions pour toute une classe relues par le référent, nouvelles entreprises autour des communes des élèves (mail
// validé par le DDFPT), relance des démarches sans réponse.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26
// et CAP_PFMP_ANNUAIRE_FICTIF=oui (entreprises fictives, sans appel à l'annuaire public).
import { writeFileSync } from "node:fs";
import { BASE, OUT, ok, session, fin, visible, browser } from "./outils.mjs";

/** Une photo de CV (fictif), avec un nom et un numéro de téléphone. */
async function photoDeCv() {
  const p = await browser.newPage({ viewport: { width: 760, height: 420 } });
  await p.setContent(`<div style="font:24px Arial;padding:28px;line-height:1.5">Curriculum vitae<br>Inès HADDAD — 06 39 98 11 22<br>Formation : seconde Métiers de la sécurité, 2026<br>Expérience : aide à l'accueil d'un club de sport<br>Qualités : ponctuelle, sérieuse, à l'écoute</div>`);
  const img = await p.screenshot();
  await p.close();
  writeFileSync(`${OUT}/cv-photo.png`, img);
  return img;
}

/* ------------------- L'élève : CV en photo, lettre, entretien ------------------- */
const ines = await session("ines.haddad");
await ines.goto(BASE + "/mon-stage");
const bloc = ines.locator("#cap-partenaires");
ok(await bloc.count() === 1, "l'élève a Cap Partenaires dans « Mon stage »");
await bloc.locator("summary:has-text('Faire relire mon CV')").click();
await bloc.locator("input[name=fichier][id^=cv-f-]").setInputFiles({ name: "cv.png", mimeType: "image/png", buffer: await photoDeCv() });
await bloc.locator("form:has(input[id^=cv-f-]) button:has-text('Relire')").click();
ok(await visible(ines.getByText("Cap Partenaires a relu le CV.")), "l'élève dépose son CV en photo : il est lu sur le serveur, puis relu");
ok((await ines.textContent("#cap-partenaires")).includes("Tes coordonnées sont présentes"), "le nom et le téléphone ont été remplacés par des repères avant la relecture");
await ines.locator("#cap-partenaires summary:has-text('Faire relire mon CV')").click();
await ines.locator("#cap-partenaires input[name=fichier][id^=cv-f-]").setInputFiles({ name: "vide.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex") });
await ines.locator("#cap-partenaires form:has(input[id^=cv-f-]) button:has-text('Relire')").click();
ok(await visible(ines.getByText("Le document est illisible")), "une photo illisible est signalée simplement");

await ines.goto(BASE + "/mon-stage");
await ines.click("#cap-partenaires summary:has-text('Préparer ma lettre de motivation')");
await ines.fill("#cap-partenaires input[name=entreprise]", "Atlas Sûreté");
await ines.fill("#cap-partenaires textarea[name=pourquoi]", "J'aime le contact avec le public");
await ines.click("#cap-partenaires button:has-text('Me guider')");
ok(await visible(ines.getByText("Cap Partenaires t'a préparé un guide")), "l'élève répond aux questions pour sa lettre");
const guide = await ines.textContent("#guide-lettre");
ok(guide.includes("Présente-toi") && guide.includes("Atlas Sûreté"), "il reçoit l'ordre des idées, sans lettre écrite à sa place");
await ines.click("#cap-partenaires summary:has-text('Faire relire ma lettre')");
await ines.fill("#cap-partenaires textarea[id^=lettre-]", "Madame, Monsieur, je suis élève en seconde Métiers de la sécurité et je cherche un stage dans votre entreprise. Je suis sérieuse et ponctuelle. Cordialement.");
await ines.click("#cap-partenaires form:has(textarea[id^=lettre-]) button:has-text('Relire')");
ok(await visible(ines.getByText("Cap Partenaires a relu la lettre de motivation.")) && (await ines.textContent("#cap-partenaires")).includes("Explique pourquoi cette entreprise t'intéresse"), "la lettre est relue, avec ce qui manque");

await ines.click("#cap-partenaires summary:has-text('Préparer mon appel et mon entretien')");
await ines.fill("#cap-partenaires form:has(button:has-text('Préparer la fiche')) input[name=entreprise]", "Atlas Sûreté");
await ines.click("#cap-partenaires button:has-text('Préparer la fiche')");
ok(await visible(ines.getByText("Ta fiche pour l'appel et l'entretien est prête")) && (await ines.textContent("#fiche-entretien")).includes("Pourquoi avoir choisi notre entreprise"), "la fiche de l'appel et de l'entretien");
ok(!(await ines.locator("text=Répondre à l'oral").count()), "sans l'option du lycée, l'entraînement se fait par écrit");
await ines.click("#entrainement button:has-text(\"Commencer l'entraînement\")");
await visible(ines.getByText("L'entraînement commence"));
ok((await ines.textContent("#entrainement")).includes("Bonjour, présentez-vous"), "Cap Partenaires joue le tuteur et pose une question");
for (const r of ["Je suis Inès, en seconde.", "J'aime le contact avec le public.", "Je sais accueillir et orienter.", "Je demanderais de répéter la consigne."]) {
  await ines.fill("#entrainement textarea[name=reponse]", r);
  await ines.click("#entrainement button:has-text('Répondre')");
  await ines.locator("#entrainement", { hasText: r }).waitFor();
}
ok((await ines.textContent("#entrainement")).includes("Bilan : Bravo"), "après quelques réponses, le bilan et des conseils");

/* ------------------- Propositions pour toute une classe, relues par le référent ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/partenaires");
await ddfpt.selectOption("#p-classe", { label: "2nde MS" });
await ddfpt.click("button:has-text('Proposer pour les élèves sans stage')");
ok(await visible(ddfpt.getByText("Cap Partenaires a préparé des propositions pour 1 élève(s) sans stage")), "le DDFPT lance la recherche pour toute une classe");
await ines.goto(BASE + "/mon-stage");
ok(!(await ines.textContent("#cap-partenaires")).includes("Lieux de stage proposés"), "l'élève ne voit pas la proposition avant la relecture");
const martin = await session("p.martin");
await martin.goto(BASE + "/partenaires");
const prop = martin.locator("#a-relire form", { hasText: "Inès HADDAD" });
ok(await prop.count() === 1, "le référent de la classe a la proposition à relire");
await prop.locator("input[name=garder_0]").uncheck();
await prop.locator("button:has-text(\"Montrer à l'élève\")").click();
ok(await visible(martin.getByText(/Inès HADDAD voit maintenant \d+ lieu\(x\) de stage proposé\(s\)/)), "il retire une entreprise et montre la proposition");
await ines.goto(BASE + "/mon-stage");
ok((await ines.textContent("#cap-partenaires")).includes("relu par le référent"), "l'élève voit la proposition relue");
ok(!(await martin.locator("#prospection").count()), "la recherche de nouvelles entreprises est réservée au DDFPT");

/* ------------------- Nouvelles entreprises autour des communes des élèves ------------------- */
await ddfpt.goto(BASE + "/eleves");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('HADDAD')")]);
await ddfpt.fill("input[name=commune]", "12 rue de la Paix");
await ddfpt.click("form[id^=commune-] button:has-text('Enregistrer')");
ok(await visible(ddfpt.getByText("Indiquez seulement la commune")), "seulement la commune, jamais l'adresse");
await ddfpt.fill("input[name=commune]", "Issy-les-Moulineaux");
await ddfpt.click("form[id^=commune-] button:has-text('Enregistrer')");
ok(await visible(ddfpt.getByText("Commune enregistrée : Issy-les-Moulineaux")), "le DDFPT indique la commune de l'élève");
await ddfpt.goto(BASE + "/partenaires");
await ddfpt.selectOption("#p-formation", { label: "Bac Pro Métiers de la sécurité" });
await ddfpt.click("#prospection button:has-text('Chercher')");
await ddfpt.waitForURL(/formation=/);
const t = await ddfpt.textContent("#prospection");
ok(t.includes("Communes : Issy-les-Moulineaux") && t.includes("(fictive)"), "Cap Partenaires trouve des entreprises autour des communes des élèves");
await ddfpt.locator("#prospection input[name=prospect_0]").check();
await ddfpt.click("button:has-text('Préparer les mails de prise de contact')");
ok(await visible(ddfpt.getByText("1 mail(s) de prise de contact préparé(s)")), "un mail de prise de contact est préparé");
await ddfpt.goto(BASE + "/mails-a-valider");
const mail = ddfpt.locator(".mail-agent", { hasText: "Nouvelle entreprise pour Bac Pro Métiers de la sécurité" });
ok((await mail.textContent()).includes("adresse à indiquer"), "il attend la validation du DDFPT, qui indique l'adresse");
await mail.locator("> .actions > form:has(button:text-is('Envoyer')) input[name=a]").fill("contact@entreprise-fictive.demo.cap-pfmp.example");
await mail.locator("button:text-is('Envoyer')").click();
ok(await visible(ddfpt.getByText(/Mail envoyé à .*\(fictive\)/)), "le DDFPT l'envoie");

/* ------------------- Démarches sans réponse ------------------- */
await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
await ddfpt.waitForURL(/msg=/);
await ddfpt.goto(BASE + "/messages");
ok((await ddfpt.textContent("main")).includes("Relance Atlas Sûreté"), "7 jours après un contact sans réponse, l'élève est invité à relancer l'entreprise");

await fin();
