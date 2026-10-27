// Étape 5 : tableau de bord, relances, campagne de rentrée, messages, double authentification, année suivante.
import { createHmac } from "node:crypto";
import { BASE, D, MDP, OUT, ok, visible, session, fin, browser } from "./outils.mjs";

function totp(secret, t = Date.now()) {
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0; const out = [];
  for (const c of secret.replace(/\s/g, "")) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac("sha1", Buffer.from(out)).update(msg).digest(); const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

const dir = await session("direction");
let t = await dir.textContent("main");
ok(t.includes("À faire") && t.includes("document(s) déposé(s) à vérifier") && t.includes("ordre(s) de mission à signer"), "le tableau de bord liste ce qui est à faire");
await dir.screenshot({ path: `${OUT}/e5-tableau.png`, fullPage: true });

// Relances du jour : la 1re a fini son stage il y a 3 jours, des documents manquent
await dir.click("button:has-text('Envoyer les relances du jour')");
ok(await visible(dir.getByText("relance(s) envoyée(s)")), "envoie les relances du jour");
await dir.click("button:has-text('Envoyer les relances du jour')");
ok(await visible(dir.getByText("Aucune relance à envoyer")), "n'envoie pas deux fois la même relance");
await dir.goto(BASE + "/messages");
t = await dir.textContent("main");
ok(t.includes("documents à transmettre") && t.includes("Simulé"), "les relances apparaissent dans les messages");

// Campagne de rentrée (une campagne a déjà été envoyée le 12 octobre : on en envoie une nouvelle)
await dir.goto(BASE + "/campagne");
ok((await dir.textContent("main")).includes("En ligne, par M. Lambert"), "les réponses de la campagne précédente s'affichent");
await dir.click("summary:has-text('Nouvelle campagne')");
const msg = await dir.inputValue("#message");
ok(msg.includes("2nde MS") && msg.includes("16 novembre 2026"), "le message reprend les dates de PFMP du calendrier");
await dir.click("button:has-text('Envoyer une nouvelle campagne')");
ok(await visible(dir.getByText("Campagne envoyée à")), "envoie la campagne");
const atlas = dir.locator("tr", { hasText: "Atlas Sûreté" });
await atlas.locator("input[type=number]").first().fill("2");
await atlas.locator("button:has-text('Enregistrer')").click();
ok(await visible(dir.getByText("Réponse enregistrée : 2 place(s)")), "enregistre les places proposées");
await dir.click("button:has-text('Relancer les')");
ok(await visible(dir.getByText("entreprise(s) relancée(s)")), "relance les entreprises sans réponse");
await dir.goto(BASE + "/messages");
ok((await dir.textContent("main")).includes("Atlas Sûreté prépare") === false && (await dir.textContent("main")).includes("Accueil de stagiaires"), "les mails de campagne sont consignés");
await dir.goto(BASE + "/campagne");
await dir.screenshot({ path: `${OUT}/e5-campagne.png`, fullPage: true });

// Double authentification : activation volontaire puis connexion avec code
await dir.goto(BASE + "/double-authentification/activer");
const secret = (await dir.locator(".secret").textContent()).trim();
await dir.fill("#code", "000000");
await dir.click("button:has-text('Activer')");
ok(await visible(dir.getByText("Code incorrect")), "refuse un mauvais code à l'activation");
await dir.fill("#code", totp(secret));
await dir.click("button:has-text('Activer')");
ok(await visible(dir.getByText("Double authentification activée")), "active la double authentification");
{
  const p = await (await browser.newContext()).newPage();
  await p.goto(BASE + "/connexion");
  await p.fill("#email", `direction@${D}`); await p.fill("#motdepasse", MDP);
  await Promise.all([p.waitForURL(/double-authentification/), p.click("button:has-text('Se connecter')")]);
  ok(true, "demande le code après le mot de passe");
  await p.goto(BASE + "/eleves");
  ok(p.url().includes("/connexion"), "sans code, aucun accès aux données");
  await p.goto(BASE + "/connexion");
  await p.fill("#email", `direction@${D}`); await p.fill("#motdepasse", MDP);
  await Promise.all([p.waitForURL(/double-authentification/), p.click("button:has-text('Se connecter')")]);
  await p.fill("#code", totp(secret));
  await Promise.all([p.waitForURL((u) => !u.pathname.includes("double")), p.click("button:has-text('Valider')")]);
  ok((await p.textContent("main")).includes("Tableau de bord"), "le bon code donne accès");
}

// Passage à l'année suivante
await dir.goto(BASE + "/classes/annee-suivante");
ok((await dir.inputValue("input[name^=libelle_] >> nth=0")).length > 0, "propose les classes de l'année suivante");
await dir.click("button:has-text(\"Ouvrir l'année 2027-2028\")");
ok(await visible(dir.getByText("Cochez la case de confirmation")), "demande une confirmation");
await dir.check("input[name=confirmer]");
await dir.click("button:has-text(\"Ouvrir l'année 2027-2028\")");
ok(await visible(dir.getByText("Année 2027-2028 ouverte")), "ouvre l'année suivante");
await dir.goto(BASE + "/eleves?q=haddad");
ok((await dir.textContent("main")).includes("1re MS"), "l'élève de 2nde passe en 1re");
await Promise.all([dir.waitForURL(/\/eleves\/[0-9a-f-]{36}/), dir.click("a.row:has-text('HADDAD')")]);
ok((await dir.textContent("#dossier")).length > 0, "son dossier reste accessible");
await dir.goto(BASE + "/eleves?q=laurent");
ok(!(await dir.textContent("main")).includes("LAURENT"), "les terminales sortent de la liste (fin de formation)");

await fin();
