import { contexte } from "@/lib/auth";
import { optionsEleve } from "@/lib/options";
import { Import } from "./Import";

export const metadata = { title: "Importer des élèves" };

export default async function ImportEleves() {
  const ctx = await contexte();
  const o = await optionsEleve(ctx);
  return (
    <>
      <div>
        <h1>Importer des élèves</h1>
        <p className="sub">Exportez la liste depuis votre logiciel de vie scolaire ou un tableur, au format CSV.</p>
      </div>
      <div className="panel pad section">
        <h2>Format attendu</h2>
        <p className="sub">Une ligne par élève. Les colonnes <b>nom</b>, <b>prenom</b> et <b>classe</b> sont obligatoires ; <b>date_naissance</b>, <b>email</b> et <b>dominante</b> sont facultatives. Le séparateur peut être un point-virgule ou une virgule. Les élèves déjà présents sont ignorés.</p>
        <pre className="secret" style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{`nom;prenom;classe;date_naissance;email;dominante
HADDAD;Inès;${o.classes[0]?.libelle ?? "2nde MS A"};14/03/2010;ines.haddad@exemple.fr;
MOREAU;Lucas;${o.classes[0]?.libelle ?? "2nde MS A"};02/07/2010;;`}</pre>
        <p className="sub">Classes reconnues : {o.classes.map((c) => c.libelle).join(", ") || "aucune, créez d'abord vos classes"}.</p>
      </div>
      <div className="panel pad"><Import /></div>
    </>
  );
}
