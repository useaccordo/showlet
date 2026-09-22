import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInContext, createContext } from "node:vm";
import { uploads } from "../src/uploads";
import { publishingTitle, type Env } from "../src/types";
import { checkPasscode } from "../src/passcodes";
it("requires a descriptive publication title", () => {
  for (const value of [
    "",
    "  ",
    "9/10/2026, 1:00:53 PM",
    "10.9.2026 13:05",
    "2026-09-10",
  ])
    expect(() => publishingTitle(value)).toThrow();
  expect(publishingTitle("  How to update your sponsor profile  ")).toBe(
    "How to update your sponsor profile",
  );
});
it("stores hashed and encrypted passcodes without plaintext before publication", async () => {
  const bind = vi.fn().mockReturnValue({ run: async () => ({}) });
  const env = {
    DB: { prepare: vi.fn().mockReturnValue({ bind }) },
    PASSCODE_ENCRYPTION_KEY: btoa("a".repeat(32)),
    R2_ACCESS_KEY_ID: "test",
    R2_SECRET_ACCESS_KEY: "test",
    ACCOUNT_ID: "test",
    R2_BUCKET: "test",
    MAX_BYTES: "100000",
    MAX_DURATION: "900",
  } as unknown as Env;
  const request = new Request("https://showlet.example/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      title: "Sponsor profile walkthrough",
      mime: "video/mp4",
      size: 100,
      duration: 17,
      passcode: "private-test-code",
    }),
  });
  const r = await uploads(request, env, "owner", "/api/uploads");
  expect(r.status).toBe(200);
  expect(env.DB.prepare).toHaveBeenCalledWith(
    expect.stringContaining("expires_at,passcode_hash"),
  );
  const values = bind.mock.calls[0];
  expect(values).not.toContain("private-test-code");
  expect(await checkPasscode("private-test-code", values[11])).toBe(true);
  expect(await r.text()).not.toContain("passcode");
});
it("publishes the stored protection in the same transaction as the video", async () => {
  const batch = vi.fn().mockResolvedValue([]);
  const statements: string[] = [];
  const env = {
    ORIGIN: "https://showlet.example",
    DB: {
      batch,
      prepare: (sql: string) => {
        statements.push(sql);
        return {
          bind: () => ({
            first: async () =>
              sql.includes("upload_sessions")
                ? {
                    id: "abcdefghijklmnopqrstuv",
                    video_id: "zyxwvutsrqponmlkjihgfe",
                    state: "pending",
                    expires_at: "2099-01-01",
                    r2_key: "video",
                    thumb_key: "thumb",
                    expected_size_bytes: 100,
                    passcode_hash: "hash",
                  }
                : { id: "zyxwvutsrqponmlkjihgfe" },
            run: async () => ({ meta: { changes: 1 } }),
          }),
        };
      },
    },
    MEDIA: { head: async () => ({ size: 100 }) },
  } as unknown as Env;
  const r = await uploads(
    new Request(
      "https://showlet.example/api/uploads/abcdefghijklmnopqrstuv/complete",
      { method: "POST", body: JSON.stringify({ parts: [] }) },
    ),
    env,
    "owner",
    "/api/uploads/abcdefghijklmnopqrstuv/complete",
  );
  expect(r.status).toBe(200);
  expect(batch).toHaveBeenCalledOnce();
  const insert = statements.find((sql) => sql.startsWith("INSERT"));
  expect(insert).toContain(
    "created_by,passcode_hash,transcript,passcode_encrypted) SELECT",
  );
  expect(insert).toContain(
    "created_by,passcode_hash,transcript,passcode_encrypted FROM upload_sessions",
  );
});
it("stopping prepares a local draft; publishing sends the chosen title and passcode", async () => {
  const elements = new Map<string, any>();
  const get = (selector: string) => {
    if (!elements.has(selector))
      elements.set(selector, {
        classList: { add: vi.fn(), remove: vi.fn() },
        value: "",
        hidden: true,
        disabled: false,
        checked: false,
        dataset: { maxDuration: "900", maxBytes: "100000" },
        href: "",
        elements: [],
        setCustomValidity: vi.fn(),
        reportValidity: () => true,
        focus: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
      });
    return elements.get(selector);
  };
  const fetch = vi.fn(async (path: string) => ({
    ok: true,
    json: async () =>
      path === "/api/uploads"
        ? {
            id: "upload",
            thumbnailUrl: "https://upload/thumb",
            uploadUrl: "https://upload/video",
            multipart: false,
          }
        : { url: "https://showlet.example/v/test" },
  }));
  class XHR {
    upload: any = {};
    status = 200;
    onload: any;
    open() {}
    getResponseHeader() {
      return "etag";
    }
    send() {
      queueMicrotask(() => this.onload());
    }
  }
  const context = createContext({
    document: { querySelector: get },
    window: { addEventListener: vi.fn() },
    navigator: { clipboard: { writeText: async () => {} } },
    Blob,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: vi.fn() },
    fetch,
    XMLHttpRequest: XHR,
    setTimeout,
    clearTimeout,
    clearInterval,
    performance,
    console,
  });
  runInContext(readFileSync("public/record.js", "utf8"), context);
  runInContext(
    'recorder = {mimeType:"video/mp4",state:"inactive"}; chunks=[new Blob(["test"])]; thumbnail=new Blob(["thumb"]); duration=17; checkPlayback=async()=>{};',
    context,
  );
  await runInContext("finish()", context);
  expect(fetch).not.toHaveBeenCalled();
  expect(get("#publish-form").hidden).toBe(false);
  get("#title").value = "9/10/2026, 1:00:53 PM";
  await runInContext("upload()", context);
  expect(fetch).not.toHaveBeenCalled();
  expect(get("#title").setCustomValidity).toHaveBeenCalled();
  get("#title").value = "Sponsor profile walkthrough";
  await runInContext("upload()", context);
  expect(fetch).not.toHaveBeenCalled();
  get("#protect-video").checked = true;
  get("#publish-passcode").value = "private-test-code";
  await runInContext("upload()", context);
  expect(JSON.parse((fetch.mock.calls[0] as any)[1].body)).toMatchObject({
    title: "Sponsor profile walkthrough",
    passcode: "private-test-code",
  });
  expect(get("#publish-form").hidden).toBe(true);
  expect(runInContext("draft", context)).toBe(false);
});

