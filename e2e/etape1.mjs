// Parcours de bout en bout de l'étape 1, sur les données de démonstration.
// Usage : node e2e/etape1.mjs (application lancée sur BASE, par défaut http://localhost:3100)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH ?? "playwright");
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const MDP = "Demo-pfmp-2026";
const D = "demo.cap-pfmp.example";
const OUT = process.env.OUT ?? ".";
const erreurs = [];
const ok = (c, m) => { if (!c) erreurs.push(m); console.log(`${c ? "✓" : "✕"} ${m}`); };

const browser = await chromium.launch();
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erreurs.push(`JS ${email}: ${e.message}`));
  await p.goto(BASE + "/connexion");
  await p.fill("#email", `${email}@${D}`);
  await p.fill("#motdepasse", MDP);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/connexion")), p.click("button:has-text('Se connecter')")]);
  // Formation incluse : la visite guidée s'ouvre à la première connexion ; le parcours la passe.
  const passer = p.locator("button:has-text('Passer la visite')");
  if (await passer.waitFor({ timeout: 4000 }).then(() => true, () => false)) { await passer.click(); await p.waitForLoadState("networkidle"); }
  return p;
}

// 1. Mauvais mot de passe
{
  const p = await (await browser.newContext()).newPage();
  await p.goto(BASE + "/connexion");
  await p.fill("#email", `p.martin@${D}`); await p.fill("#motdepasse", "faux-mot-de-passe1");
  await p.click("button:has-text('Se connecter')");
  ok(await p.getByText("Adresse ou mot de passe incorrect").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "refuse un mauvais mot de passe");
}

// 2. Professeur référent de 2nde : ne voit que sa classe
const martin = await session("p.martin");
ok(martin.url().endsWith("/"), "le référent arrive sur le tableau de bord");
const tb = await martin.textContent("main");
ok(tb.includes("2nde MS") && !tb.includes("Tle MS"), "le référent ne voit que sa classe");
await martin.screenshot({ path: `${OUT}/e1-tableau-referent.png`, fullPage: true });
await martin.goto(BASE + "/eleves");
const liste = await martin.textContent("main");
ok(liste.includes("HADDAD") && !liste.includes("LAURENT"), "liste d'élèves limitée à sa classe");
ok(liste.includes("Hors règles"), "filtres affichés");
// Noah Petit a des horaires de nuit : règle non respectée
ok(liste.includes("hors règles : horaires de nuit"), "repère un stage hors règles et dit pourquoi");

// Accès refusé à un élève d'une autre classe : on récupère l'id via la direction
const dir = await session("direction");
await dir.goto(BASE + "/eleves");
const lienEmma = await dir.locator("a.row", { hasText: "LAURENT" }).getAttribute("href");
const r = await martin.goto(BASE + lienEmma);
ok(r.status() === 404, "le référent n'ouvre pas la fiche d'un élève d'une autre classe");

// Ajout d'un élève
await martin.goto(BASE + "/eleves/nouveau");
await martin.fill("#e-prenom", "Nora"); await martin.fill("#e-nom", "Test");
await martin.selectOption("#e-classe", { label: "2nde MS" });
await martin.fill("#e-naiss", "2010-05-05");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}$/), martin.click("button:has-text('Créer la fiche')")]);
ok((await martin.textContent("h1")).includes("Nora TEST"), "crée une fiche élève");

// Compte responsable : seuls le DDFPT et la direction créent les comptes (décision d'Anissa)
ok(await martin.locator("summary:has-text('Ajouter un responsable')").count() === 0, "le référent ne crée pas les comptes des familles");
await dir.goto(martin.url());
await dir.click("summary:has-text('Ajouter un responsable')");
await dir.fill("#r-prenom", "Sami"); await dir.fill("#r-nom", "Test"); await dir.fill("#r-email", `sami.test@${D}`);
await dir.click("button:has-text('Créer son accès')");
ok(await dir.locator(".secret").waitFor({ timeout: 8000 }).then(() => true, () => false), "la direction crée un accès responsable avec mot de passe provisoire");

// Import CSV
const csv = `nom;prenom;classe;date_naissance\nIMPORT;Alice;2nde MS;12/02/2010\nIMPORT;Bob;Tle MS;12/02/2008\n;Vide;2nde MS;\n`;
writeFileSync(`${OUT}/import.csv`, csv);
await martin.goto(BASE + "/eleves/import");
await martin.setInputFiles("#fichier", `${OUT}/import.csv`);
await martin.click("button:has-text('Importer')");
await martin.waitForSelector(".msg", { timeout: 10000 });
const rap = await martin.textContent("main");
ok(rap.includes("1 élève(s) ajouté(s)"), "importe uniquement les élèves de ses classes");
ok(rap.includes("inconnue ou non gérée") && rap.includes("Nom ou prénom manquant"), "explique les lignes refusées");

