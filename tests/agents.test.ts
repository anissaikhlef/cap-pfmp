import { describe, expect, it } from "vitest";
import { REGLAGES_PAR_DEFAUT, completerReglages } from "@/db/schema";
import { agentsDuLycee, aLAgent, formuleDe, moisDe, prixMensuel, sourceOfficielle, sousLePlafond } from "@/lib/agents";
import { masquer, remettre, sansCoordonnees } from "@/lib/anonymisation";
import { classerLieux, motsCles, relectureCvExemple, type CandidatLieu } from "@/lib/regles";

const avec = (veille: boolean, entreprises: boolean) => ({ agents: { ...REGLAGES_PAR_DEFAUT.agents, veille, entreprises } });

describe("agents du lycée et prix (décision d'Anissa : l'agent 1 est obligatoire, le 2 et le 3 au choix)", () => {
  it("Cap Admin est toujours là", () => {
    expect(agentsDuLycee(avec(false, false))).toEqual(["administratif"]);
    expect(agentsDuLycee(avec(true, true))).toEqual(["administratif", "veille", "entreprises"]);
    expect(aLAgent(avec(false, true), "veille")).toBe(false);
    expect(aLAgent(avec(false, true), "entreprises")).toBe(true);
  });
  it("le prix dépend des agents choisis", () => {
    const tarifs = { seul: 49, veille: 69, entreprises: 79, complet: 99 };
    expect(formuleDe(avec(false, false))).toBe("seul");
    expect(prixMensuel(tarifs, avec(true, false))).toBe(69);
    expect(prixMensuel(tarifs, avec(false, true))).toBe(79);
    expect(prixMensuel(tarifs, avec(true, true))).toBe(99);
  });
  it("un lycée créé avant les agents reçoit les réglages par défaut", () => {
    const r = completerReglages({ gestion: "ddfpt" } as never);
    expect(r.agents).toEqual(REGLAGES_PAR_DEFAUT.agents);
    expect(agentsDuLycee(r)).toEqual(["administratif"]);
  });
  it("plafond du mois", () => {
    const p = { administratif: 3, veille: 0, entreprises: 2 };
    expect(sousLePlafond(p, "administratif", 2)).toBe(true);
    expect(sousLePlafond(p, "administratif", 3)).toBe(false);
    expect(sousLePlafond(p, "veille", 999)).toBe(true);
    expect(moisDe("2026-12-15")).toEqual({ debut: "2026-12-01", suivant: "2027-01-01" });
    expect(moisDe("2026-10-28")).toEqual({ debut: "2026-10-01", suivant: "2026-11-01" });
  });
  it("veille : sources officielles seulement", () => {
    expect(sourceOfficielle("https://www.education.gouv.fr/bo/26/Hebdo1/x.htm")).toBe(true);
    expect(sourceOfficielle("https://www.legifrance.gouv.fr/jorf/id/X")).toBe(true);
    expect(sourceOfficielle("https://eduscol.education.fr/page")).toBe(true);
    expect(sourceOfficielle("https://education.gouv.fr.exemple.com/x")).toBe(false);
    expect(sourceOfficielle("http://www.education.gouv.fr/x")).toBe(false);
    expect(sourceOfficielle("pas un lien")).toBe(false);
  });
});

describe("données des élèves cachées à l'IA", () => {
  const m = [{ valeur: "Léa FONTAINE", jeton: "[ÉLÈVE]" }, { valeur: "Léa", jeton: "[ÉLÈVE]" }, { valeur: "Fontaine", jeton: "[ÉLÈVE]" }];
  it("masque le nom, sans toucher aux mots qui le contiennent", () => {
    expect(masquer("Léa Fontaine n'a pas de stage ; léa doit appeler la fontainerie.", m)).toBe("[ÉLÈVE] n'a pas de stage ; [ÉLÈVE] doit appeler la fontainerie.");
  });
  it("remet le prénom au retour", () => {
    expect(remettre("Bonjour, [ÉLÈVE] n'a pas de stage.", [{ valeur: "Léa", jeton: "[ÉLÈVE]" }])).toBe("Bonjour, Léa n'a pas de stage.");
  });
  it("retire les coordonnées d'un CV", () => {
    const t = sansCoordonnees("Léa FONTAINE\n12 rue des Lilas\n75011 Paris\n06 39 98 12 34\nlea.f@exemple.fr\nNée le 3 mars 2010\nFormation : Bac Pro");
    expect(t).not.toMatch(/Lilas|75011|06 39|exemple\.fr|mars 2010/);
    expect(t).toContain("[téléphone]");
    expect(t).toContain("[adresse mail]");
    expect(t).toContain("Formation : Bac Pro");
  });
});

