import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: process.env.CI === undefined ? "list" : "github",
  use: { baseURL, trace: "retain-on-failure" },
  webServer:
    process.env.PLAYWRIGHT_BASE_URL === undefined
      ? {
          command: `PORT=${port} DATABASE_FILE=/tmp/mal-e2e.db GIN_MODE=test go run ./cmd/server`,
          url: baseURL,
          reuseExistingServer: process.env.CI === undefined,
          timeout: 120_000,
        }
      : undefined,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
