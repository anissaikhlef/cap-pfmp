import Link from "next/link";
import { contexte } from "@/lib/auth";
import { logoDuLycee, modeleDuLycee, utiliseLePdf } from "@/lib/modeles-documents";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "@/components/Formulaire";
import { ChampRetour } from "@/components/ChampRetour";
import { Entete, Pill } from "@/components/ui";
import { deposerLogo, retirerLogo } from "./actions";

export const metadata = { title: "Modèles de documents" };

/** Les modèles de documents du lycée : pour chacun, le modèle Cap PFMP adapté ou le PDF du lycée (décision d'Anissa). */
export default async function ModelesDocuments() {
  const ctx = await contexte({ roles: ["direction", "gestionnaire"] });
  const logo = await logoDuLycee(ctx.etab);
  const conv = await modeleDuLycee(ctx.etab.id, "convention");
  const om = await modeleDuLycee(ctx.etab.id, "ordre_mission");
  const att = await modeleDuLycee(ctx.etab.id, "attestation");
  const liv = await modeleDuLycee(ctx.etab.id, "livret");
  return (
    <>
      <Entete titre="Modèles de documents" sous="Pour chaque document, gardez le modèle Cap PFMP en l'adaptant (logo, textes, rubriques), ou déposez le PDF de votre lycée : Cap PFMP le remplit à l'identique.">
        <Link className="btn" href="/organisation">Organisation du lycée</Link>
      </Entete>
      <div className="panel rows">
        <Link className="row" href="/organisation/documents/convention">
          <div className="main">
            <div className="name">Convention de stage</div>
            <div className="meta">{utiliseLePdf(conv) ? `PDF du lycée : ${conv.pdfNom}` : "Modèle Cap PFMP"}{conv.majParId ? ` · modifié le ${dateCourte(conv.majLe.toISOString().slice(0, 10))}` : ""}</div>
          </div>
          <Pill ton={utiliseLePdf(conv) ? "info" : "muted"}>{utiliseLePdf(conv) ? "PDF du lycée" : "Cap PFMP"}</Pill>
        </Link>
        <Link className="row" href="/organisation/documents/ordre_mission">
          <div className="main">
            <div className="name">Ordre de mission et compte rendu de visite</div>
            <div className="meta">Modèle Cap PFMP : textes, questions de l&apos;appel de la première semaine, grille des attitudes professionnelles{om.majParId ? ` · modifié le ${dateCourte(om.majLe.toISOString().slice(0, 10))}` : ""}</div>
          </div>
          <Pill ton="muted">Cap PFMP</Pill>
        </Link>
        <Link className="row" href="/organisation/documents/attestation">
          <div className="main">
            <div className="name">Attestation de stage</div>
            <div className="meta">Modèle Cap PFMP : remplie et signée en ligne par le tuteur{att.majParId ? ` · modifié le ${dateCourte(att.majLe.toISOString().slice(0, 10))}` : ""}</div>
          </div>
          <Pill ton="muted">Cap PFMP</Pill>
        </Link>
        <Link className="row" href="/organisation/documents/livret">
          <div className="main">
            <div className="name">Livret de compétences</div>
            <div className="meta">Modèle Cap PFMP : attitudes professionnelles, compétences de chaque diplôme, carnet de bord de l&apos;élève{liv.majParId ? ` · modifié le ${dateCourte(liv.majLe.toISOString().slice(0, 10))}` : ""}</div>
          </div>
          <Pill ton="muted">Cap PFMP</Pill>
        </Link>
      </div>
      <div className="panel pad section" id="logo">
        <h2>Logo du lycée</h2>
        <p className="sub" style={{ margin: 0 }}>En tête des documents du modèle Cap PFMP. Image PNG ou JPG, 1 Mo au plus.</p>
        {logo && <img src={logo} alt="Logo du lycée" className="logo-document" />}
        <Formulaire action={deposerLogo} className="actions" bouton={logo ? "Remplacer le logo" : "Déposer le logo"} boutonClasse="btn small primary">
          <label className="f" htmlFor="logo-fichier" style={{ flex: 1, minWidth: 200 }}>
            <span className="vh">Image du logo</span>
            <input id="logo-fichier" name="logo" type="file" accept="image/png,image/jpeg" required />
          </label>
        </Formulaire>
        {logo && <form action={retirerLogo}><ChampRetour /><button className="btn small">Retirer le logo</button></form>}
      </div>
    </>
  );
}
