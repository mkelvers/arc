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

  test("returns zero for invalid timestamps", () => {
    assert.equal(parseVttTime(""), 0);
    assert.equal(parseVttTime("not a timestamp"), 0);
    assert.equal(parseVttTime("00:bad"), 0);
  });

  test("ignores cue settings and strips html tags", () => {
    const cues = parseVtt(`WEBVTT

00:10.000 --> 00:12.000 align:start position:0%
<b>Bold</b> & plain
`);

    assert.deepEqual(cues, [{ start: 10, end: 12, text: "Bold & plain" }]);
  });

  test("joins multiline cue text", () => {
    const cues = parseVtt(`WEBVTT

00:00.000 --> 00:03.000
First line
Second line
`);

    assert.deepEqual(cues, [{ start: 0, end: 3, text: "First line\nSecond line" }]);
  });
});
