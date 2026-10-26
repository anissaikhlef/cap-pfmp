import { contexte } from "@/lib/auth";
import { equipe } from "@/lib/requetes";
import { LIBELLES_ROLES } from "@/lib/navigation";
import { Formulaire } from "@/components/Formulaire";
import { Pill } from "@/components/ui";
import { basculerActif, creerMembre, reinitialiserMotDePasse } from "./actions";

export const metadata = { title: "Équipe" };

export default async function Equipe() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const tous = await equipe(ctx);
  const personnels = tous.filter((u) => u.roles.some((r) => r === "direction" || r === "gestionnaire" || r === "professeur" || r === "vie_scolaire"));
  const estDirection = ctx.user.roles.includes("direction");
  return (
    <>
      <div>
        <h1>Équipe</h1>
        <p className="sub">Les comptes des personnels. Les comptes des élèves, des familles et des entreprises se créent depuis leur fiche.</p>
      </div>
      <div className="panel rows">
        {personnels.map((u) => (
          <div key={u.id} className="row">
            <div className="main">
              <div className="name">{u.prenom} {u.nom} {!u.actif && <Pill ton="muted">Désactivé</Pill>}</div>
              <div className="meta">
                {u.roles.map((r) => LIBELLES_ROLES[r]).join(", ")}
                {u.discipline && ` · ${u.discipline}`}
                {u.roles.includes("professeur") && (u.enseignementPro ? " · enseignement professionnel" : " · enseignement général")}
                {` · ${u.email}`}
              </div>
            </div>
            {u.id !== ctx.user.id && (!u.roles.includes("direction") || estDirection) && (
              <div className="actions">
                <details>
                  <summary className="btn small">Mot de passe</summary>
                  <Formulaire action={reinitialiserMotDePasse} bouton="Générer un mot de passe provisoire" boutonClasse="btn small">
                    <input type="hidden" name="id" value={u.id} />
                  </Formulaire>
                </details>
                <form action={basculerActif}><input type="hidden" name="id" value={u.id} />
                  <button className={`btn small ${u.actif ? "danger" : ""}`}>{u.actif ? "Désactiver" : "Réactiver"}</button>
                </form>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="panel pad section">
        <h2>Ajouter un membre de l&apos;équipe</h2>
        <Formulaire action={creerMembre} bouton="Créer le compte">
          <div className="grid2">
            <label className="f" htmlFor="m-prenom">Prénom<input id="m-prenom" name="prenom" required /></label>
            <label className="f" htmlFor="m-nom">Nom<input id="m-nom" name="nom" required /></label>
            <label className="f" htmlFor="m-email">Adresse e-mail professionnelle<input id="m-email" name="email" type="email" required /></label>
            <label className="f" htmlFor="m-tel">Mobile (facultatif)<input id="m-tel" name="telephone" /></label>
            <label className="f" htmlFor="m-disc">Discipline (professeurs)<input id="m-disc" name="discipline" placeholder="Ex. Métiers de la sécurité" /></label>
            <label className="f" htmlFor="m-pro">Enseignement (professeurs)
              <select id="m-pro" name="enseignementPro" defaultValue="oui"><option value="oui">Professionnel</option><option value="non">Général</option></select>
            </label>
          </div>
          <fieldset className="section" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sub" style={{ marginBottom: 6 }}>Rôles</legend>
            <label className="check"><input type="checkbox" name="roles" value="professeur" defaultChecked /> Professeur (référent, visiteur)</label>
            <label className="check"><input type="checkbox" name="roles" value="gestionnaire" /> Gestion des PFMP pour tout le lycée (BDE, DDFPT)</label>
            <label className="check"><input type="checkbox" name="roles" value="vie_scolaire" /> Vie scolaire (CPE, assistants d&apos;éducation) : élèves en stage, rattrapages, absences</label>
            {estDirection && <label className="check"><input type="checkbox" name="roles" value="direction" /> Direction</label>}
          </fieldset>
        </Formulaire>
      </div>
    </>
  );
}
