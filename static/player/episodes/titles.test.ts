import assert from "node:assert/strict";
import { before, test } from "node:test";

before(() => {
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ classList: { add: () => undefined, remove: () => undefined } }),
    },
  });
});

test("parses only valid episode titles", async () => {
  const { parseEpisodeTitles } = await import("./titles");
  assert.deepEqual(
    parseEpisodeTitles([
      { number: 1, title: " First title " },
      { number: 0, title: "Invalid" },
      { number: 2, title: "" },
      null,
    ]),
    [{ number: 1, title: "First title" }],
  );
});
