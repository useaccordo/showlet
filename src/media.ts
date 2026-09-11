import { Env, Video, HttpError } from "./types";
export function parseRange(
  header: string,
  size: number,
): { offset: number; length: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) return null;
  let start: number, end: number;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= size ||
      end < start
    )
      return null;
    end = Math.min(end, size - 1);
  }
  if (size === 0) return null;
  return { offset: start, length: end - start + 1 };
}
export async function deliver(
  request: Request,
  env: Env,
  video: Video,
  thumb: boolean,
) {
  const key = thumb ? video.thumb_key : video.r2_key;
  if (!key) throw new HttpError(404, "Not found");
  const object = await env.MEDIA.head(key);
  if (!object) throw new HttpError(404, "Not found");
  const h = new Headers({
    "Content-Type": thumb ? "image/jpeg" : video.mime,
    "Accept-Ranges": "bytes",
    ETag: object.httpEtag,
    "Last-Modified": object.uploaded.toUTCString(),
    "Cache-Control": "private, no-store",
    "Content-Length": String(object.size),
    "X-Content-Type-Options": "nosniff",
  });
  if (request.headers.get("If-None-Match") === object.httpEtag)
    return new Response(null, { status: 304, headers: h });
  let range;
  const requested = request.headers.get("Range"),
    ifRange = request.headers.get("If-Range");
  if (
    request.method !== "HEAD" &&
    requested &&
    (!ifRange ||
      ifRange === object.httpEtag ||
      ifRange === object.uploaded.toUTCString())
  ) {
    range = parseRange(requested, object.size);
    if (!range) {
      h.set("Content-Range", `bytes */${object.size}`);
      h.set("Content-Length", "0");
      return new Response(null, { status: 416, headers: h });
    }
    h.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
    );
    h.set("Content-Length", String(range.length));
  }
  if (request.method === "HEAD") return new Response(null, { headers: h });
  const data = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!data) throw new HttpError(404, "Not found");
  return new Response(data.body, { status: range ? 206 : 200, headers: h });
}
