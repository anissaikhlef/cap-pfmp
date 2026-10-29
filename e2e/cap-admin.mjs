// Cap Admin, après l'audit des agents (décisions d'Anissa) : jours de stage manquants dans toutes les classes (rappels à
// l'élève, aux parents, au référent et au DDFPT ; arrêt par le DDFPT ou le référent avec la raison), élève en difficulté
// (référent et DDFPT d'abord, mail à la famille en attente), retards de l'équipe avec les rappels aux professeurs préparés,
// point de la semaine (page et mail du lundi), option SMS.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26 (un lundi).
import { BASE, ok, session, fin, visible } from "./outils.mjs";

const ddfpt = await session("ddfpt");
const fiche = async (p, nom) => {
  await p.goto(BASE + "/eleves");
  await Promise.all([p.waitForURL(/\/eleves\/[0-9a-f-]{36}/), p.click(`a.row:has-text('${nom}')`)]);
};

/* ------------------- Jours de stage manquants ------------------- */
await fiche(ddfpt, "RAHMANI");
let t = await ddfpt.textContent("#manques");
ok(t.includes("5 jour(s) de stage à rattraper") && t.includes("PFMP 1 (1re MS) : 5 jour(s)"), "la fiche montre les jours de stage manquants (absences de la PFMP 1, hors année d'examen)");

// Un élève de terminale sans lieu de stage alors que la période a commencé.
await ddfpt.goto(BASE + "/eleves/nouveau");
await ddfpt.fill("#e-prenom", "Nour");
await ddfpt.fill("#e-nom", "SANSSTAGE");
await ddfpt.selectOption("#e-classe", { label: "Tle MS" });
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("button:has-text('Créer la fiche')")]);
const nour = ddfpt.url();
ok((await ddfpt.textContent("#manques")).includes("Pas en stage alors que la période « PFMP 1 » a commencé le 19 octobre 2026 : un rappel part tous les 2 jours"), "un élève pas en stage alors que sa période a commencé est repéré");

await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
await ddfpt.waitForURL(/msg=/);
await ddfpt.goto(BASE + "/messages");
t = await ddfpt.textContent("main");
ok(t.includes("Mehdi RAHMANI : 5 jour(s) de stage à rattraper") && t.includes("Jours de stage à rattraper pour Mehdi"), "le référent, le DDFPT et les parents sont prévenus des jours à rattraper");
ok(t.includes("Nour SANSSTAGE n'est pas en stage"), "et de l'élève qui n'est pas en stage");

await ddfpt.goto(nour);
await ddfpt.fill("textarea[name=raison]", "Inscription en cours d'annulation, suivie par la direction");
await ddfpt.locator("#manques input[name=moi]").check();
await ddfpt.click("button:has-text('Arrêter le rappel')");
ok(await visible(ddfpt.locator("text=Rappel arrêté pour l'élève, sa famille et vous")), "le DDFPT arrête le rappel, pour la famille et pour lui-même");
t = await ddfpt.textContent("#manques");
ok(t.includes("« Inscription en cours d'annulation, suivie par la direction »") && t.includes("Rappel arrêté pour l'élève et sa famille"), "la raison, écrite librement, est affichée");
await ddfpt.locator("#manques form:has(input[name=cible][value=famille]) button:has-text('Réactiver')").click();
ok(await visible(ddfpt.locator("text=Rappel réactivé")), "et peut le réactiver");

const martin = await session("p.martin");
await martin.goto(nour);
ok(!(await martin.locator("button:has-text('Arrêter le rappel')").count()), "un professeur qui n'est pas le référent ne peut pas arrêter le rappel");

/* ------------------- Élève en difficulté ------------------- */
await ddfpt.goto(BASE + "/mails-a-valider");
await ddfpt.click("button:has-text('Préparer les mails du jour')");
await ddfpt.waitForURL(/msg=/);
const difficulte = ddfpt.locator(".mail-agent", { hasText: "Emma LAURENT" }).filter({ hasText: "À envoyer seulement si vous le décidez" });
ok(await visible(difficulte) && await difficulte.count() === 1 && (await difficulte.textContent()).includes("lors de l'appel au tuteur"), "après un « non » à l'appel au tuteur, un mail à la famille attend la décision de l'équipe");
await ddfpt.goto(BASE + "/messages");
t = await ddfpt.textContent("main");
ok(t.includes("Cap Admin : Emma LAURENT en difficulté en stage") && t.includes("envoyez-le seulement si vous le décidez"), "le référent et le DDFPT sont prévenus d'abord");

