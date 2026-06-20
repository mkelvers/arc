import { spawnSync } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";

type BuildStep = {
  name: string;
  args: string[];
};

const buildSteps: BuildStep[] = [
  {
    name: "player",
    args: [
      "build",
      "./static/player/main.ts",
      "--outdir",
      "./dist/static/player",
      "--target",
      "browser",
      "--splitting",
    ],
  },
  {
    name: "app",
    args: [
      "build",
      "./static/app.ts",
      "--outdir",
      "./dist/static",
      "--target",
      "browser",
      "--root",
      "./static",
      "--entry-naming",
      "[name].js",
    ],
  },
];

const runBuildStep = (step: BuildStep): void => {
  console.log(`building ${step.name}...`);

  const result = spawnSync("bun", step.args, { stdio: "inherit" });
  if (result.error) {
    throw new Error(`failed to start ${step.name} build: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`ts build interrupted at ${step.name} (${result.signal})`);
  }
  if (result.status !== 0) {
    throw new Error(`ts build failed at ${step.name}`);
  }
};

const main = async (): Promise<void> => {
  const startedAt = performance.now();

  buildSteps.forEach(runBuildStep);

  await mkdir("./dist/static", { recursive: true });
  await cp("./node_modules/htmx.org/dist/htmx.min.js", "./dist/static/htmx-lib.js");

  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(`ts build ok (${buildSteps.length} entries, ${elapsedMs}ms)`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
