import { it, expect, vi } from "vitest";
import app from "../src/index";
import {
  hashPasscode,
  encryptPasscode,
  decryptPasscode,
  checkPasscode,
  canView,
  viewerCookie,
  limitAttempts,
} from "../src/passcodes";
import type { Env, Video } from "../src/types";
const vid = "abcdefghijklmnopqrstuv";
const video = async () =>
  ({
    id: vid,
    title: "Private title",
    storage: "r2",
    r2_key: "media",
    thumb_key: "thumb",
    passcode_hash: await hashPasscode("sample-passcode"),
    created_at: "2026-09-10",
    duration_sec: 17,
  }) as Video;
function environment(v: Video) {
  const get = vi.fn(),
    head = vi.fn();
  const env = {
    ORIGIN: "https://showlet.example",
    ACCOUNT_ID: "test",
    MEDIA: { get, head },
    DB: {
      prepare: vi.fn((sql: string) => ({
        bind: () => ({
          first: async () => (sql.startsWith("INSERT") ? { attempts: 1 } : v),
          run: async () => ({}),
        }),
      })),
    },
  } as unknown as Env;
  return { env, get, head };
}
it("salts passcodes and rejects incorrect or invalid input", async () => {
  const a = await hashPasscode("sample-passcode"),
    b = await hashPasscode("sample-passcode");
  expect(a).not.toBe(b);
  expect(a).not.toContain("sample-passcode");
  expect(await checkPasscode("sample-passcode", a)).toBe(true);
  expect(await checkPasscode("wrong-passcode", a)).toBe(false);
  expect(await checkPasscode(null, a)).toBe(false);
  await expect(hashPasscode("1234")).rejects.toThrow();
});
it("viewer cookie is restricted, scoped to one recording and revoked by rotation", async () => {
  const v = await video(),
    cookie = await viewerCookie(v);
  expect(cookie).toContain("Secure; HttpOnly; SameSite=Lax");
  const request = new Request("https://showlet.example/v/" + vid, {
    headers: { Cookie: cookie },
  });
  expect(await canView(request, v)).toBe(true);
  expect(await canView(request, { ...v, id: "different-recording-id" })).toBe(
    false,
  );
  expect(
    await canView(request, {
      ...v,
      passcode_hash: await hashPasscode("sample-passcode"),
    }),
  ).toBe(false);
  expect(
    await canView(
      new Request(request.url, {
        headers: { Cookie: cookie.replace(/=\d+/, "=1") },
      }),
      v,
    ),
  ).toBe(false);
  expect(
    await canView(
      new Request(request.url, {
        headers: { Cookie: cookie.replace(/\.([a-f0-9])/, ".z") },
      }),
      v,
    ),
  ).toBe(false);
});
it("blocks direct media and thumbnails including HEAD and range before reading R2", async () => {
  const v = await video(),
    { env, get, head } = environment(v);
  for (const path of ["media", "thumb"])
    for (const method of ["GET", "HEAD"]) {
      const r = await app.fetch(
        new Request(`https://showlet.example/${path}/${vid}`, {
          method,
          headers: { Range: "bytes=0-10" },
        }),
        env,
      );
      expect(r.status).toBe(401);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    }
  expect(get).not.toHaveBeenCalled();
  expect(head).not.toHaveBeenCalled();
});
it("locked share and embed expose no private title or thumbnail", async () => {
  const { env } = environment(await video());
  for (const path of ["v", "e"]) {
    const r = await app.fetch(
        new Request(`https://showlet.example/${path}/${vid}`),
        env,
      ),
      html = await r.text();
    expect(html).toContain("A little privacy.");
    expect(html).not.toContain("Private title");
    expect(html).not.toContain("/thumb/");
    expect(html).not.toContain("/media/");
  }
});
it("unlock rejects cross-origin and wrong passcodes; correct code issues cookie", async () => {
  const { env } = environment(await video());
  for (const [origin, passcode, status] of [
    ["https://evil.example", "sample-passcode", 403],
    [env.ORIGIN, "wrong-passcode", 401],
    [env.ORIGIN, "sample-passcode", 200],
  ] as const) {
    const r = await app.fetch(
      new Request(`${env.ORIGIN}/unlock/${vid}`, {
        method: "POST",
        headers: {
          Origin: origin,
          "X-Showlet-Request": "1",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ passcode }),
      }),
      env,
    );
    expect(r.status).toBe(status);
    expect(!!r.headers.get("Set-Cookie")).toBe(status === 200);
  }
});
it("unlocked viewer gets the player without social metadata and private media stays uncached", async () => {
  const v = await video(),
    { env, head, get } = environment(v);
  const cookie = await viewerCookie(v);
  const r = await app.fetch(
    new Request(`${env.ORIGIN}/v/${vid}`, { headers: { Cookie: cookie } }),
    env,
  );
  const html = await r.text();
  expect(html).toContain("Private title");
  expect(html).toContain("/media/");
  expect(html).not.toContain('property="og:image"');
  head.mockResolvedValue({ size: 2, httpEtag: '"test"', uploaded: new Date() });
  get.mockResolvedValue({ body: new Uint8Array([1, 2]) });
  const media = await app.fetch(
    new Request(`${env.ORIGIN}/media/${vid}`, { headers: { Cookie: cookie } }),
    env,
  );
  expect(media.status).toBe(200);
  expect(media.headers.get("Cache-Control")).toBe("private, no-store");
});
it("rate limits attempts before password work", async () => {
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => ({ attempts: 11 }) }),
      }),
    },
  } as unknown as Env;
  await expect(
    limitAttempts(new Request("https://showlet.example"), env, vid),
  ).rejects.toMatchObject({ status: 429 });
});

it("encrypts passcodes with unique nonces and binds ciphertext to its recording", async () => {
  const env = { PASSCODE_ENCRYPTION_KEY: btoa("a".repeat(32)) } as Env;
  const a = await encryptPasscode("private-test-code", "video-a", env),
    b = await encryptPasscode("private-test-code", "video-a", env);
  expect(a).not.toBe(b);
  expect(a).not.toContain("private-test-code");
  expect(await decryptPasscode(a, "video-a", env)).toBe("private-test-code");
  await expect(decryptPasscode(a, "video-b", env)).rejects.toThrow();
  await expect(
    decryptPasscode(a, "video-a", {
      ...env,
      PASSCODE_ENCRYPTION_KEY: btoa("b".repeat(32)),
    }),
  ).rejects.toThrow();
});
