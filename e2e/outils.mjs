import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH ?? "playwright");

export const BASE = process.env.BASE ?? "http://localhost:3100";
export const MDP = "Demo-pfmp-2026";
export const D = "demo.cap-pfmp.example";
export const OUT = process.env.OUT ?? ".";
export const erreurs = [];
export const ok = (c, m) => { if (!c) erreurs.push(m); console.log(`${c ? "✓" : "✕"} ${m}`); };
export const visible = (loc) => loc.first().waitFor({ timeout: 8000 }).then(() => true, () => false);

export const browser = await chromium.launch();
export async function session(email, viewport = { width: 1200, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => erreurs.push(`JS ${email}: ${e.message}`));
  await p.goto(BASE + "/connexion");
  await p.fill("#email", email.includes("@") ? email : `${email}@${D}`);
  await p.fill("#motdepasse", MDP);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/connexion")), p.click("button:has-text('Se connecter')")]);
  await p.waitForLoadState("networkidle");
  // Formation incluse : la visite guidée s'ouvre à la première connexion ; les parcours la passent.
  const passer = p.locator("button:has-text('Passer la visite')");
  if (await passer.isVisible().catch(() => false)) { await passer.click(); await p.waitForTimeout(300); }
  return p;
}
export async function fin() {
  await browser.close();
  console.log(erreurs.length ? `\n${erreurs.length} PROBLÈME(S)\n- ${erreurs.join("\n- ")}` : "\nTout est bon.");
  process.exit(erreurs.length ? 1 : 0);
}
