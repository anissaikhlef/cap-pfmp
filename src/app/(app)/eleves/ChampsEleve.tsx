type Option = { id: string; libelle: string };
type V = { prenom?: string; nom?: string; classeId?: string | null; dateNaissance?: string | null; email?: string | null; dominanteId?: string | null; referentId?: string | null };

export function ChampsEleve({ v = {}, classes, dominantes, profs }: { v?: V; classes: Option[]; dominantes: Option[]; profs: Option[] }) {
  return (
    <div className="grid2">
      <label className="f" htmlFor="e-prenom">Prénom<input id="e-prenom" name="prenom" defaultValue={v.prenom} required /></label>
      <label className="f" htmlFor="e-nom">Nom<input id="e-nom" name="nom" defaultValue={v.nom} required /></label>
      <label className="f" htmlFor="e-classe">Classe
        <select id="e-classe" name="classeId" defaultValue={v.classeId ?? ""} required>
          <option value="" disabled>— Choisir —</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
        </select>
      </label>
      <label className="f" htmlFor="e-naiss">Date de naissance (pour savoir si l&apos;élève est majeur)<input id="e-naiss" name="dateNaissance" type="date" defaultValue={v.dateNaissance ?? ""} /></label>
      <label className="f" htmlFor="e-dom">Dominante (1re et terminale)
        <select id="e-dom" name="dominanteId" defaultValue={v.dominanteId ?? ""}>
          <option value="">— Aucune —</option>
          {dominantes.map((d) => <option key={d.id} value={d.id}>{d.libelle}</option>)}
        </select>
      </label>
      <label className="f" htmlFor="e-ref">Professeur référent de l&apos;élève (si différent de celui de la classe)
        <select id="e-ref" name="referentId" defaultValue={v.referentId ?? ""}>
          <option value="">— Celui de la classe —</option>
          {profs.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
        </select>
      </label>
      <label className="f" htmlFor="e-email">Adresse e-mail de l&apos;élève (facultatif)<input id="e-email" name="email" type="email" defaultValue={v.email ?? ""} /></label>
    </div>
  );
}