// Le référent n'a pas accès à l'organisation ni à l'équipe
const rOrg = await martin.goto(BASE + "/organisation");
ok(!martin.url().includes("/organisation"), "le référent est renvoyé hors de l'organisation");
void rOrg;

// 3. Direction : voit tout, modifie l'organisation, crée un compte
await dir.goto(BASE + "/");
const tbDir = await dir.textContent("main");
ok(["CAP AS", "2nde MS", "1re MS", "Tle MS"].every((c) => tbDir.includes(c)), "la direction voit toutes les classes");
await dir.screenshot({ path: `${OUT}/e1-tableau-direction.png`, fullPage: true });
await dir.goto(BASE + "/organisation");
await dir.check("input[name=gestion][value=bde]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
ok(await dir.getByText("Organisation enregistrée").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "enregistre l'organisation");
await dir.screenshot({ path: `${OUT}/e1-organisation.png`, fullPage: true });
// En mode BDE, un professeur sans rôle de gestion ne gère plus sa classe
await martin.goto(BASE + "/eleves");
ok(!martin.url().includes("/eleves"), "en mode bureau des entreprises, le référent ne gère plus la classe");
await dir.check("input[name=gestion][value=referent]");
await dir.click("button:has-text(\"Enregistrer l'organisation\")");
await dir.getByText("Organisation enregistrée").waitFor({ timeout: 5000 });

await dir.goto(BASE + "/equipe");
await dir.fill("#m-prenom", "Nadia"); await dir.fill("#m-nom", "Test"); await dir.fill("#m-email", `n.test@${D}`);
await dir.click("button:has-text('Créer le compte')");
const secret = (await dir.locator(".secret").textContent({ timeout: 5000 }))?.trim();
ok(!!secret && secret.length >= 12, "crée un compte avec mot de passe provisoire");

// 4. Première connexion : changement de mot de passe obligatoire
{
  const p = await (await browser.newContext()).newPage();
  await p.goto(BASE + "/connexion");
  await p.fill("#email", `n.test@${D}`); await p.fill("#motdepasse", secret);
  await Promise.all([p.waitForURL(/mot-de-passe/), p.click("button:has-text('Se connecter')")]);
  ok(true, "redirige vers le changement de mot de passe");
  await p.goto(BASE + "/eleves");
  ok(p.url().includes("/mot-de-passe"), "bloque l'accès tant que le mot de passe n'est pas changé");
  await p.fill("#actuel", secret); await p.fill("#nouveau", "abcdefghijkl"); await p.fill("#confirmation", "abcdefghijkl");
  await p.click("button:has-text('Enregistrer le mot de passe')");
  ok(await p.getByText("au moins une lettre et un chiffre").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "refuse un mot de passe sans chiffre");
}

// 5. Classe : modifier une période
await dir.goto(BASE + "/classes");
await Promise.all([dir.waitForURL(/\/classes\/[0-9a-f-]{36}/), dir.click("a.row:has-text('CAP AS')")]);
await dir.screenshot({ path: `${OUT}/e1-classe.png`, fullPage: true });
ok((await dir.textContent("main")).includes("Périodes de PFMP"), "ouvre une classe et ses périodes");

// 6. Élève : renvoyé vers son espace, sans accès à la gestion
const ines = await session("ines.haddad");
await ines.waitForURL(/mon-stage/, { timeout: 8000 }).catch(() => {});
ok(ines.url().includes("/mon-stage"), "l'élève arrive sur son espace");
await ines.goto(BASE + lienEmma);
ok(ines.url() !== BASE + lienEmma || (await ines.textContent("body")).includes("404"), "l'élève n'ouvre pas la fiche d'un autre élève");

// 7. Téléphone
const mob = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await mob.goto(BASE + "/connexion");
await mob.fill("#email", `p.martin@${D}`); await mob.fill("#motdepasse", MDP);
await Promise.all([mob.waitForURL((u) => !u.pathname.startsWith("/connexion")), mob.click("button:has-text('Se connecter')")]);
await mob.goto(BASE + "/eleves");
const largeur = await mob.evaluate(() => document.documentElement.scrollWidth);
ok(largeur <= 390, `pas de défilement horizontal sur téléphone (${largeur}px)`);
await mob.screenshot({ path: `${OUT}/e1-mobile.png`, fullPage: true });

await browser.close();
console.log(erreurs.length ? `\n${erreurs.length} PROBLÈME(S)\n- ${erreurs.join("\n- ")}` : "\nTout est bon.");
process.exit(erreurs.length ? 1 : 0);
