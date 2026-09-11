import { it, expect, vi } from "vitest";
import { admin } from "../src/admin";
import { playback } from "../src/analytics";
import type { Env } from "../src/types";
const req = (path: string, method = "GET", data?: unknown) =>
  new Request("https://showlet.example" + path, {
    method,
    headers: {
      Origin: "https://showlet.example",
      "Content-Type": "application/json",
      "X-Showlet-Request": "1",
    },
    body: data ? JSON.stringify(data) : undefined,
  });
function env(row: unknown) {
  const run = vi.fn(async () => ({ meta: { changes: 1 } }));
  const bind = vi.fn(() => ({ first: async () => row, run }));
  return {
    env: {
      ORIGIN: "https://showlet.example",
      DB: { prepare: vi.fn(() => ({ bind })), batch: vi.fn() },
    } as unknown as Env,
    run,
    bind,
  };
}
it("denies members and disabled administrators", async () => {
  for (const row of [
    { role: "member", disabled: 0 },
    { role: "admin", disabled: 1 },
    null,
  ]) {
    await expect(
      admin(req("/api/admin"), env(row).env, "owner"),
    ).rejects.toMatchObject({ status: 403 });
  }
});
it("prevents an admin from disabling or demoting themselves", async () => {
  await expect(
    admin(
      req("/api/admin", "PATCH", {
        id: "owner",
        role: "member",
        disabled: true,
      }),
      env({ role: "admin", disabled: 0 }).env,
      "owner",
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("rejects invalid analytics ranges", async () => {
  await expect(
    admin(
      req("/api/admin?days=1000000"),
      env({ role: "admin", disabled: 0 }).env,
      "owner",
    ),
  ).rejects.toMatchObject({ status: 400 });
});
it("requires a passcode before counting a protected playback", async () => {
  const setup = env({ id: "video", passcode_hash: "protected" });
  await expect(
    playback(req("/playback/video", "POST"), setup.env, "video"),
  ).rejects.toMatchObject({ status: 401 });
  expect(setup.run).not.toHaveBeenCalled();
});
it("records a playback using a day-scoped key and sets a private cookie", async () => {
  const setup = env({ id: "video", passcode_hash: null });
  const response = await playback(
    req("/playback/video", "POST"),
    setup.env,
    "video",
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Set-Cookie")).toContain(
    "HttpOnly; Secure; SameSite=Lax",
  );
  expect(setup.bind.mock.calls.at(-1)).toEqual([
    "video",
    expect.stringMatching(/^[a-f0-9]{64}$/),
    expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  ]);
});
it("rejects cross-origin playback requests", async () => {
  const setup = env({});
  await expect(
    playback(
      new Request("https://showlet.example/playback/video", { method: "POST" }),
      setup.env,
      "video",
    ),
  ).rejects.toMatchObject({ status: 403 });
});
