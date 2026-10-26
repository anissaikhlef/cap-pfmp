import { describe, expect, it } from "vitest";
import { base32, code, deBase32, verifier, nouveauSecret } from "@/lib/totp";

// Vecteurs de test officiels de la RFC 6238 (secret ASCII « 12345678901234567890 », SHA-1, 8 chiffres)
const SECRET = base32(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("encode et décode en base 32", () => expect(deBase32(SECRET).toString()).toBe("12345678901234567890"));
  it("vecteur RFC à T=59 s", () => expect(code(SECRET, 59_000, 8)).toBe("94287082"));
  it("vecteur RFC à T=1111111109 s", () => expect(code(SECRET, 1111111109_000, 8)).toBe("07081804"));
  it("vecteur RFC à T=2000000000 s", () => expect(code(SECRET, 2000000000_000, 8)).toBe("69279037"));
  it("accepte le code courant et le précédent", () => {
    const s = nouveauSecret();
    const t = 1_800_000_000_000;
    expect(verifier(s, code(s, t), t)).toBe(true);
    expect(verifier(s, code(s, t - 30_000), t)).toBe(true);
  });
  it("refuse un code trop ancien ou mal formé", () => {
    const s = nouveauSecret();
    const t = 1_800_000_000_000;
    expect(verifier(s, code(s, t - 120_000), t)).toBe(false);
    expect(verifier(s, "12a456", t)).toBe(false);
  });
});
