import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

type BuildStep = { name: string; args: string[] };

const isProduction = !process.argv.includes("--development");

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
      "--sourcemap=none",
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
      "--sourcemap=none",
    ],
  },
];

const bundlePaths = ["./dist/static/app.js", "./dist/static/player/main.js"];

const runBuildStep = (step: BuildStep): void => {
  console.log(`building ${step.name}...`);

  const args = isProduction ? [...step.args, "--minify"] : step.args;
  const result = spawnSync("bun", args, { stdio: "inherit" });
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

const formatBytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)}KB`;

const printBundleSizes = async (): Promise<void> => {
  console.log("bundle sizes:");

  const results = await Promise.all(
    bundlePaths.map(async (path) => {
      const contents = await readFile(path);
      return { path, raw: contents.byteLength, gzip: gzipSync(contents).byteLength };
    }),
  );

  for (const { path, raw, gzip } of results) {
    console.log(`  ${path}: ${formatBytes(raw)} raw, ${formatBytes(gzip)} gzip`);
  }
};

const main = async (): Promise<void> => {
  const startedAt = performance.now();

  await rm("./dist/static", { recursive: true, force: true });
  await mkdir("./dist/static", { recursive: true });

  buildSteps.forEach((step) => {
    runBuildStep(step);
  });

  await cp("./node_modules/htmx.org/dist/htmx.min.js", "./dist/static/htmx-lib.js");
  await printBundleSizes();

  const elapsedMs = Math.round(performance.now() - startedAt);
  const mode = isProduction ? "production" : "development";
  console.log(`ts build ok (${buildSteps.length} entries, ${mode}, ${elapsedMs}ms)`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
