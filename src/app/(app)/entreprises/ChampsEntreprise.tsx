type V = Partial<{ nom: string; secteur: string; domaine: string | null; adresse: string | null; ville: string | null; tuteurNom: string | null; tuteurFonction: string | null; email: string | null; telephone: string | null; placesParDefaut: number; notesInternes: string | null }>;

export function ChampsEntreprise({ v = {}, domaines }: { v?: V; domaines: string[] }) {
  return (
    <div className="grid2">
      <label className="f" htmlFor="x-nom">Nom<input id="x-nom" name="nom" defaultValue={v.nom} required /></label>
      <label className="f" htmlFor="x-secteur">Secteur
        <select id="x-secteur" name="secteur" defaultValue={v.secteur ?? "prive"}><option value="prive">Privé</option><option value="public">Public</option></select>
      </label>
      <label className="f" htmlFor="x-domaine">Domaine (doit correspondre à une dominante pour la 1re et la Tle)
        <input id="x-domaine" name="domaine" list="domaines" defaultValue={v.domaine ?? ""} />
        <datalist id="domaines">{domaines.map((d) => <option key={d} value={d} />)}</datalist>
      </label>
      <label className="f" htmlFor="x-places">Élèves accueillis par période<input id="x-places" name="placesParDefaut" type="number" min={0} max={50} defaultValue={v.placesParDefaut ?? 1} /></label>
      <label className="f" htmlFor="x-adresse">Adresse<input id="x-adresse" name="adresse" defaultValue={v.adresse ?? ""} /></label>
      <label className="f" htmlFor="x-ville">Ville<input id="x-ville" name="ville" defaultValue={v.ville ?? ""} /></label>
      <label className="f" htmlFor="x-tuteur">Tuteur<input id="x-tuteur" name="tuteurNom" defaultValue={v.tuteurNom ?? ""} /></label>
      <label className="f" htmlFor="x-fonction">Fonction du tuteur<input id="x-fonction" name="tuteurFonction" defaultValue={v.tuteurFonction ?? ""} /></label>
      <label className="f" htmlFor="x-email">E-mail de contact<input id="x-email" name="email" type="email" defaultValue={v.email ?? ""} /></label>
      <label className="f" htmlFor="x-tel">Mobile du tuteur<input id="x-tel" name="telephone" defaultValue={v.telephone ?? ""} /></label>
      <label className="f" htmlFor="x-notes" style={{ gridColumn: "1 / -1" }}>Notes internes (visibles des seuls personnels)<textarea id="x-notes" name="notesInternes" rows={3} defaultValue={v.notesInternes ?? ""} /></label>
    </div>
  );
}
