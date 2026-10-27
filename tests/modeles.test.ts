import { describe, expect, it } from "vitest";
import { choisirOption, completeParQualite, normaliser, sourceValable, suggererSource } from "@/lib/modeles";

describe("modèles de documents : donnée proposée pour un champ du PDF du lycée", () => {
  it("reconnaît les champs de l'élève", () => {
    expect(suggererSource("NOM et prénom", "texte")).toBe("eleve.nomPrenom");
    expect(suggererSource("Date de naissance", "texte")).toBe("eleve.dateNaissance");
    expect(suggererSource("Adresse courriel", "texte")).toBe("eleve.email");
    expect(suggererSource("Classe et filière", "texte")).toBe("classe.classeEtFiliere");
  });
  it("ce que Cap PFMP ne connaît pas est complété en signant, par la famille ou par l'entreprise", () => {
    expect(suggererSource("Numéro de portable", "texte")).toBe("famille");
    expect(suggererSource("Adresse famille", "texte")).toBe("famille");
    expect(suggererSource("Nom de l'assureur", "texte")).toBe("entreprise");
    expect(suggererSource("N° SIRET", "texte")).toBe("entreprise");
  });
  it("reconnaît l'entreprise, le tuteur et le professeur référent", () => {
    expect(suggererSource("Nom de l'entreprise", "texte")).toBe("entreprise.nom");
    expect(suggererSource("Adresse du siège de l'entreprise", "texte")).toBe("entreprise.adresse");
    expect(suggererSource("Téléphone du tuteur", "texte")).toBe("tuteur.telephone");
    expect(suggererSource("Courriel enseignant référent", "texte")).toBe("referent.email");
  });
  it("reconnaît les dates et les horaires, et laisse vide une deuxième période", () => {
    expect(suggererSource("date début période 1", "texte")).toBe("periode.debut");
    expect(suggererSource("date fin période 1", "texte")).toBe("periode.fin");
    expect(suggererSource("date début si période 2", "texte")).toBe("");
    expect(suggererSource("Lundi matin", "texte")).toBe("horaires.lundi.matin");
    expect(suggererSource("Mardi après-midi", "texte")).toBe("horaires.mardi.apresMidi");
  });
  it("ne propose rien pour un nom générique, ni « fin » dans « financière »", () => {
    expect(suggererSource("Texte_13", "texte")).toBe("");
    expect(suggererSource("Annexe financière", "texte")).toBe("");
    expect(suggererSource("Case à cocher_29", "case")).toBe("");
    expect(suggererSource("Élève mineur", "case")).toBe("eleve.mineur");
  });
  it("reconnaît les cadres de signature : le nom (signature au-dessus) et la date", () => {
    expect(suggererSource("Nom prénom signature élève", "texte")).toBe("signature.eleve.nom");
    expect(suggererSource("Date signature tuteur", "texte")).toBe("signature.tuteur.date");
    expect(suggererSource("Signature du représentant légal", "texte")).toBe("signature.parent.nom");
    expect(suggererSource("Visa du chef d'établissement", "texte")).toBe("signature.direction.nom");
  });
  it("une liste déroulante de classe ou de filière reçoit le nom de la classe", () => {
    expect(suggererSource("niveau de classe", "liste")).toBe("classe.libelle");
    expect(suggererSource("filière", "liste")).toBe("classe.libelle");
  });
});

describe("modèles de documents : option d'une liste déroulante", () => {
  const niveaux = ["niveau de classe", "CAP 1ère année", "CAP 2ème année", "2nde bac pro", "1ère bac pro", "Ter bac pro"];
  it("trouve le niveau d'après le nom de la classe", () => {
    expect(choisirOption("2nde MS", niveaux)).toBe("2nde bac pro");
    expect(choisirOption("1re MS", niveaux)).toBe("1ère bac pro");
    expect(choisirOption("Tle MS", niveaux)).toBe("Ter bac pro");
  });
  it("ne choisit rien en cas de doute", () => {
    expect(choisirOption("CAP AS", niveaux)).toBeNull();
    expect(choisirOption("", niveaux)).toBeNull();
  });
  it("trouve la filière abrégée et le professeur", () => {
    expect(choisirOption("2nde MS", ["La filière", "MV", "AS", "MSPC", "MS"])).toBe("MS");
    expect(choisirOption("Paul MARTIN", ["M. Dupont", "M. Martin", "Mme Leroy"])).toBe("M. Martin");
  });
  it("normalise accents et ponctuation", () => {
    expect(normaliser("  Date de début (période 1) ")).toBe("date de debut periode 1");
  });
});

describe("modèles de documents : sources permises", () => {
  it("une case ne reçoit ni texte fixe ni donnée texte", () => {
    expect(sourceValable("coche", "case")).toBe(true);
    expect(sourceValable("eleve.mineur", "case")).toBe(true);
    expect(sourceValable("fixe", "case")).toBe(false);
    expect(sourceValable("eleve.nom", "case")).toBe(false);
  });
  it("un champ texte reçoit une donnée, un texte fixe, ou est complété en signant", () => {
    expect(sourceValable("eleve.nom", "texte")).toBe(true);
    expect(sourceValable("fixe", "texte")).toBe(true);
    expect(sourceValable("famille", "texte")).toBe(true);
    expect(sourceValable("n'importe quoi", "texte")).toBe(false);
  });
  it("la famille complète pour l'élève et le parent, l'entreprise pour le représentant et le tuteur", () => {
    expect(completeParQualite("parent")).toBe("famille");
    expect(completeParQualite("tuteur")).toBe("entreprise");
    expect(completeParQualite("direction")).toBeNull();
  });
});