describe("Cap Partenaires : lieux de stage", () => {
  const c = (nom: string, x: Partial<CandidatLieu> = {}): CandidatLieu => ({ id: nom, nom, domaine: null, ville: null, restantes: 1, accueilliAvant: false, fiable: false, source: "annuaire", ...x });
  const mots = motsCles("Bac Pro Métiers de la sécurité", "Sûreté / gardiennage");
  it("mots-clés de la formation", () => {
    expect(mots).toEqual(expect.arrayContaining(["securite", "surete", "gardiennage"]));
    expect(mots).not.toContain("metiers");
  });
  it("classe d'abord le domaine proche et les partenaires, écarte les entreprises déjà contactées", () => {
    const r = classerLieux([
      c("Boulangerie Durand", { restantes: 3 }),
      c("Sécurité Plus", { domaine: "Sûreté", accueilliAvant: true }),
      c("Gardiennage Express", { domaine: "Gardiennage" }),
      c("Protect Ville", { domaine: "Sécurité", source: "public", id: null, restantes: null }),
    ], { mots, ville: "Ville-démo", dejaContactees: [{ id: null, nom: "gardiennage express" }] });
    expect(r.map((x) => x.nom)).toEqual(["Sécurité Plus", "Boulangerie Durand", "Protect Ville"]);
    expect(r[0].raisons).toContain("A déjà accueilli des élèves du lycée");
    expect(r[2].raisons.join(" ")).toContain("annuaire public");
  });
  it("la note de partenariat compte, sans jamais apparaître dans les raisons", () => {
    const r = classerLieux([c("A"), c("B", { fiable: true })], { mots: [], ville: null, dejaContactees: [] });
    expect(r[0].nom).toBe("B");
    expect(r[0].raisons.join(" ")).not.toMatch(/fiable|note/i);
  });
});

describe("Cap Partenaires : relecture d'exemple d'un CV", () => {
  it("repère les rubriques manquantes et les coordonnées", () => {
    const r = relectureCvExemple("[ÉLÈVE]\n[téléphone]\nFormation\n2025-2026 : 2nde Bac Pro Métiers de la sécurité\nCompétences : ponctuel, travail en équipe");
    expect(r.pointsForts.join(" ")).toContain("coordonnées");
    expect(r.aAmeliorer.join(" ")).toMatch(/expériences ou stages/);
    expect(r.aAmeliorer.join(" ")).toMatch(/très court/);
  });
});

describe("Cap Veille : lecture des sources officielles chaque semaine", () => {
  it("lit les liens d'un flux RSS et d'une page, sur les seules sources officielles", async () => {
    const { liensDePage } = await import("@/lib/agents");
    const rss = `<rss><channel><item><title><![CDATA[Périodes de formation en milieu professionnel : note de service]]></title><link>https://www.education.gouv.fr/bo/26/Hebdo40/x.htm</link></item></channel></rss>`;
    expect(liensDePage(rss, "https://www.education.gouv.fr/bo")).toEqual([{ url: "https://www.education.gouv.fr/bo/26/Hebdo40/x.htm", titre: "Périodes de formation en milieu professionnel : note de service" }]);
    const html = `<a href="/bo/26/Hebdo41/y.htm">Allocation aux lycéens de la voie professionnelle</a><a href="https://exemple.com/z">Stage ailleurs, hors source officielle</a><a href="#haut">Haut</a>`;
    expect(liensDePage(html, "https://www.education.gouv.fr/bo").map((l) => l.url)).toEqual(["https://www.education.gouv.fr/bo/26/Hebdo41/y.htm"]);
  });
  it("garde les textes qui parlent des stages", async () => {
    const { concerneLesPfmp } = await import("@/lib/agents");
    expect(concerneLesPfmp("Organisation des PFMP en classe de terminale")).toBe(true);
    expect(concerneLesPfmp("Allocation aux lycéens de la voie professionnelle en PFMP")).toBe(true);
    expect(concerneLesPfmp("Baccalauréat professionnel : épreuves")).toBe(true);
    expect(concerneLesPfmp("Calendrier des vacances scolaires")).toBe(false);
  });
  it("garde le texte de la page, sans menus ni scripts", async () => {
    const { texteDePage } = await import("@/lib/agents");
    const t = texteDePage(`<html><nav>Menu</nav><main><h1>Note de service</h1><script>x()</script><p>Les PFMP durent&nbsp;22 semaines.</p></main></html>`);
    expect(t).toContain("Note de service");
    expect(t).toContain("Les PFMP durent 22 semaines.");
    expect(t).not.toMatch(/Menu|x\(\)/);
  });
});
