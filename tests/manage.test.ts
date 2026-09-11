import { it, expect, vi } from "vitest";
vi.mock("../src/auth", async (original) => ({
  ...(await original<typeof import("../src/auth")>()),
  authenticate: async () => "owner",
}));
import app from "../src/index";
import { encryptPasscode } from "../src/passcodes";
import type { Env, Video } from "../src/types";
const vid = "abcdefghijklmnopqrstuv";
function setup(createdBy = "owner") {
  const video = {
    id: vid,
    title: "Test title",
    transcript: "Private transcript",
    passcode_hash: "never-expose-this",
    created_by: createdBy,
    created_at: "2026-09-10",
    duration_sec: 17,
    size_bytes: 10,
    views: 5,
    deleted_at: null,
    r2_key: "video",
    thumb_key: "thumb",
    mime: "video/mp4",
  } as Video;
  const writes: any[] = [];
  const prepare = vi.fn((sql: string) => ({
    bind: (...values: unknown[]) => ({
      first: async () => (values[1] === video.created_by ? video : null),
      run: async () => {
        writes.push({ sql, values });
        return { meta: { changes: 1 } };
      },
    }),
  }));
  const head = vi.fn().mockResolvedValue({
      size: 10,
      httpEtag: '"etag"',
      uploaded: new Date(),
    }),
    get = vi.fn().mockResolvedValue({ body: new Uint8Array([1, 2]) });
  return {
    video,
    env: {
      ORIGIN: "https://showlet.example",
      PASSCODE_ENCRYPTION_KEY: btoa("a".repeat(32)),
      DB: { prepare },
      MEDIA: { head, get },
    } as unknown as Env,
    prepare,
    head,
    get,
    writes,
  };
}
it("owner can open protected video management without a viewer passcode", async () => {
  const { env } = setup();
  const r = await app.fetch(new Request(env.ORIGIN + "/library/" + vid), env);
  const html = await r.text();
  expect(r.status).toBe(200);
  expect(html).toContain("Save changes");
  expect(html).toContain("Private transcript");
  expect(html).not.toContain("never-expose-this");
  expect(r.headers.get("Cache-Control")).toBe("no-store");
});
it("management, metadata, and media deny other owners before reading R2", async () => {
  const { env, head, get } = setup("different-owner");
  for (const path of [
    "/library/" + vid,
    "/api/videos/" + vid,
    "/api/videos/" + vid + "/media",
    "/api/videos/" + vid + "/thumb",
  ]) {
    const r = await app.fetch(new Request(env.ORIGIN + path), env);
    expect(r.status).toBe(404);
  }
  expect(head).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});
it("owner metadata contains no credential or R2 keys", async () => {
  const { env } = setup();
  const r = await app.fetch(
    new Request(env.ORIGIN + "/api/videos/" + vid),
    env,
  );
  const data = (await r.json()) as any;
  expect(data.passcode_protected).toBe(true);
  expect(data.title).toBe("Test title");
  expect(data.passcode_hash).toBeUndefined();
  expect(data.r2_key).toBeUndefined();
});
it("owner media uses range delivery without changing the public gate", async () => {
  const { env, get } = setup();
  const r = await app.fetch(
    new Request(env.ORIGIN + "/api/videos/" + vid + "/media", {
      headers: { Range: "bytes=0-1" },
    }),
    env,
  );
  expect(r.status).toBe(206);
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(get).toHaveBeenCalledWith("video", {
    range: { offset: 0, length: 2 },
  });
});
it("saves edited title and transcript together with ownership constraint", async () => {
  const { env, writes } = setup();
  const r = await app.fetch(
    new Request(env.ORIGIN + "/api/videos/" + vid, {
      method: "PATCH",
      headers: { Origin: env.ORIGIN, "X-Showlet-Request": "1" },
      body: JSON.stringify({
        title: "Updated title",
        transcript: "Corrected transcript",
      }),
    }),
    env,
  );
  expect(r.status).toBe(200);
  expect(writes).toEqual([
    {
      sql: expect.stringContaining("created_by=? AND deleted_at IS NULL"),
      values: ["Updated title", "Corrected transcript", vid, "owner"],
    },
  ]);
});
it("renaming preserves transcript and clearing it explicitly removes it", async () => {
  const { env, writes } = setup();
  for (const data of [{ title: "Renamed" }, { transcript: "" }])
    await app.fetch(
      new Request(env.ORIGIN + "/api/videos/" + vid, {
        method: "PATCH",
        headers: { Origin: env.ORIGIN, "X-Showlet-Request": "1" },
        body: JSON.stringify(data),
      }),
      env,
    );
  expect(writes[0].values[1]).toBe("Private transcript");
  expect(writes[1].values[1]).toBe(null);
});

it("share details require ownership and return the decrypted code without caching", async () => {
  const { env, video } = setup();
  video.passcode_encrypted = await encryptPasscode(
    "test-share-code",
    video.id,
    env,
  );
  const r = await app.fetch(
    new Request(env.ORIGIN + "/api/videos/" + vid + "/share"),
    env,
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect(((await r.json()) as any).text).toBe(
    `Watch this Showlet recording:\n\nTest title\n\nVideo: https://showlet.example/v/${vid}\n\nPasscode: test-share-code\nEnter this passcode when prompted to watch.`,
  );
  const foreign = setup("different-owner");
  expect(
    (
      await app.fetch(
        new Request(foreign.env.ORIGIN + "/api/videos/" + vid + "/share"),
        foreign.env,
      )
    ).status,
  ).toBe(404);
});
it("legacy passcodes ask the owner to set them again instead of returning a fake code", async () => {
  const { env } = setup();
  const r = await app.fetch(
    new Request(env.ORIGIN + "/api/videos/" + vid + "/share"),
    env,
  );
  expect(r.status).toBe(409);
  expect(((await r.json()) as any).error).toContain("Set it again");
});
