import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

function toSlug(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const slug = trimmed.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug;
}

function formatYYYYMMDD(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const rawName = process.argv[2] ?? '';
  const slug = toSlug(rawName);
  if (slug.length === 0) {
    throw new Error('usage: bun scripts/new-data-fix.ts <name>');
  }

  const id = `${formatYYYYMMDD(new Date())}_${slug}`;
  const dir = path.join(process.cwd(), 'internal', 'database', 'fixes');
  const filePath = path.join(dir, `${id}.go`);

  await mkdir(dir, { recursive: true });

  if (await fileExists(filePath)) {
    throw new Error(`data fix already exists: ${filePath}`);
  }

  const contents = `package fixes

import (
	"context"
	"database/sql"
	"fmt"
)

func init() {
	Register(Fix{
		ID: "${id}",
		Apply: func(ctx context.Context, sqlDB *sql.DB) error {
			// TODO: implement fix
			// _, err := sqlDB.ExecContext(ctx, \`UPDATE ...\`)
			// if err != nil { return fmt.Errorf("...: %w", err) }
			return fmt.Errorf("unimplemented data fix: ${id}")
		},
	})
}
`;

  await writeFile(filePath, contents, { encoding: 'utf8' });
  process.stdout.write(`${filePath}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
