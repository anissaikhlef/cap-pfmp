import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { completerReglages } from "@/db/schema";
import { periodesDuLycee } from "@/lib/calendrier";
import { FrisePFMP, ListePeriodes } from "@/components/calendrier";

export const metadata = { title: "Calendrier des PFMP" };

/**
 * Page publique, sans compte : le calendrier des PFMP d'un lycée qui l'a choisi dans « Organisation ».
 * Seulement les dates des classes, jamais de nom d'élève ni de rattrapage.
 */
export default async function CalendrierPublic({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [etab] = await db.select().from(schema.etablissements).where(eq(schema.etablissements.id, id)).limit(1);
  if (!etab || !completerReglages(etab.reglages).calendrierPublic) notFound();
  const lignes = await periodesDuLycee(etab);
  return (
    <main>
      <div className="wrap section" style={{ paddingBlock: 24 }}>
        <div className="logo" style={{ color: "var(--ink)" }}><i aria-hidden="true" /> Cap PFMP</div>
        <div>
          <h1>Calendrier des PFMP · {etab.nom}</h1>
          <p className="sub">Année {etab.anneeScolaire} : les périodes de formation en milieu professionnel de chaque classe.</p>
        </div>
        <FrisePFMP lignes={lignes} anneeScolaire={etab.anneeScolaire} />
        <ListePeriodes lignes={lignes} />
      </div>
    </main>
  );
}
