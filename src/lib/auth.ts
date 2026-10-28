import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { completerReglages, type Role } from "@/db/schema";

const COOKIE = "cap_session";
const COOKIE_REEL = "cap_session_reel";
const DUREE_SESSION_MS = 1000 * 60 * 60 * 12; // 12 h
const MAX_ECHECS = 5;
const FENETRE_ECHECS_MIN = 15;

export const MOT_DE_PASSE_MIN = 10;
const HACHAGE_FACTICE = bcrypt.hashSync("compte-inexistant", 12);

export async function hacherMotDePasse(mdp: string) {
  return bcrypt.hash(mdp, 12);
}

export function motDePasseValide(mdp: string): string | null {
  if (mdp.length < MOT_DE_PASSE_MIN) return `Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères.`;
  if (!/[a-zA-Z]/.test(mdp) || !/[0-9]/.test(mdp)) return "Le mot de passe doit contenir au moins une lettre et un chiffre.";
  return null;
}

/** Mot de passe provisoire lisible, communiqué une seule fois à la création du compte. */
export function motDePasseProvisoire(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += alphabet[b[i] % alphabet.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8) + "7";
}

function empreinte(jeton: string) {
  return createHash("sha256").update(jeton).digest("hex");
}

export async function tropDEchecs(email: string): Promise<boolean> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.tentativesConnexion)
    .where(and(
      eq(schema.tentativesConnexion.email, email),
      eq(schema.tentativesConnexion.reussie, false),
      gt(schema.tentativesConnexion.at, sql`now() - make_interval(mins => ${FENETRE_ECHECS_MIN})`),
    ));
  return n >= MAX_ECHECS;
}

export async function verifierIdentifiants(emailBrut: string, mdp: string) {
  const email = emailBrut.trim().toLowerCase();
  if (await tropDEchecs(email)) return { erreur: `Trop d'essais. Réessayez dans ${FENETRE_ECHECS_MIN} minutes.` as const };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  // On compare toujours un hachage pour ne pas révéler par le temps de réponse si le compte existe.
  const ok = await bcrypt.compare(mdp, u?.passwordHash ?? HACHAGE_FACTICE);
  await db.insert(schema.tentativesConnexion).values({ email, reussie: !!(ok && u?.actif) });
  if (!u || !ok || !u.actif) return { erreur: "Adresse ou mot de passe incorrect." as const };
  return { user: u };
}

/**
 * Double authentification obligatoire pour les comptes qui voient tout l'établissement : direction, gestion
 * et vie scolaire (désactivable pour une démonstration).
 */
export function doubleAuthRequise(u: { roles: Role[] }): boolean {
  if (process.env.DOUBLE_AUTH_OBLIGATOIRE === "false") return false;
  return u.roles.some((r) => r === "direction" || r === "gestionnaire" || r === "vie_scolaire" || r === "admin");
}

/** verifiee = false : le mot de passe est bon mais le code de double authentification reste à saisir. */
export async function ouvrirSession(userId: string, verifiee = true) {
  const jeton = randomBytes(32).toString("base64url");
  // Une session en attente du second facteur n'est valable que 10 minutes.
  const expiresAt = new Date(Date.now() + (verifiee ? DUREE_SESSION_MS : 10 * 60 * 1000));
  await db.insert(schema.sessions).values({ id: empreinte(jeton), userId, expiresAt, verifiee });
  await db.update(schema.users).set({ derniereConnexion: new Date() }).where(eq(schema.users.id, userId));
  (await cookies()).set(COOKIE, jeton, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Formation incluse : entrer dans un compte du lycée d'entraînement. La session du vrai compte est mise de côté
 * (cookie « cap_session_reel ») pour y revenir ; on ne quitte jamais son vrai compte sans pouvoir y revenir.
 */
export async function ouvrirSessionEntrainement(userId: string) {
  const c = await cookies();
  const actuel = c.get(COOKIE)?.value;
  if (actuel && !c.get(COOKIE_REEL)) c.set(COOKIE_REEL, actuel, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: DUREE_SESSION_MS / 1000 });
  else if (actuel) await db.delete(schema.sessions).where(eq(schema.sessions.id, empreinte(actuel)));
  await ouvrirSession(userId);
}

/** Le vrai compte de la personne qui s'entraîne (session mise de côté), ou null. */
export async function compteReel(): Promise<Contexte | null> {
  const jeton = (await cookies()).get(COOKIE_REEL)?.value;
  if (!jeton) return null;
  const [r] = await db.select({ user: schema.users, etab: schema.etablissements, expiresAt: schema.sessions.expiresAt }).from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.users.etablissementId))
    .where(eq(schema.sessions.id, empreinte(jeton))).limit(1);
  return r && r.expiresAt > new Date() && r.user.actif ? { user: r.user, etab: { ...r.etab, reglages: completerReglages(r.etab.reglages) } } : null;
}

