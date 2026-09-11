// Promotes the "## Unreleased" section of CHANGELOG.md to a version heading.
// Runs from the `version` script during `npm version`; pass a version explicitly for the first release.
import { readFile, writeFile } from "node:fs/promises";
const version = process.argv[2] ?? process.env.npm_package_version;
if (!version) throw new Error("Usage: node scripts/changelog.mjs <version> (or run through `npm version`)");
const path = new URL("../CHANGELOG.md", import.meta.url);
const text = await readFile(path, "utf8");
if (!/^## Unreleased$/m.test(text)) throw new Error("CHANGELOG.md needs an `## Unreleased` section");
const date = new Date().toISOString().slice(0, 10);
await writeFile(path, text.replace(/^## Unreleased$/m, `## Unreleased\n\n## ${version} (${date})`));
console.log(`CHANGELOG.md: recorded ${version}`);
