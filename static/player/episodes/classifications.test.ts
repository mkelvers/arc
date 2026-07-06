import assert from "node:assert/strict";
import { before, test } from "node:test";

before(() => {
  Object.assign(globalThis, {
    document: {
      createElement: () => ({ classList: { add: () => undefined, remove: () => undefined } }),
    },
  });
});

test("parses only valid episode classifications", async () => {
  const { parseEpisodeClassifications } = await import("./classifications");
  assert.deepEqual(
    parseEpisodeClassifications([
      { filler: true, number: 2, recap: false },
      { filler: false, number: 3, recap: true },
      { filler: "true", number: 4, recap: false },
      { filler: false, number: 0, recap: false },
    ]),
    [
      { filler: true, number: 2, recap: false },
      { filler: false, number: 3, recap: true },
    ],
  );
});
