import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isRecord, parseModeSources, parseSegments } from "./validate";

describe("player validation", () => {
  test("identifies plain records", () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord({ token: "abc" }), true);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord("value"), false);
  });

  test("parses valid mode sources and drops malformed entries", () => {
    const sources = parseModeSources({
      sub: {
        token: "sub-token",
        type: "hls",
        qualities: ["1080p", "720p"],
        subtitles: [{ lang: "English", token: "subtitle-token" }],
      },
      dub: { token: "", subtitles: [] },
      badSubtitles: { token: "bad", subtitles: [{ lang: "English" }] },
      badQualities: { token: "ok", qualities: ["1080p", 720], subtitles: [] },
    });

    assert.deepEqual(sources, {
      sub: {
        token: "sub-token",
        type: "hls",
        qualities: ["1080p", "720p"],
        subtitles: [{ lang: "English", token: "subtitle-token" }],
      },
      badQualities: { token: "ok", type: undefined, qualities: undefined, subtitles: [] },
    });
  });

  test("parses skip segments from numbers and numeric strings", () => {
    assert.deepEqual(
      parseSegments([
        { type: "op", start: 10, end: 90, source: "aniskip" },
        { type: "ed", start: "1200.5", end: "1280" },
        { type: "", start: 0, end: 1 },
        { type: "op", start: "nope", end: 1 },
      ]),
      [
        { type: "op", start: 10, end: 90, source: "aniskip" },
        { type: "ed", start: 1200.5, end: 1280, source: undefined },
      ],
    );
  });

  test("returns empty structures for non-container inputs", () => {
    assert.deepEqual(parseModeSources(null), {});
    assert.deepEqual(parseSegments({}), []);
  });
});
