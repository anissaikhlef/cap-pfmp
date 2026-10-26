/** Codes à usage unique (TOTP, RFC 6238) compatibles avec les applications d'authentification courantes. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(b: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const x of b) {
    val = (val << 8) | x; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

export function deBase32(s: string): Buffer {
  const t = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of t) {
    val = (val << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function nouveauSecret(): string {
  return base32(randomBytes(20));
}

export function code(secret: string, quand = Date.now(), chiffres = 6, pas = 30): string {
  const compteur = Math.floor(quand / 1000 / pas);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(compteur));
  const h = createHmac("sha1", deBase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** chiffres).padStart(chiffres, "0");
}

/** Accepte le code de la période en cours et des périodes voisines (décalage d'horloge du téléphone). */
export function verifier(secret: string, saisi: string, quand = Date.now()): boolean {
  const c = saisi.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  return [-1, 0, 1].some((d) => {
    const attendu = Buffer.from(code(secret, quand + d * 30_000));
    return timingSafeEqual(attendu, Buffer.from(c));
  });
}

export function lienApplication(secret: string, compte: string, emetteur = "Cap PFMP"): string {
  return `otpauth://totp/${encodeURIComponent(emetteur)}:${encodeURIComponent(compte)}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=6&period=30`;
}
