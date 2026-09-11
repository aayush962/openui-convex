import { access, readFile } from "node:fs/promises";
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const missing = [];
for (const [name, target] of Object.entries(pkg.exports)) {
  for (const path of typeof target === "string" ? [target] : Object.values(target)) {
    try { await access(new URL(`../${path}`, import.meta.url)); }
    catch { missing.push(`${name}: ${path}`); }
  }
}
if (missing.length) throw new Error(`Missing package exports:\n${missing.join("\n")}`);
console.log(`All ${Object.keys(pkg.exports).length} package exports exist.`);
