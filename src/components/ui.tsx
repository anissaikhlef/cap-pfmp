import { STATUTS, type Statut } from "@/lib/regles";

export function Pastille({ statut }: { statut: Statut }) {
  const s = STATUTS[statut];
  return <span className={`pill t-${s.ton}`}>{s.libelle}</span>;
}

export function Pill({ ton, children }: { ton: "ok" | "warn" | "bad" | "info" | "muted"; children: React.ReactNode }) {
  return <span className={`pill t-${ton}`}>{children}</span>;
}

export function Entete({ titre, sous, children }: { titre: string; sous?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="actions" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
      <div><h1>{titre}</h1>{sous && <p className="sub">{sous}</p>}</div>
      {children}
    </div>
  );
}
