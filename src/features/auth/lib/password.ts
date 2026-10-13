import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** Password hashing with scrypt from Node's standard library, so no native dependency is needed. */

const KEY_LENGTH = 64;
// OWASP's minimum scrypt parameters (N=2^17, r=8, p=1) need ~128 MiB; N=2^15 keeps a login around
// 50 ms and 32 MiB, which suits a serverless function. The parameters are stored with each hash.
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

export const MIN_PASSWORD_LENGTH = 8;
/** Bounds the work a single request can force on the server. */
export const MAX_PASSWORD_LENGTH = 128;

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: cost, r: BLOCK_SIZE, p: PARALLELISM, maxmem: 256 * cost * BLOCK_SIZE },
      (error, key) => (error ? reject(error) : resolve(key))
    );
  });
}

/** Returns `scrypt$<cost>$<salt>$<hash>` (salt and hash base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST);
  return `scrypt$${COST}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, salt, hash] = stored.split("$");
  const n = Number(cost);
  if (scheme !== "scrypt" || !Number.isInteger(n) || n < 2 ** 10 || n > 2 ** 20 || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), n);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A real hash nobody knows the password for. Checked when the email is unknown, so timing does not reveal which emails exist. */
let decoy: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(16).toString("hex"));
  return decoy;
}
