// Packaging layout check: the release zip must drop in as a single `QuickBinds/`
// folder whose TOC lists exactly the lua files shipped, with the right Interface line.
// Run: node tools/check-package.mjs dist/QuickBinds-vX.Y.Z.zip
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const zip = process.argv[2];
if (!zip || !existsSync(zip)) {
  console.error(`usage: node tools/check-package.mjs <zip>  (got: ${zip})`);
  process.exit(1);
}

const tocPath = join(root, "QuickBinds", "QuickBinds.toc");
const tocLines = readFileSync(tocPath, "utf8").split(/\r?\n/);

const interfaceLine = "## Interface: 16001, 120105";
if (!tocLines.includes(interfaceLine)) {
  console.error(`FAIL: TOC is missing the exact line: ${interfaceLine}`);
  process.exit(1);
}

const tocFiles = tocLines
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith("##"));

const listing = execFileSync("python3", ["-m", "zipfile", "-l", zip], {
  encoding: "utf8",
});
const entries = listing
  .split("\n")
  .slice(1) // header row: "File Name  Modified  Size"
  .map((line) => line.trim().split(/\s+/)[0])
  .filter(Boolean);
const entrySet = new Set(entries);

let failed = false;
const need = (cond, msg) => {
  console.log(`${cond ? "OK  " : "FAIL"} ${msg}`);
  if (!cond) failed = true;
};

need(entrySet.has("QuickBinds/QuickBinds.toc"), "zip root contains QuickBinds/QuickBinds.toc");
need(
  entries.every((e) => e === "QuickBinds/" || e.startsWith("QuickBinds/")),
  "QuickBinds/ is the single root entry",
);
for (const file of tocFiles) {
  need(entrySet.has(`QuickBinds/${file}`), `TOC-listed ${file} is in the zip`);
}
for (const file of readdirSync(join(root, "QuickBinds")).filter((f) => f.endsWith(".lua"))) {
  need(tocFiles.includes(file), `QuickBinds/${file} is listed in the TOC`);
}
for (const entry of entries) {
  if (entry.endsWith(".lua")) {
    const bare = entry.slice("QuickBinds/".length);
    need(tocFiles.includes(bare), `zip lua ${entry} is TOC-listed`);
  }
}

need(entrySet.has("QuickBinds/Media/icon.tga"), "Media/icon.tga is in the zip (media, not TOC-listed)");
need(!tocFiles.some((f) => !f.endsWith(".lua")), "TOC file entries are code, not media");

if (failed) {
  console.error(`check-package: FAILED for ${zip}`);
  process.exit(1);
}
console.log(`check-package: ${entries.length} entries, layout ok`);