it("requests microphone permission before offering the screen picker", async () => {
  const elements = new Map();
  const get = (key: string) => {
    if (!elements.has(key))
      elements.set(key, {
        dataset: { maxDuration: "900", maxBytes: "100000" },
      });
    return elements.get(key);
  };
  const getUserMedia = vi.fn(async () => ({
    getAudioTracks: () => [{ readyState: "live" }],
  }));
  const getDisplayMedia = vi.fn();
  const context = createContext({
    document: { querySelector: get },
    window: { addEventListener: vi.fn() },
    navigator: { mediaDevices: { getUserMedia, getDisplayMedia } },
  });
  runInContext(readFileSync("public/record.js", "utf8"), context);
  await get("#start").onclick();
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(getDisplayMedia).not.toHaveBeenCalled();
  expect(get("#start").textContent).toBe("Choose screen & record");
  expect(get("#start").disabled).toBe(false);
});

it("normalizes S3 HTTP part ETags before Workers multipart completion", async () => {
  let assembled = false;
  const complete = vi.fn(async (parts) => {
    expect(parts).toEqual([
      { partNumber: 1, etag: "abc123" },
      { partNumber: 2, etag: "def456" },
    ]);
    assembled = true;
  });
  const size = 20 * 1024 * 1024;
  const env = {
    ORIGIN: "https://example.com",
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () =>
            sql.includes("upload_sessions")
              ? {
                  id: "abcdefghijklmnopqrstuv",
                  video_id: "zyxwvutsrqponmlkjihgfe",
                  state: "finalizing",
                  expires_at: "2099-01-01",
                  r2_key: "video",
                  thumb_key: "thumb",
                  expected_size_bytes: size,
                  passcode_hash: "hash",
                  multipart_upload_id: "multipart-test",
                }
              : { id: "zyxwvutsrqponmlkjihgfe" },
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
      batch: vi.fn().mockResolvedValue([]),
    },
    MEDIA: {
      head: async (key: string) =>
        key === "thumb" ? { size: 100 } : assembled ? { size } : null,
      resumeMultipartUpload: () => ({ complete }),
    },
  } as unknown as Env;
  const response = await uploads(
    new Request(
      "https://example.com/api/uploads/abcdefghijklmnopqrstuv/complete",
      {
        method: "POST",
        body: JSON.stringify({
          parts: [
            { partNumber: 1, etag: '\"abc123\"' },
            { partNumber: 2, etag: "def456" },
          ],
        }),
      },
    ),
    env,
    "owner",
    "/api/uploads/abcdefghijklmnopqrstuv/complete",
  );
  expect(response.status).toBe(200);
  expect(complete).toHaveBeenCalledOnce();
  expect(env.DB.batch).toHaveBeenCalledOnce();
});
