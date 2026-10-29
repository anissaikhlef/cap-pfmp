import { describe, expect, it } from "vitest";
import { masquer, masquerCoordonnees, remettre } from "@/lib/anonymisation";
import { codeLangue, droiteAGauche, languesDuLycee, libelleLangue } from "@/lib/langues";

describe("langue des familles (décisions d'Anissa)", () => {
  it("la liste de Cap PFMP et les langues ajoutées par le lycée", () => {
    const l = languesDuLycee(["Soninké", " "]);
    expect(l.map((x) => x.libelle).slice(0, 3)).toEqual(["Arabe", "Anglais", "Espagnol"]);
    expect(l.at(-1)).toEqual({ code: "x-soninke", libelle: "Soninké", nom: "Soninké" });
    expect(codeLangue("Tigrigna (Érythrée)")).toBe("x-tigrigna-erythree");
    expect(libelleLangue("x-soninke", ["Soninké"])).toBe("Soninké");
    expect(libelleLangue("fr", [])).toBeNull();
    expect(libelleLangue(null, [])).toBeNull();
    expect(droiteAGauche("ar") && droiteAGauche("ur") && !droiteAGauche("en")).toBe(true);
  });
  it("les noms, adresses mail, liens et numéros sont remplacés avant la traduction, puis remis", () => {
    const noms = [{ valeur: "Mehdi RAHMANI", jeton: "[ÉLÈVE]" }, { valeur: "Leïla", jeton: "[PARENT1]" }];
    const texte = "Bonjour Leïla,\nMehdi RAHMANI doit rattraper 5 jours. Écrivez à ddfpt@lycee.example ou appelez le 06 39 98 00 01 : https://cap-pfmp.example/mon-enfant";
    const c = masquerCoordonnees(masquer(texte, noms));
    expect(c.texte).toBe("Bonjour [PARENT1],\n[ÉLÈVE] doit rattraper 5 jours. Écrivez à [MAIL1] ou appelez le [TEL1] : [LIEN1]");
    expect(c.texte).not.toMatch(/Leïla|RAHMANI|@|06 39/);
    expect(remettre(remettre(c.texte, c.masques), noms)).toBe(texte);
  });
});
