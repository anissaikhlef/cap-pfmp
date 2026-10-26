import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { typeReel, nomPropre } = await import("@/lib/stockage");

describe("détection du type de fichier", () => {
  it("reconnaît un PDF", () => expect(typeReel(Buffer.from("%PDF-1.7 ..."))?.mime).toBe("application/pdf"));
  it("reconnaît un JPEG", () => expect(typeReel(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.ext).toBe("jpg"));
  it("refuse un HTML déguisé en PDF", () => expect(typeReel(Buffer.from("<html><script>alert(1)</script>"))).toBeNull());
  it("refuse un exécutable", () => expect(typeReel(Buffer.from("MZ\x90\x00"))).toBeNull());
  it("nettoie les noms de fichier", () => expect(nomPropre("../../etc/passwd convention é")).toBe("....etcpasswd_convention_e"));
});
