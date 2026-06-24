import { spawnSync } from "node:child_process";

const port = process.env.PORT ?? "3100";

export default function globalSetup() {
  if (process.env.PLAYWRIGHT_BASE_URL !== undefined) {
    return;
  }

  const username = process.env.E2E_USERNAME ?? "e2e@example.com";
  const password = process.env.E2E_PASSWORD ?? "e2e-password";
  const databaseFile = process.env.DATABASE_FILE ?? `/tmp/mal-e2e-${port}.db`;

  const result = spawnSync("go", ["run", "./cmd/user", username, password], {
    env: { ...process.env, DATABASE_FILE: databaseFile, GIN_MODE: "test" },
    input: "y\n",
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`Failed to seed e2e user:\n${result.stderr || result.stdout}`);
  }
}
