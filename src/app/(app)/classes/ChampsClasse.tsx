type Prof = { id: string; prenom: string; nom: string };
type Valeurs = { formationId?: string | null; libelle?: string; niveau?: string; filiere?: string | null; codeRome?: string | null; anneeExamen?: boolean; regleStructure?: string; referentId?: string | null };

type Formation = { id: string; libelle: string; pole: string | null };

export function ChampsClasse({ v = {}, profs, formations = [], referentModifiable = true }: { v?: Valeurs; profs: Prof[]; formations?: Formation[]; referentModifiable?: boolean }) {
  const poles = [...new Set(formations.map((f) => f.pole ?? "Sans pôle"))];
  return (
    <div className="grid2">
      <label className="f" htmlFor="c-libelle">Nom de la classe<input id="c-libelle" name="libelle" defaultValue={v.libelle} placeholder="Ex. 2nde MS A" required /></label>
      <label className="f" htmlFor="c-niveau">Niveau
        <select id="c-niveau" name="niveau" defaultValue={v.niveau ?? "2NDE"}>
          <option value="CAP">CAP</option><option value="2NDE">Seconde</option><option value="1RE">Première</option><option value="TLE">Terminale</option>
        </select>
      </label>
      <label className="f" htmlFor="c-annee">Pour un CAP : année
        <select id="c-annee" name="anneeExamen" defaultValue={v.anneeExamen ? "oui" : "non"}>
          <option value="non">1re année</option><option value="oui">2e année (année d&apos;examen)</option>
        </select>
      </label>
      {formations.length > 0 && (
        <label className="f" htmlFor="c-formation">Formation (pôle)
          <select id="c-formation" name="formationId" defaultValue={v.formationId ?? ""}>
            <option value="">— Choisir —</option>
            {poles.map((p) => (
              <optgroup key={p} label={p}>
                {formations.filter((f) => (f.pole ?? "Sans pôle") === p).map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      <label className="f" htmlFor="c-filiere">Diplôme préparé{formations.length > 0 ? " (repris de la formation choisie)" : ""}<input id="c-filiere" name="filiere" defaultValue={v.filiere ?? ""} placeholder="Ex. Bac Pro Métiers de la sécurité" /></label>
      <label className="f" htmlFor="c-rome">Code métier ROME (facultatif, pour La bonne boîte)<input id="c-rome" name="codeRome" defaultValue={v.codeRome ?? ""} placeholder="Ex. K2503 (sécurité privée)" maxLength={5} pattern="[A-Za-z]\d{4}" /></label>
      <label className="f" htmlFor="c-regle">Lieu de stage autorisé
        <select id="c-regle" name="regleStructure" defaultValue={v.regleStructure ?? "auto"}>
          {!v.regleStructure && <option value="auto">Selon le niveau (privé en CAP et 2nde, spécialité en 1re et Tle)</option>}
          <option value="prive">Structure du secteur privé uniquement</option>
          <option value="dominante">Dans la spécialité de l&apos;élève</option>
          <option value="libre">Pas de restriction</option>
        </select>
      </label>
      <label className="f" htmlFor="c-ref">Professeur référent de la classe
        <select id="c-ref" name="referentId" defaultValue={v.referentId ?? ""} disabled={!referentModifiable}>
          <option value="">— Aucun —</option>
          {profs.map((p) => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
        </select>
      </label>
    </div>
  );
}
