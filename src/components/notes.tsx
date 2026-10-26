import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Contexte } from "@/lib/auth";
import { peutVoirNotes } from "@/lib/acces";
import { LIBELLES_ROLES } from "@/lib/navigation";
import { dateCourte } from "@/lib/dates";
import { Formulaire } from "./Formulaire";
import { ajouterNote, retirerNote } from "@/app/(app)/eleves/note-actions";

/** Notes de suivi partagées entre la vie scolaire, la gestion des stages et le professeur référent. */
export async function NotesEleve({ ctx, eleve }: { ctx: Contexte; eleve: typeof schema.eleves.$inferSelect }) {
  if (!(await peutVoirNotes(ctx, eleve))) return null;
  const notes = await db.select({ n: schema.notesEleves, u: schema.users }).from(schema.notesEleves)
    .leftJoin(schema.users, eq(schema.users.id, schema.notesEleves.auteurId))
    .where(eq(schema.notesEleves.eleveId, eleve.id)).orderBy(desc(schema.notesEleves.createdAt));
  return (
    <div className="panel pad section" id="notes">
      <h2>Notes de suivi</h2>
      <p className="sub" style={{ margin: 0 }}>Partagées entre la vie scolaire, la gestion des stages et le professeur référent. Jamais visibles par l&apos;élève, sa famille ou l&apos;entreprise.</p>
      {notes.length > 0 && (
        <div className="panel rows">
          {notes.map(({ n, u }) => (
            <div key={n.id} className="row" style={{ alignItems: "flex-start" }}>
              <div className="main">
                <div style={{ whiteSpace: "pre-wrap" }}>{n.texte}</div>
                <div className="meta">{u ? `${u.prenom} ${u.nom}${u.roles[0] ? ` (${LIBELLES_ROLES[u.roles[0]]?.toLowerCase()})` : ""}` : "Compte supprimé"} · {dateCourte(n.createdAt.toISOString().slice(0, 10))}</div>
              </div>
              {n.auteurId === ctx.user.id && (
                <form action={retirerNote}><input type="hidden" name="id" value={n.id} /><button className="btn small danger">Retirer</button></form>
              )}
            </div>
          ))}
        </div>
      )}
      <Formulaire action={ajouterNote} bouton="Ajouter la note" boutonClasse="btn">
        <input type="hidden" name="eleveId" value={eleve.id} />
        <label className="f" htmlFor="note-texte">Nouvelle note<textarea id="note-texte" name="texte" rows={3} maxLength={2000} placeholder="Ex. la famille a prévenu par téléphone ; l'élève sera au lycée lundi pour récupérer ses documents" /></label>
      </Formulaire>
    </div>
  );
}
