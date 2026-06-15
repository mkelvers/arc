import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseVtt, parseVttTime } from "./vtt";

describe("vtt parsing", () => {
  test("parses mm:ss timestamps", () => {
    assert.equal(parseVttTime("01:02.500"), 62.5);
  });

  test("parses hh:mm:ss timestamps", () => {
    assert.equal(parseVttTime("01:02:03.250"), 3723.25);
  });

  test("parses standard and compact cues", () => {
    const cues = parseVtt(`WEBVTT

1
00:00.000 --> 00:01.500
<i>Hello</i>

00:02.000 --> 00:03.000
World
`);

    assert.deepEqual(cues, [
      { start: 0, end: 1.5, text: "Hello" },
      { start: 2, end: 3, text: "World" },
    ]);
  });
});
