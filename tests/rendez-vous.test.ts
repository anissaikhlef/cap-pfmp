import { describe, expect, it } from "vitest";
import { modeRetenu } from "@/lib/regles";

describe("prise de rendez-vous : forme de la visite retenue", () => {
  it("garde la forme imposée par le professeur, quoi que l'entreprise envoie", () => {
    expect(modeRetenu("presentiel", null, "distanciel")).toBe("presentiel");
    expect(modeRetenu("distanciel", "presentiel", "presentiel")).toBe("distanciel");
  });
  it("au choix de l'entreprise : prend sa réponse, et rien tant qu'elle n'a pas choisi", () => {
    expect(modeRetenu("les2", "distanciel", "presentiel")).toBe("distanciel");
    expect(modeRetenu("les2", "presentiel", "distanciel")).toBe("presentiel");
    expect(modeRetenu("les2", null, "presentiel")).toBeNull();
    expect(modeRetenu("les2", "en visio", "presentiel")).toBeNull();
  });
  it("sans proposition enregistrée (créneaux envoyés avant la prise de rendez-vous en ligne), garde la forme de la visite", () => {
    expect(modeRetenu(null, "distanciel", "presentiel")).toBe("presentiel");
  });
});
