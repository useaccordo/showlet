export interface Env {
  ADMIN_EMAILS: string;
  PASSCODE_ENCRYPTION_KEY: string;
  AI: Ai;
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  ORIGIN: string;
  ACCESS_ISSUER: string;
  ACCESS_AUD: string;
  MAX_DURATION: string;
  MAX_BYTES: string;
  R2_BUCKET: string;
  ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}
export interface Video {
  transcript: string | null;
  passcode_hash: string | null;
  passcode_encrypted: string | null;
  id: string;
  title: string;
  r2_key: string;
  thumb_key: string | null;
  mime: string;
  size_bytes: number;
  duration_sec: number;
  created_by: string;
  created_at: string;
  views: number;
  deleted_at: string | null;
  storage: string;
  media_purged_at: string | null;
}
export interface Upload {
  transcript: string | null;
  public_acknowledged_at: string | null;
  passcode_hash: string | null;
  passcode_encrypted: string | null;
  id: string;
  video_id: string;
  created_by: string;
  title: string;
  r2_key: string;
  thumb_key: string;
  mime: string;
  expected_size_bytes: number;
  duration_sec: number;
  multipart_upload_id: string | null;
  state: string;
  expires_at: string;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export const id = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
export function title(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new HttpError(400, "Title must be 1–200 characters.");
  return value.trim();
}
export async function bytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing JSON");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request too large");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  return bytes;
}
export async function body(request: Request, limit = 16384) {
  const data = await bytes(request, limit);
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function publishingTitle(value: unknown) {
  const name = title(value);
  if (/^[\d\s/.,:\-]+(?:[ap]\.?m\.?)?$/i.test(name))
    throw new HttpError(
      400,
      "Give your recording a descriptive title instead of a date and time.",
    );
  return name;
}

export function transcriptText(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 60000)
    throw new HttpError(400, "Transcript is too long.");
  return value.trim() || null;
}
export function requirePublicAcknowledgment(
  passcode: unknown,
  acknowledged: unknown,
) {
  if (passcode == null && acknowledged !== true)
    throw new HttpError(
      400,
      "Confirm that anyone with the link can watch and forward this recording without a passcode.",
    );
}
