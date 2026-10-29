// Horaires du stage (décision d'Anissa) : par défaut, chaque heure se choisit dans une liste de demi-heures (8 h 00,
// 8 h 30…) ; chaque lycée choisit la plage proposée, ou revient à la saisie libre, à la minute près.
// Données de démonstration fraîches (npm run db:seed), application lancée avec CAP_PFMP_DATE_DU_JOUR=2026-10-26.
import { execFileSync } from "node:child_process";
import { BASE, ok, session, fin, visible } from "./outils.mjs";

const sql = (q) => execFileSync("psql", [process.env.DATABASE_URL, "-Atc", q]).toString().trim();
const ddfpt = await session("ddfpt");
const ficheMoreau = async () => {
  await ddfpt.goto(BASE + "/eleves");
  await Promise.all([ddfpt.waitForURL(/\/eleves\/[0-9a-f-]{36}/), ddfpt.click("a.row:has-text('MOREAU')")]);
  await ddfpt.click("summary:has-text('Modifier le lieu ou les horaires')");
};

await ficheMoreau();
let options = await ddfpt.locator("select[name=debut_0] option").allTextContents();
ok(options.length === 49 && options.includes("08 h 00") && options.includes("08 h 30") && options.includes("23 h 30") && !options.includes("08 h 15"), "par défaut, une liste de demi-heures, toute la journée");
await ddfpt.selectOption("select[name=debut_0]", "09:30");
await ddfpt.click("button:has-text('Enregistrer le stage')");
await ddfpt.waitForURL(/msg=/);
ok(sql("select horaires->0->0->>0 from stages s join eleves e on e.id = s.eleve_id where e.nom = 'MOREAU'") === "09:30", "l'heure choisie est enregistrée");

await ddfpt.goto(BASE + "/organisation");
await ddfpt.selectOption("#horairesDebut", "06:00");
await ddfpt.selectOption("#horairesFin", "22:00");
await ddfpt.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await visible(ddfpt.getByText("Organisation enregistrée")), "le lycée choisit la plage proposée");
sql("update stages set horaires = jsonb_set(horaires, '{1,0,0}', '\"08:15\"') where eleve_id = (select id from eleves where nom = 'MOREAU')");
await ficheMoreau();
options = await ddfpt.locator("select[name=debut_0] option").allTextContents();
ok(options.length === 34 && options[1] === "06 h 00" && options.at(-1) === "22 h 00", "la liste suit la plage du lycée (de 6 h 00 à 22 h 00)");
ok(await ddfpt.inputValue("select[name=debut_1]") === "08:15", "une heure déjà saisie hors demi-heure reste affichée telle quelle");

await ddfpt.goto(BASE + "/organisation");
await ddfpt.check("input[name=saisieHoraires][value=libre]");
await ddfpt.click("button:has-text(\"Enregistrer l'organisation\")");
await visible(ddfpt.getByText("Organisation enregistrée"));
await ficheMoreau();
ok(await ddfpt.locator("input[type=time][name=debut_0]").count() === 1, "en option, le lycée revient à la saisie libre, à la minute près");

await fin();
