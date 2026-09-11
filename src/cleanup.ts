import { Env, Upload, Video } from "./types";
export async function cleanup(env: Env) {
  await env.DB.prepare("DELETE FROM playback_events WHERE day < ?")
    .bind(new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10))
    .run();
  await env.DB.prepare("DELETE FROM ai_usage WHERE day < ?")
    .bind(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
    .run();
  await env.DB.prepare("DELETE FROM viewer_attempts WHERE expires_at < ?")
    .bind(Math.floor(Date.now() / 1000))
    .run();
  const expired = await env.DB.prepare(
    "SELECT * FROM upload_sessions WHERE expires_at < ? AND state != 'complete' LIMIT 100",
  )
    .bind(new Date().toISOString())
    .all<Upload>();
  for (const s of expired.results) {
    const claim = await env.DB.prepare(
      "UPDATE upload_sessions SET state='aborted' WHERE id=? AND state!='complete'",
    )
      .bind(s.id)
      .run();
    if (!claim.meta.changes) continue;
    if (s.multipart_upload_id)
      try {
        await env.MEDIA.resumeMultipartUpload(
          s.r2_key,
          s.multipart_upload_id,
        ).abort();
      } catch {}
    await env.MEDIA.delete([s.r2_key, s.thumb_key]);
    await env.DB.prepare(
      "DELETE FROM upload_sessions WHERE id=? AND state='aborted'",
    )
      .bind(s.id)
      .run();
  }
  const deleted = await env.DB.prepare(
    "SELECT * FROM videos WHERE deleted_at IS NOT NULL AND media_purged_at IS NULL ORDER BY deleted_at LIMIT 100",
  ).all<Video>();
  for (const v of deleted.results) {
    await env.MEDIA.delete([v.r2_key, ...(v.thumb_key ? [v.thumb_key] : [])]);
    await env.DB.prepare(
      "UPDATE videos SET media_purged_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    )
      .bind(v.id)
      .run();
  }
  // Completed sessions are not needed after their presigned URLs have expired.
  await env.DB.prepare(
    "DELETE FROM upload_sessions WHERE state='complete' AND expires_at < ?",
  )
    .bind(new Date().toISOString())
    .run();
}