/* ------------------- Retards de l'équipe et point de la semaine ------------------- */
await ddfpt.goto(BASE + "/point-de-la-semaine");
t = await ddfpt.textContent("main");
ok(t.includes("Mehdi RAHMANI") && t.includes("5 jour(s) à rattraper") && t.includes("Emma LAURENT"), "le point de la semaine liste les jours manquants et les élèves en difficulté");
const diallo = ddfpt.locator("#equipe .panel:has-text('Awa DIALLO')");
t = await diallo.textContent();
ok(t.includes("Compte rendu en retard · Rayan MANSOURI") && t.includes("Visite non prise · Adam CISSÉ"), "les retards de l'équipe, par professeur");
ok((await diallo.locator("textarea").inputValue()).includes("Petit rappel pour ces stages"), "le rappel au professeur est préparé");
await ddfpt.locator("#equipe input[name=prof]").evaluateAll((els) => els.forEach((e) => { e.checked = false; }));
await diallo.locator("input[name=prof]").check();
await diallo.locator("textarea").fill((await diallo.locator("textarea").inputValue()).replace("Petit rappel", "Petit rappel amical"));
await ddfpt.click("button:has-text('Envoyer les rappels')");
ok(await visible(ddfpt.locator("text=1 rappel(s) envoyé(s) aux professeurs")), "le DDFPT envoie le rappel en un clic");
ok((await ddfpt.textContent("#equipe")).includes("rappel envoyé le"), "le rappel envoyé est noté");
await ddfpt.goto(BASE + "/messages");
ok((await ddfpt.textContent("main")).includes("Petit rappel amical"), "le professeur reçoit le message relu par le DDFPT");

const r = await ddfpt.context().request.get(BASE + "/api/taches/quotidiennes", { headers: { authorization: "Bearer jeton-de-test-local-123456789" } });
ok(r.status() === 200, "la tâche du matin passe");
await ddfpt.goto(BASE + "/messages");
t = await ddfpt.textContent("main");
ok(t.includes("Point de la semaine du 26 octobre 2026") && t.includes("Le détail : ") && t.includes("/point-de-la-semaine"), "le lundi, le DDFPT reçoit le point de la semaine avec le lien");
ok(t.includes("retard(s) de l'équipe à suivre"), "et une alerte pour les nouveaux retards de l'équipe");
await martin.goto(BASE + "/point-de-la-semaine");
ok(!martin.url().includes("point-de-la-semaine"), "le point de la semaine est réservé au DDFPT et à la direction");

/* ------------------- Option SMS ------------------- */
await ddfpt.goto(BASE + "/mails-a-valider");
ok(!(await ddfpt.locator("text=aussi par SMS").count()), "sans l'option SMS du lycée, que des mails");
await ddfpt.goto(BASE + "/organisation/agents");
await ddfpt.locator("input[name=sms]").check();
await ddfpt.click("button:has-text('Enregistrer les agents')");
ok(await visible(ddfpt.locator("text=Réglages des agents enregistrés")), "le lycée prend l'option SMS");
await fiche(ddfpt, "RAHMANI");
await ddfpt.click("summary:has-text('Préparer un mail avec Cap Admin')");
await ddfpt.fill("#mail-consigne", "Rendez-vous jeudi avec le référent pour organiser le rattrapage");
await ddfpt.click("button:has-text('Préparer le mail')");
await ddfpt.waitForURL(/msg=/);
await ddfpt.goto(BASE + "/mails-a-valider");
const mehdi = ddfpt.locator(".mail-agent", { hasText: "Mehdi RAHMANI" }).filter({ hasText: "Rendez-vous jeudi" });
await mehdi.locator("> .actions > form:has(button:text-is('Envoyer')) input[name=sms]").check();
await mehdi.locator("button:text-is('Envoyer')").click();
ok(await visible(ddfpt.locator("text=et 1 SMS")), "la personne qui valide envoie aussi par SMS");
await ddfpt.goto(BASE + "/messages");
ok((await ddfpt.textContent("main")).includes("06 39 98 20 16"), "le SMS part au numéro du parent");

await fin();
