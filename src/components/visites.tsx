import type { Contexte } from "@/lib/auth";

// Complété à l'étape 4 (visites, ordres de mission, comptes rendus).
export type OrdreASigner = { visiteId: string; libelle: string };
export async function listeOrdresASigner(_ctx: Contexte): Promise<OrdreASigner[]> { return []; }
export function BlocOrdresASigner({ ordres }: { ordres: OrdreASigner[] }) {
  return ordres.length ? null : null;
}