/** Quitte le lycée d'entraînement : la session du vrai compte reprend. */
export async function revenirAuVraiCompte() {
  const c = await cookies();
  const reel = c.get(COOKIE_REEL)?.value;
  const actuel = c.get(COOKIE)?.value;
  if (actuel && actuel !== reel) await db.delete(schema.sessions).where(eq(schema.sessions.id, empreinte(actuel)));
  if (reel) {
    c.set(COOKIE, reel, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: DUREE_SESSION_MS / 1000 });
    c.delete(COOKIE_REEL);
  }
}

export async function fermerSession() {
  const c = await cookies();
  const jeton = c.get(COOKIE)?.value;
  if (jeton) await db.delete(schema.sessions).where(eq(schema.sessions.id, empreinte(jeton)));
  c.delete(COOKIE);
  // Se déconnecter pendant l'entraînement ferme aussi le vrai compte.
  const reel = c.get(COOKIE_REEL)?.value;
  if (reel) { await db.delete(schema.sessions).where(eq(schema.sessions.id, empreinte(reel))); c.delete(COOKIE_REEL); }
}

export type Utilisateur = typeof schema.users.$inferSelect;
export type Etablissement = typeof schema.etablissements.$inferSelect;
export type Contexte = { user: Utilisateur; etab: Etablissement };

export async function contexteOptionnel(opts: { nonVerifiee?: boolean } = {}): Promise<Contexte | null> {
  const jeton = (await cookies()).get(COOKIE)?.value;
  if (!jeton) return null;
  const rows = await db
    .select({ user: schema.users, etab: schema.etablissements, expiresAt: schema.sessions.expiresAt, verifiee: schema.sessions.verifiee })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.etablissements, eq(schema.etablissements.id, schema.users.etablissementId))
    .where(eq(schema.sessions.id, empreinte(jeton)))
    .limit(1);
  const r = rows[0];
  if (!r || r.expiresAt < new Date() || !r.user.actif) return null;
  if (!r.verifiee && !opts.nonVerifiee) return null;
  if (r.verifiee && opts.nonVerifiee) return null;
  return { user: r.user, etab: { ...r.etab, reglages: completerReglages(r.etab.reglages) } };
}

/** Termine la double authentification : la session devient pleinement valide. */
export async function validerSecondFacteur() {
  const jeton = (await cookies()).get(COOKIE)?.value;
  if (!jeton) return;
  const expiresAt = new Date(Date.now() + DUREE_SESSION_MS);
  await db.update(schema.sessions).set({ verifiee: true, expiresAt }).where(eq(schema.sessions.id, empreinte(jeton)));
  (await cookies()).set(COOKIE, jeton, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", expires: expiresAt });
}

/** À appeler en tête de chaque page et de chaque action serveur. */
export async function contexte(opts: { roles?: Role[]; ignorerChangementMdp?: boolean; ignorerDoubleAuth?: boolean } = {}): Promise<Contexte> {
  const ctx = await contexteOptionnel();
  if (!ctx) redirect("/connexion");
  if (ctx.user.doitChangerMotDePasse && !opts.ignorerChangementMdp) redirect("/mot-de-passe");
  // Le lycée d'entraînement : on y entre depuis son vrai compte, déjà protégé.
  if (!ctx.etab.entrainementDeId && doubleAuthRequise(ctx.user) && !ctx.user.totpActif && !opts.ignorerDoubleAuth && !opts.ignorerChangementMdp) redirect("/double-authentification/activer");
  if (opts.roles && !opts.roles.some((r) => ctx.user.roles.includes(r))) redirect("/");
  return ctx;
}

export class AccesRefuse extends Error {
  constructor() { super("Accès refusé"); }
}
