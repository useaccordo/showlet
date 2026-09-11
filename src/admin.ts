import { Env, HttpError, json, body } from "./types";
import { page } from "./pages";
export async function admin(request: Request, env: Env, owner: string) {
  const user = await env.DB.prepare(
    "SELECT role,disabled FROM staff_users WHERE id=?",
  )
    .bind(owner)
    .first<{ role: string; disabled: number }>();
  if (!user || user.role !== "admin" || user.disabled)
    throw new HttpError(403, "Administrator access required.");
  const url = new URL(request.url);
  if (url.pathname === "/library/admin")
    return new Response(
      page(
        "Admin",
        `<div class="heading"><div><p class="eyebrow">SHOWLET ADMIN</p><h1>A view across your team.</h1></div></div><p id="admin-status" role="status"></p><div id="admin-stats" class="admin-stats"></div><section><div class="heading"><h2>Video views over time</h2><label class="period-control">Period<select id="analytics-period"><option value="30">Last 30 days</option><option value="7">Last 7 days</option><option value="90">Last 90 days</option></select></label></div><p class="fine-print">Playback starts, counted once per browser and video each UTC day. Historical page opens are shown separately. Tracking starts with this release.</p><div id="views-chart" class="views-chart"></div><details><summary>View daily totals</summary><div id="views-table" class="table-scroll"></div></details></section><section class="admin-users"><h2>Staff</h2><p class="fine-print">Staff appear after signing in through Cloudflare Access. New emails must first be allowed in the Access policy. Disabling an account blocks staff tools; shared videos keep their existing access settings.</p><div id="users-table" class="table-scroll"></div></section>`,
        "",
        "/admin.js",
        true,
      ),
      { headers: { "Content-Type": "text/html;charset=utf-8" } },
    );
  if (request.method === "PATCH") {
    const input = (await body(request)) as {
      id?: string;
      role?: string;
      disabled?: boolean;
    };
    if (
      !input.id ||
      !["admin", "member"].includes(input.role || "") ||
      typeof input.disabled !== "boolean"
    )
      throw new HttpError(400, "Invalid user settings.");
    if (input.id === owner)
      throw new HttpError(
        400,
        "You cannot change your own administrator access.",
      );
    const target = await env.DB.prepare("SELECT id FROM staff_users WHERE id=?")
      .bind(input.id)
      .first();
    if (!target) throw new HttpError(404, "User not found.");
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE staff_users SET role=?,disabled=? WHERE id=?",
      ).bind(input.role, input.disabled ? 1 : 0, input.id),
      env.DB.prepare(
        "INSERT INTO admin_audit(actor,target,action) VALUES(?,?,?)",
      ).bind(
        owner,
        input.id,
        JSON.stringify({ role: input.role, disabled: input.disabled }),
      ),
    ]);
    return json({ ok: true });
  }
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
  const days = Number(url.searchParams.get("days") || 30);
  if (![7, 30, 90].includes(days)) throw new HttpError(400, "Invalid period");
  const since = new Date(Date.now() - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const results = await env.DB.batch([
    env.DB.prepare(
      "SELECT COUNT(*) AS recordings,COALESCE(SUM(size_bytes),0) AS bytes,COALESCE(SUM(views),0) AS legacyViews FROM videos WHERE deleted_at IS NULL",
    ),
    env.DB.prepare(
      "SELECT day,SUM(views) AS views FROM playback_daily WHERE day>=? GROUP BY day ORDER BY day",
    ).bind(since),
    env.DB.prepare(
      "SELECT u.id,u.email,u.role,u.disabled,u.last_seen,COUNT(v.id) AS recordings FROM staff_users u LEFT JOIN videos v ON v.created_by=u.id AND v.deleted_at IS NULL GROUP BY u.id ORDER BY u.email",
    ),
  ]);
  return json({
    owner,
    stats: results[0].results[0],
    daily: results[1].results,
    users: results[2].results,
    since,
  });
}
