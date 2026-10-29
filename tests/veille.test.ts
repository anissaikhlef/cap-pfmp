import { describe, expect, it } from "vitest";
import { REGLAGES_PAR_DEFAUT } from "@/db/schema";
import { appliquerChangement, echeanceValide, lirePagesAcademies, valeurActuelle, valeurDe } from "@/lib/veille-def";

describe("Cap Veille : appliquer en un clic (décision d'Anissa)", () => {
  it("seules certaines cases, avec des valeurs vérifiées", () => {
    expect(valeurDe({ cible: "regles.heuresMax", valeur: "32" })).toBe(32);
    expect(valeurDe({ cible: "regles.heuresMax", valeur: "80" })).toBeNull();
    expect(valeurDe({ cible: "regles.nuitDebut", valeur: "21:00" })).toBe("21:00");
    expect(valeurDe({ cible: "regles.nuitDebut", valeur: "21h" })).toBeNull();
    expect(valeurDe({ cible: "regles.dimancheInterdit", valeur: "Non" })).toBe(false);
    expect(valeurDe({ cible: "regles.inconnue" as never, valeur: "1" })).toBeNull();
  });
  it("le changement s'applique aux réglages du lycée, sans incohérence", () => {
    const r = appliquerChangement(REGLAGES_PAR_DEFAUT, { cible: "regles.heuresMax", valeur: "32" })!;
    expect(r.regles.heuresMax).toBe(32);
    expect(r.regles.heuresMin).toBe(REGLAGES_PAR_DEFAUT.regles.heuresMin);
    expect(appliquerChangement(REGLAGES_PAR_DEFAUT, { cible: "regles.heuresMax", valeur: "20" })).toBeNull();
    expect(valeurActuelle(REGLAGES_PAR_DEFAUT, "regles.dimancheInterdit")).toBe("oui");
  });
  it("échéances et pages des académies", () => {
    expect(echeanceValide({ titre: "Envoi des attestations", date: "2027-04-15", concerne: "examen" }, "2026-10-26")).toBe(true);
    expect(echeanceValide({ titre: "Passée", date: "2026-01-01", concerne: "toutes" }, "2026-10-26")).toBe(false);
    expect(lirePagesAcademies("Versailles | https://www.ac-versailles.fr/pfmp\nligne fausse\nVERSAILLES | https://www.ac-versailles.fr/examens"))
      .toEqual({ VERSAILLES: ["https://www.ac-versailles.fr/pfmp", "https://www.ac-versailles.fr/examens"] });
  });
});
