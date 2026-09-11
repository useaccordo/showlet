import {
  Env,
  Video,
  HttpError,
  json,
  body,
  title,
  requirePublicAcknowledgment,
  transcriptText,
} from "./types";
import { cleanup } from "./cleanup";
import { authenticate, csrf } from "./auth";
import { uploads } from "./uploads";
import { deliver } from "./media";
import {
  page,
  missing,
  recording,
  library,
  share,
  locked,
  manage,
  signIn,
  landing,
} from "./pages";
import {
  hashPasscode,
  encryptPasscode,
  decryptPasscode,
  checkPasscode,
  viewerCookie,
  canView,
  limitAttempts,
} from "./passcodes";
import { onboarding } from "./onboarding";
import { admin } from "./admin";
import { playback } from "./analytics";
import { aiRequest } from "./transcripts";
export default {
  async scheduled(_event: ScheduledController, env: Env) {
    await cleanup(env);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url),
      path = url.pathname;
    let response: Response;
    try {
      if (
        url.origin !== env.ORIGIN &&
        !["localhost", "127.0.0.1"].includes(url.hostname)
      )
        throw new HttpError(404, "Not found");
      const protectedRoute = /^\/(record|library|api)(\/|$)/.test(path);
      let owner = "";
      if (protectedRoute) {
        owner = await authenticate(request, env);
        csrf(request, env);
      }
      const guide = protectedRoute
        ? await onboarding(request, env, owner)
        : null;
      if (guide) response = guide;
      else if (path === "/signin")
        response = new Response(signIn(), {
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      else if (path === "/library/admin" || path === "/api/admin")
        response = await admin(request, env, owner);
      else if (/^\/playback\/[\w-]{22}$/.test(path))
        response = await playback(request, env, path.split("/")[2]);
      else if (path === "/api/transcribe" || path === "/api/suggest-title")
        response = await aiRequest(request, env, path);
      else if (path.startsWith("/api/uploads"))
        response = await uploads(request, env, owner, path);
      else if (path === "/api/videos" && request.method === "GET")
        response = json(
          (
            await env.DB.prepare(
              "SELECT id,title,created_at,duration_sec,views+COALESCE((SELECT SUM(p.views) FROM playback_daily p WHERE p.video_id=videos.id),0) AS views,passcode_hash IS NOT NULL AS passcode_protected FROM videos WHERE created_by=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500",
            )
              .bind(owner)
              .all()
          ).results,
        );
      else if (
        /^\/(?:library|api\/videos)\/[\w-]{22}(?:\/(?:media|thumb|share))?$/.test(
          path,
        ) &&
        ["GET", "HEAD"].includes(request.method)
      ) {
        const vid = path.startsWith("/library/")
          ? path.split("/")[2]
          : path.split("/")[3];
        const v = await env.DB.prepare(
          "SELECT * FROM videos WHERE id=? AND created_by=? AND deleted_at IS NULL",
        )
          .bind(vid, owner)
          .first<Video>();
        if (!v) throw new HttpError(404, "Not found");
        if (path.startsWith("/library/")) {
          const totals = await env.DB.prepare(
            "SELECT COALESCE(SUM(views),0) AS views FROM playback_daily WHERE video_id=?",
          )
            .bind(vid)
            .first<{ views: number }>();
          v.views += totals?.views || 0;
        }
        if (path.startsWith("/library/") && path.split("/").length === 3)
          response = new Response(
            manage(
              v,
              env,
              v.passcode_hash && v.passcode_encrypted
                ? await decryptPasscode(v.passcode_encrypted, vid, env)
                : null,
            ),
            {
              headers: { "Content-Type": "text/html;charset=utf-8" },
            },
          );
        else if (path === `/api/videos/${vid}/share`) {
          if (v.passcode_hash && !v.passcode_encrypted)
            throw new HttpError(
              409,
              "This passcode was set before one-copy sharing was available. Set it again in Sharing, then copy the link and passcode together.",
            );
          const passcode = v.passcode_hash
            ? await decryptPasscode(v.passcode_encrypted!, vid, env)
            : null;
          response = json({
            text: `Watch this Showlet recording:\n\n${v.title}\n\nVideo: ${env.ORIGIN}/v/${vid}${passcode ? `\n\nPasscode: ${passcode}\nEnter this passcode when prompted to watch.` : ""}`,
            protected: !!passcode,
          });
        } else if (
          path.startsWith("/api/videos/") &&
          (path.endsWith("/media") || path.endsWith("/thumb"))
        )
          response = await deliver(request, env, v, path.endsWith("/thumb"));
        else if (
          path.startsWith("/api/videos/") &&
          path.split("/").length === 4
        )
          response = json({
            id: v.id,
            title: v.title,
            transcript: v.transcript,
            duration_sec: v.duration_sec,
            created_at: v.created_at,
            views: v.views,
            size_bytes: v.size_bytes,
            passcode_protected: !!v.passcode_hash,
          });
        else throw new HttpError(404, "Not found");
      } else if (/^\/api\/videos\/[\w-]{22}$/.test(path)) {
        const vid = path.split("/")[3],
          v = await env.DB.prepare(
            "SELECT * FROM videos WHERE id=? AND created_by=?",
          )
            .bind(vid, owner)
            .first<Video>();
        if (!v) throw new HttpError(404, "Not found");
        if (request.method === "PATCH" && !v.deleted_at) {
          const changes = await body(request, 262144);
          if (Object.hasOwn(changes, "passcode")) {
            requirePublicAcknowledgment(
              changes.passcode,
              changes.publicAcknowledged,
            );
            const hash =
              changes.passcode === null
                ? null
                : await hashPasscode(changes.passcode);
            const encrypted =
              changes.passcode === null
                ? null
                : await encryptPasscode(changes.passcode, vid, env);
            await env.DB.prepare(
              "UPDATE videos SET passcode_hash=?,passcode_encrypted=? WHERE id=? AND created_by=? AND deleted_at IS NULL",
            )
              .bind(hash, encrypted, vid, owner)
              .run();
          } else {
            await env.DB.prepare(
              "UPDATE videos SET title=?,transcript=? WHERE id=? AND created_by=? AND deleted_at IS NULL",
            )
              .bind(
                Object.hasOwn(changes, "title")
                  ? title(changes.title)
                  : v.title,
                Object.hasOwn(changes, "transcript")
                  ? transcriptText(changes.transcript)
                  : v.transcript,
                vid,
                owner,
              )
              .run();
          }
          response = json({ ok: true });
        } else if (request.method === "DELETE") {
          await env.DB.prepare(
            "UPDATE videos SET deleted_at=COALESCE(deleted_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=?",
          )
            .bind(vid)
            .run();
          await env.MEDIA.delete([
            v.r2_key,
            ...(v.thumb_key ? [v.thumb_key] : []),
          ]);
          await env.DB.prepare(
            "UPDATE videos SET media_purged_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
          )
            .bind(vid)
            .run();
          response = json({ ok: true });
        } else throw new HttpError(405, "Method not allowed");
      } else if (
        /^\/unlock\/[\w-]{22}$/.test(path) &&
        request.method === "POST"
      ) {
        csrf(request, env);
        const vid = path.split("/")[2];
        const v = await env.DB.prepare(
          "SELECT * FROM videos WHERE id=? AND deleted_at IS NULL",
        )
          .bind(vid)
          .first<Video>();
        if (!v) throw new HttpError(404, "Not found");
        if (!v.passcode_hash) response = json({ ok: true });
        else {
          await limitAttempts(request, env, vid);
          if (
            !(await checkPasscode(
              (await body(request)).passcode,
              v.passcode_hash,
            ))
          )
            throw new HttpError(401, "That passcode didn’t match. Try again.");
          response = new Response(JSON.stringify({ ok: true }), {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": await viewerCookie(v),
              "Cache-Control": "no-store",
            },
          });
        }
      } else if (!["GET", "HEAD"].includes(request.method))
        throw new HttpError(405, "Method not allowed");
      else if (path === "/record")
        response = new Response(recording(env), {
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      else if (path === "/library")
        response = new Response(library(), {
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      else if (path === "/")
        response = new Response(landing(), {
          headers: { "Content-Type": "text/html;charset=utf-8" },
        });
      else if (/^\/(v|e|media|thumb)\/[\w-]{22}$/.test(path)) {
        const [, kind, vid] = path.split("/"),
          v = await env.DB.prepare(
            "SELECT * FROM videos WHERE id=? AND deleted_at IS NULL",
          )
            .bind(vid)
            .first<Video>();
        if (!v) throw new HttpError(404, "Not found");
        if (v.storage !== "r2") throw new HttpError(503, "Storage unavailable");
        if (!(await canView(request, v))) {
          response =
            kind === "media" || kind === "thumb"
              ? json({ error: "Passcode required" }, 401)
              : new Response(locked(v.id, kind === "e"), {
                  headers: { "Content-Type": "text/html;charset=utf-8" },
                });
        } else if (kind === "media" || kind === "thumb")
          response = await deliver(request, env, v, kind === "thumb");
        else {
          response = new Response(share(v, env, kind === "e"), {
            headers: { "Content-Type": "text/html;charset=utf-8" },
          });
        }
      } else if (
        [
          "/app.css",
          "/assets/favicon.svg",
          "/assets/showlet-illustration.svg",
          "/record.js",
          "/transcription.js",
          "/library.js",
          "/manage.js",
          "/copy-share.js",
          "/local-time.js",
          "/theme.js",
          "/admin.js",
          "/help.js",
          "/playback.js",
          "/viewer.js",
          "/unlock.js",
          "/vendor/fix-webm-duration.js",
        ].includes(path)
      )
        response = await env.ASSETS.fetch(request);
      else throw new HttpError(404, "Not found");
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      response =
        path.startsWith("/api/") || path.startsWith("/unlock/")
          ? json(
              {
                error:
                  e instanceof HttpError
                    ? e.message
                    : "Something went wrong. Please retry.",
              },
              status,
            )
          : new Response(
              status === 404
                ? missing()
                : page(
                    "Unavailable",
                    `<h1>${status === 503 ? "Setup in progress" : status === 401 ? "Staff login required" : "Request unavailable"}</h1>`,
                  ),
              {
                status,
                headers: { "Content-Type": "text/html;charset=utf-8" },
              },
            );
    }
    const h = new Headers(response.headers);
    h.set("X-Robots-Tag", "noindex, nofollow");
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "no-referrer");
    if (!path.startsWith("/e/")) h.set("X-Frame-Options", "DENY");
    h.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self' https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com; frame-ancestors ${path.startsWith("/e/") ? "*" : "'none'"}; base-uri 'none'; form-action 'self'`,
    );
    if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
    return new Response(request.method === "HEAD" ? null : response.body, {
      status: response.status,
      headers: h,
    });
  },
};
