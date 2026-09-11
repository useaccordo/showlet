import { describe, it, expect } from "vitest";
import { parseRange } from "../src/media";
import { escape } from "../src/pages";
describe("byte ranges", () => {
  it("supports Safari suffix and open-ended seeking", () => {
    expect(parseRange("bytes=-2", 100)).toEqual({ offset: 98, length: 2 });
    expect(parseRange("bytes=20-", 100)).toEqual({ offset: 20, length: 80 });
    expect(parseRange("bytes=0-1", 100)).toEqual({ offset: 0, length: 2 });
  });
  it("clips the end to the object", () =>
    expect(parseRange("bytes=90-200", 100)).toEqual({
      offset: 90,
      length: 10,
    }));
  it.each([
    "bytes=100-",
    "bytes=9-2",
    "bytes=-0",
    "bytes=0-1,3-4",
    "nonsense",
    "bytes=-",
    "bytes=9007199254740992-",
  ])("rejects unsatisfiable or unsupported %s", (r) =>
    expect(parseRange(r, 100)).toBeNull(),
  );
  it("rejects empty object ranges", () =>
    expect(parseRange("bytes=0-", 0)).toBeNull());
});
it("escapes titles in HTML and metadata attributes", () =>
  expect(escape('\"<script>&')).toBe("&quot;&lt;script&gt;&amp;"));
