import crypto from "node:crypto";
import { promisify } from "node:util";

/**
 * Құпия сөз хэші: Node crypto.scrypt (N=16384, r=8, p=1), 16 байт тұз, 64 байт кілт.
 * Пішімі: scrypt$16384$8$1$<salt b64url>$<hash b64url>. Салыстыру — timingSafeEqual.
 */
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Қалпына келтіру токенінің хэші (дерекқорда тек осы сақталады). */
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
