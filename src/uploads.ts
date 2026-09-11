import { AwsClient } from "aws4fetch";
import {
  Env,
  Upload,
  HttpError,
  body,
  id,
  json,
  publishingTitle,
  transcriptText,
  requirePublicAcknowledgment,
} from "./types";
import { hashPasscode, encryptPasscode } from "./passcodes";
const PART = 16 * 1024 * 1024;
async function sign(env: Env, key: string, query: Record<string, string> = {}) {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
    throw new HttpError(503, "Upload credentials are not configured");
  const url = new URL(
    `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`,
  );
  url.searchParams.set("X-Amz-Expires", "900");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  }).sign(url, { method: "PUT", aws: { signQuery: true } });
  return signed.url;
}
export async function uploads(
  request: Request,
  env: Env,
  owner: string,
  path: string,
) {
  if (path === "/api/uploads" && request.method === "POST") {
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
      throw new HttpError(503, "Upload credentials are not configured");
    const b = await body(request, 262144),
      name = publishingTitle(b.title);
    requirePublicAcknowledgment(b.passcode, b.publicAcknowledged);
    const transcript = transcriptText(b.transcript);
    const passcodeHash =
      b.passcode == null ? null : await hashPasscode(b.passcode);
    if (
      !["video/mp4", "video/webm"].includes(b.mime) ||
      !Number.isSafeInteger(b.size) ||
      b.size <= 0 ||
      b.size > Number(env.MAX_BYTES) ||
      !Number.isFinite(b.duration) ||
      b.duration <= 0 ||
      b.duration > Number(env.MAX_DURATION) + 1
    )
      throw new HttpError(400, "Invalid recording size, duration, or format");
    const uid = id(),
      vid = id(),
      key = `videos/${vid}/${uid}.${b.mime === "video/mp4" ? "mp4" : "webm"}`,
      thumb = `thumbnails/${vid}/${uid}.jpg`;
    const encrypted =
      b.passcode == null ? null : await encryptPasscode(b.passcode, vid, env);
    let multipart: R2MultipartUpload | undefined;
    if (b.size > PART)
      multipart = await env.MEDIA.createMultipartUpload(key, {
        httpMetadata: { contentType: b.mime },
      });
    try {
      await env.DB.prepare(
        "INSERT INTO upload_sessions(id,video_id,created_by,title,r2_key,thumb_key,mime,expected_size_bytes,duration_sec,multipart_upload_id,expires_at,passcode_hash,transcript,public_acknowledged_at,passcode_encrypted) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(
          uid,
          vid,
          owner,
          name,
          key,
          thumb,
          b.mime,
          b.size,
          b.duration,
          multipart?.uploadId ?? null,
          new Date(Date.now() + 86400000).toISOString(),
          passcodeHash,
          transcript,
          passcodeHash ? null : new Date().toISOString(),
          encrypted,
        )
        .run();
    } catch (e) {
      await multipart?.abort();
      throw e;
    }
    return json({
      id: uid,
      partSize: PART,
      parts: Math.ceil(b.size / PART),
      multipart: !!multipart,
      thumbnailUrl: await sign(env, thumb),
      uploadUrl: multipart ? null : await sign(env, key),
    });
  }
  const match =
    /^\/api\/uploads\/([\w-]{22})(?:\/(parts|complete|abort))?$/.exec(path);
  if (!match) throw new HttpError(404, "Not found");
  const s = await env.DB.prepare(
    "SELECT * FROM upload_sessions WHERE id=? AND created_by=?",
  )
    .bind(match[1], owner)
    .first<Upload>();
  if (!s) throw new HttpError(404, "Upload not found");
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
  if (match[2] === "complete" && s.state === "complete")
    return json({ url: `${env.ORIGIN}/v/${s.video_id}` });
  if (s.state === "aborted" || Date.parse(s.expires_at) < Date.now())
    throw new HttpError(410, "Upload expired");
  if (match[2] === "parts") {
    if (s.state !== "pending" || !s.multipart_upload_id)
      throw new HttpError(409, "Upload is not pending");
    const b = await body(request);
    if (
      !Number.isInteger(b.part) ||
      b.part < 1 ||
      b.part > Math.ceil(s.expected_size_bytes / PART)
    )
      throw new HttpError(400, "Invalid part");
    return json({
      url: await sign(env, s.r2_key, {
        partNumber: String(b.part),
        uploadId: s.multipart_upload_id,
      }),
    });
  }
  if (match[2] === "abort") {
    const claimed = await env.DB.prepare(
      "UPDATE upload_sessions SET state='aborted' WHERE id=? AND state='pending'",
    )
      .bind(s.id)
      .run();
    if (!claimed.meta.changes)
      throw new HttpError(409, "Upload is completing or already completed");
    if (s.multipart_upload_id)
      try {
        await env.MEDIA.resumeMultipartUpload(
          s.r2_key,
          s.multipart_upload_id,
        ).abort();
      } catch {}
    await env.MEDIA.delete([s.r2_key, s.thumb_key]);
    return json({ ok: true });
  }
  if (match[2] === "complete") {
    if (!s.passcode_hash && !s.public_acknowledged_at)
      throw new HttpError(
        400,
        "Confirm public sharing before publishing. Refresh and retry.",
      );
    const b = await body(request);
    const claimed = await env.DB.prepare(
      "UPDATE upload_sessions SET state='finalizing' WHERE id=? AND state IN ('pending','finalizing')",
    )
      .bind(s.id)
      .run();
    if (!claimed.meta.changes)
      throw new HttpError(409, "Upload is no longer pending");
    if (s.multipart_upload_id) {
      const parts = b.parts as R2UploadedPart[];
      if (
        !Array.isArray(parts) ||
        parts.length !== Math.ceil(s.expected_size_bytes / PART) ||
        parts.some(
          (p, i) =>
            p.partNumber !== i + 1 ||
            typeof p.etag !== "string" ||
            p.etag.length > 200,
        )
      )
        throw new HttpError(400, "Invalid parts");
      if (!(await env.MEDIA.head(s.r2_key)))
        await env.MEDIA.resumeMultipartUpload(
          s.r2_key,
          s.multipart_upload_id,
        ).complete(parts);
    }
    const [file, thumb] = await Promise.all([
      env.MEDIA.head(s.r2_key),
      env.MEDIA.head(s.thumb_key),
    ]);
    if (
      !file ||
      file.size !== s.expected_size_bytes ||
      !thumb ||
      thumb.size > 2 * 1024 * 1024
    )
      throw new HttpError(400, "Uploaded objects are missing or do not match");
    // Publication and session completion commit together; repeated completion is harmless.
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO videos(id,title,r2_key,thumb_key,mime,size_bytes,duration_sec,created_by,passcode_hash,transcript,passcode_encrypted) SELECT video_id,title,r2_key,thumb_key,mime,expected_size_bytes,duration_sec,created_by,passcode_hash,transcript,passcode_encrypted FROM upload_sessions WHERE id=? AND state='finalizing'",
      ).bind(s.id),
      env.DB.prepare(
        "UPDATE upload_sessions SET state='complete' WHERE id=? AND state='finalizing'",
      ).bind(s.id),
    ]);
    const ready = await env.DB.prepare(
      "SELECT id FROM videos WHERE id=? AND deleted_at IS NULL",
    )
      .bind(s.video_id)
      .first();
    if (!ready) throw new HttpError(409, "Upload was cancelled");
    return json({ url: `${env.ORIGIN}/v/${s.video_id}` });
  }
  throw new HttpError(404, "Not found");
}
