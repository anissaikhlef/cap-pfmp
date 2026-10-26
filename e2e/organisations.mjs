// Organisation « bureau des entreprises » : un compte BDE gère, le référent consulte et signe.
import { BASE, D, MDP, OUT, ok, visible, session, fin, browser } from "./outils.mjs";

const dir = await session("direction");
await dir.goto(BASE + "/organisation");
await dir.check("input[name=gestion][value=bde]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
await visible(dir.getByText("Organisation enregistrée"));
await dir.goto(BASE + "/equipe");
await dir.fill("#m-prenom", "Bruno"); await dir.fill("#m-nom", "Bde"); await dir.fill("#m-email", `bde@${D}`);
await dir.uncheck("input[name=roles][value=professeur]");
await dir.check("input[name=roles][value=gestionnaire]");
await dir.click("button:has-text('Créer le compte')");
const secret = (await dir.locator(".secret").textContent({ timeout: 8000 })).trim();

// Le compte BDE gère toutes les classes
const p = await (await browser.newContext()).newPage();
await p.goto(BASE + "/connexion");
await p.fill("#email", `bde@${D}`); await p.fill("#motdepasse", secret);
await Promise.all([p.waitForURL(/mot-de-passe/), p.click("button:has-text('Se connecter')")]);
await p.fill("#actuel", secret); await p.fill("#nouveau", "Bde-nouveau-2026"); await p.fill("#confirmation", "Bde-nouveau-2026");
await Promise.all([p.waitForURL(/connexion/), p.click("button:has-text('Enregistrer le mot de passe')")]);
await p.fill("#email", `bde@${D}`); await p.fill("#motdepasse", "Bde-nouveau-2026");
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/connexion")), p.click("button:has-text('Se connecter')")]);
const t = await p.textContent("main");
ok(["CAP AS", "2nde MS", "1re MS", "Tle MS"].every((c) => t.includes(c)), "le bureau des entreprises gère toutes les classes");

// Le référent consulte ses élèves et signe la convention
const martin = await session("p.martin");
ok(martin.url().includes("/mes-eleves"), "le référent arrive sur « Mes élèves »");
ok((await martin.textContent("main")).includes("BENKHELIFA"), "il voit les élèves de sa classe");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('BENKHELIFA')")]);
ok((await martin.textContent("main")).includes("Consultation"), "la fiche s'ouvre en consultation");
ok(!(await martin.locator("button:has-text('Enregistrer le stage')").count()), "il ne peut pas modifier le stage");
await martin.check("input[name=lu]");
await martin.click("button:has-text('Je signe en tant que professeur référent')");
ok(await visible(martin.getByText("Signature enregistrée")), "il signe la convention en tant que référent");
await martin.goto(BASE + "/visites");
ok(!martin.url().includes("/visites") || martin.url().includes("/mes-visites"), "il n'accède pas à la répartition des visites");

await fin();
