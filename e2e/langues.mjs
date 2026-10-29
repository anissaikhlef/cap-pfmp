// Langue des familles (décisions d'Anissa) : indiquée par l'équipe ou choisie par les parents ; les messages aux parents
// et l'espace « Mon enfant » sont traduits, avec le français dessous ; une liste de langues, et le lycée en ajoute.
// Aucun nom ni coordonnée n'est envoyé à l'IA. Sans IA, l'application de test fait une traduction fictive (« [Arabe] … »).
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26
// et CAP_PFMP_TRADUCTION_FICTIVE=oui.
import { execFileSync } from "node:child_process";
import { BASE, ok, session, fin, visible } from "./outils.mjs";

const sql = (q) => execFileSync("psql", [process.env.DATABASE_URL, "-Atc", q]).toString().trim();

/* ------------------- Le lycée ajoute une langue ------------------- */
const ddfpt = await session("ddfpt");
await ddfpt.goto(BASE + "/organisation/agents");
ok((await ddfpt.textContent("main")).includes("Langues proposées : Arabe, Anglais, Espagnol, Portugais, Turc, Roumain, Russe, Ukrainien, Chinois, Tamoul, Ourdou, Bengali"), "la liste des langues les plus courantes");
await ddfpt.fill("#langues", "Soninké");
await ddfpt.click("button:has-text('Enregistrer les agents')");
ok(await visible(ddfpt.getByText("Réglages des agents enregistrés")), "le lycée ajoute une langue");

/* ------------------- Les parents choisissent leur langue ------------------- */
const leila = await session("l.rahmani");
await leila.goto(BASE + "/mon-enfant");
const choix = leila.locator("form[id^=langue-] select[name=langue]");
ok((await choix.locator("option").allTextContents()).some((o) => o.includes("Soninké")) && (await choix.locator("option").allTextContents()).some((o) => o.includes("العربية (Arabe)")), "les parents voient les langues, écrites dans leur langue");
await choix.selectOption("ar");
await leila.click("form[id^=langue-] button:has-text('Enregistrer')");
ok(await visible(leila.getByText("Langue de la famille : Arabe")), "un parent choisit l'arabe");
ok(await visible(leila.getByText("Affichage en Arabe, avec le français dessous")), "l'espace « Mon enfant » s'affiche dans sa langue");
const titre = leila.locator("[id^=eleve-] h2").first();
await leila.waitForFunction(() => !!document.querySelector("[id^=eleve-] h2[data-traduction]"), null, { timeout: 15000 }).catch(() => {});
ok((await titre.getAttribute("data-traduction")) === "[Arabe] Mehdi RAHMANI" && (await titre.getAttribute("data-traduction-rtl")) !== null, "chaque texte reçoit sa traduction (de droite à gauche pour l'arabe), le français reste dessous");
ok((await titre.textContent()).includes("Mehdi RAHMANI"), "le texte français est gardé");

/* ------------------- L'équipe le voit et les messages sont traduits ------------------- */
await ddfpt.goto(BASE + "/eleves");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('RAHMANI')")]);
ok(await ddfpt.locator("#langue select[name=langue]").inputValue() === "ar", "la langue de la famille figure sur la fiche de l'élève");
await ddfpt.goto(BASE + "/");
await ddfpt.click("button:has-text('Envoyer les relances du jour')");
await ddfpt.waitForURL(/msg=/);
await ddfpt.goto(BASE + "/messages");
const t = await ddfpt.textContent("main");
ok(t.includes("[Arabe] Bonjour Leïla") && t.includes("— Version française —") && t.includes("[Arabe] Jours de stage à rattraper pour Mehdi / Jours de stage à rattraper pour Mehdi"), "le message aux parents part dans leur langue, avec le français dessous");
ok(t.includes("Mehdi RAHMANI : 5 jour(s) de stage à rattraper") && !t.includes("[Arabe] Mehdi RAHMANI : 5"), "les messages à l'équipe restent en français");
ok(sql("select count(*) from traductions where texte ilike '%rahmani%' or texte ilike '%leïla%' or texte ilike '%mehdi%' or texte ilike '%@%'") === "0" && Number(sql("select count(*) from traductions")) > 0,
  "aucun nom ni adresse n'est gardé ni envoyé pour la traduction : des repères les remplacent");

/* ------------------- Retour au français ------------------- */
await ddfpt.goto(BASE + "/eleves");
await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('RAHMANI')")]);
await ddfpt.selectOption("#langue select[name=langue]", "");
await ddfpt.click("#langue button:has-text('Enregistrer')");
ok(await visible(ddfpt.getByText("Langue de la famille : français")), "l'équipe peut remettre le français");
await leila.goto(BASE + "/mon-enfant");
ok(!(await leila.getByText("Affichage en Arabe").count()), "l'espace « Mon enfant » repasse en français");

const martin = await session("p.martin");
await martin.goto(BASE + "/mon-enfant");
ok(!martin.url().includes("mon-enfant"), "seuls les parents ont l'espace « Mon enfant »");
const r = await martin.context().request.post(BASE + "/api/traduire", { data: { eleveId: "00000000-0000-0000-0000-000000000000", textes: ["Bonjour"] } });
ok(!(await r.text()).includes('"traductions"'), "et la traduction de l'espace leur est réservée");

await fin();
