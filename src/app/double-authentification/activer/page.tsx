import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { contexte } from "@/lib/auth";
import { lienApplication } from "@/lib/totp";
import { Formulaire } from "@/components/Formulaire";
import { confirmerActivation, preparerActivation } from "../actions";

export const metadata = { title: "Activer la double authentification" };

export default async function Activer() {
  await preparerActivation();
  const ctx = await contexte({ ignorerDoubleAuth: true });
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id)).limit(1);
  const lien = lienApplication(u.totpSecret!, u.email);
  const svg = await QRCode.toString(lien, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#152033", light: "#ffffff" } });
  return (
    <main className="login">
      <div className="panel pad section" style={{ width: "min(520px, 100%)" }}>
        <h1>Activer la double authentification</h1>
        <p className="sub">Votre compte donne accès aux données de tous les élèves : un code envoyé sur votre téléphone est demandé en plus du mot de passe.</p>
        <ol className="sub" style={{ paddingLeft: 18, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>Installez une application d&apos;authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator, FreeOTP…).</li>
          <li>Dans l&apos;application, ajoutez un compte en scannant ce code :</li>
        </ol>
        <div style={{ width: 200, alignSelf: "center", background: "#fff", padding: 6, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="sub" style={{ margin: 0 }}>Impossible de scanner ? Saisissez cette clé à la main :</p>
        <div className="secret" style={{ fontSize: 14, overflowWrap: "anywhere" }}>{u.totpSecret!.match(/.{1,4}/g)!.join(" ")}</div>
        <Formulaire action={confirmerActivation} bouton="Activer">
          <label className="f" htmlFor="code">3. Saisissez le code à 6 chiffres affiché par l&apos;application<input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required /></label>
        </Formulaire>
      </div>
    </main>
  );
}
