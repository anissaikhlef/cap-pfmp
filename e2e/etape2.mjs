// Étape 2 : entreprises, démarches, saisie du stage et règles.
import { BASE, D, OUT, ok, visible, session, fin, heure } from "./outils.mjs";

// Élève sans stage : démarches et suggestions
const ines = await session("ines.haddad");
ok(ines.url().includes("/mon-stage"), "l'élève arrive sur son espace");
let t = await ines.textContent("main");
ok(t.includes("Mes démarches") && t.includes("Garde Ouest Services") && t.includes("Refus"), "l'élève voit ses démarches");
ok(t.includes("à relancer"), "signale une démarche sans réponse depuis 7 jours");
ok(t.includes("Entreprises qui peuvent vous accueillir"), "propose des entreprises");
ok(!t.includes("Police municipale"), "n'en propose pas du secteur public en 2nde");
await ines.screenshot({ path: `${OUT}/e2-eleve.png`, fullPage: true });
const avant = await ines.locator("button:has-text(\"Je l'ai contactée\")").count();
await ines.locator("button:has-text(\"Je l'ai contactée\")").first().click();
let apres = avant;
for (let i = 0; i < 20 && apres === avant; i++) { await ines.waitForTimeout(300); apres = await ines.locator("button:has-text(\"Je l'ai contactée\")").count(); }
ok(apres === avant - 1, "« Je l'ai contactée » ajoute la démarche");
await ines.fill("#d-ent", "Boulangerie du coin");
await ines.click("button:has-text('Ajouter')");
ok(await visible(ines.getByText("Démarche ajoutée")), "l'élève ajoute une démarche libre");

// Professeur référent : enregistre le stage d'Inès
const martin = await session("p.martin");
await martin.goto(BASE + "/eleves");
await Promise.all([martin.waitForURL(/\/eleves\/[0-9a-f-]{36}/), martin.click("a.row:has-text('HADDAD')")]);
const fiche = martin.url();
ok((await martin.textContent("main")).includes("Boulangerie du coin"), "le référent voit les démarches de l'élève");
await martin.selectOption("#s-ent", { label: "Atlas Sûreté (Issy-les-Moulineaux)" });
for (let i = 0; i < 5; i++) {
  await heure(martin, `debut_${i}`, "08:00");
  await heure(martin, `fin_${i}`, i === 4 ? "12:00" : "15:00");
  await martin.uncheck(`input[name=repos_${i}]`);
}
await martin.click("button:has-text('Enregistrer le stage')");
ok(await visible(martin.getByText("Stage enregistré")), "enregistre le stage");
await martin.goto(fiche);
t = await martin.textContent("main");
ok(t.includes("32 h par semaine"), "calcule la durée hebdomadaire");
ok(t.includes("Convention en cours"), "statut : convention en cours");
ok(!t.includes("Non respecté : Durée"), "durée conforme");
await martin.screenshot({ path: `${OUT}/e2-fiche.png`, fullPage: true });

// Horaires de nuit : règle enfreinte
await martin.click("summary:has-text('Modifier le lieu ou les horaires')");
await heure(martin, "fin_0", "23:00");
await martin.click("button:has-text('Enregistrer le stage')");
await martin.waitForURL(/msg=/);
await martin.goto(fiche);
ok((await martin.textContent("main")).includes("Non respecté : Aucun horaire de nuit"), "détecte un horaire de nuit");
await martin.goto(BASE + "/eleves?statut=hors_regles");
ok((await martin.textContent("main")).includes("HADDAD"), "l'élève apparaît dans le filtre « hors règles »");

// Annuaire
await martin.goto(BASE + "/entreprises/nouvelle");
await martin.fill("#x-nom", "Sécuri'Test"); await martin.fill("#x-ville", "Ville-démo"); await martin.fill("#x-domaine", "Sécurité incendie");
await Promise.all([martin.waitForURL(/\/entreprises\/[0-9a-f-]{36}/), martin.click("button:has-text('Créer la fiche')")]);
ok((await martin.textContent("h1")).includes("Sécuri'Test"), "ajoute une entreprise à l'annuaire");
await martin.goto(BASE + "/entreprises?f=public");
t = await martin.textContent("main");
ok(t.includes("Police municipale") && !t.includes("Atlas"), "filtre l'annuaire par secteur");
await martin.goto(BASE + "/entreprises");
await Promise.all([martin.waitForURL(/\/entreprises\/[0-9a-f-]{36}/), martin.click("a.row:has-text('Atlas Sûreté')")]);
t = await martin.textContent("main");
ok(t.includes("HADDAD") && t.includes("Élèves accueillis"), "la fiche entreprise liste les élèves accueillis");

// Responsable légal
const fatou = await session("f.traore");
ok(fatou.url().includes("/mon-enfant"), "le parent arrive sur le suivi de son enfant");
t = await fatou.textContent("main");
ok(t.includes("Moussa") && t.includes("Atlas Sûreté") && !t.includes("HADDAD"), "le parent ne voit que son enfant");

// Entreprise
const tuteur = await session("k.ferhat");
ok(tuteur.url().includes("/stagiaires"), "le tuteur arrive sur ses stagiaires");
t = await tuteur.textContent("main");
ok(t.includes("MOREAU") && t.includes("TRAORÉ") && !t.includes("LAURENT"), "le tuteur ne voit que ses stagiaires");
await tuteur.goto(BASE + "/entreprises");
ok(!tuteur.url().includes("/entreprises"), "le tuteur n'accède pas à l'annuaire");
await tuteur.screenshot({ path: `${OUT}/e2-tuteur.png`, fullPage: true });

await fin();
