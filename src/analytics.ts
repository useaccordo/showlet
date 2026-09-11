import { Env, Video, HttpError, json } from "./types";
import { canView } from "./passcodes";
export async function playback(request: Request, env: Env, id: string) {
  if (
    request.method !== "POST" ||
    request.headers.get("Origin") !== env.ORIGIN ||
    request.headers.get("X-Showlet-Request") !== "1"
  )
    throw new HttpError(403, "Invalid playback request");
  const v = await env.DB.prepare(
    "SELECT * FROM videos WHERE id=? AND deleted_at IS NULL",
  )
    .bind(id)
    .first<Video>();
  if (!v) throw new HttpError(404, "Not found");
  if (!(await canView(request, v)))
    throw new HttpError(401, "Passcode required");
  const raw = request.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)showlet_viewer=([a-f0-9-]{36})(?:;|$)/)?.[1];
  const viewer = raw || crypto.randomUUID();
  const day = new Date().toISOString().slice(0, 10);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(day + ":" + viewer),
  );
  const key = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO playback_events(video_id,viewer_key,day) VALUES(?,?,?)",
  )
    .bind(id, key, day)
    .run();
  const result = json({ ok: true });
  if (!raw)
    result.headers.set(
      "Set-Cookie",
      `showlet_viewer=${viewer}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    );
  return result;
}
