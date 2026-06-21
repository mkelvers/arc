import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const toSlug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");

const formatYyyymmdd = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
};

const sourceFor = (id: string): string => `package fixes

import (
\t"context"
\t"database/sql"
\t"fmt"
)

func init() {
\tRegister(Fix{
\t\tID: "${id}",
\t\tApply: func(ctx context.Context, sqlDB *sql.DB) error {
\t\t\t// TODO: implement fix
\t\t\t// _, err := sqlDB.ExecContext(ctx, \`UPDATE ...\`)
\t\t\t// if err != nil { return fmt.Errorf("...: %w", err) }
\t\t\treturn fmt.Errorf("unimplemented data fix: ${id}")
\t\t},
\t})
}
`;

const main = async (): Promise<void> => {
  const rawName = process.argv[2] ?? "";

  if (rawName === "--help" || rawName === "-h") {
    console.log("usage: bun run ./scripts/new-data-fix.ts <name>");
    return;
  }

  const slug = toSlug(rawName);

  if (!slug) {
    console.error("usage: bun run ./scripts/new-data-fix.ts <name>");
    process.exit(1);
  }

  const id = `${formatYyyymmdd()}_${slug}`;
  const dir = join(process.cwd(), "internal", "database", "fixes");
  const filePath = join(dir, `${id}.go`);

  if (existsSync(filePath)) {
    console.error(`data fix already exists: ${filePath}`);
    process.exit(1);
  }

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, sourceFor(id));
  spawnSync("gofmt", ["-w", filePath], { stdio: "ignore" });

  console.log(filePath);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
