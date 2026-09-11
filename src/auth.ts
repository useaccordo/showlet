import { createRemoteJWKSet, jwtVerify } from "jose";
import { Env, HttpError } from "./types";
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function authenticate(request: Request, env: Env) {
  if (!env.ACCESS_AUD)
    throw new HttpError(503, "Staff authentication is not configured yet.");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "Staff login required");
  try {
    let jwks = keys.get(env.ACCESS_ISSUER);
    if (!jwks) {
      jwks = createRemoteJWKSet(
        new URL(env.ACCESS_ISSUER + "/cdn-cgi/access/certs"),
      );
      keys.set(env.ACCESS_ISSUER, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.ACCESS_ISSUER,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
    });
    if (!payload.sub) throw Error("No subject");
    const email =
      typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email) throw Error("Missing verified email");
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE staff_users SET id=? WHERE id=? AND email=? AND NOT EXISTS (SELECT 1 FROM staff_users WHERE id=?)",
    )
      .bind(payload.sub, "pending:" + email, email, payload.sub)
      .run();
    await env.DB.prepare(
      "INSERT INTO staff_users(id,email,role,created_at,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,last_seen=excluded.last_seen",
    )
      .bind(
        payload.sub,
        email,
        (env.ADMIN_EMAILS || "")
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .includes(email)
          ? "admin"
          : "member",
        now,
        now,
      )
      .run();
    const user = await env.DB.prepare(
      "SELECT disabled FROM staff_users WHERE id=?",
    )
      .bind(payload.sub)
      .first<{ disabled: number }>();
    if (!user || user.disabled)
      throw new HttpError(403, "Your staff account is disabled.");
    return payload.sub;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Invalid staff session");
  }
}
export function csrf(request: Request, env: Env) {
  if (
    !["GET", "HEAD"].includes(request.method) &&
    (request.headers.get("Origin") !== env.ORIGIN ||
      request.headers.get("X-Showlet-Request") !== "1")
  )
    throw new HttpError(403, "Invalid request origin");
}
