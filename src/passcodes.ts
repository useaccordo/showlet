import { Env, HttpError, Video, id } from "./types";
const enc = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
async function derive(passcode: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: enc.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      key,
      256,
    ),
  );
}
export async function hashPasscode(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 128 ||
    !value.trim()
  )
    throw new HttpError(400, "Use a passcode between 8 and 128 characters.");
  const salt = id();
  return `pbkdf2$${salt}$${await derive(value, salt)}`;
}
export async function checkPasscode(value: unknown, stored: string) {
  if (typeof value !== "string" || value.length > 128) return false;
  const [version, salt, expected] = stored.split("$");
  if (version !== "pbkdf2" || !salt || !expected) return false;
  const actual = await derive(value, salt);
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
const cookieName = (v: Video) => `__Host-showlet_${v.id}`;
async function signature(v: Video, expires: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(v.passcode_hash!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", key, enc.encode(`${v.id}:${expires}`)),
  );
}
export async function viewerCookie(v: Video) {
  const expires = String(Math.floor(Date.now() / 1000) + 43200);
  return `${cookieName(v)}=${expires}.${await signature(v, expires)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=43200`;
}
export async function canView(request: Request, v: Video) {
  if (!v.passcode_hash) return true;
  const token = request.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName(v) + "="))
    ?.split("=")[1];
  if (!token) return false;
  const [expires, supplied] = token.split(".");
  if (
    !/^\d+$/.test(expires) ||
    !/^[a-f0-9]{64}$/.test(supplied || "") ||
    Number(expires) <= Date.now() / 1000 ||
    Number(expires) > Date.now() / 1000 + 43200
  )
    return false;
  const expected = await signature(v, expires);
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return difference === 0;
}
export async function limitAttempts(request: Request, env: Env, vid: string) {
  const now = Math.floor(Date.now() / 1000);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const key = hex(
    await crypto.subtle.digest("SHA-256", enc.encode(`${vid}:${ip}`)),
  );
  const row = await env.DB.prepare(
    `INSERT INTO viewer_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,
  )
    .bind(key, now + 900, now, now)
    .first<{ attempts: number }>();
  if (!row || row.attempts > 10)
    throw new HttpError(
      429,
      "Too many attempts. Please try again in 15 minutes.",
    );
}

async function encryptionKey(env: Env) {
  if (!env.PASSCODE_ENCRYPTION_KEY)
    throw new HttpError(503, "Passcode sharing is temporarily unavailable.");
  const raw = Uint8Array.from(atob(env.PASSCODE_ENCRYPTION_KEY), (c) =>
    c.charCodeAt(0),
  );
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptPasscode(value: string, vid: string, env: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(vid) },
    await encryptionKey(env),
    enc.encode(value),
  );
  return (
    "v1." +
    btoa(String.fromCharCode(...iv)) +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  );
}
export async function decryptPasscode(value: string, vid: string, env: Env) {
  try {
    const [version, nonce, cipher] = value.split(".");
    if (version !== "v1") throw Error("Unknown version");
    const iv = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0)),
      data = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: enc.encode(vid) },
        await encryptionKey(env),
        data,
      ),
    );
  } catch {
    throw new HttpError(
      503,
      "The saved passcode could not be read. Set a new passcode in Sharing to restore one-copy sharing.",
    );
  }
}
