import { it, expect, vi } from "vitest";
import app from "../src/index";
import { csrf } from "../src/auth";
import { deliver } from "../src/media";
import type { Env, Video } from "../src/types";
const env = {
  ORIGIN: "https://showlet.example",
  ACCESS_AUD: "",
  ACCOUNT_ID: "test",
} as Env;
it("fails closed before Access is configured", async () => {
  const r = await app.fetch(new Request("https://showlet.example/record"), env);
  expect(r.status).toBe(503);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
});
it("rejects missing JWT with configured Access", async () => {
  const r = await app.fetch(new Request("https://showlet.example/api/videos"), {
    ...env,
    ACCESS_AUD: "aud",
  });
  expect(r.status).toBe(401);
});
it("does not expose staff pages on workers.dev or www", async () => {
  for (const host of ["example.workers.dev", "www.showlet.example"])
    expect(
      (await app.fetch(new Request(`https://${host}/record`), env)).status,
    ).toBe(404);
});
it("requires explicit same-origin write headers", () => {
  for (const headers of [
    {},
    { Origin: "https://evil.example", "X-Showlet-Request": "1" },
    { Origin: env.ORIGIN },
  ])
    expect(() =>
      csrf(
        new Request(env.ORIGIN + "/api/videos", { method: "POST", headers }),
        env,
      ),
    ).toThrow();
  expect(() =>
    csrf(
      new Request(env.ORIGIN + "/api/videos", {
        method: "POST",
        headers: { Origin: env.ORIGIN, "X-Showlet-Request": "1" },
      }),
      env,
    ),
  ).not.toThrow();
});
it("returns 206 with exact length and range, without reading whole object", async () => {
  const get = vi.fn().mockResolvedValue({ body: new Uint8Array([1, 2]) });
  const e = {
    ...env,
    MEDIA: {
      head: vi.fn().mockResolvedValue({
        size: 100,
        httpEtag: '"etag"',
        uploaded: new Date(0),
      }),
      get,
    },
  } as unknown as Env;
  const r = await deliver(
    new Request(env.ORIGIN + "/media/id", { headers: { Range: "bytes=0-1" } }),
    e,
    { r2_key: "key", mime: "video/mp4" } as Video,
    false,
  );
  expect(r.status).toBe(206);
  expect(r.headers.get("Content-Range")).toBe("bytes 0-1/100");
  expect(r.headers.get("Content-Length")).toBe("2");
  expect(get).toHaveBeenCalledWith("key", { range: { offset: 0, length: 2 } });
});
it("returns 404 for deleted records before reading media", async () => {
  const first = vi.fn().mockResolvedValue(null),
    prepare = vi.fn().mockReturnValue({ bind: () => ({ first }) }),
    get = vi.fn();
  const e = { ...env, DB: { prepare }, MEDIA: { get } } as unknown as Env;
  const r = await app.fetch(
    new Request(env.ORIGIN + "/media/abcdefghijklmnopqrstuv"),
    e,
  );
  expect(r.status).toBe(404);
  expect(get).not.toHaveBeenCalled();
  expect(prepare.mock.calls[0][0]).toContain("deleted_at IS NULL");
});
