import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { aiRequest, wavSeconds } from "../src/transcripts";
import {
  requirePublicAcknowledgment,
  transcriptText,
  type Env,
  type Video,
} from "../src/types";
import { share, locked } from "../src/pages";
import app from "../src/index";
async function wav() {
  const context = createContext({
    window: {},
    Blob,
    ArrayBuffer,
    DataView,
    Float32Array,
  });
  runInContext(readFileSync("public/transcription.js", "utf8"), context);
  const result = runInContext(
    "window.ShowletTranscription.wav(new Float32Array(16000))",
    context,
  );
  return new Uint8Array(await result.arrayBuffer());
}
const env = () =>
  ({
    AI: {
      run: vi.fn().mockResolvedValue({
        text: "Update your sponsor profile in Showlet.",
        response: "Update Your Sponsor Profile",
      }),
    },
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: () => ({ first: async () => ({ units: 1 }) }),
      }),
    },
  }) as unknown as Env;
it("requires explicit acknowledgment for unprotected publication", () => {
  for (const value of [undefined, false, "true", 1])
    expect(() => requirePublicAcknowledgment(null, value)).toThrow();
  expect(() => requirePublicAcknowledgment(null, true)).not.toThrow();
  expect(() =>
    requirePublicAcknowledgment("private-code", false),
  ).not.toThrow();
  expect(() => transcriptText("a".repeat(60001))).toThrow();
});
it("encodes bounded valid WAV segments and rejects unsupported/malformed audio", async () => {
  const data = await wav();
  expect(wavSeconds(data)).toBe(1);
  const bad = data.slice();
  bad[24] = 0;
  expect(() => wavSeconds(bad)).toThrow();
  expect(() => wavSeconds(data.slice(0, 20))).toThrow();
});
it("transcribes audio using the AI binding after reserving usage", async () => {
  const e = env(),
    data = await wav();
  const r = await aiRequest(
    new Request("https://showlet.example/api/transcribe", {
      method: "POST",
      body: data,
    }),
    e,
    "/api/transcribe",
  );
  expect(await r.json()).toEqual({
    text: "Update your sponsor profile in Showlet.",
  });
  expect(e.DB.prepare).toHaveBeenCalledWith(
    expect.stringContaining("units+excluded.units<=?"),
  );
  expect(e.AI.run).toHaveBeenCalledWith(
    "@cf/openai/whisper-large-v3-turbo",
    expect.objectContaining({ task: "transcribe", vad_filter: true }),
  );
});
it("does not call AI for malformed audio or exhausted quota", async () => {
  const e = env();
  await expect(
    aiRequest(
      new Request("https://showlet.example/api/transcribe", {
        method: "POST",
        body: "not audio",
      }),
      e,
      "/api/transcribe",
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(e.AI.run).not.toHaveBeenCalled();
  e.DB.prepare = vi
    .fn()
    .mockReturnValue({ bind: () => ({ first: async () => null }) });
  await expect(
    aiRequest(
      new Request("https://showlet.example/api/transcribe", {
        method: "POST",
        body: await wav(),
      }),
      e,
      "/api/transcribe",
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(e.AI.run).not.toHaveBeenCalled();
});
it("suggests a title from transcript without creating a public video", async () => {
  const e = env();
  const r = await aiRequest(
    new Request("https://showlet.example/api/suggest-title", {
      method: "POST",
      body: JSON.stringify({
        transcript:
          "Update the company description in your sponsor profile and save changes.",
      }),
    }),
    e,
    "/api/suggest-title",
  );
  expect(await r.json()).toEqual({ title: "Update Your Sponsor Profile" });
  for (const [sql] of vi.mocked(e.DB.prepare).mock.calls)
    expect(sql).not.toContain("videos");
});
it("escapes transcript text and does not expose it through locked routes", async () => {
  const v = {
    id: "abcdefghijklmnopqrstuv",
    title: "Private",
    created_at: "2026-09-10",
    duration_sec: 17,
    transcript: "Private transcript <script>alert(1)</script>",
    passcode_hash: "private-hash",
    storage: "r2",
  } as Video;
  const e = {
    ORIGIN: "https://showlet.example",
    DB: { prepare: () => ({ bind: () => ({ first: async () => v }) }) },
  } as unknown as Env;
  const response = await app.fetch(new Request(e.ORIGIN + "/v/" + v.id), e);
  expect(await response.text()).not.toContain("Private transcript");
  const html = share(v, e, false);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>alert");
});

it("joins chunk boundaries and removes exact repeated boundary phrases", () => {
  const context = createContext({ window: {} });
  runInContext(readFileSync("public/transcription.js", "utf8"), context);
  const format = runInContext("window.ShowletTranscription.format", context);
  expect(
    format([
      "Once uploaded you have the ability to",
      "You have the ability to upload new versions.",
    ]),
  ).toBe("Once uploaded you have the ability to upload new versions.");
  expect(format(["Here is a", "complete sentence. Another sentence."])).toBe(
    "Here is a complete sentence. Another sentence.",
  );
  expect(format(["", ""])).toBe("");
  const long =
    "This is a complete sentence with enough words to make a paragraph. ".repeat(
      15,
    );
  expect(
    format([long])
      .split("\n\n")
      .every((p) => p.endsWith(".")),
  ).toBe(true);
});
