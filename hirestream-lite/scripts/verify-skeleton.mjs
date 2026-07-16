/**
 * verify-skeleton.mjs
 * Purpose: Assert the project conforms to the Day-1 testing skeleton checklist.
 * Expected exit codes: 0 if all 11 checks pass, 1 if any missing.
 * Extend by editing the CHECKS array.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

function findProjectRoot(startDir) {
  let curr = startDir;
  while (curr !== "/") {
    if (existsSync(join(curr, "package.json"))) return curr;
    curr = dirname(curr);
  }
  return null;
}

const root = findProjectRoot(process.cwd());
if (!root) {
  console.error("FAIL: Could not find package.json in ancestor directories.");
  process.exit(1);
}

let pkg = {};
try {
  pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
} catch (e) {
  console.error("FAIL: Could not parse package.json.");
  process.exit(1);
}

const missing = [];

const CHECKS = [
  { name: "tests/unit/", test: () => existsSync(join(root, "tests", "unit")) },
  { name: "tests/integration/", test: () => existsSync(join(root, "tests", "integration")) },
  { name: "tests/e2e/", test: () => existsSync(join(root, "tests", "e2e")) },
  { name: "tests/fixtures/", test: () => existsSync(join(root, "tests", "fixtures")) },
  { name: "tests/DEEP_TESTING.md", test: () => existsSync(join(root, "tests", "DEEP_TESTING.md")) },
  { name: "tests/setup.ts or tests/setup.js", test: () => existsSync(join(root, "tests", "setup.ts")) || existsSync(join(root, "tests", "setup.js")) },
  { name: "scripts/deep-smoke.mjs", test: () => existsSync(join(root, "scripts", "deep-smoke.mjs")) },
  { name: "package.json scripts.smoke", test: () => pkg.scripts && typeof pkg.scripts["smoke"] === "string" && pkg.scripts["smoke"].trim() !== "" },
  { name: "package.json scripts.test:deep", test: () => pkg.scripts && typeof pkg.scripts["test:deep"] === "string" && pkg.scripts["test:deep"].trim() !== "" },
  { name: "package.json scripts.test", test: () => pkg.scripts && typeof pkg.scripts["test"] === "string" && pkg.scripts["test"].trim() !== "" },
  { name: "VERIFICATION.md", test: () => existsSync(join(root, "VERIFICATION.md")) }
];

for (const check of CHECKS) {
  if (!check.test()) {
    missing.push(check.name);
  }
}

if (missing.length === 0) {
  console.log(`Day-1 skeleton: OK (${CHECKS.length}/${CHECKS.length} checks)`);
  process.exit(0);
} else {
  console.error(`Day-1 skeleton: FAIL (${missing.length} missing)`);
  for (const item of missing) {
    console.error(`- Missing: ${item}`);
  }
  process.exit(1);
}
