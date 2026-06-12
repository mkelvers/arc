import { copyFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

type BuildStep = {
  name: string;
  command: string[];
};

const steps: BuildStep[] = [
  {
    name: "player",
    command: [
      "bun",
      "build",
      "./static/player/main.ts",
      "--outdir",
      "./dist/static/player",
      "--target",
      "browser",
      "--splitting",
    ],
  },
];

const startedAt = performance.now();

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ts build failed: ${message}`);
  process.exit(1);
});

async function main(): Promise<void> {
  const appEntries = readdirSync("./static", { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => `./static/${entry.name}`)
    .sort();

  steps.push({
    name: "app",
    command: [
      "bun",
      "build",
      ...appEntries,
      "--outdir",
      "./dist/static",
      "--target",
      "browser",
      "--root",
      "./static",
      "--entry-naming",
      "[name].js",
    ],
  });

  for (const step of steps) {
    const result = spawnSync(step.command[0], step.command.slice(1), {
      stdio: "pipe",
    });

    if (result.status !== 0) {
      const detail = summarizeFailure(result.stderr, result.stdout);
      console.error(`ts build failed at ${step.name}${detail === "" ? "" : `: ${detail}`}`);
      process.exit(result.status ?? 1);
    }
  }

  await copyFile("./node_modules/htmx.org/dist/htmx.min.js", "./dist/static/htmx-lib.js");

  const playerEntries = 1;
  const totalEntries = playerEntries + appEntries.length;
  const elapsedMs = Math.round(performance.now() - startedAt);

  console.log(`ts build ok (${totalEntries} entries, ${elapsedMs}ms)`);
}

function summarizeFailure(stderr: Uint8Array, stdout: Uint8Array): string {
  const combined = `${Buffer.from(stderr).toString("utf8")}${Buffer.from(stdout).toString("utf8")}`.trim();
  if (combined === "") {
    return "";
  }

  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  return lines[lines.length - 1] ?? "";
}
