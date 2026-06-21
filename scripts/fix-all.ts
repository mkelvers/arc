import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ignoredDirectories = new Set([".git", "dist", "node_modules", "vendor"]);

const goFiles = (root: string): string[] => {
  const files: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (!ignoredDirectories.has(entry)) {
        const path = join(dir, entry);
        const stat = statSync(path);
        if (stat.isDirectory()) {
          walk(path);
        } else if (stat.isFile() && path.endsWith(".go")) {
          files.push(path);
        }
      }
    }
  };

  walk(root);
  return files.sort();
};

const sourceHash = (): string => {
  const hash = createHash("sha256");
  for (const file of goFiles(process.cwd())) {
    hash.update(relative(process.cwd(), file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
};

const runGoFix = (): void => {
  spawnSync("go", ["fix", "./..."], { stdio: "ignore" });
};

console.log("running go fix recursively until no changes...");

let previousHash = sourceHash();
let iteration = 0;

while (true) {
  iteration += 1;
  console.log(`iteration ${iteration}...`);

  runGoFix();

  const currentHash = sourceHash();
  if (previousHash === currentHash) {
    console.log(`no more changes after ${iteration} iteration(s)`);
    break;
  }

  previousHash = currentHash;
}

console.log("done");
