import type { Contexte } from "@/lib/auth";
import { chargerConvention } from "@/lib/convention";
import { carnetDeBord } from "@/lib/livret";
import { aujourdhui, dateLongue } from "@/lib/dates";
import { noterActivitesDuJour } from "@/app/(app)/mon-stage/actions";
import { Formulaire } from "./Formulaire";
import { CarnetDeBord } from "./fin-de-stage";

/**
 * Le carnet de bord de l'élève : chaque jour de stage, il note ce qu'il a fait. Son tuteur s'en sert pour remplir le livret
 * de compétences ; le carnet y est joint.
 */
export async function BlocCarnetEleve({ ctx, stageId }: { ctx: Contexte; stageId: string }) {
  const cv = await chargerConvention(ctx, stageId);
  if (!cv) return null;
  const jour = aujourdhui();
  const carnet = await carnetDeBord(stageId);
  const max = jour < cv.p.fin ? jour : cv.p.fin;
  return (
    <div className="panel pad section" id="carnet">
      <h2>Mon carnet de bord</h2>
      {jour < cv.p.debut ? (
        <p className="sub" style={{ margin: 0 }}>À partir du {dateLongue(cv.p.debut)}, premier jour de votre stage, notez ici chaque jour ce que vous avez fait. Votre tuteur s&apos;en sert pour remplir votre livret de compétences.</p>
      ) : (
        <>
          <p className="sub" style={{ margin: 0 }}>Chaque jour, notez ce que vous avez fait : les tâches, ce que vous avez appris. Votre tuteur s&apos;en sert pour remplir votre livret de compétences.</p>
          <Formulaire action={noterActivitesDuJour} bouton="Enregistrer">
            <input type="hidden" name="stageId" value={stageId} />
            <label className="f" htmlFor="cb-date" style={{ maxWidth: 220 }}>Jour<input id="cb-date" name="date" type="date" min={cv.p.debut} max={max} defaultValue={max} required /></label>
            <label className="f" htmlFor="cb-texte">Ce que j&apos;ai fait<textarea id="cb-texte" name="texte" rows={3} required minLength={5} maxLength={2000} placeholder="Ex. accueil des visiteurs, ronde du matin avec mon tuteur…" /></label>
          </Formulaire>
        </>
      )}
      {carnet.length > 0 && <CarnetDeBord carnet={carnet} />}
    </div>
  );
}
