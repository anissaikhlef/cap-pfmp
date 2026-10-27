// Aucune page ne doit défiler horizontalement sur un téléphone (390 px).
import { BASE, ok, session, fin } from "./outils.mjs";
const V = { width: 390, height: 844 };
const parcours = {
  direction: ["/", "/eleves", "/entreprises", "/documents", "/allocations", "/visites", "/visites/heures", "/campagne", "/a-signer", "/classes", "/messages", "/equipe", "/organisation", "/classes/annee-suivante"],
  "ines.haddad": ["/mon-stage"],
  "f.traore": ["/mon-enfant"],
  "l.rahmani": ["/mon-enfant"],
  "k.ferhat": ["/stagiaires"],
  "m.garnier": ["/mes-visites"],
  "vie.scolaire": ["/vie-scolaire", "/vie-scolaire?jour=2026-10-14"],
};
for (const [compte, pages] of Object.entries(parcours)) {
  const p = await session(compte, V);
  for (const chemin of pages) {
    await p.goto(BASE + chemin);
    const l = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(l <= 390, `${compte} ${chemin} : ${l}px`);
  }
  if (compte === "direction") {
    for (const lien of ["a.row:has-text('LAURENT')"]) {
      await p.goto(BASE + "/eleves"); await p.click(lien); await p.waitForURL(/\/eleves\/[0-9a-f-]{36}/);
      const l = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(l <= 390, `direction fiche élève : ${l}px`);
    }
    await p.goto(BASE + "/visites"); await p.click("a:has-text('Détails') >> nth=0"); await p.waitForURL(/\/visites\/[0-9a-f-]{36}/);
    ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 390, "direction détail visite");
    await p.goto(BASE + "/eleves?q=rahmani"); await p.click("a.row:has-text('RAHMANI')"); await p.waitForURL(/\/eleves\/[0-9a-f-]{36}/);
    ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 390, "direction fiche d'un élève en rattrapage");
  }
  if (compte === "vie.scolaire") {
    await p.goto(BASE + "/vie-scolaire"); await p.click("a.row:has-text('RAHMANI') >> nth=0"); await p.waitForURL(/\/vie-scolaire\/eleves\/[0-9a-f-]{36}/);
    ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= 390, "vie scolaire fiche élève");
  }
}
await fin();
